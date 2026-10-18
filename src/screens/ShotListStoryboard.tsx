import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { Badge, Body, Button, Card, Divider, H2, H3, Row, Small } from '@/components/ui';
import { PromptCard } from '@/components/PromptCard';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { canTry, clipState, creditsLine, creditsPlanned, creditsSpent, flowFor, MAX_TRIES } from '@/core/flowCredits';
import { shotCounts, shotRules } from '@/core/shotListPlan';
import { coldOpenProblems } from '@/core/authenticity';
import { longQaChecks } from '@/core/longQa';
import StillQueueCard from '@/components/StillQueueCard';
import MasterStillsCard from '@/components/MasterStillsCard';
import FillSheetCard from '@/components/FillSheetCard';
import type { Project } from '@/core/types';

/** What a drawn card says, in one line. */
function describeCard(card: any): string {
  if (!card) return '';
  switch (card.kind) {
    case 'stats':
      return card.rows.map((r: any) => `${r.label} → ${r.value}`).join(' · ');
    case 'stat':
      return `${card.label} → ${card.value}${card.note ? ` (${card.note})` : ''}`;
    case 'end':
      return `Next: ${card.text}`;
    case 'icons':
      return card.labels.join(' / ');
    case 'prices':
      return card.prices.join(' / ');
    case 'split':
      return card.pairs.map((p: any) => `${p.from} → ${p.to}`).join(', ');
    case 'flip':
      return `${card.from} → ${card.to}`;
    case 'bars':
      return `Bars: ${card.values.map((v: number) => `${v}${card.unit}`).join(' / ')}`;
    case 'study':
      return `${card.name} · ${card.meta}`;
    case 'label':
      return card.lines.join(' ');
    case 'pulse':
      return 'A big red button, pulsing once';
    case 'title':
      return card.text;
    default:
      return 'GUESS? (over the pause)';
  }
}

/**
 * A long video's shot list in the order it is made: free stills first, a
 * preview with no Veo, then the clips under the credit cap, then the cards.
 */
export function ShotListStoryboard({
  project,
  list,
  onImportClip,
  onImportStillsInOrder,
  onImportStill,
  onPreview,
}: {
  project: Project;
  list?: any;
  onImportClip: (key: string) => void;
  onImportStillsInOrder: (keys: string[]) => void;
  onImportStill: (key: string) => void;
  onPreview: () => void;
}) {
  const script: any = project.script;
  const cfg = useStudio((s) => s.channelConfig.flow);
  const flow = useMemo(() => flowFor(script, cfg), [script, cfg]);
  const logFlowTry = useStudio((s) => s.logFlowTry);
  const clipToStill = useStudio((s) => s.clipToStill);
  const updateProject = useStudio((s) => s.updateProject);
  const neutralTerms = useStudio((s) => s.settings.neutralTerms);
  const [showCards, setShowCards] = useState(false);

  const items = useMemo(
    () =>
      script.chapters.flatMap((ch: any) => (ch.visuals ?? []).map((v: any) => ({ v, chapter: ch.title as string }))) as {
        v: any;
        chapter: string;
      }[],
    [script],
  );
  const clips = items.filter((i) => i.v.kind === 'clip');
  const stills = items.filter((i) => i.v.kind === 'still' && !i.v.reuse);
  const cards = items.filter((i) => i.v.kind === 'card');
  const assets: any = project.assets;
  const missing = stills.filter((s) => !assets.stills?.[s.v.key]).map((s) => s.v.key as string);

  const rules = useMemo(
    () =>
      list
        ? shotRules(
            list,
            script.chapters.map((c: any) => c.visuals ?? []),
          )
        : { blocks: [] as string[], warnings: (script.bankV2?.planNotes ?? []) as string[] },
    [list, script],
  );
  const alignment = project.assets.alignment;
  const qa = useMemo(
    () =>
      script.bankV2?.cueCounts
        ? longQaChecks(script, {
            alignment,
            welcome: (t: string) => coldOpenProblems(t, true),
            neutralTerms,
          } as any)
        : [],
    [script, alignment, neutralTerms],
  );
  const ledger: any = (project as any).flow;
  const spent = creditsSpent(ledger, flow);
  const planned = creditsPlanned(script, flow);
  const counts = shotCounts(items.map((i) => i.v));

  const importClip = (key: string) => {
    // Importing a clip that was never logged counts its one try.
    if (!ledger?.tries?.[key]) logFlowTry(project.id, key, true);
    onImportClip(key);
  };
  const logTry = (key: string) => {
    const verdict: any = logFlowTry(project.id, key);
    if (!verdict.ok) Alert.alert('No more tries', verdict.reason ?? 'The credit cap stops another try.');
  };
  const useStill = (key: string) =>
    Alert.alert(
      'Use a still instead?',
      'The clip becomes a still with a slow zoom: make it in the Gemini app like the others. No more Flow credits for it.',
      [
        { text: 'Keep the clip', style: 'cancel' },
        { text: 'Use a still', onPress: () => clipToStill(project.id, key) },
      ],
    );

  return (
    <>
      <Card>
        <H2>Shot list</H2>
        <Small>
          {counts.clips} Veo clips · {counts.stills} stills from the Gemini app · {counts.cards} cards the app draws.{' '}
          {list
            ? 'Every picture shows something from its own sentence; Hoot is the only character and the app adds him.'
            : `Every picture shows its own scene with the cast (${(script.bankV2?.cast ?? []).join(', ') || 'no cast'}); Hoot is never in a prompt: the app adds him.`}
        </Small>
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small style={{ color: spent > flow.longformCap ? colors.danger : colors.text, fontWeight: '800' }}>
            {creditsLine(ledger, flow)}
          </Small>
          <Badge label={`${planned} PLANNED`} tone={planned > flow.longformCap ? 'danger' : 'info'} />
        </Row>
        {qa.length ? (
          <>
            <Divider />
            <H3>QA gate (CR-69)</H3>
            {qa.map((q) => (
              <Small
                key={q.id}
                style={{
                  color: q.status === 'block' ? colors.danger : q.status === 'warn' ? colors.warn : colors.text,
                  marginTop: space.xs,
                }}
              >
                {q.status === 'pass' ? '✓' : q.status === 'warn' ? '!' : '✕'} {q.label}: {q.detail}
              </Small>
            ))}
            {script.bankV2?.cast?.length ? (
              <Small style={{ marginTop: space.xs }}>
                Make each cast member's reference image first and attach it to every Flow and Gemini prompt that names
                them, so the face and wardrobe hold from chapter to chapter.
              </Small>
            ) : null}
            <Divider />
          </>
        ) : null}
        {rules.blocks.map((b) => (
          <Small key={b} style={{ color: colors.danger, marginTop: space.xs }}>
            • {b}
          </Small>
        ))}
        {rules.warnings.map((w) => (
          <Small key={w} style={{ color: colors.warn, marginTop: space.xs }}>
            • {w}
          </Small>
        ))}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>1 · Stills first (free)</H3>
          <Badge
            label={missing.length ? `${stills.length - missing.length}/${stills.length}` : 'ALL IN'}
            tone={missing.length ? 'neutral' : 'ok'}
          />
        </Row>
        <Small>
          Make all {stills.length} in the Gemini app (no Flow credits), in order. Each prompt starts with the video's
          locked style. Then import them together; they are matched in the order you tap them.
        </Small>
        <PromptCard
          verbatim
          label={`ALL ${stills.length} STILL PROMPTS, NUMBERED`}
          prompt={stills
            .map((s, i) => `${i + 1}.${s.v.shot ? ` (shot ${s.v.shot})` : ''} ${s.v.prompt}`)
            .join('\n\n')}
        />
        {missing.length ? (
          <Pressable onPress={() => onImportStillsInOrder(missing)} style={{ paddingVertical: space.xs }}>
            <Small style={{ color: colors.accent, fontWeight: '800' }}>
              Import the next {missing.length} still{missing.length === 1 ? '' : 's'} in order →
            </Small>
          </Pressable>
        ) : null}
        <Divider />
        <FillSheetCard projectId={project.id} />
        <MasterStillsCard projectId={project.id} />
        <StillQueueCard projectId={project.id} />
        <H3>Contact sheet</H3>
        <Small>Look for anything off-style or repeated; tap a picture to replace it.</Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
          {stills.map((s) => {
            const uri = assets.stills?.[s.v.key];
            return (
              <Pressable key={s.v.key} onPress={() => onImportStill(s.v.key)} style={{ width: '31%' }}>
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{
                      width: '100%',
                      aspectRatio: 1.7777777777777777,
                      borderRadius: 6,
                      backgroundColor: colors.surfaceAlt,
                    }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: '100%',
                      aspectRatio: 1.7777777777777777,
                      borderRadius: 6,
                      backgroundColor: colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Small>to make</Small>
                  </View>
                )}
                <Small>#{s.v.shot}</Small>
              </Pressable>
            );
          })}
        </View>
        <Button
          label={(project as any).stillsApproved ? '✓ Stills approved' : 'The stills look right: approve'}
          variant={(project as any).stillsApproved ? 'secondary' : 'primary'}
          disabled={missing.length > 0}
          onPress={() => updateProject(project.id, { stillsApproved: !(project as any).stillsApproved } as any)}
          style={{ marginTop: space.sm }}
        />
      </Card>

      <Card>
        <H3>2 · Preview with no Veo</H3>
        <Small>
          Render a draft of the stills, the cards and Hoot alone. If it already works, Veo only adds polish: a clip not
          made yet is covered by the picture beside it.
        </Small>
        <Button label="Open the draft preview" variant="secondary" onPress={onPreview} style={{ marginTop: space.xs }} />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>3 · Veo clips ({clips.length})</H3>
          <Badge label={`${spent}/${flow.longformCap} CREDITS`} tone={spent >= flow.longformCap ? 'danger' : 'info'} />
        </Row>
        <Small>
          The hook first. {flow.creditsPerClip} credits a try; the video is held to {flow.longformCap}, retries included.
          A clip that fails {MAX_TRIES} times becomes a still with a slow zoom instead of a third try.
          {(project as any).stillsApproved ? '' : ' Do the stills and the preview first.'}
        </Small>
        {clips.map((c, i) => {
          const key: string = c.v.key;
          const imported = Boolean(project.assets.clips[key]);
          const state = clipState(ledger, key, imported);
          const tries: number = ledger?.tries?.[key] ?? 0;
          const can: any = canTry(ledger, key, flow);
          return (
            <View key={key} style={{ gap: space.xs, marginTop: space.sm }}>
              <PromptCard
                verbatim
                label={`VEO CLIP ${i + 1}${c.v.shot ? ` · shot ${c.v.shot}` : ''} · ${c.chapter}`}
                prompt={c.v.prompt}
                status={
                  imported
                    ? { label: 'IMPORTED', tone: 'ok' }
                    : { label: tries ? `${tries} TRIED` : 'PENDING', tone: tries ? 'warn' : 'neutral' }
                }
                onImport={() => importClip(key)}
              />
              <Small>Covers: {c.v.text}</Small>
              {imported ? null : (
                <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
                  <Button
                    label={`Log a try (−${flow.creditsPerClip})`}
                    variant="ghost"
                    disabled={!can.ok}
                    onPress={() => logTry(key)}
                  />
                  {state === 'offer-still' || !can.ok ? (
                    <Button label="Use a still instead" variant="secondary" onPress={() => useStill(key)} />
                  ) : null}
                </Row>
              )}
              {!imported && !can.ok ? <Small style={{ color: colors.warn }}>{can.reason}</Small> : null}
            </View>
          );
        })}
        {clips.length ? null : <Small>No Veo clips are left in this video: every picture is a still or a card.</Small>}
      </Card>

      <Card>
        <Pressable onPress={() => setShowCards((v) => !v)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>4 · Cards the app draws ({cards.length})</H3>
            <Badge label="FREE" tone="ok" />
          </Row>
          <Small>
            Numbers, study names, labels and questions: nothing to make. {showCards ? 'Hide' : 'Show'} the list.
          </Small>
        </Pressable>
        {showCards
          ? cards.map((c) => (
              <Body key={c.v.key} style={{ fontSize: 13, lineHeight: 18 }}>
                {c.v.shot ? `#${c.v.shot}` : c.chapter} · {describeCard(c.v.card)}
              </Body>
            ))
          : null}
      </Card>
    </>
  );
}
