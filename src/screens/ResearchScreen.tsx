import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import { Badge, Body, Button, Card, H2, H3, ProgressBar, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { currentLedger, estimateRunUnits, remainingUnits } from '@/core/researchQuota';
import { DEFAULT_FILTERS, FILTERS_VERSION, KEYWORDS_VERSION } from '@/core/researchConfig';
import { migrateProfilesV132 } from '@/core/researchMigrate';
import { researchConfigHash } from '@/core/researchHash';
import { previousRate } from '@/core/researchHistory';
import { classifyRelevance } from '@/services/scriptProvider';
import { keywordHistoryFor, seenBefore } from '@/core/researchRuns';
import { replayRun, replaySummary } from '@/core/researchReplay';
import { durationLabel, shortsLink } from '@/core/researchReport';
import { runOutlierResearch } from '@/services/research';
import { clearResearchFiles, deleteRunFiles, isExpired, loadRun, saveRun } from '@/services/researchFiles';
import { shareReport } from '@/services/researchShare';
import { getKey } from '@/services/keys';
import { useMounted } from '@/util/useMounted';

type Progress = { step: string; done: number; total: number };

const appVersion = () =>
  `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;

/** Compact counts: 950, 1.2K, 12K, 1.3M. */
const fmt = (n: number) =>
  n >= 1000000
    ? `${(n / 1000000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`
      : String(Math.round(n));

const times = (n: number) => (n >= 10 ? `${Math.round(n)}×` : `${n.toFixed(1)}×`);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Recent Shorts in the niche that beat their channel's size, from the YouTube Data API. */
export default function ResearchScreen() {
  const nav = useNavigation<any>();
  const research = useStudio((s) => s.research);
  const settings = useStudio((s) => s.settings);
  const store = useStudio;
  const mounted = useMounted();
  const profile = research.profiles.find((p) => p.id === research.profileId) ?? research.profiles[0];
  const ledger = currentLedger(research.quota);
  const estimate = estimateRunUnits(profile.seedKeywords.length);
  const remaining = remainingUnits(research.quota, research.cap);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<any>(null);
  const [shown, setShown] = useState(30);
  const [onlyNew, setOnlyNew] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const lastRun = useMemo(
    () => research.runs.find((r) => r.profileId === profile.id && r.status !== 'running'),
    [research.runs, profile.id],
  );

  // New filter defaults replace stored ones once, keeping the chosen region.
  useEffect(() => {
    const s = store.getState();
    if ((s.research.filtersVersion ?? 1) < FILTERS_VERSION) {
      s.updateResearch({
        filters: { ...DEFAULT_FILTERS, regionCode: s.research.filters.regionCode },
        filtersVersion: FILTERS_VERSION,
      });
    }
  }, [store]);

  useEffect(() => {
    const s = store.getState();
    if ((s.research.keywordsVersion ?? 1) >= KEYWORDS_VERSION) return;
    const { profiles, changes } = migrateProfilesV132(s.research.profiles as any[]);
    s.updateResearch({ profiles, keywordsVersion: KEYWORDS_VERSION });
    if (changes.length) Alert.alert('Research keywords updated', changes.join('\n\n'));
  }, [store]);

  // A run left "running" by a closed app is marked interrupted; old runs are deleted.
  useEffect(() => {
    const s = store.getState();
    for (const run of s.research.runs) {
      if (run.status === 'running' && !abortRef.current) s.updateResearchRun(run.id, { status: 'interrupted' });
    }
    const expired = s.research.runs.filter((r) => isExpired(r.startedAt));
    for (const run of expired) deleteRunFiles(run);
    if (expired.length) s.removeResearchRuns(expired.map((r) => r.id));
  }, [store]);

  useEffect(() => {
    if (running) return;
    setReport(lastRun?.runUri ? loadRun(lastRun.runUri) : null);
    setShown(30);
  }, [lastRun?.runUri, running]);

  const start = async () => {
    if (running) return;
    const apiKey = await getKey('youtubeApiKey');
    if (!apiKey) {
      Alert.alert(
        'YouTube API key needed',
        'Research uses a YouTube Data API key. Add it in Settings → YouTube, then tap Test key.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Open Settings', onPress: () => nav.navigate('Settings') },
        ],
      );
      return;
    }
    if (estimate > remaining) {
      Alert.alert(
        'Not enough quota left today',
        `This run needs about ${estimate} units; ${remaining} of today's ${research.cap} research units are left. The quota resets at midnight Pacific time.`,
      );
      return;
    }

    const runId = `run-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const lists = {
      nicheTerms: profile.nicheTerms,
      entityBlocklist: research.entityBlocklist,
      podcastTerms: research.podcastTerms,
    };
    const history = keywordHistoryFor(research.keywordHistory[profile.id], research.runs, profile.id);
    const seen = new Set([...(research.seen[profile.id] ?? []), ...seenBefore(research.runs, profile.id)]);
    const controller = new AbortController();
    const model = settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;
    const fallbackModel = settings.scriptProvider === 'anthropic' ? settings.geminiModel : settings.anthropicModel;

    store.getState().recordResearchRun({
      id: runId,
      profileId: profile.id,
      profileName: profile.name,
      startedAt,
      status: 'running',
      unitsUsed: 0,
      outliersFound: 0,
      videosSeen: 0,
      keywordsSearched: 0,
    });
    abortRef.current = controller;
    setRunning(true);
    setProgress({ step: 'Starting', done: 0, total: 1 });

    const result: any = await runOutlierResearch(
      {
        apiKey,
        profile,
        filters: research.filters,
        keywords: profile.seedKeywords,
        excludeChannelIds: [...research.profiles.map((p) => p.ownChannelId), settings.youtubeChannelId].filter(
          Boolean,
        ) as string[],
        seenVideoIds: seen,
        lists,
        keywordPrevious: Object.fromEntries(
          profile.seedKeywords.map((k) => [k, previousRate(history, k, startedAt, [runId])]),
        ) as Record<string, number>,
        classify: research.layer2Enabled
          ? (items) =>
              classifyRelevance(
                { provider: settings.scriptProvider, model, fallbackModel, signal: controller.signal } as any,
                items,
              ) as any
          : undefined,
        layer2Cache: research.layer2Cache ?? {},
        onLayer2Labels: (labels) => store.getState().cacheLayer2Labels(labels),
        channelCache: (research.channelCache ?? {}) as any,
        onChannelRecent: (entries) => store.getState().cacheChannelRecent(entries),
        appVersion: appVersion(),
        configHash: researchConfigHash({
          filters: research.filters,
          lists,
          keywords: profile.seedKeywords,
          layer2Enabled: research.layer2Enabled,
        }),
        quota: {
          canSpend: (units: number) =>
            remainingUnits(store.getState().research.quota, store.getState().research.cap) >= units,
          charge: (units: number) => store.getState().chargeResearchQuota(units),
          refund: (units: number) => store.getState().refundResearchQuota(units),
        } as any,
        signal: controller.signal,
        onProgress: (step, done, total) => {
          if (mounted.current) setProgress({ step, done, total });
        },
      },
      runId,
    );

    let paths = {};
    try {
      paths = saveRun(result);
    } catch (e) {
      result.notes.push(`Could not save the report: ${errorText(e)}`);
    }
    const s = store.getState();
    s.updateResearchRun(runId, {
      status: result.status,
      finishedAt: result.finishedAt,
      unitsUsed: result.unitsUsed,
      outliersFound: result.outliers.length,
      videosSeen: result.videosSeen,
      keywordsSearched: result.keywordsSearched,
      ...paths,
    });
    s.markResearchSeen(profile.id, result.qualifiedIds ?? result.outliers.map((o: any) => o.videoId));
    if (result.status === 'complete' || result.status === 'partial_quota') {
      s.recordKeywordRates(
        profile.id,
        runId,
        startedAt,
        Object.fromEntries(
          result.keywordStats.filter((k: any) => k.searched).map((k: any) => [k.keyword, k.hitRate ?? 0]),
        ),
      );
    }
    abortRef.current = null;
    if (!mounted.current) return;
    setRunning(false);
    setProgress(null);
    setReport(result);
    setShown(30);

    const n = result.outliers.length;
    const summary =
      result.status === 'complete'
        ? `${n} outliers from ${result.videosSeen} Shorts.`
        : result.status === 'partial_quota'
          ? `Partial — quota. ${n} outliers from what was searched.`
          : result.status === 'cancelled'
            ? `Stopped. ${n} outliers from what was searched.`
            : `The run failed: ${result.notes[result.notes.length - 1] ?? 'unknown error'}`;
    Alert.alert(
      result.status === 'failed' ? 'Research failed' : 'Research finished',
      `${summary}\n${result.unitsUsed} quota units used.`,
    );
  };

  /** Scores a saved run again under today's rules, for no quota. */
  const rescore = (run: any) => {
    const s = store.getState();
    const lists = {
      nicheTerms: profile.nicheTerms,
      entityBlocklist: s.research.entityBlocklist,
      podcastTerms: s.research.podcastTerms,
    };
    let source = run;
    if (run.replayOf) {
      source = loadRun(s.research.runs.find((r) => r.id === run.replayOf)?.runUri ?? '') ?? run;
    }
    const replayed = replayRun(run, {
      filters: s.research.filters,
      lists,
      excludeChannelIds: [...s.research.profiles.map((p) => p.ownChannelId), settings.youtubeChannelId].filter(
        Boolean,
      ) as string[],
      keywordHistory: keywordHistoryFor(s.research.keywordHistory[profile.id], s.research.runs, profile.id),
      seenBefore: seenBefore(s.research.runs, profile.id, source.startedAt),
      layer2Cache: s.research.layer2Cache ?? {},
      appVersion: appVersion(),
      configHash: researchConfigHash({
        filters: s.research.filters,
        lists,
        keywords: run.keywordStats.map((k: any) => k.keyword),
        layer2Enabled: s.research.layer2Enabled,
      }),
    });
    let paths = {};
    try {
      paths = saveRun(replayed);
    } catch (e) {
      Alert.alert('Could not save the re-scored report', errorText(e));
    }
    s.recordResearchRun({
      id: replayed.id,
      profileId: replayed.profileId,
      profileName: replayed.profileName,
      startedAt: replayed.startedAt,
      finishedAt: replayed.finishedAt,
      status: replayed.status,
      unitsUsed: 0,
      outliersFound: replayed.quality?.finalOutliers ?? replayed.outliers.length,
      videosSeen: replayed.videosSeen,
      keywordsSearched: replayed.keywordsSearched,
      ...paths,
    });
    setReport(replayed);
    setShown(30);
    Alert.alert('Re-scored (0 quota)', replaySummary(run, replayed));
  };

  const [showFiltered, setShowFiltered] = useState(false);
  const list: any[] = (report?.outliers ?? []).filter((o: any) => !onlyNew || o.isNew);
  const lastReport = research.runs.find((r) => r.profileId === profile.id && r.reportUri);
  const f = research.filters;
  const q = report?.quality;

  return (
    <Screen>
      <Card>
        <H2>Outlier research</H2>
        <Small>Finds recent Shorts in your niche that beat their channel's size. Uses the free YouTube Data API quota.</Small>
        <Segmented
          value={profile.id}
          onChange={(id) => {
            if (!running) store.getState().updateResearch({ profileId: id });
          }}
          options={research.profiles.map((p) => ({ value: p.id, label: p.name }))}
        />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Quota today</H3>
          <Small>
            {ledger.unitsUsed.toLocaleString('en-US')} / {research.cap.toLocaleString('en-US')} units
          </Small>
        </Row>
        <ProgressBar fraction={Math.min(1, ledger.unitsUsed / research.cap)} />
        <Small>
          Next run: about {estimate.toLocaleString('en-US')} units ({profile.seedKeywords.length} keywords × 100, plus
          stats). Resets at midnight Pacific time.
        </Small>
        <Small>
          Filters: last {f.windowDays} days · ≥{fmt(f.minViews)} views ·{' '}
          {f.maxSubs != null ? `≤${fmt(f.maxSubs)} subs` : 'any channel size'} · views ≥ {f.minSubRatio}× subs · ≤
          {f.maxDurationSec}s
        </Small>
        {running ? (
          <>
            <Small style={{ color: colors.text, fontWeight: '700' }}>
              {progress?.step} {progress && progress.total > 1 ? `(${progress.done}/${progress.total})` : ''}
            </Small>
            <Button label="Stop" variant="secondary" onPress={() => abortRef.current?.abort()} />
          </>
        ) : (
          <Button label="Run research" onPress={() => void start()} disabled={estimate > remaining} />
        )}
      </Card>

      {lastReport ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>Last report</H3>
            <Badge
              label={
                lastReport.status === 'complete'
                  ? 'Complete'
                  : lastReport.status === 'partial_quota'
                    ? 'Partial — quota'
                    : lastReport.status
              }
              tone={lastReport.status === 'complete' ? 'ok' : 'warn'}
            />
          </Row>
          <Small>
            {new Date(lastReport.startedAt).toLocaleString()} · {lastReport.outliersFound} outliers ·{' '}
            {lastReport.videosSeen} Shorts scanned · {lastReport.unitsUsed} units
          </Small>
          <Button
            label="Re-score saved run (0 quota)"
            variant="ghost"
            onPress={() => {
              const run = loadRun(lastReport.runUri ?? '');
              if (!run) {
                Alert.alert('Nothing to re-score', 'The saved run could not be read.');
                return;
              }
              rescore(run);
            }}
          />
          <Button
            label="Share report (.md)"
            variant="secondary"
            onPress={() => {
              shareReport(lastReport.reportUri).catch((e) => Alert.alert('Could not share', errorText(e)));
            }}
          />
        </Card>
      ) : null}

      {report ? (
        <>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <H3>
              {list.length} outlier{list.length === 1 ? '' : 's'}
            </H3>
            <Button label={onlyNew ? 'Showing new only' : 'All'} variant="ghost" onPress={() => setOnlyNew((v) => !v)} />
          </Row>
          {q ? (
            <Card>
              <Small>
                Scanned {q.scanned} · layer 1 {q.passedLayer1} · layer 2 {q.layer2?.status ?? 'not run'}
                {q.layer2?.labelled ? ` (${q.layer2.kept} of ${q.layer2.labelled} EXPLAINER)` : ''} · outliers{' '}
                {q.finalOutliers} ({(q.outlierRate * 100).toFixed(1)}%) · views ÷ subs ≥ {q.minSubRatio}×
                {q.raised ? ' (raised)' : ''} · breakout {q.breakoutChannels ? `${q.breakoutChannels} channels` : '—'}
                {report.replayOf ? ' · re-scored offline' : ''}
              </Small>
              <Small style={{ color: colors.textFaint }}>
                App {report.appVersion ?? 'unknown'} · config {report.configHash ?? '—'}
              </Small>
            </Card>
          ) : null}
          {report.notes.length ? (
            <Card>
              {report.notes.map((n: string, i: number) => (
                <Small key={i} style={{ color: colors.warn }}>
                  • {n}
                </Small>
              ))}
            </Card>
          ) : null}
          {list.slice(0, shown).map((o, i) => (
            <Pressable
              key={o.videoId}
              onPress={() => void Linking.openURL(shortsLink(o.videoId))}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
            >
              {o.thumbnailUrl ? (
                <Image source={{ uri: o.thumbnailUrl }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontSize: 14, lineHeight: 19, fontWeight: '700' }}>
                  {i + 1}. {o.titleClean ?? o.title}
                </Body>
                <Small>
                  {o.channelTitle} · {o.subs != null ? `${fmt(o.subs)} subs` : 'subs hidden'}
                </Small>
                <Small style={{ color: colors.text }}>
                  {fmt(o.views)} views · {o.subRatio != null ? times(o.subRatio) : '—'} subs · {fmt(o.vph)}/h ·{' '}
                  {durationLabel(o.durationSec)}
                </Small>
                <Row style={{ flexWrap: 'wrap' }}>
                  {o.isNew ? <Badge label="NEW" tone="ok" /> : null}
                  {o.duplicates ? <Badge label={`×${o.duplicates + 1} similar`} tone="neutral" /> : null}
                  {o.moreFromChannel ? <Badge label={`+${o.moreFromChannel} more from channel`} tone="neutral" /> : null}
                  {o.flags.map((flag: string) => (
                    <Badge key={flag} label={flag} tone="warn" />
                  ))}
                </Row>
              </View>
            </Pressable>
          ))}
          {list.length > shown ? (
            <Button
              label={`Show ${Math.min(30, list.length - shown)} more`}
              variant="ghost"
              onPress={() => setShown((n) => n + 30)}
            />
          ) : null}
          {report.filteredOut?.length ? (
            <Card>
              <Pressable onPress={() => setShowFiltered((v) => !v)}>
                <H3>
                  {showFiltered ? '▾' : '▸'} Filtered out ({report.filteredOut.length})
                </H3>
              </Pressable>
              {showFiltered
                ? report.filteredOut.slice(0, 20).map((x: any) => (
                    <Small key={x.videoId}>
                      • {x.title} — {x.reason} · {fmt(x.views)} views
                    </Small>
                  ))
                : null}
            </Card>
          ) : null}
        </>
      ) : running ? null : (
        <Card>
          <Small>No report for {profile.name} yet. Run research to find this week's outliers.</Small>
        </Card>
      )}

      {research.runs.length && !running ? (
        <Button
          label="Clear research cache"
          variant="ghost"
          onPress={() =>
            Alert.alert('Clear research cache?', 'Deletes every saved run and report on this phone. Quota counts are kept.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: () => {
                  clearResearchFiles();
                  store.getState().clearResearch();
                  setReport(null);
                },
              },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  thumb: { width: 64, aspectRatio: 0.5625, borderRadius: radius.sm },
});
