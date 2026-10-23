import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { saveToGallery as saveRenderToGallery } from '@/services/gallery';
import { Badge, Body, Button, Card, Empty, Field, H2, H3, ProgressBar, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { assembleLongform, assembleShort, type RenderInfo } from '@/services/assembler';
import { cancelAll, FFmpegError } from '@/services/ffmpeg';
import { appendGateLog, gateInputFor, runGate } from '@/core/authenticity';
import { loudnessOk } from '@/core/renderRules';
import { titleCache } from '@/core/discovery';
import { ORIGINALITY_CHECKLIST } from '@/core/originality';
import type { RootStackParamList } from '@/navigation/types';
import { BOTTOM_OVERLAY_SECONDS, viralBadge, type ViralInfo } from '@/core/viralBatch';

export default function AssemblyScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Assembly'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const patchAssets = useStudio((s) => s.patchAssets);
  const updateProject = useStudio((s) => s.updateProject);

  const [rendering, setRendering] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // A render outlives the screen if the user navigates away, so every state
  // write is gated on the component still being mounted.
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // State lags a render behind; the ref stops a double tap starting two renders.
  const renderingRef = useRef(false);

  useEffect(
    () => () => {
      mounted.current = false;
      abortRef.current?.abort();
    },
    []
  );

  const player = useVideoPlayer(project?.assets.finalVideo ?? null);

  const projects = useStudio((s) => s.projects);
  const competitorVideos = useStudio((s) => s.weekly.competitorVideos);
  const channels = useStudio((s) => s.weekly.channels);
  const titles = useMemo(() => titleCache(competitorVideos, channels), [competitorVideos, channels]);
  const gate = useMemo(
    () => (project ? runGate(gateInputFor(project, projects, titles, settings.neutralTerms)) : undefined),
    [project, projects, titles, settings.neutralTerms]
  );
  const [overrideReason, setOverrideReason] = useState('');
  const [source, setSource] = useState(project?.source ?? '');

  // Lines arrive pre-batched from the FFmpeg wrapper; keep only a bounded tail
  // so a long render cannot pin tens of thousands of strings in memory.
  const appendLogs = useCallback((lines: string[]) => {
    if (!mounted.current) return;
    setLogs((prev) => [...prev, ...lines].slice(-200));
  }, []);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const render = async () => {
    // Guard re-entry: a double tap would otherwise start two FFmpeg sessions
    // writing to the same output file.
    if (renderingRef.current) return;

    // The gate runs fresh against the live store on every attempt, and every attempt is logged.
    const live = useStudio.getState();
    const result = runGate(gateInputFor(project, live.projects, titles, live.settings.neutralTerms));
    updateProject(project.id, { gateLog: appendGateLog(project.gateLog, result, project.review, new Date()) });
    if (!result.ok) {
      Alert.alert(
        'Blocked by the authenticity gate',
        result.checks
          .filter((c) => c.status === 'block')
          .map((c) => `${c.label}: ${c.detail}`)
          .join('\n\n')
      );
      return;
    }

    renderingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setRendering(true);
    setLogs([]);
    setProgress(0);
    setStep('Starting');

    try {
      const short = project.mode === 'short';
      const opts = {
        includeMascot: settings.includeMascot && settings.mascot !== 'off',
        textWatermark: short && settings.textWatermark,
        mascot: settings.mascot,
        wordCaptions: settings.wordCaptions,
        includeCaptions: settings.includeCaptions,
        draft: settings.draftRender,
        hootSide: settings.hootSide,
        musicBed: short && (settings.musicBed || Boolean(project.style?.music)),
        cutWhoosh: short && settings.cutWhoosh,
        punchIn: short && settings.punchIn,
        onRenderInfo: (info: RenderInfo) => patchAssets(project.id, { renderInfo: info as any }),
        hook: useStudio.getState().channelConfig.hook,
        signal: controller.signal,
        onLog: appendLogs,
        onProgress: (label: string, done: number, total: number) => {
          if (!mounted.current) return;
          setStep(label);
          setProgress(total > 0 ? done / total : 0);
        },
      };

      const uri = project.mode === 'short' ? await assembleShort(project, opts) : await assembleLongform(project, opts);
      patchAssets(project.id, {
        finalVideo: uri,
        mascotVariant: short ? (settings.includeMascot ? 'delayed' : 'none') : undefined,
        // A long render reports nothing, so a Short's old render check must not linger.
        ...(short ? {} : { renderInfo: undefined }),
      } as any);
      if (mounted.current) {
        setStep('Complete');
        setProgress(1);
      }
    } catch (e) {
      const cancelled = controller.signal.aborted;
      if (e instanceof FFmpegError && e.logs) appendLogs(e.logs.slice(-4000).split('\n'));
      if (mounted.current) {
        if (!cancelled) Alert.alert('Render failed', e instanceof Error ? e.message : String(e));
        setStep(cancelled ? 'Cancelled' : 'Failed');
      }
    } finally {
      abortRef.current = null;
      renderingRef.current = false;
      if (mounted.current) setRendering(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    void cancelAll();
  };

  const saveToGallery = async () => {
    if (!project.assets.finalVideo) return;
    try {
      const where = await saveRenderToGallery(project.assets.finalVideo);
      if (where !== 'gallery') Alert.alert('Permission needed', 'Allow media access to save the render to your gallery.');
      else Alert.alert('Saved', 'The render is in your gallery.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  const viral: ViralInfo | undefined = project.mode === 'short' ? (project.script as any).bankV2?.viral : undefined;

  return (
    <Screen>
      <Card>
        <H2>Assembly</H2>
        <Small>
          {project.mode === 'short'
            ? 'Hero clips are speed-matched to the voiceover, then word-level captions are burned in. Every Short opens on its hook_text banner, the first word at 0:00 and a low-bass hit (A10).'
            : 'Every chapter is synced and captioned against its own audio before anything is concatenated, so drift cannot compound.'}
        </Small>
      </Card>

      {viral ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>Viral batch</H3>
            <Badge label={viralBadge(viral)} tone="warn" />
          </Row>
          <Small>
            The shots run in storyboard order at an even pace, the hook banner sits on frame 1, the bank's subtitles are
            burned into the centre third in place of the captions and text cards, and the audio cuts on the last
            syllable so it loops into 0:00.
          </Small>
          {viral.subtitles.map((c, i) => (
            <Small key={i} style={{ color: colors.text }}>
              {c.start.toFixed(1)}–{c.end.toFixed(1)} s · {c.text}
            </Small>
          ))}
          {viral.bottomOverlay ? (
            <Small>
              Last {BOTTOM_OVERLAY_SECONDS} s, small at the bottom: {viral.bottomOverlay}
            </Small>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <H3>Options</H3>
        <ToggleRow
          label="Burn captions"
          hint="Kinetic ASS subtitles with neon-yellow highlight"
          value={settings.includeCaptions}
          onChange={(v) => updateSettings({ includeCaptions: v })}
        />
        <ToggleRow
          label="Professor Hoot overlay"
          hint={
            project.mode === 'short'
              ? 'Pack v2, small and bottom-left. Shown in the last 2 s by default; change it in Settings (CR-86B)'
              : 'Pack v2, bottom-right all the way through: opens the file on each chapter, reacts on key lines'
          }
          value={settings.includeMascot}
          onChange={(v) => updateSettings({ includeMascot: v })}
        />
        <ToggleRow
          label="Draft quality"
          hint="720p, faster preset: for checking only. A draft is never published (CR-80J)"
          value={settings.draftRender}
          onChange={(v) => updateSettings({ draftRender: v })}
        />
        {project.mode === 'short' ? (
          <ToggleRow
            label="Music bed (test)"
            hint="A soft pad made by the app under the voice, ducked while speech plays, about 14 dB under it. Off unless you switch it on."
            value={settings.musicBed}
            onChange={(v) => updateSettings({ musicBed: v })}
          />
        ) : null}
        {project.mode === 'short' ? (
          <ToggleRow
            label="Whoosh at cuts (test)"
            hint="A short, quiet whoosh at each cut, made by the app. Off unless you switch it on."
            value={settings.cutWhoosh}
            onChange={(v) => updateSettings({ cutWhoosh: v })}
          />
        ) : null}
        {project.mode === 'short' ? (
          <ToggleRow
            label="Punch-in (test)"
            hint="Each generated clip slowly grows 1.0x to 1.12x, a small reset every 2 to 3 s. Off unless you switch it on."
            value={settings.punchIn}
            onChange={(v) => updateSettings({ punchIn: v })}
          />
        ) : null}
      </Card>

      {project.mode === 'short' && project.assets.renderInfo ? (
        <RenderCheck info={project.assets.renderInfo as unknown as RenderInfo} />
      ) : null}

      <Card>
        <H3>Reused, not regenerated</H3>
        <Small>
          Assembling never re-imports clips or re-bills voice. It uses what is already on the
          device; anything missing is simply skipped.
        </Small>
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small>Imported clips</Small>
          <Small style={{ color: colors.text }}>{Object.keys(project.assets.clips).length}</Small>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Voiced tracks</Small>
          <Small style={{ color: colors.text }}>{Object.keys(project.assets.audio).length}</Small>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Generated stills</Small>
          <Small style={{ color: colors.text }}>{Object.keys(project.assets.stills).length}</Small>
        </Row>
      </Card>

      {gate ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>Authenticity gate</H3>
            <Badge label={gate.ok ? 'READY' : 'BLOCKED'} tone={gate.ok ? 'ok' : 'danger'} />
          </Row>
          {gate.checks.map((c) => (
            <View key={c.id} style={{ marginTop: space.xs }}>
              <Small
                style={{
                  color: c.status === 'block' ? colors.danger : c.status === 'warn' ? colors.warn : colors.ok,
                  fontWeight: '800',
                }}
              >
                {c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✕'} {c.label}
              </Small>
              <Small>{c.detail}</Small>
            </View>
          ))}
          {gate.checks.some((c) => c.id === 'originality' && c.status === 'block') ? (
            <>
              <Field
                label="Publish this title anyway: why is it fine?"
                value={overrideReason}
                onChangeText={setOverrideReason}
                placeholder="e.g. the same term, my own angle and study"
              />
              <Button
                label="Log the reason and allow it"
                variant="secondary"
                disabled={overrideReason.trim().length < 8}
                onPress={() =>
                  updateProject(project.id, {
                    originalityOverride: { reason: overrideReason.trim(), at: new Date().toISOString() },
                  })
                }
              />
            </>
          ) : null}
          {Boolean((project.script as any).bankV2) ? null : (
            <Field
              label="Source (the study or concept this is based on)"
              value={source}
              onChangeText={(t) => {
                setSource(t);
                updateProject(project.id, { source: t.trim() || undefined });
              }}
              placeholder="e.g. Cialdini (1984), Influence"
            />
          )}
          {settings.reviewerName.trim() ? null : (
            <Field
              label="Reviewer name (saved for every review)"
              value={settings.reviewerName}
              onChangeText={(t) => updateSettings({ reviewerName: t })}
              placeholder="Your name"
            />
          )}
          <Small>Before you tick: {ORIGINALITY_CHECKLIST.join(' ')}</Small>
          <ToggleRow
            label="I've read this script and the visuals match it."
            hint={
              settings.reviewerName.trim()
                ? `Recorded as ${settings.reviewerName.trim()} with the time. Any later change to the script or shots clears it.`
                : 'Enter your name first.'
            }
            value={Boolean(project.review && project.review.scriptHash === gate.scriptHash)}
            onChange={(v) => {
              if (!settings.reviewerName.trim()) {
                Alert.alert('Name needed', 'Type the reviewer name first; it is stored with the review.');
                return;
              }
              updateProject(project.id, {
                review: v
                  ? { reviewer: settings.reviewerName.trim(), at: new Date().toISOString(), scriptHash: gate.scriptHash }
                  : undefined,
              });
            }}
          />
          {gate.checks.some((c) => c.id === 'hook' && c.status === 'block') && project.mode === 'long' ? (
            <Small style={{ color: colors.warn }}>
              This script may be from an older version of the bank. Go back to the project: if it says "The bank has
              changed", tap "Update from the bank".
            </Small>
          ) : null}
          <Small>
            Every video must pass before it renders, and every attempt is logged (CR-45). These checks can't be switched
            off (CR-57).
          </Small>
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Render</H3>
          <Badge
            label={step || 'idle'}
            tone={
              step === 'Complete' ? 'ok' : step === 'Failed' ? 'danger' : rendering || step === 'Cancelled' ? 'warn' : 'neutral'
            }
          />
        </Row>
        <ProgressBar fraction={progress} />
        <Row style={{ marginTop: space.sm }}>
          <Button
            label={rendering ? 'Rendering…' : project.assets.finalVideo ? 'Re-render' : 'Assemble video'}
            onPress={render}
            loading={rendering}
            disabled={!gate?.ok && !rendering}
            style={{ flex: 1 }}
          />
          {rendering ? <Button label="Cancel" variant="danger" onPress={cancel} /> : null}
        </Row>
      </Card>

      {project.assets.finalVideo ? (
        <Card>
          <H3>Preview</H3>
          <VideoView
            player={player}
            style={[s.video, { aspectRatio: project.mode === 'short' ? 9 / 16 : 16 / 9 }]}
            nativeControls
            contentFit="contain"
          />
          <Button label="Save to gallery" variant="secondary" onPress={saveToGallery} />
        </Card>
      ) : null}

      {logs.length ? (
        <Card>
          <H3>FFmpeg log</H3>
          <ScrollView style={s.logBox} nestedScrollEnabled>
            {logs.map((line, i) => (
              <Text key={i} style={s.logLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </Card>
      ) : null}
    </Screen>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: space.xs }}>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '600' }}>{label}</Body>
        <Small>{hint}</Small>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accentDim, false: colors.border }}
        thumbColor={value ? colors.accent : colors.textFaint}
      />
    </Row>
  );
}

/** What the last Short render measured: size, loudness, silences and the first frames. */
function RenderCheck({ info }: { info: RenderInfo }) {
  const rows: [string, string, boolean | undefined][] = [
    ['Size', `${info.width}x${info.height}${info.draft ? ' (draft: not for publishing)' : ''}`, !info.draft],
    [
      'Loudness',
      info.lufs !== undefined ? `${info.lufs.toFixed(1)} LUFS (aim -14, accept -15 to -13)` : 'not measured',
      info.lufs !== undefined ? loudnessOk(info.lufs) : undefined,
    ],
    [
      'Silences over 0.45 s',
      info.longGaps !== undefined ? String(info.longGaps) : 'not measured',
      info.longGaps !== undefined ? info.longGaps === 0 : undefined,
    ],
    ...(info.pausesCut
      ? [['Pauses trimmed', `${info.pausesCut.toFixed(2)} s taken out at 0.35 s each`, true] as [string, string, boolean]]
      : []),
  ];

  return (
    <Card>
      <H3>Render check</H3>
      {info.hookText ? <Small>Hook text drawn from frame 0: "{info.hookText}"</Small> : null}
      {rows.map(([label, value, ok]) => (
        <Row key={label} style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small>{label}</Small>
          <Small style={{ color: ok === undefined ? colors.text : ok ? colors.ok : colors.warn }}>{value}</Small>
        </Row>
      ))}
      {info.frame0 || info.frame30 ? (
        <Row style={{ gap: space.sm, marginTop: space.sm }}>
          {(
            [
              ['Frame 0', info.frame0],
              ['At 1 s', info.frame30],
            ] as [string, string | undefined][]
          ).map(([label, uri]) =>
            uri ? (
              <View key={label} style={{ flex: 1 }}>
                <Image
                  source={{ uri }}
                  style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: radius.sm }}
                  resizeMode="cover"
                />
                <Small>{label}</Small>
              </View>
            ) : null
          )}
        </Row>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  video: { width: '100%', backgroundColor: '#000', borderRadius: radius.md, marginVertical: space.sm },
  logBox: {
    maxHeight: 220,
    backgroundColor: '#05070b',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  logLine: { color: colors.textFaint, fontSize: 10, fontFamily: 'monospace', lineHeight: 14 },
});
