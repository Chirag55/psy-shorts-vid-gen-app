import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Body, Button, Card, Field, H2, H3, ProgressBar, Row, Screen, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { daysUntil, hoursByFormat, YPP, yppProgress } from '@/core/ypp';
import { LONG_FORMAT_NAMES } from '@/core/bankV2';
import { flowCostRows } from '@/core/flowCredits';
import { catchphraseTest, correlationTable, hookShellTable, retentionVideos } from '@/core/retention';
import { diagnose, DIAGNOSIS_TEXT } from '@/core/weeklyReview';
import { hookTest } from '@/core/hookVariants';
import { hookLogRows, summariseFormats, summariseHookLog, summariseHookStyles, summariseProfiles } from '@/core/hookLog';
import { refreshYpp } from '@/services/ypp';
import { runWeeklyReview } from '@/services/weeklyReview';
import { runCompetitorScan } from '@/services/competitors';
import CompetitorCard from '@/components/CompetitorCard';
import { competitorQueue } from '@/core/competitors';
import { useMounted } from '@/util/useMounted';

type Busy = 'ypp' | 'weekly' | 'scan' | null;

/** Large counts whole, small ones to one decimal. */
const fmt = (n: number) => (n >= 10000 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString());

/** Partner Programme progress, the experiments, the weekly review and the competitor scan. */
export default function YppScreen() {
  const ypp = useStudio((s) => s.ypp);
  const weekly = useStudio((s) => s.weekly);
  const addYppReading = useStudio((s) => s.addYppReading);
  const setViewedRate = useStudio((s) => s.setViewedRate);
  const mounted = useMounted();
  const [busy, setBusy] = useState<Busy>(null);
  const [hours, setHours] = useState('');
  const [shorts, setShorts] = useState('');

  const now = new Date();
  const rows = yppProgress(ypp.snapshot, ypp.manual, now);
  const projects = useStudio((s) => s.projects);
  const formatHours = ypp.snapshot
    ? hoursByFormat(
        ypp.snapshot,
        projects
          .filter((p) => p.mode === 'long')
          .map((p) => ({ videoId: p.assets.youtubeVideoId, format: (p.script as any).bankV2?.formatType })) as any,
        LONG_FORMAT_NAMES,
      )
    : [];
  const flow = useStudio((s) => s.channelConfig.flow);
  const flowRows = flowCostRows(projects, flow, now);
  const retention = retentionVideos(projects, 'short');
  const correlation = correlationTable(retention).filter((r) => r.delta !== undefined);
  const shells = hookShellTable(retention);
  const catchphrase = catchphraseTest(retention);
  const hookAB = hookTest(retention as any);
  const setStayedToWatch = useStudio((s) => s.setStayedToWatch);
  const [stayed, setStayed] = useState<Record<string, string>>({});
  const hookRows = hookLogRows(projects, now.getTime());
  const log = summariseHookLog(hookRows);
  const formats = summariseFormats(hookRows);
  const profiles = summariseProfiles(hookRows);
  const hookStyles = summariseHookStyles(hookRows);
  const days = daysUntil(YPP.deadline, now);

  const refresh = async () => {
    setBusy('ypp');
    try {
      await refreshYpp();
    } catch (e) {
      Alert.alert('Could not refresh', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const review = async () => {
    setBusy('weekly');
    try {
      const r = await runWeeklyReview();
      Alert.alert(
        'Weekly review done',
        `${r.ranked.length} Shorts ranked. ${r.sequelIdeas.length} sequel idea(s) and ${r.longformCandidates.length} long-form candidate(s) added to the Topic Bank ideas; ${r.avoid.length} added to the avoid list.`,
      );
    } catch (e) {
      Alert.alert('Review failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const addTopics = useStudio((s) => s.addTopics);
  const skipCompetitor = useStudio((s) => s.skipCompetitor);
  const queue = competitorQueue(weekly.competitors ?? [], weekly.competitorsSkip ?? []);

  const scan = async () => {
    setBusy('scan');
    try {
      const r = await runCompetitorScan();
      Alert.alert(
        'Competitors read',
        `${r.rows.length} long-form(s) at 3× or more.${r.errors.length ? `\n\nNot read: ${r.errors.join('; ')}` : ''}`,
      );
    } catch (e) {
      Alert.alert('Could not read the competitors', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const saveReading = () => {
    const h = hours.trim() ? Number(hours.replace(/,/g, '')) : undefined;
    const s = shorts.trim() ? Number(shorts.replace(/,/g, '')) : undefined;
    if ((h !== undefined && !(h >= 0)) || (s !== undefined && !(s >= 0)) || (h === undefined && s === undefined)) {
      Alert.alert('Not saved', 'Enter a number for watch hours, engaged Shorts views, or both.');
      return;
    }
    addYppReading({
      at: new Date().toISOString(),
      ...(h !== undefined ? { longformHours: h } : {}),
      ...(s !== undefined ? { engagedShorts: s } : {}),
    } as any);
    setHours('');
    setShorts('');
  };

  const report = weekly.report;
  const ranked = diagnose(report?.ranked ?? [], weekly.viewedRates);

  return (
    <Screen>
      <Card>
        <H2>Partner Program</H2>
        <Small>
          {ypp.snapshot
            ? `Read ${ypp.snapshot.at.slice(0, 16).replace('T', ' ')} UTC from the YouTube Analytics API; refreshed daily.`
            : 'Not read yet.'}
        </Small>
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small style={{ color: colors.text, fontWeight: '800' }}>{days} days to 1 Feb 2027</Small>
          <Badge label={days > 0 ? 'CURRENT BAR' : 'NEW BAR'} tone={days > 60 ? 'info' : 'warn'} />
        </Row>
        <Small>
          From 1 Feb 2027 new applicants need {YPP.watchHoursAfter.toLocaleString()} hours or{' '}
          {(YPP.shortsAfter / 1000000).toFixed(0)}M engaged Shorts views. Shorts watch time never counts toward the hours;
          private, unlisted and deleted videos don't count either.
        </Small>
        <Button
          label={busy === 'ypp' ? 'Reading…' : 'Refresh now'}
          loading={busy === 'ypp'}
          variant="secondary"
          onPress={() => void refresh()}
        />
      </Card>

      {rows.map((r) => (
        <Card key={r.label}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>{r.label}</H3>
            <Badge
              label={r.source === 'api' ? 'API' : r.source === 'manual' ? 'MANUAL' : 'NO DATA'}
              tone={r.source === 'api' ? 'ok' : r.source === 'manual' ? 'warn' : 'neutral'}
            />
          </Row>
          <ProgressBar fraction={Math.min(1, r.target ? r.current / r.target : 0)} />
          <Body style={{ fontSize: 14 }}>
            {fmt(r.current)} of {fmt(r.target)}
          </Body>
          <Small>
            {r.eta === 'done'
              ? 'Reached.'
              : r.eta
                ? `At ${fmt(r.pace)} a day (last 14 days): reached around ${r.eta}.`
                : r.source === 'none'
                  ? 'No number yet.'
                  : 'Not moving over the last 14 days, so no date can be projected.'}
          </Small>
        </Card>
      ))}

      {formatHours.length ? (
        <Card>
          <H3>Long-form hours by format (365 days)</H3>
          <Small>
            Which format earns the watch hours (CR-63). Replace the playbook's retention guesses with these after the first
            uploads.
          </Small>
          {formatHours.map((f) => (
            <Row key={f.label} style={{ justifyContent: 'space-between' }}>
              <Small style={{ color: colors.text }}>{f.label}</Small>
              <Small style={{ color: colors.text, fontWeight: '800' }}>{fmt(f.hours)} h</Small>
            </Row>
          ))}
        </Card>
      ) : null}

      {retention.length ? (
        <Card>
          <H3>What the audit predicted (Shorts)</H3>
          <Small>
            {retention.length} Short{retention.length === 1 ? '' : 's'} with a retention reading. For each check: average %
            viewed when it passed against when it didn't (CR-44).
          </Small>
          {correlation.slice(0, 8).map((c) => (
            <Row key={c.id} style={{ justifyContent: 'space-between' }}>
              <Small style={{ color: colors.text }}>
                {c.id} · passed {c.passed}, failed {c.failed}
              </Small>
              <Small style={{ color: (c.delta ?? 0) >= 0 ? colors.ok : colors.warn, fontWeight: '800' }}>
                {(c.delta ?? 0) >= 0 ? '+' : ''}
                {c.delta} pts
              </Small>
            </Row>
          ))}
          {shells.length ? <H3>Hook shells</H3> : null}
          {shells.map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <Small style={{ color: colors.text }}>{s.label}</Small>
              <Small style={{ color: colors.text, fontWeight: '800' }}>
                {s.avg}% · {s.videos}
              </Small>
            </Row>
          ))}
          <H3>Catchphrase test</H3>
          <Small>{catchphrase.advice}</Small>
          {catchphrase.ready ? (
            <Small style={{ color: colors.text }}>
              With: {catchphrase.with.avg}% ({catchphrase.with.n} Shorts) · without: {catchphrase.without.avg}% (
              {catchphrase.without.n})
            </Small>
          ) : null}
          <H3>Hook A/B test</H3>
          <Small>{hookAB.summary}</Small>
          {hookAB.lesson ? (
            <Small style={{ color: colors.text }}>Proposed lesson (not applied): {hookAB.lesson}</Small>
          ) : null}
        </Card>
      ) : null}

      {hookRows.length ? (
        <>
          <Card>
            <H2>Hook A/B log (CR-80I)</H2>
            <Small>
              A is the default hook and B the alternate. Judge a Short at 72 hours and 7 days, not 12 hours. In Studio:
              Analytics, Content, Shorts, then "Stayed to watch". Type it in once a Short is 72 hours old.
            </Small>
            {hookRows
              .filter((r) => r.due)
              .map((r) => (
                <Row key={r.projectId} style={{ alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
                  <View style={{ flex: 1 }}>
                    <Small style={{ color: colors.text }}>{r.title}</Small>
                    <Small>Variant {r.arm} · 72 h reading due</Small>
                  </View>
                  <View style={{ width: 90 }}>
                    <Field
                      label="Stayed %"
                      value={stayed[r.projectId] ?? ''}
                      onChangeText={(v) => setStayed((s) => ({ ...s, [r.projectId]: v }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <Button
                    label="Save"
                    variant="secondary"
                    onPress={() => {
                      const n = Number((stayed[r.projectId] ?? '').replace(',', '.'));
                      if (Number.isFinite(n) && n > 0 && n <= 100) {
                        setStayedToWatch(r.projectId, n);
                        setStayed((s) => ({ ...s, [r.projectId]: '' }));
                        return;
                      }
                      Alert.alert('Enter a percent', 'The "stayed to watch" figure from Studio, between 1 and 100.');
                    }}
                  />
                </Row>
              ))}
            {log.weeks.map((w: any) => (
              <Row key={w.week} style={{ justifyContent: 'space-between' }}>
                <Small>Week of {w.week}</Small>
                <Small style={{ color: colors.text }}>
                  A {w.A ? `${w.A.median}% (${w.A.n})` : '–'} · B {w.B ? `${w.B.median}% (${w.B.n})` : '–'}
                </Small>
              </Row>
            ))}
            <Small style={{ color: colors.text }}>{log.summary}</Small>
            <Small style={{ color: colors.text }}>{formats.summary}</Small>
            <Small style={{ color: colors.text }}>{profiles.summary}</Small>
            <Small style={{ color: colors.text }}>{hookStyles.summary}</Small>
          </Card>
          <Card>
            <H2>Experiment log (CR-84F)</H2>
            <Small>
              One row per published Short: what was varied beside what happened. A pattern can be read here without
              opening each Short. Time shown is when it went public.
            </Small>
            {hookRows.slice(0, 20).map((r) => (
              <View key={r.projectId} style={{ marginTop: space.xs }}>
                <Small style={{ color: colors.text }}>{r.title}</Small>
                <Small>
                  {r.profile ?? '–'} · {r.hookStyle === 'pov' ? 'POV banner' : 'label banner'} "{r.hookText ?? '–'}"
                  {r.hookType ? ` (${r.hookType})` : ''} · {r.captionMode ?? 'word'} captions · music{' '}
                  {r.music ? 'on' : 'off'} · ending {r.endingMode ?? '–'} ·{' '}
                  {r.publishTime ? r.publishTime.slice(0, 16).replace('T', ' ') : '–'}
                </Small>
                <Small style={{ color: r.stayed !== undefined ? colors.text : colors.textFaint }}>
                  {r.stayed !== undefined ? `Stayed to watch ${r.stayed}%` : 'Stayed to watch: no data yet'}
                  {r.viewed !== undefined ? ` · ${Math.round(r.viewed)}% viewed on average` : ''}
                </Small>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {flowRows.rows.some((r) => r.spent > 0 || r.clips > 0) ? (
        <Card>
          <H3>Flow credits per long-form</H3>
          <Small>
            Each video is held to {flow.longformCap} credits, retries included (CR-66). This pool period (from{' '}
            {flowRows.periodStart}) has spent {flowRows.periodSpent} of {flowRows.pool.toLocaleString()}.
          </Small>
          {flowRows.rows.slice(0, 8).map((r) => (
            <Row key={r.id} style={{ justifyContent: 'space-between' }}>
              <Small style={{ color: colors.text, flex: 1 }}>{r.title}</Small>
              <Small style={{ color: r.over ? colors.danger : colors.text, fontWeight: '800' }}>
                {r.spent}/{flow.longformCap} · {r.imported}/{r.clips} clips
                {r.stills ? ` · ${r.stills} still${r.stills === 1 ? '' : 's'}` : ''}
              </Small>
            </Row>
          ))}
        </Card>
      ) : null}

      {ypp.snapshot?.notes.length ? (
        <Card>
          {ypp.snapshot.notes.map((n) => (
            <Small key={n} style={{ color: colors.warn }}>
              • {n}
            </Small>
          ))}
        </Card>
      ) : null}

      <Card>
        <H3>Weekly reading from Studio</H3>
        <Small>
          When the API can't give a number, copy it from YouTube Studio → Earn once a week. The newest reading is used
          until the API answers.
        </Small>
        <Field label="Public watch hours (last 365 days)" value={hours} onChangeText={setHours} keyboardType="numeric" />
        <Field label="Engaged Shorts views (last 90 days)" value={shorts} onChangeText={setShorts} keyboardType="numeric" />
        <Button label="Save reading" variant="secondary" onPress={saveReading} />
        {ypp.manual[0] ? <Small>Last reading: {ypp.manual[0].at.slice(0, 10)}</Small> : null}
      </Card>

      <Card>
        <H2>Weekly review</H2>
        <Small>
          Every Monday: last week's Shorts against the channel's own 30-day median. The top 20% seed a sequel idea (and a
          long-form candidate when two share a pillar); the bottom 20% join the avoid list the script writer reads.
          Underperformers are never deleted: their views still count.
        </Small>
        <Button
          label={busy === 'weekly' ? 'Reviewing…' : 'Run the review now'}
          loading={busy === 'weekly'}
          variant="secondary"
          onPress={() => void review()}
        />
        {report ? (
          <Small>
            Week of {report.week} · 30-day median {fmt(report.median30)} views · {report.ranked.length} Shorts
          </Small>
        ) : (
          <Small>No review yet.</Small>
        )}
      </Card>

      {ranked.map((r: any) => (
        <Card key={r.videoId}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ flex: 1, fontWeight: '800', fontSize: 14 }}>{r.title}</Body>
            <Badge
              label={r.tier === 'top' ? 'TOP 20%' : r.tier === 'bottom' ? 'BOTTOM 20%' : 'MIDDLE'}
              tone={r.tier === 'top' ? 'ok' : r.tier === 'bottom' ? 'danger' : 'neutral'}
            />
          </Row>
          <Small>
            {fmt(r.views)} views · {r.ratio.toFixed(2)}× median
            {r.averageViewPercentage !== undefined ? ` · ${Math.round(r.averageViewPercentage)}% viewed` : ''}
            {r.subscribersGained !== undefined ? ` · +${r.subscribersGained} subs` : ''}
          </Small>
          <View style={{ marginTop: space.xs }}>
            <Field
              label="Viewed vs swiped away (%, from Studio)"
              value={weekly.viewedRates[r.videoId] !== undefined ? String(weekly.viewedRates[r.videoId]) : ''}
              onChangeText={(v) => {
                const n = Number(v.replace(/[^0-9.]/g, ''));
                setViewedRate(r.videoId, v.trim() && Number.isFinite(n) ? Math.min(100, n) : undefined);
              }}
              keyboardType="numeric"
            />
          </View>
          <Small style={{ color: r.diagnosis === 'working' ? colors.ok : colors.warn }}>
            {DIAGNOSIS_TEXT[r.diagnosis as keyof typeof DIAGNOSIS_TEXT]}
          </Small>
        </Card>
      ))}

      {report && (report.sequelIdeas.length || report.longformCandidates.length) ? (
        <Card>
          <H3>Added to the ideas list</H3>
          {[...report.sequelIdeas, ...report.longformCandidates].map((s: string) => (
            <Small key={s}>• {s}</Small>
          ))}
        </Card>
      ) : null}

      <Card>
        <H2>Steal the topic</H2>
        <Small>
          Long-forms from the last 30 days that beat their own channel's median by 3× or more, across the competitor
          channels below (CR-62). Take the topic, never the title or the script: your angle is study-backed and
          defence-framed, with Hoot.
        </Small>
        <Button
          label={busy === 'scan' ? 'Reading…' : 'Scan the competitors now'}
          loading={busy === 'scan'}
          variant="secondary"
          onPress={() => void scan()}
        />
        <Small>
          {weekly.competitorsAt
            ? `Last read ${weekly.competitorsAt.slice(0, 10)}; runs with the Monday review.`
            : 'Not read yet; runs with the Monday review.'}
        </Small>
        {queue.slice(0, 12).map((c) => (
          <View key={c.videoId} style={{ marginTop: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ flex: 1, fontWeight: '800', fontSize: 14 }}>{c.title}</Body>
              <Badge label={`${c.ratio.toFixed(1)}×`} tone="ok" />
            </Row>
            <Small>
              {c.channelName} · {fmt(c.views)} views (median {fmt(c.median)}) · {Math.round(c.durationSeconds / 60)} min ·{' '}
              {c.publishedAt.slice(0, 10)}
            </Small>
            <Row style={{ gap: space.xs }}>
              <Button
                label="Add to ideas"
                variant="ghost"
                onPress={() => {
                  addTopics([
                    {
                      topic: `${c.title} (proven by ${c.channelName}, ${c.ratio.toFixed(1)}×): your own study-backed, defence-framed angle`,
                      category: 'Steal the topic (CR-62)',
                    },
                  ]);
                  skipCompetitor(c.videoId);
                }}
              />
              <Button label="Dismiss" variant="ghost" onPress={() => skipCompetitor(c.videoId)} />
            </Row>
          </View>
        ))}
        {weekly.competitorsAt && !queue.length ? <Small>Nothing new at 3× this week.</Small> : null}
      </Card>

      <CompetitorCard />

      {weekly.avoid.length ? (
        <Card>
          <H3>Avoid list ({weekly.avoid.length})</H3>
          {weekly.avoid.slice(0, 12).map((a: any) => (
            <Small key={a.title}>
              • {a.title}
              {a.hook ? ` — "${a.hook}"` : ''}
            </Small>
          ))}
          <Small>Read by the script writer for AI-written scripts. Bank narration is never rewritten.</Small>
        </Card>
      ) : null}
    </Screen>
  );
}
