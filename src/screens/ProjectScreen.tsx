import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Badge, Body, Button, Card, Divider, Empty, Field, H2, Row, Screen, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { calmSeconds } from '@/core/compliance';
import { isLegacy, isV2, parseBankMarkdown, planImport } from '@/core/topicBank';
import { parseBankV2 } from '@/core/bankV2';
import { TOPIC_BANK_V2 } from '@/assets/topicBankV2';
import { longClipCount, longProjectStale, longStillCount, refreshLongFromBank } from '@/core/v2Script';
import { revoiceReason } from '@/core/neutralLint';
import { countWords, estimateDuration, fullNarration, validateScript } from '@/core/guardrails';
import { buildDescription } from '@/core/timestamps';
import { applyLongEdits, applyShortEdits, longBankScriptFrom, shortBankScriptFrom, staleAudioKeys } from '@/core/scriptEdits';
import type { LongScript, Project } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const longTexts = (s: any): string[] =>
  [s.coldOpen, ...s.chapters.map((c: any) => c.narration), s.closingSynthesis].filter((t: string) => t.trim());

export default function ProjectScreen() {
  const nav = useNavigation<Nav>();
  const { id } = useRoute<RouteProp<RootStackParamList, 'Project'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const updateProject = useStudio((s) => s.updateProject);
  const entry: any = useStudio((s) => s.bank.find((e: any) => e.id === project?.bankEntryId));

  // Bank items keep their own checks; the guardrails are for written scripts.
  const issues = useMemo(
    () => (project && !(project.script as any).bankV2 ? validateScript(project.script) : []),
    [project],
  );

  const bankEntryId = project?.bankEntryId;
  /** The long item as the app ships it, for when the phone's bank copy is older. */
  const bundled = useMemo(() => {
    if (!bankEntryId) return undefined;
    const found: any = parseBankV2(TOPIC_BANK_V2).entries.find((e: any) => e.id === bankEntryId);
    return found?.kind === 'long' ? found : undefined;
  }, [bankEntryId]);

  if (!project) {
    return (
      <Screen>
        <Empty title="Project not found" />
      </Screen>
    );
  }

  const stored = entry && isV2(entry) && entry.kind === 'long' ? entry : undefined;
  const longScript: any = project.mode === 'long' && (project.script as any).bankV2 ? project.script : undefined;
  const stale = longScript
    ? stored && longProjectStale(longScript, stored)
      ? { entry: stored, bundled: false }
      : bundled && longProjectStale(longScript, bundled)
        ? { entry: bundled, bundled: true }
        : undefined
    : undefined;
  const bankChanged = Boolean(stale);
  const revoice = revoiceReason(project);
  const refreshable = Boolean(stale && refreshLongFromBank(longScript, stale.entry));

  const syncBundledBank = () => {
    const s = useStudio.getState();
    const plan = planImport(s.bank, parseBankMarkdown(TOPIC_BANK_V2), s.bankMeta);
    s.applyBankImport(plan.next, plan.banks, plan.reset);
  };

  const script: any = project.script;
  const words = countWords(fullNarration(project.script));
  const seconds = script.mode !== 'long' ? estimateDuration(fullNarration(project.script)) : calmSeconds(longTexts(script));

  const expectedClips =
    script.mode !== 'short'
      ? longClipCount(script)
      : script.beats.reduce((n: number, b: any) => n + b.shots.filter((s: any) => s.source === 'clip' && !s.reuse).length, 0);
  const clipCount = Object.keys(project.assets.clips).length;
  const expectedStills =
    script.mode === 'long' && script.chapters.some((c: any) => c.visuals) ? longStillCount(script) : 0;
  const stillCount = expectedStills
    ? script.chapters
        .flatMap((c: any) => c.visuals ?? [])
        .filter((v: any) => v.kind === 'still' && !v.reuse && (project.assets as any).stills?.[v.key]).length
    : 0;
  const expectedAudio = script.mode !== 'short' ? longTexts(script).length : 1;
  const audioCount = Object.keys(project.assets.audio).length;

  const updateFromBank = () => {
    if (!stale || !longScript) return;
    const result = refreshLongFromBank(longScript, stale.entry);
    if (!result) return;
    if (stale.bundled) syncBundledBank();
    const audio: Record<string, any> = { ...project.assets.audio };
    const alignment: Record<string, any> = { ...project.assets.alignment };
    const segments: Record<string, any> = { ...((project.assets as any).segments ?? {}) };
    for (const key of result.changed) {
      delete audio[key];
      delete alignment[key];
      delete segments[key];
    }
    updateProject(project.id, {
      script: result.script,
      topic: result.script.title,
      publish: { ...project.publish, title: result.script.title },
      review: undefined,
      assets: { ...project.assets, audio, alignment, segments, finalVideo: undefined },
    } as any);
    const n = result.changed.length;
    Alert.alert(
      'Updated from the bank',
      n
        ? `${n} chapter${n === 1 ? '' : 's'} changed and need voicing again; the rest keep their voice. Open Voice to make them, then review the script again before rendering.`
        : 'The words are the same; only titles and packaging changed. Review the script again before rendering.',
    );
  };

  const copyScript = async () => {
    const text =
      project.mode !== 'short'
        ? buildDescription(project.script as LongScript)
        : script.beats.map((b: any) => `[${b.kind.toUpperCase()}]\n${b.text}`).join('\n\n');
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
        <H2>{script.title}</H2>
        <Small>
          {project.category} · {script.archetype}
        </Small>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>{words} spoken words</Small>
          <Small>≈ {seconds.toFixed(0)}s runtime</Small>
        </Row>
      </Card>

      {revoice ? (
        <Card>
          <Row>
            <Badge label="NEEDS RE-VOICE" tone="warn" />
          </Row>
          <Small>
            {revoice} Nothing is re-rendered for you: re-voice only those lines (the bank's own narration has no character
            names), or keep this project as it is.
            {bankChanged
              ? ' "Update from the bank" below brings the new names in and marks only the changed chapters.'
              : ''}
          </Small>
        </Card>
      ) : null}

      {(project as any).bankReset && project.bankEntryId ? (
        <Card>
          <Badge label="REWRITTEN BY THE BANK" tone="warn" />
          <Small>
            The topic bank rewrote {project.bankEntryId} (CR-91) while this project was in progress. Its old voice and
            render were discarded; the script below is the old one. Make it again from the bank: this project is removed
            and a new one starts from the new script (3 shots, one clip).
          </Small>
          <Button
            label="Make it again from the bank"
            onPress={() => {
              const mode = project.mode;
              useStudio.getState().deleteProject(project.id);
              nav.replace('Generate', { mode, bankEntryId: project.bankEntryId });
            }}
          />
        </Card>
      ) : null}

      {bankChanged ? (
        <Card>
          <H2>The bank has changed</H2>
          <Small>
            This project was made from an older version of {project.bankEntryId}.{' '}
            {refreshable
              ? "Update it to the bank's current text: only the changed chapters need their voice made again, and the clips and stills you have made are kept. Your review is cleared."
              : 'The chapters no longer line up (the script was remade), so make a new project from the topic bank. Its voice, clips and stills are for the old script.'}
          </Small>
          {refreshable ? <Button label="Update from the bank" onPress={updateFromBank} /> : null}
          {!refreshable && stale?.bundled ? (
            <Button
              label="Update the phone's topic bank"
              variant="secondary"
              onPress={() => {
                syncBundledBank();
                Alert.alert(
                  'Topic bank updated',
                  `${project.bankEntryId} now has its remade script. Start a new project from it in the Topic Bank.`,
                );
              }}
            />
          ) : null}
        </Card>
      ) : null}

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
          detail={`${clipCount} / ${expectedClips} clips imported${expectedStills ? ` · ${stillCount} / ${expectedStills} stills` : ''}`}
          tone={
            clipCount >= expectedClips && stillCount >= expectedStills
              ? 'ok'
              : clipCount + stillCount > 0
                ? 'warn'
                : 'neutral'
          }
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

      <ScriptCard project={project} />

      <Button label="Copy full script" variant="secondary" onPress={copyScript} />
    </Screen>
  );
}

/** The script by section, editable unless the bank owns the words. */
function ScriptCard({ project }: { project: Project }) {
  const updateProject = useStudio((s) => s.updateProject);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const script: any = project.script;
  const sections: { label: string; text: string }[] =
    script.mode !== 'short'
      ? [
          { label: 'COLD OPEN', text: script.coldOpen },
          ...script.chapters.map((c: any) => ({ label: `CH ${c.index} · ${c.title}`, text: c.narration })),
          { label: 'CLOSING', text: script.closingSynthesis },
        ]
      : script.beats.map((b: any) => ({ label: b.kind.toUpperCase(), text: b.text }));
  const locked = Boolean(script.bankV2);
  const shown = sections.map((s, i) => ({ ...s, i })).filter((s) => editing || s.text.trim() || !locked);
  const source = script.scriptSource;

  const save = () => {
    const s = useStudio.getState();
    const next: any =
      script.mode !== 'short'
        ? applyLongEdits(script, {
            coldOpen: drafts[0],
            chapters: drafts.slice(1, -1),
            closing: drafts[drafts.length - 1],
          })
        : applyShortEdits(script, drafts);
    const stale = staleAudioKeys(script, next);
    const audio: Record<string, any> = { ...project.assets.audio };
    const alignment: Record<string, any> = { ...project.assets.alignment };
    for (const key of stale) {
      delete audio[key];
      delete alignment[key];
    }
    updateProject(project.id, {
      script: next,
      assets: { ...project.assets, audio, alignment, finalVideo: stale.length ? undefined : project.assets.finalVideo },
    } as any);
    // A legacy bank script follows the edit, so the bank and the project agree.
    const entry: any = project.bankEntryId ? s.bank.find((e: any) => e.id === project.bankEntryId) : undefined;
    if (entry?.kind === 'short' && isLegacy(entry) && entry.script && next.mode === 'short') {
      s.updateBankEntry(entry.id, { script: shortBankScriptFrom(entry.script, next) });
    } else if (entry?.kind === 'long' && isLegacy(entry) && entry.script && next.mode === 'long') {
      s.updateBankEntry(entry.id, { script: longBankScriptFrom(entry.script, next) });
    }
    setEditing(false);
    if (stale.length) Alert.alert('Script saved', 'The changed parts need voicing again before the next render.');
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>Script</H2>
        <Badge
          label={
            locked
              ? 'BANK v2 · LOCKED'
              : source === 'bank'
                ? 'FROM THE BANK'
                : source === 'edited'
                  ? 'EDITED'
                  : 'WRITTEN BY AI'
          }
          tone={locked || source === 'bank' ? 'ok' : source === 'edited' ? 'warn' : 'neutral'}
        />
      </Row>
      {shown.map(({ label, text, i }) => (
        <React.Fragment key={label + i}>
          <Small style={{ fontWeight: '800', letterSpacing: 1, marginTop: space.xs }}>{label}</Small>
          {editing ? (
            <Field
              label=""
              value={drafts[i] ?? ''}
              onChangeText={(v) => setDrafts((d) => d.map((x, j) => (j === i ? v : x)))}
              multiline
            />
          ) : (
            <Body style={{ fontSize: 14, lineHeight: 20 }}>{text}</Body>
          )}
        </React.Fragment>
      ))}
      {editing ? (
        <Row style={{ marginTop: space.sm }}>
          <Button label="Save" onPress={save} style={{ flex: 1 }} />
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </Row>
      ) : locked ? (
        <Small>The narration is the bank's, word for word. To change it, edit the bank file and import it again.</Small>
      ) : (
        <Button
          label="Edit"
          variant="ghost"
          onPress={() => {
            setDrafts(sections.map((s) => s.text));
            setEditing(true);
          }}
        />
      )}
    </Card>
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
