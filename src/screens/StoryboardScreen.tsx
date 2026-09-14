import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Body, Card, Divider, Empty, H2, H3, Row, Screen, Small } from '@/components/ui';
import { PromptCard } from '@/components/PromptCard';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { importInto } from '@/services/workspace';
import { generateStill } from '@/services/imagen';
import { getKey } from '@/services/keys';
import { continuationPrefix } from '@/core/styleLock';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

export default function StoryboardScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Storyboard'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const setClip = useStudio((s) => s.setClip);
  const setStill = useStudio((s) => s.setStill);

  const [generating, setGenerating] = useState<string | null>(null);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  /** Imports a Veo result from the camera roll into the project workspace. */
  const importClip = async (key: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import clips you generated in Flow.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    try {
      const uri = await importInto('clips', project.slug, result.assets[0].uri, `${key}.mp4`);
      setClip(project.id, key, uri);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const makeStill = async (key: string, prompt: string) => {
    const apiKey = await getKey('gemini');
    if (!apiKey) {
      Alert.alert('Gemini key missing', 'Imagen uses the same key. Add it in Settings.');
      return;
    }
    setGenerating(key);
    try {
      const uri = await generateStill({
        apiKey,
        prompt,
        slug: project.slug,
        key,
        aspectRatio: project.mode === 'short' ? '9:16' : '16:9',
      });
      setStill(project.id, key, uri);
    } catch (e) {
      Alert.alert('Still generation failed', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(null);
    }
  };

  const clipStatus = (key: string) =>
    project.assets.clips[key]
      ? ({ label: 'IMPORTED', tone: 'ok' } as const)
      : ({ label: 'PENDING', tone: 'neutral' } as const);

  return (
    <Screen>
      <Card>
        <H2>Storyboard</H2>
        <Small>
          Copy a prompt, paste it into Google Flow on this phone, then import the finished clip back here.
        </Small>
        <Divider />
        <Small style={{ color: colors.textDim }}>Continuity phrase for this project:</Small>
        <Body style={{ fontSize: 13, color: colors.accent }}>
          {continuationPrefix(project.script.characterDescription)}
        </Body>
      </Card>

      {project.mode === 'short'
        ? (project.script as ShortScript).beats.map((beat, i) => (
            <Card key={i}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H3>Beat {i + 1} · {beat.kind.toUpperCase()}</H3>
                <Badge label={`${beat.text.trim().split(/\s+/).length}w`} tone="info" />
              </Row>
              <Body style={{ fontSize: 14, lineHeight: 20 }}>{beat.text}</Body>
              <View style={{ marginTop: space.sm }}>
                <PromptCard
                  label={`CLIP ${i + 1} — ${i === 0 ? 'ESTABLISH' : 'CONTINUATION'}`}
                  prompt={beat.clipPrompt}
                  status={clipStatus(`short_${i}`)}
                  onImport={() => importClip(`short_${i}`)}
                />
              </View>
            </Card>
          ))
        : (
          <>
            <Card>
              <H3>Cold Open</H3>
              <Body style={{ fontSize: 14, lineHeight: 20 }}>{(project.script as LongScript).coldOpen}</Body>
              <Small>Voiced as chapter 0. Its visuals reuse chapter 1's hero clips.</Small>
            </Card>

            {(project.script as LongScript).chapters.map((ch) => (
              <Card key={ch.index}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <H3>Ch {ch.index} · {ch.title}</H3>
                  <Badge label={ch.kenBurns.replace('_', ' ')} tone="info" />
                </Row>

                <Small style={{ color: colors.accent }}>MINI-HOOK</Small>
                <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.miniHook}</Body>
                <Small style={{ color: colors.accent }}>MECHANISM</Small>
                <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.mechanism}</Body>
                <Small style={{ color: colors.accent }}>MICRO-REFRAME</Small>
                <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.microReframe}</Body>

                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  <PromptCard
                    label="CLIP A — HOOK ACTION"
                    prompt={ch.heroA}
                    status={clipStatus(`${ch.index}_a`)}
                    onImport={() => importClip(`${ch.index}_a`)}
                  />
                  <PromptCard
                    label="CLIP B — MECHANISM ESCALATION"
                    prompt={ch.heroB}
                    status={clipStatus(`${ch.index}_b`)}
                    onImport={() => importClip(`${ch.index}_b`)}
                  />
                  <PromptCard
                    label="STILL — REFRAME METAPHOR"
                    prompt={ch.stillPrompt}
                    status={
                      project.assets.stills[String(ch.index)]
                        ? { label: 'GENERATED', tone: 'ok' }
                        : { label: 'PENDING', tone: 'neutral' }
                    }
                    onGenerate={() => makeStill(String(ch.index), ch.stillPrompt)}
                    generating={generating === String(ch.index)}
                  />
                </View>
              </Card>
            ))}

            <Card>
              <H3>Closing Synthesis</H3>
              <Body style={{ fontSize: 14, lineHeight: 20 }}>{(project.script as LongScript).closingSynthesis}</Body>
              <Small>Voiced as chapter 99.</Small>
            </Card>
          </>
        )}

      <Card>
        <Small>
          Stills cost a fraction of a Veo clip, which is why each chapter gets two hero clips and one animated
          still rather than three clips.
        </Small>
      </Card>
    </Screen>
  );
}
