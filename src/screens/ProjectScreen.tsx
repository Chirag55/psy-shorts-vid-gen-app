import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Badge, Body, Button, Card, Divider, Empty, H2, Row, Screen, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { countWords, estimateDuration, fullNarration, validateScript } from '@/core/guardrails';
import { buildDescription } from '@/core/timestamps';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProjectScreen() {
  const nav = useNavigation<Nav>();
  const { id } = useRoute<RouteProp<RootStackParamList, 'Project'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));

  const issues = useMemo(() => (project ? validateScript(project.script) : []), [project]);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const words = countWords(fullNarration(project.script));
  const seconds = estimateDuration(fullNarration(project.script));

  const chapterCount = project.script.mode === 'long' ? project.script.chapters.length : 0;
  const expectedClips = project.mode === 'short' ? 3 : chapterCount * 2;
  const clipCount = Object.keys(project.assets.clips).length;
  const expectedAudio = project.mode === 'short' ? 1 : chapterCount + 2;
  const audioCount = Object.keys(project.assets.audio).length;

  const copyScript = async () => {
    const text =
      project.mode === 'short'
        ? (project.script as ShortScript).beats.map((b) => `[${b.kind.toUpperCase()}]\n${b.text}`).join('\n\n')
        : buildDescription(project.script as LongScript);
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Script copied to the clipboard.');
  };

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={project.mode === 'short' ? '9:16 SHORT' : '16:9 DEEP DIVE'} tone="info" />
          <Small>{project.slug}</Small>
        </Row>
        <H2>{project.script.title}</H2>
        <Small>{project.category} · {project.script.archetype}</Small>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>{words} spoken words</Small>
          <Small>≈ {seconds.toFixed(0)}s runtime</Small>
        </Row>
      </Card>

      {issues.length ? (
        <Card>
          <H2>Guardrails</H2>
          {issues.map((issue, i) => (
            <Body key={i} style={{ color: issue.severity === 'error' ? colors.danger : colors.warn, fontSize: 13 }}>
              {issue.severity === 'error' ? '✕' : '!'} {issue.message}
            </Body>
          ))}
        </Card>
      ) : (
        <Card>
          <Row>
            <Badge label="GUARDRAILS PASS" tone="ok" />
          </Row>
          <Small>Word count, beat structure and catchphrase all check out.</Small>
        </Card>
      )}

      <Card>
        <H2>Pipeline</H2>
        <PipelineRow
          step="1"
          title="Storyboard & prompts"
          detail={`${clipCount} / ${expectedClips} clips imported`}
          tone={clipCount >= expectedClips ? 'ok' : clipCount > 0 ? 'warn' : 'neutral'}
          onPress={() => nav.navigate('Storyboard', { id })}
        />
        <PipelineRow
          step="2"
          title="Voice & alignment"
          detail={`${audioCount} / ${expectedAudio} tracks voiced`}
          tone={audioCount >= expectedAudio ? 'ok' : audioCount > 0 ? 'warn' : 'neutral'}
          onPress={() => nav.navigate('Voice', { id })}
        />
        <PipelineRow
          step="3"
          title="Assemble"
          detail={project.assets.finalVideo ? 'Rendered' : 'Not rendered'}
          tone={project.assets.finalVideo ? 'ok' : 'neutral'}
          onPress={() => nav.navigate('Assembly', { id })}
        />
        <PipelineRow
          step="4"
          title="Thumbnail"
          detail={project.assets.thumbnail ? 'Ready' : 'Not made'}
          tone={project.assets.thumbnail ? 'ok' : 'neutral'}
          onPress={() => nav.navigate('Thumbnail', { id })}
        />
        <PipelineRow
          step="5"
          title="Publish to YouTube"
          detail={project.assets.youtubeVideoId ? `Live · ${project.assets.youtubeVideoId}` : 'Not published'}
          tone={project.assets.youtubeVideoId ? 'ok' : 'neutral'}
          onPress={() => nav.navigate('Publish', { id })}
        />
      </Card>

      <Button label="Copy full script" variant="secondary" onPress={copyScript} />
    </Screen>
  );
}

function PipelineRow({
  step,
  title,
  detail,
  tone,
  onPress,
}: {
  step: string;
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'neutral';
  onPress: () => void;
}) {
  return (
    <Button
      label={`${step}. ${title}  —  ${detail}`}
      variant={tone === 'ok' ? 'secondary' : 'ghost'}
      onPress={onPress}
      style={{ marginTop: space.xs, alignItems: 'flex-start' }}
    />
  );
}
