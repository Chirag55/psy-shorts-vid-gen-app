import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import { Badge, Body, Button, Card, Empty, H2, H3, ProgressBar, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { assembleLongform, assembleShort } from '@/services/assembler';
import { cancelAll, FFmpegError } from '@/services/ffmpeg';
import type { RootStackParamList } from '@/navigation/types';

export default function AssemblyScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Assembly'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const patchAssets = useStudio((s) => s.patchAssets);

  const [rendering, setRendering] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // A render outlives the screen if the user navigates away, so every state
  // write is gated on the component still being mounted.
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      mounted.current = false;
      abortRef.current?.abort();
    },
    []
  );

  const player = useVideoPlayer(project?.assets.finalVideo ?? null);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  // Lines arrive pre-batched from the FFmpeg wrapper; keep only a bounded tail
  // so a long render cannot pin tens of thousands of strings in memory.
  const appendLogs = useCallback((lines: string[]) => {
    if (!mounted.current) return;
    setLogs((prev) => [...prev, ...lines].slice(-200));
  }, []);

  const render = async () => {
    // Guard re-entry: a double tap would otherwise start two FFmpeg sessions
    // writing to the same output file.
    if (rendering) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setRendering(true);
    setLogs([]);
    setProgress(0);
    setStep('Starting');

    try {
      const opts = {
        includeMascot: settings.includeMascot,
        includeCaptions: settings.includeCaptions,
        draft: settings.draftRender,
        mascotAssets: settings.mascotAssets,
        signal: controller.signal,
        onLog: appendLogs,
        onProgress: (label: string, done: number, total: number) => {
          if (!mounted.current) return;
          setStep(label);
          setProgress(total > 0 ? done / total : 0);
        },
      };

      const uri = project.mode === 'short' ? await assembleShort(project, opts) : await assembleLongform(project, opts);
      patchAssets(project.id, { finalVideo: uri });
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
      if (mounted.current) setRendering(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    void cancelAll();
  };

  const saveToGallery = async () => {
    if (!project.assets.finalVideo) return;
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to save the render to your gallery.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(project.assets.finalVideo);
      Alert.alert('Saved', 'The render is in your gallery.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Assembly</H2>
        <Small>
          {project.mode === 'short'
            ? 'Hero clips are speed-matched to the voiceover, then word-level captions are burned in.'
            : 'Every chapter is synced and captioned against its own audio before anything is concatenated, so drift cannot compound.'}
        </Small>
      </Card>

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
          hint={project.mode === 'short' ? 'Bottom-left PiP, expression per beat' : 'Chapter transitions only'}
          value={settings.includeMascot}
          onChange={(v) => updateSettings({ includeMascot: v })}
        />
        <ToggleRow
          label="Draft quality"
          hint="720p, faster preset — much cooler and quicker on a phone"
          value={settings.draftRender}
          onChange={(v) => updateSettings({ draftRender: v })}
        />
        {settings.includeMascot && !Object.keys(settings.mascotAssets).length ? (
          <Small style={{ color: colors.warn }}>
            No Hoot expressions imported yet — add them in Settings or the overlay is skipped.
          </Small>
        ) : null}
      </Card>

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
