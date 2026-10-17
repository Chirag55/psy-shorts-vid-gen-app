import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, space } from '@/theme';
import { Badge, Body, Button, Card, Empty, H1, ProgressBar, Row, Small } from '@/components/ui';
import { useStudio } from '@/store';
import { getKey } from '@/services/keys';
import { fetchSubscription } from '@/services/elevenlabs';
import { countWords, fullNarration } from '@/core/guardrails';
import { isV2 } from '@/core/topicBank';
import { collectReleases } from '@/core/schedule';
import { nextLongFor, nextShortFor } from '@/core/weekPlan';
import { blockReasons, plannableLongs } from '@/core/rotation';
import { openTasks } from '@/core/funnel';
import { daysUntil, YPP, yppProgress } from '@/core/ypp';
import { watchUrl } from '@/services/youtube';
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
  const bank = useStudio((s) => s.bank);
  const bankMode = settings.topicSource !== 'ai';
  const allProjects = useStudio((s) => s.projects);
  const channelUploads = useStudio((s) => s.channelUploads);
  const channelConfig = useStudio((s) => s.channelConfig);
  const weekPlan = useStudio((s) => s.weekPlan);

  const nextShort = useMemo(
    () =>
      bankMode
        ? nextShortFor(bank, collectReleases(allProjects, channelUploads), channelConfig, weekPlan).entry
        : undefined,
    [bank, bankMode, allProjects, channelUploads, channelConfig, weekPlan],
  );
  const nextLong = useMemo(() => (bankMode ? nextLongFor(bank, weekPlan) : undefined), [bank, bankMode, weekPlan]);
  const blocked = useMemo(() => bank.filter((e: any) => e.status === 'unused' && blockReasons(e).length).length, [bank]);
  const releaseWatch = useStudio((s) => s.releaseWatch);
  const tasks = useMemo(
    () =>
      openTasks(
        projects,
        releaseWatch,
        new Date(),
        watchUrl,
        plannableLongs(bank).map((e: any) => e.title),
      ),
    [projects, releaseWatch, bank],
  );
  const ypp = useStudio((s) => s.ypp);
  const yppRows = useMemo(() => yppProgress(ypp.snapshot, ypp.manual, new Date()), [ypp]);

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
      ],
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
                <Badge
                  label={quotaError ? 'offline' : `${Math.round(pct * 100)}% used`}
                  tone={quotaError ? 'neutral' : quotaTone}
                />
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

            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.quotaLabel}>Partner Program</Text>
                <Badge label={`${daysUntil(YPP.deadline, new Date())} days to 1 Feb 2027`} tone="info" />
              </Row>
              {[yppRows[1], yppRows[2], yppRows[4]].map((r) => (
                <Small key={r.label}>
                  {r.label}: {Math.round(r.current).toLocaleString()} / {r.target.toLocaleString()}
                  {r.eta === 'done' ? ' ✓' : r.eta ? ` · ~${r.eta}` : ''}
                </Small>
              ))}
              <Button label="Progress and weekly review" variant="ghost" onPress={() => nav.navigate('Ypp')} />
            </Card>

            {tasks.length ? (
              <Card>
                <Text style={s.quotaLabel}>To do in YouTube Studio ({tasks.length})</Text>
                {tasks.slice(0, 4).map(({ project, task }) => (
                  <Pressable key={`${project.id}-${task.id}`} onPress={() => nav.navigate('Publish', { id: project.id })}>
                    <Small style={{ color: colors.text }}>
                      • {task.title} — {project.publish.title || project.script.title}
                    </Small>
                  </Pressable>
                ))}
                <Small>
                  The API can't set a Short's Related video, pin a comment or add an end screen. Tap one to open its
                  card.
                </Small>
              </Card>
            ) : null}

            {bankMode ? (
              <Card>
                <Text style={s.quotaLabel}>Up next from your topic bank</Text>
                {nextShort ? (
                  <>
                    <Small>
                      Short · {nextShort.id.replace(/^MF-S-/, '')}
                      {isV2(nextShort) && nextShort.kind === 'short' ? ` · ${nextShort.format} · ${nextShort.pillar}` : ''}
                    </Small>
                    <Body style={{ fontWeight: '800' }}>{nextShort.title}</Body>
                    <Button
                      label="Make this Short"
                      onPress={() => nav.navigate('Generate', { mode: 'short', bankEntryId: nextShort.id })}
                    />
                  </>
                ) : null}
                {nextLong ? (
                  <>
                    <Small>
                      Long-form · {nextLong.id}
                      {isV2(nextLong) && nextLong.kind === 'long' ? ` · ${nextLong.pillar} · Saturday` : ''}
                    </Small>
                    <Body style={{ fontWeight: '800' }}>{nextLong.title}</Body>
                    <Button
                      label="Make this deep dive"
                      variant="secondary"
                      onPress={() => nav.navigate('Generate', { mode: 'long', bankEntryId: nextLong.id })}
                    />
                  </>
                ) : null}
                {nextShort || nextLong ? null : (
                  <Small>
                    {bank.length
                      ? blocked
                        ? `No plannable topic left. ${blocked} v2 Short${blocked === 1 ? ' is' : 's are'} blocked by the hook gate: fix ${blocked === 1 ? 'it' : 'them'} in the bank file and import again.`
                        : 'Every v2 topic is in progress, published or skipped. Import the next bank.'
                      : 'No topics yet. Import a topic bank file to start.'}
                  </Small>
                )}
                <Button
                  label={bank.length ? 'All topics' : 'Import a topic bank'}
                  variant="ghost"
                  onPress={() => nav.navigate('TopicBank')}
                />
              </Card>
            ) : (
              <>
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
              </>
            )}

            {bankMode ? (
              <Pressable onPress={() => nav.navigate('Generate', { mode: 'short' })}>
                <Small style={{ color: colors.accent, textAlign: 'center' }}>Or write a Short on your own topic</Small>
              </Pressable>
            ) : null}

            <Text style={s.sectionTitle}>Projects</Text>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="No projects yet"
            hint="Make the next topic from your bank to start. Everything stays on this device."
          />
        }
        renderItem={({ item }) => (
          <ProjectRow
            project={item}
            onOpen={() => nav.navigate('Project', { id: item.id })}
            onLongPress={() => confirmDelete(item)}
          />
        )}
      />
    </View>
  );
}

function ProjectRow({ project, onOpen, onLongPress }: { project: Project; onOpen: () => void; onLongPress: () => void }) {
  const words = countWords(fullNarration(project.script));
  const voiced = Object.keys(project.assets.audio).length;
  const clips = Object.keys(project.assets.clips).length;
  const rendered = Boolean(project.assets.finalVideo);
  const published = Boolean(project.assets.youtubeVideoId);

  return (
    <Pressable onPress={onOpen} onLongPress={onLongPress} style={({ pressed }) => [s.projectCard, pressed && { opacity: 0.8 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={project.mode === 'short' ? '9:16 SHORT' : '16:9 DEEP DIVE'} tone="info" />
        {published ? (
          <Badge label="PUBLISHED" tone="ok" />
        ) : rendered ? (
          <Badge label="RENDERED" tone="ok" />
        ) : null}
      </Row>
      <Body style={s.projectTitle}>{project.script.title}</Body>
      <Small>{project.category}</Small>
      <Row style={{ marginTop: space.xs, flexWrap: 'wrap' }}>
        <Small>{words} words</Small>
        <Small>·</Small>
        <Small>{clips} clips</Small>
        <Small>·</Small>
        <Small>{voiced} voiced</Small>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  quotaLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: space.sm,
  },
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
