import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, space } from '@/theme';
import { Badge, Body, Button, Card, Empty, H1, ProgressBar, Row, Small } from '@/components/ui';
import { useStudio } from '@/store';
import { getKey } from '@/services/keys';
import { fetchSubscription } from '@/services/elevenlabs';
import { countWords, fullNarration } from '@/core/guardrails';
import type { RootStackParamList } from '@/navigation/types';
import type { Project } from '@/core/types';
import { useMounted } from '@/util/useMounted';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function StudioHubScreen() {
  const nav = useNavigation<Nav>();
  const projects = useStudio((s) => s.projects);
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const deleteProject = useStudio((s) => s.deleteProject);

  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useMounted();

  /** Pulls live quota so the badge reflects spend from the desktop studio too. */
  const refreshQuota = useCallback(async () => {
    const key = await getKey('elevenlabs');
    if (!key) {
      if (mounted.current) setQuotaError('No ElevenLabs key set');
      return;
    }
    setRefreshing(true);
    try {
      const sub = await fetchSubscription(key);
      updateSettings({ voiceCharsUsed: sub.characterCount, voiceCharLimit: sub.characterLimit });
      if (mounted.current) setQuotaError(null);
    } catch (e) {
      if (mounted.current) setQuotaError(e instanceof Error ? e.message : 'Quota unavailable');
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [updateSettings, mounted]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  const used = settings.voiceCharsUsed;
  const limit = settings.voiceCharLimit || 1;
  const pct = used / limit;
  const quotaTone = pct > 0.9 ? 'danger' : pct > 0.7 ? 'warn' : 'ok';

  const confirmDelete = (project: Project) => {
    Alert.alert(
      'Delete project',
      `Remove "${project.script.title}" and every rendered file for it? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteProject(project.id) },
      ]
    );
  };

  return (
    <View style={s.root}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <H1>The Mind Files</H1>

            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.quotaLabel}>ElevenLabs quota</Text>
                <Badge label={quotaError ? 'offline' : `${Math.round(pct * 100)}% used`} tone={quotaError ? 'neutral' : quotaTone} />
              </Row>
              <ProgressBar fraction={pct} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Small>
                  {used.toLocaleString()} / {limit.toLocaleString()} characters
                </Small>
                <Pressable onPress={refreshQuota} disabled={refreshing}>
                  <Small style={{ color: colors.accent }}>{refreshing ? 'Refreshing…' : 'Refresh'}</Small>
                </Pressable>
              </Row>
              {quotaError ? <Small style={{ color: colors.warn }}>{quotaError}</Small> : null}
            </Card>

            <Row>
              <Button label="New Short" onPress={() => nav.navigate('Generate', { mode: 'short' })} style={{ flex: 1 }} />
              <Button
                label="New Deep Dive"
                variant="secondary"
                onPress={() => nav.navigate('Generate', { mode: 'long' })}
                style={{ flex: 1 }}
              />
            </Row>

            <Button label="Topic Bank" variant="ghost" onPress={() => nav.navigate('TopicBank')} />

            <Text style={s.sectionTitle}>Projects</Text>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="No projects yet"
            hint="Generate a short or a deep dive to start a storyboard. Everything stays on this device."
          />
        }
        renderItem={({ item }) => (
          <ProjectRow project={item} onOpen={() => nav.navigate('Project', { id: item.id })} onLongPress={() => confirmDelete(item)} />
        )}
      />
    </View>
  );
}

function ProjectRow({
  project,
  onOpen,
  onLongPress,
}: {
  project: Project;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const words = countWords(fullNarration(project.script));
  const audioCount = Object.keys(project.assets.audio).length;
  const clipCount = Object.keys(project.assets.clips).length;
  const done = Boolean(project.assets.finalVideo);
  const published = Boolean(project.assets.youtubeVideoId);

  return (
    <Pressable onPress={onOpen} onLongPress={onLongPress} style={({ pressed }) => [s.projectCard, pressed && { opacity: 0.8 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={project.mode === 'short' ? '9:16 SHORT' : '16:9 DEEP DIVE'} tone="info" />
        {published ? <Badge label="PUBLISHED" tone="ok" /> : done ? <Badge label="RENDERED" tone="ok" /> : null}
      </Row>
      <Body style={s.projectTitle}>{project.script.title}</Body>
      <Small>{project.category}</Small>
      <Row style={{ marginTop: space.xs, flexWrap: 'wrap' }}>
        <Small>{words} words</Small>
        <Small>·</Small>
        <Small>{clipCount} clips</Small>
        <Small>·</Small>
        <Small>{audioCount} voiced</Small>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  quotaLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: space.sm },
  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 6,
  },
  projectTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
