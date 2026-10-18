import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Badge, Button, Card, H3, Row, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { matchByTime, matchDownload, picksFor, prefixOfId, type DownloadMatch, type PickedFile } from '@/core/stillMaster';
import {
  applyPicks,
  copyMasterPrompt,
  copyOnePrompt,
  importOne,
  masterFor,
  pickDownload,
  saveMasterFiles,
  type MasterGroup,
} from '@/services/masterStills';

/** Numbered prompts to make in Flow, and the files that come back placed by their numbers. */
export default function MasterStillsCard({ projectId }: { projectId: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const flow = useStudio((s) => s.channelConfig.flow);
  const master = useMemo(() => (project ? masterFor(projectId) : null), [project, projectId, flow]);
  if (!project || !master) return null;

  const toMake = master.groups.reduce((n, g) => n + g.manifest.length, 0);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>{project.script.mode === 'short' ? 'Numbered prompts for this Short (CR-81C)' : 'One master prompt (CR-81C)'}</H3>
        <Badge label={`${toMake} TO MAKE`} tone="info" />
      </Row>
      <Small>
        {master.cost} Copy one prompt, make it in Flow, then add the result beside it. Or add them all at once: a file named
        with its id (MF044-S1…) goes in its place, and you check the match first. Paste one prompt per Flow box.
      </Small>
      {master.groups.map((g) => (
        <Group key={g.prefix} projectId={projectId} g={g} />
      ))}
    </Card>
  );
}

function Group({ projectId, g }: { projectId: string; g: MasterGroup }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState<DownloadMatch<PickedFile> | undefined>();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | undefined>();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!project) return null;

  const isClip = g.kind === 'clip';
  const rows = g.manifest.map((m, i) => ({ id: m.id, prompt: g.lines[i].replace(/^\S+ \| /, '') }));

  const run = (files: PickedFile[], byTime = false) => {
    setPicked(files);
    setOverrides({});
    setSelected(undefined);
    setChecked(false);
    setMatch(byTime ? matchByTime(files, rows) : matchDownload(files, rows, g.prefix));
    setOpen(true);
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

  const sm: any = (project as any).stillMaster;
  // Exported prompts that no longer match the script would number the files wrongly.
  const stale = Boolean(
    sm?.entries.some(
      (e: any) => prefixOfId(e.id) === g.prefix && !g.manifest.some((m) => m.id === e.id && m.hash === e.hash),
    ),
  );
  const picks = match ? picksFor(match, g.manifest, overrides) : {};

  const current = (id: string) => overrides[id] ?? match?.variants[id]?.[0]?.name;
  const swapWith = (a: string, b: string) => {
    if (!match || a === b) return;
    setOverrides({ ...overrides, [b]: current(a) as string, [a]: current(b) as string });
    setChecked(false);
  };

  const mapped = Object.keys(sm?.mapped ?? {}).filter((id) => prefixOfId(id) === g.prefix).length;
  const assets: any = project.assets;

  return (
    <View style={{ marginTop: space.sm }}>
      <Small style={{ color: colors.text, fontWeight: '800' }}>
        {g.label} · {g.manifest.length} · {g.manifest[0].id} to {g.manifest[g.manifest.length - 1].id}
      </Small>
      {stale ? (
        <Small style={{ color: colors.warn }}>
          The prompts changed since the last export. Export again before importing, or the numbers may not match.
        </Small>
      ) : null}
      <Row style={{ gap: space.sm, marginTop: space.xs, flexWrap: 'wrap' }}>
        <Button
          label="Copy all"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void guard(async () => {
              await copyMasterPrompt(projectId, g);
              Alert.alert(
                'Copied',
                `${g.manifest.length} prompts, one per line, are on the clipboard. Flow's own box needs them one at a time: use the Copy buttons below.`,
              );
            })
          }
        />
        <Button
          label="Save as .txt"
          variant="secondary"
          disabled={busy}
          onPress={() => void guard(() => saveMasterFiles(projectId, g))}
        />
        <Button
          label={isClip ? 'Add all clips at once' : 'Add all stills at once'}
          disabled={busy}
          onPress={() =>
            void guard(async () => {
              const files = await pickDownload(g.kind);
              if (files.length) run(files);
            })
          }
        />
      </Row>
      {g.manifest.map((m: any, i) => {
        const have: string | undefined = isClip ? assets.clips[m.key] : assets.stills?.[m.key];
        return (
          <Row key={m.id} style={{ gap: space.sm, marginTop: space.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Small style={{ color: colors.text, fontWeight: '800' }}>
                {m.id}
                {m.label ? ` · ${m.label}` : ''}
              </Small>
              <Small>
                {g.lines[i]
                  .replace(/^\S+ \| /, '')
                  .replace(/^(One single image[^.]*\.|Camera: [^.]*\.)\s*/, '')
                  .slice(0, 90)}
                …
              </Small>
              <Button
                label={`Copy ${m.id}`}
                variant="secondary"
                disabled={busy}
                onPress={() => void guard(() => copyOnePrompt(projectId, g, i))}
              />
            </View>
            <View style={{ width: 84, alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 84,
                  aspectRatio: 0.5625,
                  borderRadius: 6,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {have && !isClip ? (
                  <Image source={{ uri: have }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Small style={{ color: have ? colors.ok : colors.textFaint, textAlign: 'center' }}>
                    {have ? 'Clip ✓' : isClip ? 'No clip' : 'No picture'}
                  </Small>
                )}
              </View>
              <Button
                label={have ? 'Replace' : 'Add'}
                variant="ghost"
                disabled={busy}
                onPress={() => void guard(() => importOne(projectId, g, i))}
              />
            </View>
          </Row>
        );
      })}
      {mapped ? <Small>{mapped} of {g.manifest.length} numbers have a file from the last import.</Small> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
        >
          <H3>Check the match · {g.label}</H3>
          {match ? (
            <>
              <Small>
                {Object.keys(match.variants).length} of {g.manifest.length} numbers matched. Amber means a guess from file
                order. Tap a tile, then another, to swap them; tap a number with several variants to switch to the next
                one.
              </Small>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {g.manifest.map((m) => {
                  const variants = match.variants[m.id] ?? [];
                  const file = variants.find((v) => v.name === overrides[m.id]) ?? variants[0];
                  const info = file ? match.matches.find((x) => x.file.name === file.name) : undefined;
                  const uri = file ? picked.find((p) => p.name === file.name)?.uri : undefined;
                  return (
                    <Pressable
                      key={m.id}
                      style={{
                        width: '31%',
                        borderWidth: selected === m.id ? 2 : 0,
                        borderColor: colors.accent,
                        borderRadius: radius.sm,
                      }}
                      onPress={() => {
                        if (selected && selected !== m.id) {
                          swapWith(selected, m.id);
                          setSelected(undefined);
                          return;
                        }
                        if (variants.length > 1 && selected === m.id) {
                          const at = variants.findIndex((v) => v.name === file?.name);
                          const next = variants[(at + 1) % variants.length];
                          setOverrides({ ...overrides, [m.id]: next.name });
                          setSelected(undefined);
                          return;
                        }
                        setSelected(m.id);
                      }}
                    >
                      {file && !isClip ? (
                        <Image
                          source={{ uri }}
                          style={{
                            width: '100%',
                            aspectRatio: project.script.mode === 'short' ? 0.5625 : 1.7777777777777777,
                            borderRadius: 6,
                            backgroundColor: colors.surfaceAlt,
                          }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: '100%',
                            aspectRatio: isClip ? 0.5625 : 1.7777777777777777,
                            borderRadius: 6,
                            backgroundColor: colors.surfaceAlt,
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 4,
                          }}
                        >
                          <Small style={{ color: file ? colors.text : colors.danger }}>{file ? file.name : 'missing'}</Small>
                        </View>
                      )}
                      <Small style={{ color: info?.confidence === 'amber' ? colors.warn : colors.text, fontWeight: '800' }}>
                        {m.id}
                        {info ? ` · ${info.method}` : ''}
                        {variants.length > 1 ? ` · ${variants.length} variants` : ''}
                      </Small>
                    </Pressable>
                  );
                })}
              </View>
              {match.missing.length ? (
                <>
                  <Small style={{ color: colors.danger }}>
                    Missing: {match.missing.join(', ')}.
                    {isClip
                      ? ' The shot falls back to its still or the one before until it is made.'
                      : ' Each is covered by the picture before it until you make it.'}
                  </Small>
                  <Button
                    label="Copy a prompt file for the missing ones"
                    variant="secondary"
                    onPress={() =>
                      void guard(async () => {
                        await Clipboard.setStringAsync(
                          `${g.lines.filter((l) => match.missing.some((id) => l.startsWith(`${id} |`))).join('\n')}\n`,
                        );
                        Alert.alert('Copied', `${match.missing.length} prompts.`);
                      })
                    }
                  />
                </>
              ) : null}
              {match.unmatched.length ? (
                <Small style={{ color: colors.warn }}>
                  Not matched, left out: {match.unmatched.map((f) => f.name).join(', ')}
                </Small>
              ) : null}
              {match.small.length ? (
                <Small style={{ color: colors.warn }}>
                  Under 1080 px on the short side: {match.small.map((f) => f.name).join(', ')}
                </Small>
              ) : null}
              {match.matches.some((x) => x.method === 'order') ||
              (match.unmatched.length && match.unmatched.length === picked.length) ? (
                <Button label="Match by file time instead" variant="secondary" onPress={() => run(picked, true)} />
              ) : null}
              <Pressable onPress={() => setChecked(!checked)} style={{ paddingVertical: space.sm }}>
                <Small style={{ color: colors.text, fontWeight: '800' }}>
                  {checked ? '☑' : '☐'} I have checked every {isClip ? 'clip' : 'picture'} against its number
                </Small>
              </Pressable>
              <Row style={{ gap: space.sm }}>
                <Button
                  label={`Apply ${Object.keys(picks).length}`}
                  disabled={!checked || !Object.keys(picks).length}
                  onPress={() =>
                    void guard(async () => {
                      const n = await applyPicks(projectId, picks, picked, g.kind);
                      setOpen(false);
                      Alert.alert(isClip ? 'Clips imported' : 'Stills imported', `${n} placed by number.`);
                    })
                  }
                  style={{ flex: 1 }}
                />
                <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
              </Row>
            </>
          ) : null}
        </ScrollView>
      </Modal>
    </View>
  );
}
