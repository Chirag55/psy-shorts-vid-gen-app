import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Card, Field, H2, H3, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import {
  generateLongScript,
  generateShortScript,
  planBankedScript,
  type ShortStructure,
} from '@/services/scriptProvider';
import { fetchPerformanceContext } from '@/services/performanceContext';
import { validateScript } from '@/core/guardrails';
import { useMounted } from '@/util/useMounted';
import { duplicatesForEntry } from '@/services/bankImport';
import { isV2 } from '@/core/topicBank';
import { shortClipCap } from '@/core/channelConfig';
import { blockReasons } from '@/core/rotation';
import { countWords, endsWithCatchphrase, longNarration, SIGNOFF_CARD, withoutCatchphrase } from '@/core/bankV2';
import { applyHookVariant, nextVariantFor, variantTitle } from '@/core/hookVariants';
import { endQuestionOf } from '@/core/seoLint';
import { moodFor, moodOf, nextProfile, styleFor, type StyleProfile } from '@/core/styleProfiles';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORIES = [
  'Social Dynamics',
  'Attachment & Relationships',
  'Cognitive Bias',
  'Self-Sabotage',
  'Emotional Regulation',
  'Persuasion & Influence',
];

export default function GenerateScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Generate'>>();

  const createProject = useStudio((s) => s.createProject);
  const markTopicUsed = useStudio((s) => s.markTopicUsed);
  const recentArchetypes = useStudio((s) => s.recentArchetypes);
  const settings = useStudio((s) => s.settings);
  const entry: any = useStudio((s) =>
    route.params.bankEntryId ? s.bank.find((e: any) => e.id === route.params.bankEntryId) : undefined,
  );

  const [mode, setMode] = useState(entry?.kind ?? route.params.mode);
  const [topic, setTopic] = useState<string>(entry?.title ?? route.params.topic ?? '');
  const [category, setCategory] = useState<string>(
    entry
      ? `Topic bank · ${isV2(entry) ? entry.pillar : entry.framing.replace('_', ' ')}`
      : (route.params.category ?? CATEGORIES[0]),
  );
  const [chapters, setChapters] = useState('4');
  const [structure, setStructure] = useState<ShortStructure>('single');
  const [longStructure, setLongStructure] = useState('standard');
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();
  // Synchronous guard: two taps in one tick would both pass a state check and
  // bill two generations.
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Asks before making something the channel has already made. */
  const confirmRepeats = async (): Promise<boolean> => {
    if (!entry) return true;
    let dups: { message: string }[] = [];
    try {
      dups = await duplicatesForEntry(entry.id);
    } catch {
      // A failed check never blocks the make.
    }
    if (!dups.length) return true;
    return new Promise((resolve) =>
      Alert.alert('Possible repeat', `${dups.map((d) => d.message).join('\n')}\n\nMake it anyway?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Make it', onPress: () => resolve(true) },
      ]),
    );
  };

  const generate = async (skipRepeats = false) => {
    if (busyRef.current) return;

    if (entry && blockReasons(entry).length) {
      Alert.alert(
        'Blocked by the hook gate',
        `${blockReasons(entry).join('\n')}\n\nFix it in the bank file and import it again.`,
      );
      return;
    }
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Give the generator a specific psychological pattern to work from.');
      return;
    }

    busyRef.current = true;
    if (!skipRepeats && !(await confirmRepeats())) {
      busyRef.current = false;
      return;
    }
    setBusy(true);
    setNotice('');
    const controller = new AbortController();
    abortRef.current = controller;
    let switched = '';
    try {
      const archetypes = recentArchetypes();
      const model = settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;
      // Bank items are written already: no channel stats are needed to steer them.
      const isBank = Boolean(entry && (isV2(entry) || entry.script));
      const performanceContext = isBank ? '' : await fetchPerformanceContext(mode === 'short');

      const testProfile = entry && isV2(entry) ? entry.test_profile : undefined;
      const profile: StyleProfile =
        settings.styleProfile === 'auto'
          ? testProfile
            ? testProfile === 'calm'
              ? 'C'
              : 'P'
            : nextProfile(useStudio.getState().projects as any)
          : (settings.styleProfile as StyleProfile);
      const mood = moodFor(profile, entry && isV2(entry) ? moodOf(entry) : 'warm');
      const style = { profile, mood };

      const ctx = {
        provider: settings.scriptProvider,
        model,
        performanceContext,
        titleConfig: useStudio.getState().channelConfig.titles,
        structure,
        longStructure,
        clipBudget: Math.min(settings.shortClipBudget, shortClipCap(useStudio.getState().channelConfig.flow)),
        style,
        assignment: entry,
        fallbackModel: settings.scriptProvider === 'anthropic' ? settings.geminiModel : settings.anthropicModel,
        signal: controller.signal,
        onNotice: (text: string) => {
          if (text.startsWith('Written by ')) switched = text;
          if (mounted.current) setNotice(text);
        },
      };

      // A spoken sign-off on a SIGNOFF Short becomes the end card when the voice is told not to say it.
      const stripCatchphrase = Boolean(
        entry &&
          isV2(entry) &&
          entry.kind === 'short' &&
          entry.ending === 'SIGNOFF' &&
          !settings.spokenSignoff &&
          endsWithCatchphrase(entry.narration),
      );
      const assignment =
        stripCatchphrase && entry && isV2(entry) && entry.kind === 'short'
          ? { ...entry, narration: withoutCatchphrase(entry.narration) }
          : entry;

      const script: any =
        assignment && isBank
          ? await planBankedScript(ctx as any, assignment, archetypes, settings.shotPlanner === 'ai')
          : mode !== 'short'
            ? await generateLongScript(
                ctx as any,
                topic,
                category,
                entry?.kind === 'long'
                  ? entry.chapters.length
                  : longStructure === 'numbered'
                    ? Math.max(5, Math.min(7, Number.parseInt(chapters, 10) || 5))
                    : Math.max(3, Math.min(6, Number.parseInt(chapters, 10) || 4)),
                archetypes,
              )
            : await generateShortScript(ctx as any, topic, category, archetypes);

      if (!mounted.current) return;

      const issues = isBank ? [] : validateScript(script);
      const errors = issues.filter((i) => i.severity === 'error');

      const proceed = () => {
        const variant =
          script.mode === 'short' && script.bankV2?.hookAlt
            ? nextVariantFor(script, useStudio.getState().projects)
            : undefined;
        const varied = variant && script.mode === 'short' ? applyHookVariant(script, variant) : script;
        const question =
          varied.mode === 'short' && varied.bankV2 && settings.endQuestionCard
            ? endQuestionOf(varied.bankV2.pinnedComment)
            : undefined;
        const card = stripCatchphrase ? SIGNOFF_CARD : question;
        const finalScript = card && varied.mode === 'short' ? { ...varied, ctaQuestion: card } : varied;
        const project = createProject({
          topic,
          category,
          script: finalScript,
          bankEntryId: entry?.id,
          ...(finalScript.mode !== 'short' ? {} : { style: styleFor(profile, mood) }),
        } as any);
        if (variant && script.mode === 'short') {
          useStudio.getState().updateProject(project.id, {
            hookVariant: variant,
            publish: {
              ...project.publish,
              title: variantTitle(variant, project.publish.title, script.bankV2?.titleAlt),
            },
          } as any);
        }
        if (route.params.topicId) markTopicUsed(route.params.topicId);
        nav.replace('Project', { id: project.id });
        if (switched) Alert.alert('Provider switched', switched);
      };

      if (errors.length) {
        // A hard cap breach means the audio will not fit the clip budget, so make
        // the tradeoff explicit rather than letting it surface at render time.
        Alert.alert(
          'Guardrail breach',
          `${errors.map((e) => e.message).join('\n\n')}\n\nKeep it anyway, or regenerate?`,
          [
            { text: 'Regenerate', style: 'cancel', onPress: () => void generate(true) },
            { text: 'Keep anyway', onPress: proceed },
          ],
        );
      } else {
        proceed();
      }
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        const details = e instanceof Error ? e.message : String(e);
        Alert.alert('Generation failed', details, [
          { text: 'Copy details', onPress: () => void Clipboard.setStringAsync(details) },
          { text: 'OK', style: 'cancel' },
        ]);
      }
    } finally {
      busyRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
      if (mounted.current) {
        setBusy(false);
        setNotice('');
      }
    }
  };

  // An unused bank item starts on open; the gate and any repeat check still apply.
  const autoRef = useRef(false);
  useEffect(() => {
    if (!entry || autoRef.current || entry.status !== 'unused' || blockReasons(entry).length) return;
    autoRef.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (entry) {
    const existingProjectId =
      entry.projectId && useStudio.getState().projects.some((p) => p.id === entry.projectId)
        ? entry.projectId
        : undefined;
    const reasons = blockReasons(entry);
    const planOnly = Boolean(isV2(entry) || entry.script);
    const v2 = isV2(entry) ? entry : null;
    const plannerNote = (aiLine: string) =>
      settings.shotPlanner === 'ai' ? aiLine : 'The character and shots are planned on the phone — no AI call.';

    return (
      <Screen>
        <Card>
          <H2>From the topic bank</H2>
          {v2 ? (
            <>
              <Small>
                {v2.id} · {v2.pillar}
                {v2.kind !== 'short'
                  ? ` · publish order ${v2.publish_order} · ${v2.chapters.length} chapters`
                  : ` · ${v2.format} · ending ${v2.ending}`}
              </Small>
              <Body style={{ fontSize: 16, fontWeight: '800' }}>{v2.title}</Body>
              {v2.kind !== 'short' ? (
                <>
                  <Small>Thumbnail: {v2.thumbnail_text}</Small>
                  {v2.chapters.map((c: any) => (
                    <Small key={c.title}>• {c.title}</Small>
                  ))}
                </>
              ) : (
                <>
                  <Small>On screen from frame 0: {v2.hook_text}</Small>
                  <Small>Source: {v2.source}</Small>
                  <Small>Funnels into {v2.related_longform}</Small>
                </>
              )}
              <Small>
                Narration from the bank ({countWords(v2.kind !== 'short' ? longNarration(v2) : v2.narration)} words), used
                word for word and never sent to a model to rewrite.{' '}
                {plannerNote('The AI planner only picks the character and the shots.')}
              </Small>
            </>
          ) : (
            <>
              <Small>
                LEGACY · {entry.id} · {entry.framing.replace('_', ' ')} ·{' '}
                {entry.kind !== 'short'
                  ? `${entry.target_min} min · ${entry.chapters.length} chapters`
                  : `${entry.format.replace('_', ' ')} · ${entry.length_s} s`}{' '}
                · priority {entry.priority}
              </Small>
              <Body style={{ fontSize: 16, fontWeight: '800' }}>{entry.title}</Body>
              {entry.kind !== 'short' ? (
                <>
                  <Small>Cold open: {entry.cold_open}</Small>
                  {entry.chapters.map((c: any, i: number) => (
                    <Small key={c.title}>
                      {i + 1}. {c.title} — {c.concept}
                    </Small>
                  ))}
                </>
              ) : (
                <>
                  <Small>Hook: {entry.hook}</Small>
                  <Small>Concept: {entry.concept}</Small>
                  {entry.format === 'test' ? (
                    <Small>
                      Stimulus ({entry.stimulus_hold_s} s, drawn by the app): {entry.stimulus}
                    </Small>
                  ) : null}
                  <Small>On screen at the end: {entry.cta_question}</Small>
                </>
              )}
              {entry.notes ? <Small style={{ color: colors.warn }}>Notes: {entry.notes}</Small> : null}
              <Small>
                {entry.script
                  ? `Finished script from the bank (${entry.script.word_count} words), used word for word. ${plannerNote(
                      'The AI planner only picks the character and the shots — it never touches the words.',
                    )}`
                  : 'This entry has no script, so one is written to its brief. The topic, framing, format and concept are locked.'}
              </Small>
            </>
          )}
        </Card>

        {reasons.length ? (
          <Card>
            <H3>Blocked by the hook gate (CR-46)</H3>
            {reasons.map((r) => (
              <Small key={r} style={{ color: colors.danger }}>
                • {r}
              </Small>
            ))}
            <Small>
              Fix this item's narration or hook_text in the bank file and import it again. The narration is never changed
              in the app.
            </Small>
          </Card>
        ) : null}

        {busy ? (
          <Card>
            <H3>{planOnly ? 'Planning the shots…' : 'Writing the script from this brief…'}</H3>
            <Small>
              {planOnly
                ? "One character is picked and the bank's lines are cut into shots. The project opens as soon as it's ready."
                : "The narration and shot list are written to the brief above. The project opens as soon as it's ready."}
            </Small>
            {notice ? <Small style={{ color: colors.textDim }}>{notice}</Small> : null}
          </Card>
        ) : null}

        {!busy && existingProjectId ? (
          <>
            <Button label="Open the project" onPress={() => nav.replace('Project', { id: existingProjectId })} />
            {reasons.length ? null : (
              <Button label="Make it again as a new project" variant="ghost" onPress={() => void generate()} />
            )}
          </>
        ) : null}

        {!busy && !existingProjectId && !reasons.length && (autoRef.current || entry.status !== 'unused') ? (
          <Button
            label={
              entry.status === 'unused'
                ? planOnly
                  ? 'Plan the shots'
                  : 'Write the script'
                : 'Make it again as a new project'
            }
            onPress={() => void generate()}
          />
        ) : null}
      </Screen>
    );
  }

  const budget = settings.shortClipBudget;

  return (
    <Screen>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'short', label: '9:16 Short' },
          { value: 'long', label: '16:9 Deep Dive' },
        ]}
      />

      <Card>
        <H2>{mode === 'short' ? 'Short-form brief' : 'Deep dive brief'}</H2>
        <Small>
          {mode === 'short'
            ? `${
                structure === 'rapid'
                  ? '38–46 words: hook, three signs, closer (about 17 s)'
                  : '55–70 spoken words across hook, mechanism and reframe'
              }. Opens on something the viewer does, with the hook on screen for 2 s, and ends straight back into the hook. Cut as 4+ shots: ${budget} generated clip${budget === 1 ? '' : 's'} (Settings), the rest moving stills.`
            : '450–700 spoken words. Cold open, chapters, closing synthesis — two hero clips and one connective still per chapter.'}
        </Small>
      </Card>

      <Card>
        <Field
          label="Topic"
          value={topic}
          onChangeText={setTopic}
          placeholder="e.g. Why being left on read triggers a threat response"
          multiline
        />

        <Small style={{ marginBottom: space.xs }}>Category</Small>
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              label={c}
              variant={c === category ? 'primary' : 'ghost'}
              onPress={() => setCategory(c)}
              style={{ paddingHorizontal: space.md, minHeight: 38 }}
            />
          ))}
        </Row>

        {mode !== 'long' ? (
          <>
            <Small style={{ marginBottom: space.xs }}>Structure</Small>
            <Segmented
              value={structure}
              onChange={setStructure}
              options={[
                { value: 'single', label: 'One tactic' },
                { value: 'list', label: 'Three tactics' },
                { value: 'rapid', label: 'Rapid list' },
              ]}
            />
            <Small style={{ marginBottom: space.md }}>
              {structure === 'single'
                ? 'One named tactic explored in depth.'
                : structure === 'list'
                  ? 'Counts off three named tactics in the same word budget — each stated, not explained.'
                  : 'Three fast signs someone is using a tactic on you, each with its own on-screen card. About 17 seconds, and about a third less voice budget.'}
            </Small>
          </>
        ) : (
          <>
            <Small style={{ marginBottom: space.xs }}>Structure</Small>
            <Segmented
              value={longStructure}
              onChange={(v) => {
                setLongStructure(v);
                const n = Number.parseInt(chapters, 10) || 0;
                if (v === 'numbered' && (n < 5 || n > 7)) setChapters('5');
                if (v === 'standard' && (n < 3 || n > 6)) setChapters('4');
              }}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'numbered', label: 'N signs / tactics' },
              ]}
            />
            <Small style={{ marginBottom: space.md }}>
              {longStructure === 'numbered'
                ? 'One named tactic per chapter, each closing on how to spot it. Titled "[N] Tactics People Use… (Psychology Explained)".'
                : 'Chapters that build one argument, each with a hook, a mechanism and a reframe.'}
            </Small>
            <Field
              label={longStructure === 'numbered' ? 'Chapters (5–7)' : 'Chapters (3–6)'}
              value={chapters}
              onChangeText={setChapters}
              keyboardType="numeric"
            />
          </>
        )}

        <Button label={busy ? 'Writing…' : 'Generate script'} onPress={() => void generate()} loading={busy} />
        {busy && notice ? <Small style={{ marginTop: space.sm, color: colors.textDim }}>{notice}</Small> : null}
      </Card>

      <Card>
        <Body style={{ color: colors.textDim }}>
          The style lock is appended to every visual prompt automatically, and archetypes from your last ten projects are
          excluded so characters never repeat.
        </Body>
      </Card>
    </Screen>
  );
}
