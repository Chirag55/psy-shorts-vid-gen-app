import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Body, Button, Card, Empty, H2, H3, Row, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { isV2 } from '@/core/topicBank';
import { PILLARS, V2_FORMATS } from '@/core/bankV2';
import { collectReleases, formatRelease, localParts } from '@/core/schedule';
import { buildLedger, rejectionsFor } from '@/core/ledger';
import { blockReasons, poolUse, rotationHistory } from '@/core/rotation';
import {
  autoReorder,
  longDays,
  nextLongFor,
  nextShortFor,
  optionCategories,
  planQueue,
  planWarnings,
  QUEUE_DAYS,
  queueSlots,
  replacePlanDay,
  swapOptions,
  swapPlanDays,
} from '@/core/weekPlan';
import { exportBank, pickBankFile, previewImport, type ImportPreview } from '@/services/bankImport';
import { TOPIC_BANK_V2, TOPIC_BANK_V2_FILE } from '@/assets/topicBankV2';
import { runAutoImport } from '@/services/autoImportBank';
import { useMounted } from '@/util/useMounted';
import { viralBadge, viralOf } from '@/core/viralBatch';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Status = 'unused' | 'in_progress' | 'published' | 'skipped';

const STATUSES: Status[] = ['unused', 'in_progress', 'published', 'skipped'];
const STATUS_LABELS: Record<Status, string> = {
  unused: 'UP NEXT',
  in_progress: 'IN PROGRESS',
  published: 'PUBLISHED',
  skipped: 'SKIPPED',
};

export const FORMAT_COLORS: Record<string, string> = {
  STUDY: '#60a5fa',
  SCEN: '#a78bfa',
  TACTIC: '#f472b6',
  MYTH: '#fbbf24',
  LIST: '#34d399',
  DEFENSE: '#22d3ee',
};

export const PILLAR_COLORS: Record<string, string> = {
  'Persuasion & Influence': '#f59e0b',
  'Manipulation & Defense': '#ef4444',
  'Cognitive Bias': '#8b5cf6',
  'Body Language & Social': '#10b981',
};

const PILLAR_LABELS: Record<string, string> = {
  'Persuasion & Influence': 'Persuasion',
  'Manipulation & Defense': 'Manipulation',
  'Cognitive Bias': 'Bias',
  'Body Language & Social': 'Body & Social',
};

const shortId = (id: string) => id.replace(/^MF-S-/, '');

/**
 * The imported topic bank: what is up next, the planned queue with its
 * rotation ledger, every entry by status, and the import preview.
 */
export default function ImportedTopicBank() {
  const navigation = useNavigation<Nav>();
  const bank = useStudio((s) => s.bank) as any[];
  const applyBankImport = useStudio((s) => s.applyBankImport);
  const bankAuto = useStudio((s) => s.bankAuto);
  const acceptConditional = useStudio((s) => s.acceptConditional);
  const updateBankEntry = useStudio((s) => s.updateBankEntry);
  const mounted = useMounted();

  const [kind, setKind] = useState<'short' | 'long'>('short');
  const [pending, setPending] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapDay, setSwapDay] = useState<number | null>(null);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<string | null>(null);

  const projects = useStudio((s) => s.projects);
  const channelUploads = useStudio((s) => s.channelUploads);
  const channelConfig = useStudio((s) => s.channelConfig);
  const weekPlan = useStudio((s) => s.weekPlan);
  const setWeekPlan = useStudio((s) => s.setWeekPlan);

  const releases = useMemo(() => collectReleases(projects, channelUploads as any), [projects, channelUploads]);
  const nextShort = useMemo(
    () => nextShortFor(bank, releases, channelConfig as any, weekPlan),
    [bank, releases, channelConfig, weekPlan]
  );
  const nextShortEntry = nextShort.entry;
  const nextLong = useMemo(() => nextLongFor(bank, weekPlan), [bank, weekPlan]);
  const history = useMemo(
    () => rotationHistory(bank, releases, channelConfig.schedule, new Date()).history,
    [bank, releases, channelConfig.schedule]
  );
  const blocked = useMemo(() => bank.filter((e) => e.status === 'unused' && blockReasons(e).length), [bank]);
  const legacyCount = bank.filter((e) => !isV2(e)).length;

  /** Plans the next window of Short slots and Saturdays from the bank. */
  const makePlan = (window: number = QUEUE_DAYS) => {
    const { shortSlots, longSlots, history: past } = queueSlots(
      bank,
      releases,
      channelConfig.schedule,
      new Date(),
      window
    );
    setWeekPlan({ ...planQueue(bank, shortSlots, longSlots, past, channelConfig.schedule), window });
  };

  // Only what is still ahead counts; days already gone drop out of the plan.
  const nowIso = new Date().toISOString();
  const futureDays: any[] = weekPlan?.days?.filter((d: any) => d.at > nowIso) ?? [];
  const futureLong: any[] = weekPlan?.long?.filter((d: any) => d.at > nowIso) ?? [];
  const livePlan = weekPlan ? { ...weekPlan, days: futureDays, long: futureLong } : undefined;
  const warnings: string[] = livePlan
    ? planWarnings(livePlan, bank, history, channelConfig.flow, projects)
    : [];
  const pool = livePlan ? poolUse(longDays(livePlan, bank, projects), channelConfig.flow) : [];

  const listed = bank.filter((e) => e.kind === kind);

  const ledger = useMemo(() => {
    if (!weekPlan) return undefined;
    const now = new Date();
    const { pending: waiting } = rotationHistory(bank, releases, channelConfig.schedule, now);
    return buildLedger({
      plan: weekPlan,
      bank,
      releases,
      schedule: channelConfig.schedule,
      history,
      startDay: localParts(now, channelConfig.schedule).day,
      days: (weekPlan.window ?? QUEUE_DAYS) + waiting,
      now,
    });
  }, [weekPlan, bank, releases, channelConfig.schedule, history]);
  const planDebug = useStudio((s) => s.settings.planDebug);

  const options = useMemo(
    () => (!weekPlan || swapDay === null ? [] : swapOptions(weekPlan, swapDay, bank, history)),
    [weekPlan, swapDay, bank, history]
  );
  const categories = useMemo(() => optionCategories(options), [options]);
  const shown = options.filter(
    (o) =>
      isV2(o.entry) &&
      o.entry.kind === 'short' &&
      (pillarFilter === null || o.entry.pillar === pillarFilter) &&
      (formatFilter === null || o.entry.format === formatFilter)
  );

  const openSwap = (index: number) => {
    setPillarFilter(null);
    setFormatFilter(null);
    setSwapDay(index);
  };

  const choose = (entryId: string) => {
    if (weekPlan && swapDay !== null) setWeekPlan(replacePlanDay(weekPlan, swapDay, entryId));
    setSwapDay(null);
  };

  /** A planned day's actions: swap its topic, or skip a topic that isn't for you. */
  const dayActions = (index: number) => {
    const plan = weekPlan;
    if (!plan) return;
    const entry = bank.find((e) => e.id === plan.days[index].entryId);
    const buttons: any[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Swap topic…', onPress: () => openSwap(index) },
    ];
    if (entry?.status === 'unused') {
      buttons.push({
        text: 'Not for me (skip)',
        style: 'destructive',
        onPress: () => {
          updateBankEntry(entry.id, { status: 'skipped' });
          const next = bank.map((e) => (e.id === entry.id ? { ...e, status: 'skipped' } : e));
          const option = swapOptions(plan, index, next, history)[0];
          if (option) setWeekPlan(replacePlanDay(plan, index, option.entry.id));
          Alert.alert(
            `${shortId(entry.id)} skipped`,
            option
              ? `${shortId(option.entry.id)} · ${option.entry.title} takes its day.${
                  option.warnings.length ? `\n\n${option.warnings.join('\n')}` : ''
                }\n\nRestore it any time: long-press it under Skipped.`
              : 'No plannable Short is left to take its day. Restore it any time: long-press it under Skipped.'
          );
        },
      });
    }
    Alert.alert(
      entry ? `${shortId(entry.id)} · ${entry.title}` : plan.days[index].entryId,
      formatRelease(new Date(plan.days[index].at), channelConfig.schedule),
      buttons
    );
  };

  const importText = async (fileName: string, markdown: string, accepted: string[] = []) => {
    if (busy) return;
    setBusy(true);
    try {
      const preview = await previewImport(fileName, markdown, accepted);
      if (mounted.current) setPending(preview);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const importFile = async () => {
    if (busy) return;
    try {
      const file = await pickBankFile();
      if (!file) return;
      await importText(file.name, file.text);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const exportStatus = async () => {
    try {
      await exportBank();
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  /** Opens the project made from an entry, or starts one from an unused entry. */
  const open = (entry: any) => {
    if (entry.status !== 'unused') {
      if (entry.projectId && useStudio.getState().projects.some((p) => p.id === entry.projectId)) {
        navigation.navigate('Project', { id: entry.projectId });
      }
      return;
    }
    navigation.navigate('Generate', { mode: entry.kind, bankEntryId: entry.id } as any);
  };

  const manage = (entry: any) => {
    const buttons: any[] = [{ text: 'Cancel', style: 'cancel' }];
    if (entry.status === 'unused') {
      buttons.push({ text: 'Skip', style: 'destructive', onPress: () => updateBankEntry(entry.id, { status: 'skipped' }) });
    }
    if (entry.status === 'skipped') {
      buttons.push({ text: 'Restore', onPress: () => updateBankEntry(entry.id, { status: 'unused' }) });
    }
    if (entry.status === 'in_progress') {
      buttons.push({
        text: 'Reset to unused',
        onPress: () => updateBankEntry(entry.id, { status: 'unused', projectId: undefined, startedAt: undefined }),
      });
    }
    if (buttons.length !== 1) {
      Alert.alert(`${entry.id} · ${entry.title}`, `Status: ${entry.status.replace('_', ' ')}`, buttons);
    }
  };

  // v2 topics before legacy ones, then in bank order.
  const viralRank = (e: any) => viralOf(e)?.queue ?? viralOf(e)?.position ?? Number.MAX_SAFE_INTEGER;
  const sortKey = (a: any, b: any) =>
    (isV2(a) ? 0 : 1) - (isV2(b) ? 0 : 1) || viralRank(a) - viralRank(b) || a.order - b.order;

  const fixOrder = () => {
    if (!weekPlan) return;
    const reordered = autoReorder(weekPlan, bank, history);
    if (!reordered) {
      Alert.alert(
        'No order keeps every rule',
        "These topics can't be ordered without breaking a rotation rule. Swap one for another format or pillar, or re-plan."
      );
      return;
    }
    setWeekPlan(reordered);
  };

  const confirmImport = () => {
    if (!pending) return;
    applyBankImport(pending.plan.next, pending.plan.banks, pending.plan.reset);
    const { added, updated } = pending.plan;
    setPending(null);
    Alert.alert('Topic bank imported', `${added.length} new, ${updated.length} updated.`);
  };

  const queueRows = [
    ...futureDays.map((d) => ({ d, long: false })),
    ...futureLong.map((d) => ({ d, long: true })),
  ].sort((a, b) => a.d.at.localeCompare(b.d.at));

  const changes = pending
    ? pending.plan.added.length +
      pending.plan.updated.length +
      pending.plan.scriptsAdded.length +
      pending.plan.briefsAdded.length +
      pending.plan.seoAdded.length
    : 0;

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <H2>Topic bank</H2>
        <Small>
          {bank.length
            ? `${bank.filter((e) => e.status === 'unused').length} unused · ${
                bank.filter((e) => e.status === 'in_progress').length
              } in progress · ${bank.filter((e) => e.status === 'published').length} published · ${
                bank.filter((e) => e.status === 'skipped').length
              } skipped${legacyCount ? ` · ${legacyCount} legacy (v1, never planned automatically)` : ''}`
            : 'Import a topic bank file (.md) to start. Topics come from the bank, not from AI.'}
        </Small>
        <Row style={{ marginTop: space.sm }}>
          <Button
            label={busy ? 'Reading…' : 'Import topic bank'}
            loading={busy}
            onPress={() => void importFile()}
            style={{ flex: 1 }}
          />
          {bank.length ? <Button label="Export status" variant="secondary" onPress={() => void exportStatus()} /> : null}
        </Row>
        <Button
          label="Preview the bundled Topic Bank again"
          variant="ghost"
          onPress={() => void importText(TOPIC_BANK_V2_FILE, TOPIC_BANK_V2)}
        />
      </Card>

      {bankAuto ? (
        <Card>
          <H3>Imported automatically</H3>
          <Small>
            The bundled bank imports itself when the app has a new one; anything started or published is left as it is.
          </Small>
          {(bankAuto.lines ?? []).slice(0, 2).map((line: string, i: number) => (
            <Small key={i}>• {line}</Small>
          ))}
          {(bankAuto.rejected ?? []).map((line: string, i: number) => (
            <Small key={i} style={{ color: colors.danger }}>
              • Refused: {line}
            </Small>
          ))}
          {(bankAuto.conditional ?? []).map((c: any) => (
            <View key={c.id} style={{ gap: space.xs, marginTop: space.xs }}>
              <Small style={{ fontWeight: '800' }}>{shortId(c.id)} waits for your answer</Small>
              <Small>{c.condition}</Small>
              <Button
                label="The condition holds: import it"
                variant="secondary"
                onPress={() => {
                  acceptConditional(c.id);
                  runAutoImport();
                }}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {nextShortEntry || nextLong ? (
        <Card>
          <H3>Make next</H3>
          {nextShortEntry ? (
            <Button
              label={`Next Short (${formatRelease(nextShort.at, channelConfig.schedule)}): ${shortId(nextShortEntry.id)} — ${
                nextShortEntry.title
              }`}
              onPress={() => open(nextShortEntry)}
            />
          ) : null}
          {nextShort.problems.map((p) => (
            <Small key={p} style={{ color: colors.warn }}>
              • {p}
            </Small>
          ))}
          {nextLong ? (
            <Button
              label={`Next long-form (Saturday): ${nextLong.id} — ${nextLong.title}`}
              variant="secondary"
              onPress={() => open(nextLong)}
            />
          ) : null}
          <Small>
            v2 topics in bank order, kept varied (CR-43): never the same format two days running, at most 3 of a format
            in any 7 days, never one pillar more than 2 days running. Long-forms go out in publish order, one per
            Saturday. Legacy topics are never picked for you.
          </Small>
        </Card>
      ) : null}

      {blocked.length ? (
        <Card>
          <H3>Blocked by the hook gate ({blocked.length})</H3>
          {blocked.map((e) => (
            <Pressable key={e.id} onPress={() => open(e)}>
              <Small style={{ color: colors.text, fontWeight: '800' }}>
                {shortId(e.id)} · {e.title}
              </Small>
              {blockReasons(e).map((r) => (
                <Small key={r} style={{ color: colors.danger }}>
                  • {r}
                </Small>
              ))}
            </Pressable>
          ))}
          <Small>
            These are never planned. Fix the narration or hook_text in the bank file and import it again; a fixed topic
            rejoins in bank order.
          </Small>
        </Card>
      ) : null}

      {bank.some((e) => isV2(e) && e.status === 'unused') ? (
        <Card>
          <H3>Queue · next {QUEUE_DAYS} days</H3>
          {!futureDays.length && !futureLong.length ? (
            <>
              <Small>
                Plan which v2 topic goes out in each of the next {QUEUE_DAYS} Short slots, plus the Saturday long-forms,
                then reorder by hand.
              </Small>
              <Row>
                <Button
                  label={`Plan ${QUEUE_DAYS} days`}
                  variant="secondary"
                  onPress={() => makePlan()}
                  style={{ flex: 1 }}
                />
                <Button label="Plan 30 days" variant="secondary" onPress={() => makePlan(30)} style={{ flex: 1 }} />
              </Row>
            </>
          ) : (
            <>
              {queueRows.map(({ d, long }) => {
                const entry = bank.find((e) => e.id === d.entryId);
                const dayIndex = long ? -1 : weekPlan.days.indexOf(d);
                const listIndex = long ? -1 : futureDays.indexOf(d);
                const v2 = entry && isV2(entry) ? entry : undefined;
                return (
                  <Row key={`${long ? 'L' : 'S'}${d.day}`} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Pressable
                      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
                      onPress={() => {
                        if (!long) dayActions(dayIndex);
                        else if (entry) open(entry);
                      }}
                    >
                      <Small style={{ color: colors.text, fontWeight: '800' }}>
                        {formatRelease(new Date(d.at), channelConfig.schedule)}
                        {long ? ' · LONG-FORM' : ''}
                      </Small>
                      <Row style={{ flexWrap: 'wrap', gap: 4 }}>
                        {v2 && viralOf(v2) ? <Badge label={viralBadge(viralOf(v2)!)} tone="warn" /> : null}
                        {v2 && v2.kind === 'short' ? <Tag label={v2.format} color={FORMAT_COLORS[v2.format]} /> : null}
                        {v2 ? <Tag label={PILLAR_LABELS[v2.pillar]} color={PILLAR_COLORS[v2.pillar]} /> : null}
                        <Small>
                          {entry
                            ? `${shortId(entry.id)} · ${entry.title}${
                                entry.status !== 'unused' ? ` (${entry.status.replace('_', ' ')})` : ''
                              }`
                            : d.entryId}
                        </Small>
                      </Row>
                    </Pressable>
                    {long ? null : (
                      <>
                        <Button
                          label="▲"
                          variant="ghost"
                          disabled={listIndex <= 0}
                          onPress={() =>
                            setWeekPlan(swapPlanDays(weekPlan, dayIndex, weekPlan.days.indexOf(futureDays[listIndex - 1])))
                          }
                        />
                        <Button
                          label="▼"
                          variant="ghost"
                          disabled={listIndex === futureDays.length - 1}
                          onPress={() =>
                            setWeekPlan(swapPlanDays(weekPlan, dayIndex, weekPlan.days.indexOf(futureDays[listIndex + 1])))
                          }
                        />
                      </>
                    )}
                  </Row>
                );
              })}

              {ledger ? (
                <>
                  <Small style={{ color: colors.text, fontWeight: '800' }}>{ledger.summary}</Small>
                  {ledger.rows
                    .filter((r) => r.state === 'relaxed' || r.state === 'empty' || r.state === 'taken')
                    .map((r) => (
                      <View key={`L${r.day}`}>
                        <Small
                          style={{
                            color: r.state === 'empty' ? colors.danger : r.state === 'relaxed' ? colors.warn : colors.textDim,
                          }}
                        >
                          {r.day} ({r.weekday}) ·{' '}
                          {r.state === 'relaxed' ? `${shortId(r.entryId ?? '')} breaks: ${r.breaks.join(' ')}` : r.reason}
                        </Small>
                        {r.state === 'relaxed' && r.entryId ? (
                          <Pressable onPress={() => dayActions(weekPlan.days.findIndex((d: any) => d.day === r.day))}>
                            <Small style={{ color: colors.accent }}>Swap topic…</Small>
                          </Pressable>
                        ) : null}
                        {r.bankEmpty ? (
                          <Small style={{ color: colors.accent }}>
                            Import more topics (the refill prompt is in your content skill), then re-plan.
                          </Small>
                        ) : null}
                        {planDebug && (r.state === 'relaxed' || r.state === 'empty')
                          ? rejectionsFor(
                              r.day,
                              bank.flatMap((e) =>
                                isV2(e) && e.kind === 'short' && e.status === 'unused'
                                  ? [{ id: e.id, format: e.format, pillar: e.pillar }]
                                  : []
                              ),
                              [
                                ...history,
                                ...(weekPlan?.days
                                  ?.filter((d: any) => d.day !== r.day)
                                  .flatMap((d: any) => {
                                    const e = bank.find((x) => x.id === d.entryId);
                                    return e && isV2(e) && e.kind === 'short'
                                      ? [{ id: e.id, format: e.format, pillar: e.pillar, day: d.day }]
                                      : [];
                                  }) ?? []),
                              ]
                            )
                              .slice(0, 12)
                              .map((x) => (
                                <Small key={x.id}>
                                  ↳ {shortId(x.id)} rejected: {x.problems.join(' ')}
                                </Small>
                              ))
                          : null}
                      </View>
                    ))}
                  {ledger.longs
                    .filter((l) => l.due)
                    .map((l) => (
                      <Small key={`D${l.day}`} style={{ color: colors.warn }}>
                        {l.day} · {l.due}
                      </Small>
                    ))}
                </>
              ) : null}

              {warnings.map((w) => (
                <Small key={w} style={{ color: colors.danger }}>
                  • {w}
                </Small>
              ))}
              {pool.map((p) => (
                <Small
                  key={p.period}
                  style={{ color: p.credits > channelConfig.flow.monthlyPool ? colors.danger : colors.textDim }}
                >
                  Flow pool from {p.period}: {p.credits.toLocaleString()} of{' '}
                  {channelConfig.flow.monthlyPool.toLocaleString()} credits ({p.longforms.join(', ')})
                </Small>
              ))}
              <Row>
                {warnings.some((w) => / — /.test(w)) ? (
                  <Button label="Fix order" onPress={fixOrder} style={{ flex: 1 }} />
                ) : null}
                <Button
                  label="Re-plan"
                  variant="secondary"
                  onPress={() => makePlan(weekPlan?.window ?? QUEUE_DAYS)}
                  style={{ flex: 1 }}
                />
                <Button label="Clear" variant="ghost" onPress={() => setWeekPlan(undefined)} />
              </Row>
              <Small>
                Tap a day to swap its topic, or to skip one that isn't for you. Move topics with ▲ ▼; "Fix order"
                re-orders the same topics to keep the rotation rules. "Make next" follows the queue for each day.
              </Small>
            </>
          )}
        </Card>
      ) : null}

      {bank.length ? (
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'short', label: `Shorts (${bank.filter((e) => e.kind === 'short').length})` },
            { value: 'long', label: `Long-form (${bank.filter((e) => e.kind === 'long').length})` },
          ]}
        />
      ) : (
        <Empty
          title="No topics yet"
          hint="Tap Import topic bank and choose a bank .md file, or import the bundled Topic Bank v2."
        />
      )}

      {STATUSES.map((status) => {
        const rows = listed.filter((e) => e.status === status).sort(sortKey);
        if (!rows.length) return null;
        return (
          <View key={status} style={{ gap: space.sm }}>
            <Small style={{ fontWeight: '800', letterSpacing: 1 }}>
              {STATUS_LABELS[status]} ({rows.length})
            </Small>
            {rows.map((e) => {
              const reasons = status !== 'unused' ? [] : blockReasons(e);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => open(e)}
                  onLongPress={() => manage(e)}
                  style={({ pressed }) => [s.row, status !== 'unused' && s.rowDone, pressed && { opacity: 0.8 }]}
                >
                  <Row style={{ flexWrap: 'wrap' }}>
                    <Badge label={shortId(e.id)} tone="info" />
                    {viralOf(e) ? <Badge label={viralBadge(viralOf(e)!)} tone="warn" /> : null}
                    {isV2(e) ? (
                      <>
                        {e.kind !== 'short' ? (
                          <Badge label={`order ${e.publish_order}`} tone="neutral" />
                        ) : (
                          <Tag label={e.format} color={FORMAT_COLORS[e.format]} />
                        )}
                        <Tag label={PILLAR_LABELS[e.pillar]} color={PILLAR_COLORS[e.pillar]} />
                        {e.kind !== 'short' ? (
                          <Badge label={`${e.chapters.length} ch`} tone="neutral" />
                        ) : (
                          <Badge label={e.ending} tone="neutral" />
                        )}
                        {reasons.length ? <Badge label="BLOCKED" tone="danger" /> : null}
                      </>
                    ) : (
                      <>
                        <Badge label="LEGACY" tone="warn" />
                        <Badge label={`P${e.priority}`} tone={e.priority === 1 ? 'ok' : 'neutral'} />
                        <Badge label={String(e.framing).replace('_', ' ')} tone="neutral" />
                        <Badge
                          label={
                            e.kind !== 'short'
                              ? `${e.target_min} min · ${e.chapters.length} ch`
                              : `${String(e.format).replace('_', ' ')} · ${e.length_s}s`
                          }
                          tone="neutral"
                        />
                        {e.script ? (
                          <Badge label={e.script.source === 'edited' ? 'SCRIPT · EDITED' : 'SCRIPT'} tone="ok" />
                        ) : null}
                      </>
                    )}
                  </Row>
                  <Body style={{ fontSize: 14, lineHeight: 20 }}>{e.title}</Body>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {bank.length ? <Small>Tap an entry to make it. Long-press to skip, restore or reset it.</Small> : null}

      <Modal visible={swapDay !== null} animationType="slide" onRequestClose={() => setSwapDay(null)}>
        <ScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
        >
          {weekPlan && swapDay !== null && weekPlan.days[swapDay] ? (
            <>
              <H2>Swap topic</H2>
              <Small>
                {formatRelease(new Date(weekPlan.days[swapDay].at), channelConfig.schedule)} · now{' '}
                {shortId(weekPlan.days[swapDay].entryId)}. Topics that keep every rotation rule come first; the rest say
                what they'd break.
              </Small>
              <Small style={{ fontWeight: '800', letterSpacing: 1 }}>PILLAR</Small>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label={`All (${options.length})`} on={pillarFilter === null} onPress={() => setPillarFilter(null)} />
                {PILLARS.filter((p) => categories.pillars.some((c) => c.value === p)).map((p) => (
                  <Chip
                    key={p}
                    label={`${PILLAR_LABELS[p]} (${categories.pillars.find((c) => c.value === p)?.count ?? 0})`}
                    on={pillarFilter === p}
                    onPress={() => setPillarFilter(p)}
                  />
                ))}
              </Row>
              <Small style={{ fontWeight: '800', letterSpacing: 1 }}>FORMAT</Small>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label="Any" on={formatFilter === null} onPress={() => setFormatFilter(null)} />
                {V2_FORMATS.filter((f) => categories.formats.some((c) => c.value === f)).map((f) => (
                  <Chip
                    key={f}
                    label={`${f} (${categories.formats.find((c) => c.value === f)?.count ?? 0})`}
                    on={formatFilter === f}
                    onPress={() => setFormatFilter(f)}
                  />
                ))}
              </Row>
              {shown.length ? (
                shown.map(({ entry, warnings: why }) =>
                  isV2(entry) && entry.kind === 'short' ? (
                    <Pressable
                      key={entry.id}
                      onPress={() => choose(entry.id)}
                      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
                    >
                      <Row style={{ flexWrap: 'wrap' }}>
                        <Badge label={shortId(entry.id)} tone="info" />
                        <Tag label={entry.format} color={FORMAT_COLORS[entry.format]} />
                        <Tag label={PILLAR_LABELS[entry.pillar]} color={PILLAR_COLORS[entry.pillar]} />
                        <Badge label={entry.ending} tone="neutral" />
                      </Row>
                      <Body style={{ fontSize: 14, lineHeight: 20 }}>{entry.title}</Body>
                      {why.map((w) => (
                        <Small key={w} style={{ color: colors.warn }}>
                          • {w}
                        </Small>
                      ))}
                    </Pressable>
                  ) : null
                )
              ) : (
                <Small>
                  {options.length ? 'No topic with this pillar and format.' : 'No other plannable Short in the bank.'}
                </Small>
              )}
              <Button label="Cancel" variant="ghost" onPress={() => setSwapDay(null)} />
            </>
          ) : null}
        </ScrollView>
      </Modal>

      <Modal visible={Boolean(pending)} animationType="slide" onRequestClose={() => setPending(null)}>
        <ScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
        >
          {pending ? (
            <>
              <H2>Import preview</H2>
              <Small>{pending.fileName}</Small>
              <Card>
                <Row style={{ flexWrap: 'wrap' }}>
                  <Badge label={`${pending.plan.added.length} new`} tone="ok" />
                  <Badge label={`${pending.plan.updated.length} updated`} tone="info" />
                  <Badge label={`${pending.plan.unchanged.length} unchanged`} tone="neutral" />
                  <Badge label={`${pending.plan.locked.length} locked`} tone="warn" />
                  {pending.plan.scriptsAdded.length ? (
                    <Badge label={`${pending.plan.scriptsAdded.length} scripts added`} tone="ok" />
                  ) : null}
                  {pending.plan.briefsAdded.length ? (
                    <Badge label={`${pending.plan.briefsAdded.length} visual briefs added`} tone="ok" />
                  ) : null}
                  {pending.plan.seoAdded.length ? (
                    <Badge label={`${pending.plan.seoAdded.length} SEO added`} tone="ok" />
                  ) : null}
                  <Badge
                    label={`${pending.plan.rejected.length} rejected`}
                    tone={pending.plan.rejected.length ? 'danger' : 'neutral'}
                  />
                </Row>
                <Small>
                  {pending.plan.next.filter((e) => isV2(e) || e.script).length} of {pending.plan.next.length} topics have
                  finished narration and will be used word for word. AI only plans their character and shots.
                </Small>
                {pending.plan.scriptsAdded.length ? (
                  <Small>Scripts added to topics you had already started: {pending.plan.scriptsAdded.join(', ')}</Small>
                ) : null}
                {pending.plan.briefsAdded.length ? (
                  <Small>
                    Visual briefs added to topics you had already started, for their next shot plan:{' '}
                    {pending.plan.briefsAdded.join(', ')}
                  </Small>
                ) : null}
                {pending.plan.seoAdded.length ? (
                  <Small>
                    SEO (description, tags, pinned comment) added to topics you had already started, for their upload:{' '}
                    {pending.plan.seoAdded.join(', ')}
                  </Small>
                ) : null}
                <Small>
                  {pending.plan.next.filter((e) => (isV2(e) ? Boolean(e.hashtags && e.long_tail) : e.seo)).length} of{' '}
                  {pending.plan.next.length} topics carry upload metadata (tags and hashtags).
                </Small>
                {pending.plan.next.some((e) => isV2(e)) ? (
                  <Small>
                    {
                      pending.plan.next.filter((e) => isV2(e) && e.status === 'unused' && blockReasons(e).length)
                        .length
                    }{' '}
                    v2 Shorts are blocked by the hook gate and won't be planned until fixed.
                  </Small>
                ) : null}
                {pending.plan.locked.length ? (
                  <Small>
                    Locked (already started, published or skipped, so not overwritten): {pending.plan.locked.join(', ')}
                  </Small>
                ) : null}
              </Card>

              <Card>
                <H3>Dry run</H3>
                {pending.report.lines.map((line: string, i: number) => (
                  <Small key={i}>• {line}</Small>
                ))}
              </Card>

              {pending.plan.conditional.length || pending.accepted.length ? (
                <Card>
                  <H3>Conditional Shorts</H3>
                  <Small>
                    These only fit if their condition holds. Nothing is imported until you say yes; leave one alone to
                    keep it out.
                  </Small>
                  {pending.plan.conditional.map((c) => (
                    <View key={c.id} style={{ gap: space.xs, marginTop: space.xs }}>
                      <Small style={{ fontWeight: '800' }}>{shortId(c.id)}</Small>
                      <Small>{c.condition}</Small>
                      <Button
                        label="Yes, import it"
                        variant="secondary"
                        onPress={() => void importText(pending.fileName, pending.markdown, [...pending.accepted, c.id])}
                      />
                    </View>
                  ))}
                  {pending.accepted.map((id) => (
                    <Row key={id} style={{ justifyContent: 'space-between', marginTop: space.xs }}>
                      <Small>{shortId(id)}: importing</Small>
                      <Button
                        label="Undo"
                        variant="ghost"
                        onPress={() =>
                          void importText(
                            pending.fileName,
                            pending.markdown,
                            pending.accepted.filter((x) => x !== id)
                          )
                        }
                      />
                    </Row>
                  ))}
                </Card>
              ) : null}

              {pending.plan.skipped.length ? (
                <Card>
                  <H3>Marked skipped ({pending.plan.skipped.length})</H3>
                  {pending.plan.skipped.map((k) => (
                    <Small key={k.id}>
                      • {shortId(k.id)}: {k.reason}
                    </Small>
                  ))}
                  <Small>Kept as records, never deleted; you can restore one from the bank.</Small>
                </Card>
              ) : null}

              {pending.plan.warnings.length ? (
                <Card>
                  <H3>Notes</H3>
                  {pending.plan.warnings.map((w, i) => (
                    <Small key={i} style={{ color: colors.warn }}>
                      • {w.reason}
                    </Small>
                  ))}
                </Card>
              ) : null}

              {pending.plan.ignored.length ? (
                <Card>
                  <H3>Ignored fields</H3>
                  {pending.plan.ignored.map((g, i) => (
                    <Small key={i}>
                      • {g.id ?? g.bankId}: {g.fields.join(', ')}
                    </Small>
                  ))}
                  <Small>Fields the app doesn't use are skipped; the entries still import.</Small>
                </Card>
              ) : null}

              {pending.plan.rejected.length ? (
                <Card>
                  <H3>Rejected</H3>
                  {pending.plan.rejected.map((r: any, i: number) => (
                    <Small key={i} style={{ color: colors.danger }}>
                      • {r.id ?? r.bankId ?? 'file'}: {r.reason}
                    </Small>
                  ))}
                </Card>
              ) : null}

              <Card>
                <H3>Possible repeats</H3>
                {pending.warnings.length ? (
                  pending.warnings.map((w, i) => (
                    <Small key={i} style={{ color: colors.warn }}>
                      • {w.message}
                    </Small>
                  ))
                ) : (
                  <Small>None found.</Small>
                )}
                {pending.libraryNote ? <Small>{pending.libraryNote}</Small> : null}
                <Small>Warnings don't block the import — you decide.</Small>
              </Card>

              <Button label={changes ? 'Import' : 'Nothing new — close'} onPress={changes ? confirmImport : () => setPending(null)} />
              <Button label="Cancel" variant="ghost" onPress={() => setPending(null)} />
            </>
          ) : null}
        </ScrollView>
      </Modal>
    </View>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.tag, { borderColor: color }]}>
      <Text style={[s.tagText, { color }]}>{label}</Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.7 }]}>
      <Small style={{ color: on ? colors.text : colors.textDim, fontWeight: on ? '800' : '600' }}>{label}</Small>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  rowDone: { backgroundColor: colors.surfaceAlt, opacity: 0.85 },
  tag: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
});
