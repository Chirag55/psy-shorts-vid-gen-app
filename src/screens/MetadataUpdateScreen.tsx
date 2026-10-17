import React, { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Badge, Body, Button, Card, H2, H3, ProgressBar, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { normalizeUpdate } from '@/core/seoNormalizer';
import { parseMetadataFile, planUpdates, type MetadataFile, type PlannedUpdate, type RejectedUpdate } from '@/core/metadataUpdate';
import { applyUpdate, fetchLiveVideos, hasBackup, MetadataUpdateError, revertVideo } from '@/services/metadataUpdate';
import { signInAgain, youtubeAccessToken } from '@/services/youtubeAuth';
import { useMounted } from '@/util/useMounted';

type Busy = '' | 'reading' | 'applying';
type Result = { ok: boolean; message: string };

const studioUrl = (videoId: string) => `https://studio.youtube.com/video/${videoId}/edit`;

/**
 * Applies a metadata update file to live videos: every change is shown against
 * what YouTube has now, nothing is sent until confirmed, and each original is
 * backed up on the phone so it can be put back.
 */
export default function MetadataUpdateScreen() {
  const logMetadataChange = useStudio((s) => s.logMetadataChange);
  const mounted = useMounted();
  const [file, setFile] = useState<MetadataFile | null>(null);
  const [rejected, setRejected] = useState<RejectedUpdate[]>([]);
  const [plans, setPlans] = useState<PlannedUpdate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Busy>('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [reverting, setReverting] = useState('');

  const handleError = (e: unknown, title: string) => {
    if (e instanceof MetadataUpdateError && (e.kind === 'permissions' || e.kind === 'auth')) {
      Alert.alert(title, e.message, [
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
    Alert.alert(title, e instanceof Error ? e.message : String(e));
  };

  const importFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const text = await new File(picked.assets[0].uri).text();
    const parsed = parseMetadataFile(text);
    if (!parsed.file) {
      Alert.alert('Not an update file', parsed.error ?? 'The file could not be read.');
      return;
    }
    const parsedFile = parsed.file;
    setFile(parsedFile);
    setRejected(parsed.rejected);
    setResults({});
    setBusy('reading');
    try {
      const token = await youtubeAccessToken();
      const live = await fetchLiveVideos(
        token,
        parsedFile.updates.map((u) => u.videoId),
      );
      const snippets = Object.fromEntries(Object.entries(live).map(([id, v]) => [id, v.snippet]));
      const planned = planUpdates(parsedFile, snippets, normalizeUpdate);
      if (!mounted.current) return;
      setPlans(planned);
      setSelected(new Set(planned.filter((p) => !p.issues.length).map((p) => p.update.videoId)));
    } catch (e) {
      handleError(e, 'Could not read the videos');
    } finally {
      if (mounted.current) setBusy('');
    }
  };

  const applySelected = async () => {
    if (!file || busy) return;
    const chosen = plans.filter((p) => selected.has(p.update.videoId) && !p.issues.length);
    if (!chosen.length) return;
    setBusy('applying');
    setProgress(0);
    const done: Record<string, Result> = {};
    try {
      const token = await youtubeAccessToken();
      for (let i = 0; i < chosen.length; i++) {
        const update = chosen[i].update;
        try {
          const change = await applyUpdate(token, file.channelId, update);
          logMetadataChange({ videoId: update.videoId, at: new Date().toISOString(), kind: 'update', ...change });
          done[update.videoId] = {
            ok: true,
            message: change.oldTitle !== change.newTitle ? `Updated — was "${change.oldTitle}"` : 'Updated (title kept)',
          };
        } catch (e) {
          done[update.videoId] = { ok: false, message: e instanceof Error ? e.message : String(e) };
          if (e instanceof MetadataUpdateError && (e.kind === 'quota' || e.kind === 'permissions' || e.kind === 'auth')) {
            // The rest would fail the same way; say so rather than leave them blank.
            for (const rest of chosen.slice(i + 1)) {
              done[rest.update.videoId] = { ok: false, message: 'Not run — stopped after the error above.' };
            }
            if (mounted.current) {
              setResults({ ...done });
              setBusy('');
            }
            handleError(e, e.kind === 'quota' ? 'Quota used up' : 'Stopped');
            return;
          }
        }
        if (mounted.current) {
          setProgress((i + 1) / chosen.length);
          setResults({ ...done });
        }
      }
      if (mounted.current) setBusy('');
      const ok = Object.values(done).filter((r) => r.ok).length;
      Alert.alert(
        'Finished',
        `${ok} of ${chosen.length} updated.${ok ? ' Originals are backed up; each can be reverted below.' : ''}`,
      );
    } catch (e) {
      setBusy('');
      handleError(e, 'Not signed in');
    }
  };

  const revert = async (videoId: string) => {
    setReverting(videoId);
    try {
      const token = await youtubeAccessToken();
      const change = await revertVideo(token, videoId);
      logMetadataChange({ videoId, at: new Date().toISOString(), kind: 'revert', ...change });
      if (mounted.current) {
        setResults((r) => ({ ...r, [videoId]: { ok: true, message: `Reverted to "${change.newTitle}"` } }));
      }
    } catch (e) {
      handleError(e, 'Could not revert');
    } finally {
      if (mounted.current) setReverting('');
    }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const selectedCount = plans.filter((p) => !p.issues.length).filter((p) => selected.has(p.update.videoId)).length;
  const short = (s: string) => `${s.slice(0, 90)}${s.length > 90 ? '…' : ''}`;

  return (
    <Screen>
      <Card>
        <H2>Update video metadata</H2>
        <Small>
          Import a metadata update file (.json). You see every change against what is live on YouTube before anything is
          sent. Each video's original title, description and tags are backed up on this phone and can be put back.
        </Small>
        <Button
          label={busy === 'reading' ? 'Reading from YouTube…' : 'Import update file'}
          loading={busy === 'reading'}
          onPress={() => void importFile()}
        />
      </Card>

      {rejected.length ? (
        <Card>
          <H3>Skipped entries</H3>
          {rejected.map((r, i) => (
            <Small key={i} style={{ color: colors.danger }}>
              • {r.videoId ?? 'entry'}: {r.reason}
            </Small>
          ))}
        </Card>
      ) : null}

      {plans.length ? (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>Changes</H3>
              <Badge label={`${selectedCount} of ${plans.length} selected`} tone={selectedCount ? 'ok' : 'neutral'} />
            </Row>
            <Small>
              Uses about {selectedCount * 51 + 1} of YouTube's 10,000 daily API units. Title changes only where the file
              gives a new title.
            </Small>
            <Button
              label={busy === 'applying' ? 'Applying…' : `Apply selected (${selectedCount})`}
              loading={busy === 'applying'}
              disabled={!selectedCount || Boolean(busy)}
              onPress={() =>
                Alert.alert(
                  'Apply to YouTube?',
                  `${selectedCount} live video${selectedCount === 1 ? '' : 's'} will be changed. Originals are backed up first.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Apply', onPress: () => void applySelected() },
                  ],
                )
              }
            />
            {busy === 'applying' ? <ProgressBar fraction={progress} /> : null}
          </Card>

          {plans.map((p) => {
            const id = p.update.videoId;
            const blocked = p.issues.length > 0;
            const checked = selected.has(id) && !blocked;
            const result = results[id];
            const open = expanded.has(id);
            const cur = p.current;
            return (
              <Card key={id}>
                <Pressable
                  onPress={() => {
                    if (blocked || busy) return;
                    setSelected((s) => toggle(s, id));
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: radius.sm,
                      borderWidth: 2,
                      borderColor: blocked ? colors.border : colors.accent,
                      backgroundColor: checked ? colors.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked ? <Small style={{ color: colors.bg, fontWeight: '900' }}>✓</Small> : null}
                  </View>
                  <Body style={{ flex: 1, fontWeight: '800' }}>{cur?.title ?? id}</Body>
                </Pressable>
                <Small>{id}</Small>
                {p.issues.map((issue) => (
                  <Small key={issue} style={{ color: colors.warn }}>
                    • {issue}
                  </Small>
                ))}
                {cur ? (
                  <>
                    <Small style={{ fontWeight: '800', marginTop: space.xs }}>TITLE</Small>
                    {p.update.title !== null && p.changes.title ? (
                      <>
                        <Small style={{ color: colors.textDim, textDecorationLine: 'line-through' }}>{cur.title}</Small>
                        <Small style={{ color: colors.ok }}>{p.update.title}</Small>
                      </>
                    ) : (
                      <Small>Kept: {cur.title}</Small>
                    )}
                    <Small style={{ fontWeight: '800', marginTop: space.xs }}>DESCRIPTION</Small>
                    <Small style={{ color: colors.textDim }}>
                      Now: {open ? cur.description || '(empty)' : short(cur.description || '(empty)')}
                    </Small>
                    <Small style={{ color: colors.ok }}>
                      New: {open ? p.update.description : short(p.update.description)}
                    </Small>
                    <Small style={{ fontWeight: '800', marginTop: space.xs }}>TAGS</Small>
                    <Small style={{ color: colors.textDim }}>Now: {(cur.tags ?? []).join(', ') || '(none)'}</Small>
                    <Small style={{ color: colors.ok }}>New: {p.update.tags.join(', ')}</Small>
                    <Button
                      label={open ? 'Show less' : 'Show full descriptions'}
                      variant="ghost"
                      onPress={() => setExpanded((s) => toggle(s, id))}
                    />
                  </>
                ) : null}
                {result ? (
                  <Small style={{ color: result.ok ? colors.ok : colors.danger, fontWeight: '700' }}>
                    {result.ok ? '✅' : '❌'} {result.message}
                  </Small>
                ) : null}
                {hasBackup(id) ? (
                  <Button
                    label={reverting === id ? 'Reverting…' : 'Revert to the original'}
                    variant="ghost"
                    loading={reverting === id}
                    disabled={Boolean(busy) || Boolean(reverting)}
                    onPress={() =>
                      Alert.alert(
                        'Revert this video?',
                        'Its title, description and tags go back to how they were before the app first changed them.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Revert', style: 'destructive', onPress: () => void revert(id) },
                        ],
                      )
                    }
                  />
                ) : null}
              </Card>
            );
          })}

          <Card>
            <H3>Do these by hand in YouTube Studio</H3>
            <Small>
              The YouTube API can't set a Short's related video or pin a comment. Copy each one, open the video in
              Studio, and set it there.
            </Small>
          </Card>
          {plans
            .filter((p) => p.update.manual?.relatedVideo || p.update.manual?.pinnedComment)
            .map((p) => {
              const id = p.update.videoId;
              const manual = p.update.manual ?? {};
              return (
                <Card key={`manual-${id}`}>
                  <Body style={{ fontWeight: '800' }}>{p.update.title ?? p.current?.title ?? id}</Body>
                  {manual.relatedVideo ? (
                    <>
                      <Small>Related video: {manual.relatedVideo}</Small>
                      <Button
                        label="Copy related video link"
                        variant="ghost"
                        onPress={() => void Clipboard.setStringAsync(manual.relatedVideo!)}
                      />
                    </>
                  ) : null}
                  {manual.pinnedComment ? (
                    <>
                      <Small>Pinned comment: {manual.pinnedComment}</Small>
                      <Button
                        label="Copy comment"
                        variant="ghost"
                        onPress={() => void Clipboard.setStringAsync(manual.pinnedComment!)}
                      />
                    </>
                  ) : null}
                  <Button
                    label="Open in YouTube Studio"
                    variant="secondary"
                    onPress={() => void Linking.openURL(studioUrl(id))}
                  />
                </Card>
              );
            })}
        </>
      ) : null}
    </Screen>
  );
}
