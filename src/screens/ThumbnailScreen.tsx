import React, { useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { File } from 'expo-file-system';
import { Badge, Button, Card, Empty, Field, H2, H3, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { sampleThumbnailFrames } from '@/services/assembler';
import { bucketFile } from '@/services/workspace';
import type { ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

/**
 * Thumbnail studio.
 *
 * The canvas is composed as real React Native views and captured with
 * view-shot, rather than drawn by FFmpeg — that way the preview the user tunes
 * is pixel-identical to the file that gets written.
 */
export default function ThumbnailScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Thumbnail'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const patchAssets = useStudio((s) => s.patchAssets);

  const shotRef = useRef<ViewShotRef>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [sampling, setSampling] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultLines = splitHeadline(
    project?.mode === 'short' ? (project.script as ShortScript).hookLine : project?.script.title ?? ''
  );
  const [line1, setLine1] = useState(defaultLines[0]);
  const [line2, setLine2] = useState(defaultLines[1]);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const isShort = project.mode === 'short';
  const aspect = isShort ? 9 / 16 : 16 / 9;

  const sample = async () => {
    if (!project.assets.finalVideo) {
      Alert.alert('Render first', 'Assemble the video before sampling candidate frames.');
      return;
    }
    setSampling(true);
    try {
      const frames = await sampleThumbnailFrames(project.assets.finalVideo, project.slug);
      setCandidates(frames);
      setSelected(0);
    } catch (e) {
      Alert.alert('Sampling failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSampling(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Capture at the real YouTube canvas size so the exported PNG is upload-ready.
      const node = shotRef.current;
      if (!node) throw new Error('Preview is not ready yet.');
      const tmpUri = await node.capture();

      const target = bucketFile('thumbnails', project.slug, 'thumbnail.png');
      if (target.exists) target.delete();
      await new File(tmpUri).copy(target);

      patchAssets(project.id, { thumbnail: target.uri });

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.granted) {
        await MediaLibrary.saveToLibraryAsync(target.uri);
        Alert.alert('Saved', 'Thumbnail saved to the workspace and your gallery.');
      } else {
        Alert.alert('Saved', 'Thumbnail saved to the project workspace.');
      }
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const background = candidates[selected];

  return (
    <Screen>
      <Card>
        <H2>Thumbnail studio</H2>
        <Small>Two-line high-impact formula: white top line, gold bottom line, 7.4% safe margins.</Small>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Candidate frames</H3>
          <Badge label={`${candidates.length} sampled`} tone={candidates.length ? 'ok' : 'neutral'} />
        </Row>
        <Button
          label={sampling ? 'Sampling…' : 'Sample frames at 25 / 50 / 75%'}
          variant="secondary"
          loading={sampling}
          onPress={sample}
        />
        {candidates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }}>
            <Row>
              {candidates.map((uri, i) => (
                <Pressable key={uri} onPress={() => setSelected(i)}>
                  <Image
                    source={{ uri }}
                    style={[s.candidate, { aspectRatio: aspect }, selected === i && s.candidateActive]}
                  />
                </Pressable>
              ))}
            </Row>
          </ScrollView>
        ) : null}
      </Card>

      <Card>
        <H3>Preview</H3>
        <ViewShot
          ref={shotRef}
          style={[s.canvas, { aspectRatio: aspect }]}
          options={{
            format: 'png',
            quality: 1,
            width: isShort ? 1080 : 1920,
            height: isShort ? 1920 : 1080,
          }}
        >
          {background ? (
            <Image source={{ uri: background }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#12161f' }]} />
          )}
          <View style={s.scrim} />
          <View style={s.textBlock}>
            {line1 ? <Text style={[s.line, s.line1, isShort && s.lineShort]}>{line1.toUpperCase()}</Text> : null}
            {line2 ? (
              <View style={s.line2Box}>
                <Text style={[s.line, s.line2, isShort && s.lineShort]}>{line2.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </ViewShot>
      </Card>

      <Card>
        <Field label="Line 1 (white)" value={line1} onChangeText={setLine1} autoCapitalize="characters" />
        <Field label="Line 2 (gold)" value={line2} onChangeText={setLine2} autoCapitalize="characters" />
        <Button label={saving ? 'Saving…' : 'Save thumbnail'} loading={saving} onPress={save} />
      </Card>
    </Screen>
  );
}

/** Splits a headline near its midpoint on a word boundary for the two-line formula. */
function splitHeadline(text: string): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text.trim(), ''];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

const s = StyleSheet.create({
  candidate: {
    width: 150,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  candidateActive: { borderColor: colors.accent },
  canvas: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,11,0.35)' },
  textBlock: { padding: '7.4%', gap: 6 },
  line: { fontWeight: '900', letterSpacing: -0.5, fontSize: 30, lineHeight: 34 },
  lineShort: { fontSize: 26, lineHeight: 30 },
  line1: {
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
  },
  line2: { color: colors.accent },
  line2Box: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(5,7,11,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
});
