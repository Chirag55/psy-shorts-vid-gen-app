import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Badge, Button, Card, H3, Row, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { CAST } from '@/assets/cast';
import { applyEdits, buildSheet, fillBlanksPrompt, parseSheetText, sheetText, type RowEdit } from '@/core/fillSheet';
import { fillSheetBlanks } from '@/services/scriptProvider';

type Field = 'setting' | 'cutaway' | 'cast';
type Picker = { key: string; field: Field; options: string[] };

/** One row per beat of a long video: the setting, cutaway and cast each picture is made with. */
export default function FillSheetCard({ projectId }: { projectId: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useStudio((s) => s.updateProject);
  const settings = useStudio((s) => s.settings);
  const [picker, setPicker] = useState<Picker | undefined>();
  const [proposals, setProposals] = useState<Record<string, RowEdit> | undefined>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const script: any = project?.script.mode === 'long' ? project.script : undefined;

  const sheet = useMemo(() => {
    if (!script || !project) return undefined;
    const copied = new Set<string>((((project as any).stillMaster?.entries ?? []) as any[]).map((e) => e.key));
    return buildSheet(
      script.chapters,
      {
        still: (key) => Boolean((project.assets as any).stills?.[key]),
        clip: (key) => Boolean(project.assets.clips?.[key]),
      },
      copied,
    );
  }, [script, project]);

  if (!project || !script || !sheet || !sheet.rows.length) return null;

  const textOf = (key: string): string =>
    script.chapters.flatMap((c: any) => c.visuals ?? []).find((v: any) => v.key === key)?.text ?? '';

  const commit = (edits: Record<string, RowEdit>) => {
    if (!Object.keys(edits).length) return;
    updateProject(projectId, { script: { ...script, chapters: applyEdits(script.chapters, edits) } } as any);
  };

  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Could not do that', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = (key: string, field: Field) =>
    setPicker({
      key,
      field,
      options:
        field === 'setting'
          ? sheet.settings
          : field === 'cutaway'
            ? sheet.cutaways
            : [...new Set(Object.values(CAST).map((c) => c.name)), 'none'],
    });

  const cell = (value: string | undefined, blank: boolean, onPress: () => void, weight: '400' | '800' = '400') => (
    <Pressable onPress={onPress} style={{ paddingVertical: 2 }}>
      <Small style={{ color: blank ? colors.danger : colors.text, fontWeight: blank ? '800' : weight }}>
        {blank ? '⚠ blank' : value || '—'}
      </Small>
    </Pressable>
  );

  const fill = () =>
    void guard(async () => {
      const model = settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;
      const fallbackModel = settings.scriptProvider === 'anthropic' ? settings.geminiModel : settings.anthropicModel;
      const proposed: any[] = await fillSheetBlanks(
        { provider: settings.scriptProvider, model, fallbackModel } as any,
        fillBlanksPrompt(sheet, textOf),
      );
      const edits: Record<string, RowEdit> = {};
      for (const row of sheet.rows.filter((r) => r.blanks.length)) {
        const p = proposed.find((x) => x.key === row.key);
        if (!p) continue;
        const e: RowEdit = {};
        if (row.blanks.includes('setting') && p.setting?.trim()) e.setting = p.setting.trim();
        if (row.blanks.includes('cutaway') && p.cutaway?.trim()) e.cutaway = p.cutaway.trim();
        if (Object.keys(e).length) edits[row.key] = e;
      }
      if (!Object.keys(edits).length) {
        Alert.alert('Nothing proposed', 'The model gave no values for the blank cells. Try again.');
        return;
      }
      setProposals(edits);
    });

  const importFile = () =>
    void guard(async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const { edits, skipped } = parseSheetText(await new File(res.assets[0].uri).text(), sheet);
      commit(edits);
      const n = Object.keys(edits).length;
      Alert.alert(
        'Sheet imported',
        `${n} row${n === 1 ? '' : 's'} changed.${skipped.length ? `\n\nSkipped:\n${skipped.slice(0, 6).join('\n')}` : ''}`,
      );
    });

  const saveFile = () =>
    void guard(async () => {
      const file = new File(Paths.cache, `${project.slug}-fill-in-sheet.txt`);
      file.create({ overwrite: true });
      file.write(sheetText(sheet));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'The fill-in sheet' });
    });

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>Fill-in sheet (CR-81B)</H3>
        <Badge label={sheet.summary.toUpperCase()} tone={sheet.blanks ? 'danger' : 'ok'} />
      </Row>
      <Small>
        {sheet.rows.length} beats · {sheet.stills} stills · {sheet.clips} clips · {sheet.cards} cards drawn. The app fills
        what it can from the plan; tap a cell to change it. A changed cell rewrites only its own row's prompt.
      </Small>
      {sheet.problems.map((p) => (
        <Small key={p} style={{ color: colors.warn }}>
          • {p}
        </Small>
      ))}
      <Row style={{ gap: space.sm, flexWrap: 'wrap', marginTop: space.xs }}>
        <Button
          label={open ? 'Hide the sheet' : `Open the sheet (${sheet.rows.length})`}
          variant="secondary"
          onPress={() => setOpen(!open)}
        />
        {sheet.blanks ? <Button label="Fill blanks for me" disabled={busy} onPress={fill} /> : null}
        <Button label="Save sheet file" variant="secondary" disabled={busy} onPress={saveFile} />
        <Button label="Import sheet file" variant="secondary" disabled={busy} onPress={importFile} />
      </Row>
      {open
        ? sheet.rows.map((row) => (
            <Card key={row.key} style={{ marginTop: space.xs }}>
              <Small style={{ color: colors.text, fontWeight: '800' }}>
                #{row.beat} · {row.chapter} · {row.words} words / {row.seconds} s · {row.visual.toUpperCase()}{' '}
                {row.number} · {row.status}
              </Small>
              {row.visual !== 'card' ? (
                <>
                  <Small>Setting</Small>
                  {cell(row.setting, row.blanks.includes('setting'), () => openPicker(row.key, 'setting'))}
                  <Small>Cutaway</Small>
                  {cell(row.cutaway, row.blanks.includes('cutaway'), () => openPicker(row.key, 'cutaway'))}
                  <Small>Cast on screen</Small>
                  {cell(row.cast, false, () => openPicker(row.key, 'cast'))}
                  {row.chip ? <Small style={{ color: colors.warn }}>⚠ {row.chip}</Small> : null}
                </>
              ) : (
                <Small>Drawn by the app; no picture to make.</Small>
              )}
            </Card>
          ))
        : null}

      <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => setPicker(undefined)}>
        <Pressable
          style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: space.md }}
          onPress={() => setPicker(undefined)}
        >
          <Card>
            <H3>
              {picker?.field === 'setting' ? 'Setting' : picker?.field === 'cutaway' ? 'Cutaway object' : 'Cast on screen'}
            </H3>
            <ScrollView style={{ maxHeight: 360 }}>
              {picker?.options.map((o) => (
                <Pressable
                  key={o}
                  style={{ paddingVertical: space.sm }}
                  onPress={() => {
                    commit({ [picker.key]: { [picker.field]: o } });
                    setPicker(undefined);
                  }}
                >
                  <Small style={{ color: colors.text }}>{o}</Small>
                </Pressable>
              ))}
              {picker?.options.length ? null : (
                <Small>No values yet. Use "Fill blanks for me" or import a sheet file.</Small>
              )}
            </ScrollView>
          </Card>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(proposals)} animationType="slide" onRequestClose={() => setProposals(undefined)}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
        >
          <H3>Proposed values</H3>
          <Small>Nothing changes until you accept. Each line is a blank cell and the value proposed for it.</Small>
          {Object.entries(proposals ?? {}).map(([key, e]) => (
            <Small key={key} style={{ color: colors.text }}>
              {key}: {e.setting ? `setting → ${e.setting}` : ''}
              {e.setting && e.cutaway ? ' · ' : ''}
              {e.cutaway ? `cutaway → ${e.cutaway}` : ''}
            </Small>
          ))}
          <Row style={{ gap: space.sm }}>
            <Button
              label="Accept all"
              style={{ flex: 1 }}
              onPress={() => {
                commit(proposals ?? {});
                setProposals(undefined);
              }}
            />
            <Button label="Reject" variant="ghost" onPress={() => setProposals(undefined)} />
          </Row>
        </ScrollView>
      </Modal>
    </Card>
  );
}
