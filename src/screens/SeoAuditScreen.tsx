import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Badge, Body, Button, Card, Empty, Field, H2, H3, Row, Screen, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { v2SeoInputs } from '@/core/funnel';
import { RetentionCard } from '@/components/RetentionCard';
import { ViralityCard } from '@/components/ViralityCard';
import { alignmentDurations } from '@/core/seoMeta';
import { withPauseDurations } from '@/core/screenplayPlan';
import { validateUpdate } from '@/core/metadataUpdate';
import { proposeSeo } from '@/core/projectSeo';
import { findRelatedDeepDive } from '@/core/related';
import { auditSeo, type SeoCheck } from '@/core/seo';
import { probeDuration } from '@/services/ffmpeg';
import { applyUpdate, fetchLiveVideos, hasBackup, MetadataUpdateError, revertVideo, type LiveVideo } from '@/services/metadataUpdate';
import { signInAgain, youtubeAccessToken } from '@/services/youtubeAuth';
import { shortsUrl, watchUrl } from '@/services/youtube';
import type { RootStackParamList } from '@/navigation/types';
import { useMounted } from '@/util/useMounted';

type Audit = { score: number; checks: SeoCheck[] };

function ScoreBadge({ audit }: { audit: Audit }) {
  return (
    <Badge label={`${audit.score}/100`} tone={audit.score >= 90 ? 'ok' : audit.score >= 70 ? 'warn' : 'danger'} />
  );
}

function Checks({ audit, onlyFailing }: { audit: Audit; onlyFailing?: boolean }) {
  const shown = onlyFailing ? audit.checks.filter((c) => !c.ok) : audit.checks;
  if (!shown.length) return <Small style={{ color: colors.ok }}>Every check passes.</Small>;
  return (
    <>
      {shown.map((c) => (
        <Small key={c.id} style={{ color: c.ok ? colors.ok : colors.warn }}>
          {c.ok ? '✓' : '✗'} {c.label} — {c.detail}
        </Small>
      ))}
    </>
  );
}

/**
 * Audits one uploaded video's title, description and tags against the channel's
 * SEO checks, proposes a fix, and applies it with a backup on the phone.
 */
export default function SeoAuditScreen() {
  const { videoId, short } = useRoute<RouteProp<RootStackParamList, 'SeoAudit'>>().params;
  const projects = useStudio((s) => s.projects);
  const bank = useStudio((s) => s.bank);
  const logMetadataChange = useStudio((s) => s.logMetadataChange);
  const updateBankEntry = useStudio((s) => s.updateBankEntry);
  const mounted = useMounted();

  const project = useMemo(() => projects.find((p) => p.assets.youtubeVideoId === videoId), [projects, videoId]);
  const entry = useMemo(
    () =>
      bank.find((e: any) => e.videoId === videoId) ??
      ((project as any)?.bankEntryId ? bank.find((e: any) => e.id === (project as any).bankEntryId) : undefined),
    [bank, videoId, project],
  );
  const mode: 'short' | 'long' = project?.mode ?? (short ? 'short' : 'long');

  const [live, setLive] = useState<LiveVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [durations, setDurations] = useState<Record<string, number> | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState('');
  const [backedUp, setBackedUp] = useState(() => hasBackup(videoId));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await youtubeAccessToken();
      const found = (await fetchLiveVideos(token, [videoId]))[videoId];
      if (!mounted.current) return;
      if (!found) setError('YouTube did not return this video. It may be deleted, or on another account.');
      setLive(found ?? null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [videoId, mounted]);

  useEffect(() => {
    void load();
  }, [load]);

  // A long video's chapter timestamps need each chapter's real length.
  useEffect(() => {
    if (!project || project.mode !== 'long') return;
    let alive = true;
    void (async () => {
      const d = alignmentDurations(project.assets.alignment);
      await Promise.all(
        Object.entries(project.assets.audio).map(async ([key, uri]) => {
          const seconds = await probeDuration(uri as string);
          if (seconds > 0) d[key] = seconds;
        }),
      );
      if (alive) setDurations(withPauseDurations(project.script as any, d));
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  const deepDive = useMemo(() => {
    if (mode !== 'short' || !project) return undefined;
    const dd = findRelatedDeepDive(project.script as any, projects);
    return dd?.assets.youtubeVideoId ? { title: dd.script.title, url: watchUrl(dd.assets.youtubeVideoId) } : undefined;
  }, [mode, project, projects]);

  const current = live
    ? { title: live.snippet.title, description: live.snippet.description ?? '', tags: live.snippet.tags ?? [] }
    : null;

  const releaseWatch = useStudio((s) => s.releaseWatch);
  const analytics = useStudio((s) => s.analytics);
  const seoInputs = useMemo(
    () =>
      v2SeoInputs(project, projects, releaseWatch, new Date(), {
        watchUrl,
        shortUrl: shortsUrl,
        viewsOf: (id: string) => analytics[id]?.views,
        orderOf: (p: any) => (bank.find((e: any) => e.id === (p.bankEntryId ?? p.script.bankEntryId)) as any)?.order ?? 0,
      } as any),
    [project, projects, releaseWatch, analytics, bank],
  );

  const proposal = useMemo(() => {
    if (!current) return null;
    if (project?.mode === 'long' && !durations) return null;
    return proposeSeo({
      project,
      bankEntry: entry,
      bank,
      durations,
      deepDive,
      live: current,
      mode,
      shortUrl: shortsUrl,
      ...seoInputs,
    } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, project, entry, bank, durations, deepDive, mode, seoInputs]);

  useEffect(() => {
    if (!proposal) return;
    setTitle(proposal.title);
    setDescription(proposal.description);
    setTags(proposal.tags.join(', '));
  }, [proposal]);

  const keyword = proposal?.keyword;
  const currentAudit = current ? auditSeo(current, { mode, keyword, deepDiveUrl: deepDive?.url }) : null;
  const edited = {
    title,
    description,
    tags: tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const proposedAudit = proposal ? auditSeo(edited, { mode, keyword, deepDiveUrl: deepDive?.url }) : null;
  const issues = validateUpdate({ videoId, ...edited } as any);
  const unchanged =
    current !== null &&
    edited.title === current.title &&
    edited.description === current.description &&
    JSON.stringify(edited.tags) === JSON.stringify(current.tags);

  const handleError = (e: unknown, heading: string) => {
    if (e instanceof MetadataUpdateError && (e.kind === 'permissions' || e.kind === 'auth')) {
      Alert.alert(heading, e.message, [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Sign in again',
          onPress: () => {
            signInAgain()
              .then(() => Alert.alert('Signed in', 'Now try again.'))
              .catch((err) => Alert.alert('Sign-in failed', err instanceof Error ? err.message : String(err)));
          },
        },
      ]);
      return;
    }
    Alert.alert(heading, e instanceof Error ? e.message : String(e));
  };

  const apply = async () => {
    if (!live || busy) return;
    setBusy('apply');
    try {
      const token = await youtubeAccessToken();
      const change = await applyUpdate(token, live.snippet.channelId, { videoId, ...edited } as any);
      logMetadataChange({ videoId, at: new Date().toISOString(), kind: 'update', ...change });
      if (entry) updateBankEntry((entry as any).id, { uploaded: edited });
      setBackedUp(true);
      Alert.alert('Updated on YouTube', 'The original is backed up on this phone; Revert puts it back.');
      await load();
    } catch (e) {
      handleError(e, 'Could not update');
    } finally {
      if (mounted.current) setBusy('');
    }
  };

  const revert = async () => {
    setBusy('revert');
    try {
      const token = await youtubeAccessToken();
      const change = await revertVideo(token, videoId);
      logMetadataChange({ videoId, at: new Date().toISOString(), kind: 'revert', ...change });
      Alert.alert('Reverted', 'Title, description and tags are back to how they were before the app first changed them.');
      await load();
    } catch (e) {
      handleError(e, 'Could not revert');
    } finally {
      if (mounted.current) setBusy('');
    }
  };

  if (loading && !live) {
    return (
      <Screen>
        <Card>
          <H2>SEO audit</H2>
          <Small>Reading the video from YouTube…</Small>
        </Card>
      </Screen>
    );
  }

  if (!live || !current || !currentAudit) {
    return (
      <Screen>
        <Empty title="Could not audit this video" hint={error || 'Sign in to YouTube in Settings, then try again.'} />
        {/Sign in to YouTube|sign-in|OAuth client/i.test(error) ? (
          <Button
            label="Sign in to YouTube"
            onPress={() => {
              signInAgain()
                .then(() => load())
                .catch((e) => Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e)));
            }}
          />
        ) : null}
        <Button label="Try again" variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }

  const source =
    proposal?.source === 'bank' && entry
      ? `from the topic bank (${(entry as any).id})`
      : proposal?.source === 'generated'
        ? 'generated from the script this video was made from'
        : 'its own text, with what is missing added';

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Live now</H2>
          <ScoreBadge audit={currentAudit} />
        </Row>
        <Body style={{ fontWeight: '800' }}>{current.title}</Body>
        <Small>
          {mode === 'short' ? 'Short' : 'Deep dive'} · {current.tags.length} tag{current.tags.length === 1 ? '' : 's'}
          {keyword ? ` · focus: "${keyword}"` : ''}
        </Small>
        <Checks audit={currentAudit} />
      </Card>

      {proposal && proposedAudit ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>{proposedAudit.checks.every((c) => c.ok) ? 'Fixed' : 'Proposed fix'}</H2>
            <ScoreBadge audit={proposedAudit} />
          </Row>
          <Small>Proposed {source}. Edit anything before applying. The title is only changed if you change it.</Small>
          {proposal.normalized?.length ? (
            <Small>Added to bring it up to standard: {proposal.normalized.join('; ')}.</Small>
          ) : null}
          {proposedAudit.checks.some((c) => !c.ok) ? (
            <Small style={{ color: colors.warn }}>
              Not fully fixed:{' '}
              {proposedAudit.checks
                .filter((c) => !c.ok)
                .map((c) => c.label)
                .join(', ')}{' '}
              still fail below.
            </Small>
          ) : null}
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field label="Description" value={description} onChangeText={setDescription} multiline />
          <Field label="Tags (comma separated)" value={tags} onChangeText={setTags} autoCapitalize="none" />
          <Checks audit={proposedAudit} onlyFailing />
          {issues.map((issue) => (
            <Small key={issue} style={{ color: colors.danger }}>
              • {issue}
            </Small>
          ))}
          <Button
            label={busy === 'apply' ? 'Updating…' : unchanged ? 'Nothing to change' : 'Apply to YouTube'}
            loading={busy === 'apply'}
            disabled={Boolean(busy) || unchanged || issues.length > 0}
            onPress={() =>
              Alert.alert('Update this video on YouTube?', 'The current title, description and tags are backed up first.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Apply', onPress: () => void apply() },
              ])
            }
          />
          <Button
            label="Reset to the proposal"
            variant="ghost"
            onPress={() => {
              setTitle(proposal.title);
              setDescription(proposal.description);
              setTags(proposal.tags.join(', '));
            }}
          />
        </Card>
      ) : (
        <Card>
          <Small>Preparing the proposal…</Small>
        </Card>
      )}

      {project && (project.mode === 'short' || durations) ? <ViralityCard project={project} durations={durations} /> : null}
      {project ? <RetentionCard project={project} /> : null}

      {proposal?.pinnedComment ? (
        <Card>
          <H3>Pinned comment</H3>
          <Small style={{ color: colors.text }}>{proposal.pinnedComment}</Small>
          <Row style={{ marginTop: space.xs }}>
            <Button
              label="Copy comment"
              variant="ghost"
              onPress={() => void Clipboard.setStringAsync(proposal.pinnedComment ?? '')}
            />
            <Button
              label="Open in Studio"
              variant="secondary"
              onPress={() => void Linking.openURL(`https://studio.youtube.com/video/${videoId}/edit`)}
            />
          </Row>
          <Small>Post it and pin it in YouTube Studio — the API can't pin comments.</Small>
        </Card>
      ) : null}

      {backedUp ? (
        <Card>
          <H3>Backup</H3>
          <Small>This phone has the video's metadata from before the app first changed it.</Small>
          <Button
            label={busy === 'revert' ? 'Reverting…' : 'Revert to the original'}
            variant="ghost"
            loading={busy === 'revert'}
            disabled={Boolean(busy)}
            onPress={() =>
              Alert.alert(
                'Revert this video?',
                'Title, description and tags go back to how they were before the app first changed them.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Revert', style: 'destructive', onPress: () => void revert() },
                ],
              )
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}
