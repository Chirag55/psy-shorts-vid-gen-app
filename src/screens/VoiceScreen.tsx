import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useAudioPlayer } from 'expo-audio';
import { Badge, Body, Button, Card, Divider, Empty, H2, H3, ProgressBar, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { getKey } from '@/services/keys';
import { fetchSubscription, preflight, synthesiseChapter, VOICES } from '@/services/elevenlabs';
import { checkVoiceQuota } from '@/core/guardrails';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

interface Track {
  key: string;
  label: string;
  text: string;
}

export default function VoiceScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Voice'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const setAudio = useStudio((s) => s.setAudio);
  const updateProject = useStudio((s) => s.updateProject);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const mounted = useRef(true);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref, not state: two taps landing in the same render tick would both read
  // a stale `false` from state and fire two paid synthesis requests.
  const busyRef = useRef(false);

  useEffect(
    () => () => {
      mounted.current = false;
      // A pending play() would otherwise fire against a released native player.
      if (playTimer.current) clearTimeout(playTimer.current);
    },
    []
  );

  const tracks = useMemo<Track[]>(() => {
    if (!project) return [];
    if (project.mode === 'short') {
      const script = project.script as ShortScript;
      return [{ key: 'short', label: 'Full short', text: script.beats.map((b) => b.text).join(' ') }];
    }
    const script = project.script as LongScript;
    return [
      { key: '0', label: 'Cold Open', text: script.coldOpen },
      ...script.chapters.map((c) => ({ key: String(c.index), label: `Ch ${c.index} · ${c.title}`, text: c.narration })),
      { key: '99', label: 'Closing Synthesis', text: script.closingSynthesis },
    ];
  }, [project]);

  const currentUri = playingKey ? project?.assets.audio[playingKey] : undefined;
  const player = useAudioPlayer(currentUri ? { uri: currentUri } : null);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const pendingChars = tracks
    .filter((t) => !project.assets.audio[t.key])
    .reduce((sum, t) => sum + t.text.length, 0);

  const quota = checkVoiceQuota(
    tracks.map((t) => t.text).join(''),
    settings.voiceCharsUsed,
    settings.voiceCharLimit
  );

  const synthesise = async (track: Track, force: boolean) => {
    if (busyRef.current) return;

    if (project.assets.audio[track.key] && !force) {
      Alert.alert('Already voiced', 'Re-synthesising spends characters again.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-synthesise', style: 'destructive', onPress: () => void synthesise(track, true) },
      ]);
      return;
    }

    const apiKey = await getKey('elevenlabs');
    if (!apiKey) {
      Alert.alert('ElevenLabs key missing', 'Add your API key in Settings.');
      return;
    }

    // Pre-flight the spend before the request goes out — this is the only point
    // at which an over-budget synthesis can still be stopped for free.
    //
    // Usage is read live from the store rather than from this render's closure:
    // "Synthesise all" loops through tracks without re-rendering, so a captured
    // value would still show the usage from before the first track and let the
    // batch sail past the ceiling.
    const live = useStudio.getState().settings;
    const check = checkVoiceQuota(track.text, live.voiceCharsUsed, live.voiceCharLimit);
    if (!check.allowed) {
      Alert.alert('Quota guard', check.reason ?? 'Not enough characters remaining.');
      return;
    }

    busyRef.current = true;
    setBusyKey(track.key);
    try {
      const result = await synthesiseChapter({
        apiKey,
        voiceId: project.voiceId || settings.voiceId,
        text: track.text,
        slug: project.slug,
        key: track.key,
      });
      setAudio(project.id, track.key, result.audioUri, result.words);

      if (result.fromCache) {
        // Nothing was billed, so there is no quota to re-read.
        return;
      }

      if (!result.words.length) {
        Alert.alert(
          'Voiced, but no word timings',
          'The audio was saved and is safe. ElevenLabs returned no alignment, so captions for this track will be skipped unless you re-synthesise.'
        );
      }

      // Refresh from the server rather than trusting the local counter, so spend
      // from the desktop studio is reflected too.
      try {
        const sub = await fetchSubscription(apiKey);
        updateSettings({ voiceCharsUsed: sub.characterCount, voiceCharLimit: sub.characterLimit });
      } catch {
        // Offline: fall back to incrementing the locally tracked spend.
        updateSettings({
          voiceCharsUsed: useStudio.getState().settings.voiceCharsUsed + result.charactersUsed,
        });
      }
    } catch (e) {
      Alert.alert('Synthesis failed', e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusyKey(null);
    }
  };

  const synthesiseAll = async () => {
    if (busyRef.current) return;

    const pending = tracks.filter((t) => !project.assets.audio[t.key]);
    if (!pending.length) {
      Alert.alert('Nothing pending', 'Every track already has a voiceover.');
      return;
    }
    const check = checkVoiceQuota(pending.map((t) => t.text).join(''), settings.voiceCharsUsed, settings.voiceCharLimit);
    if (!check.allowed) {
      Alert.alert('Quota guard', check.reason ?? 'Not enough characters remaining.');
      return;
    }

    // Authenticate once before the batch. Without this a rejected key fails on
    // every track in turn, and any that did succeed would have been billed.
    const apiKey = await getKey('elevenlabs');
    if (!apiKey) {
      Alert.alert('ElevenLabs key missing', 'Add your API key in Settings.');
      return;
    }
    try {
      await preflight(apiKey);
    } catch (e) {
      Alert.alert('Nothing synthesised', e instanceof Error ? e.message : String(e));
      return;
    }

    for (const track of pending) {
      if (!mounted.current) return;
      await synthesise(track, false);
    }
  };

  const togglePlay = (key: string) => {
    if (playTimer.current) clearTimeout(playTimer.current);

    if (playingKey === key) {
      player?.pause();
      setPlayingKey(null);
      return;
    }

    setPlayingKey(key);
    // The player source swaps on the next render, so start playback once it settles.
    playTimer.current = setTimeout(() => {
      if (mounted.current) player?.play();
    }, 150);
  };

  return (
    <Screen>
      <Card>
        <H2>Voice</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>{settings.voiceCharsUsed.toLocaleString()} / {settings.voiceCharLimit.toLocaleString()} chars used</Small>
          <Badge label={quota.allowed ? 'WITHIN BUDGET' : 'OVER CEILING'} tone={quota.allowed ? 'ok' : 'danger'} />
        </Row>
        <ProgressBar fraction={settings.voiceCharsUsed / (settings.voiceCharLimit || 1)} />
        <Small>
          {pendingChars.toLocaleString()} characters pending · safety ceiling {quota.ceiling.toLocaleString()}
        </Small>
        <Small style={{ color: colors.textFaint }}>
          Identical text in the same voice is served from the on-device cache and is never billed
          twice. Audio is written to disk the moment it arrives, before anything that could fail.
        </Small>
      </Card>

      <Card>
        <H3>Narrator</H3>
        <View style={{ gap: space.xs }}>
          {VOICES.map((v) => {
            const active = (project.voiceId || settings.voiceId) === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  updateProject(project.id, { voiceId: v.id });
                  updateSettings({ voiceId: v.id });
                }}
                style={[s.voiceRow, active && s.voiceRowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.voiceName, active && { color: colors.accent }]}>{v.name}</Text>
                  <Small>{v.blurb}</Small>
                </View>
                {active ? <Badge label="SELECTED" tone="ok" /> : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Button label="Synthesise all pending (quota guarded)" onPress={synthesiseAll} disabled={!quota.allowed} />

      {tracks.map((track) => {
        const uri = project.assets.audio[track.key];
        const words = project.assets.alignment[track.key] ?? [];
        const duration = words.length ? words[words.length - 1].end : 0;

        return (
          <Card key={track.key}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>{track.label}</H3>
              <Badge label={uri ? 'VOICED' : 'PENDING'} tone={uri ? 'ok' : 'neutral'} />
            </Row>
            <Body style={{ fontSize: 13, lineHeight: 19, color: colors.textDim }}>{track.text}</Body>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Small>{track.text.length} chars</Small>
              {duration ? <Small>{duration.toFixed(1)}s · {words.length} words aligned</Small> : null}
            </Row>
            <Row style={{ marginTop: space.xs }}>
              <Button
                label={uri ? 'Re-synthesise' : 'Synthesise'}
                variant={uri ? 'ghost' : 'primary'}
                loading={busyKey === track.key}
                onPress={() => synthesise(track, false)}
                style={{ flex: 1 }}
              />
              {uri ? (
                <Button
                  label={playingKey === track.key ? 'Pause' : 'Play'}
                  variant="secondary"
                  onPress={() => togglePlay(track.key)}
                  style={{ flex: 1 }}
                />
              ) : null}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  voiceRowActive: { borderColor: colors.accent },
  voiceName: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
