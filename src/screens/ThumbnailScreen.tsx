import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ensureHootPack } from '@/services/hootPack';
import { saveToGallery } from '@/services/gallery';
import { Badge, Button, Card, Empty, Field, H2, H3, Row, Screen, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { sampleThumbnailFrames } from '@/services/assembler';
import { renderThumbnail, THUMB_H, THUMB_W } from '@/services/thumbnailRenderer';
import { renderThumbnailV2 } from '@/services/thumbnailV2';
import { renderViralThumbnail } from '@/services/thumbnailViral';
import { generateStill } from '@/services/imagen';
import { viralBadge, viralThumbnailPrompt, type ViralInfo } from '@/core/viralBatch';
import * as Clipboard from 'expo-clipboard';
import { fullBleedFontSize, PREVIEW_WIDTH, thumbnailLegibility, thumbnailVariants } from '@/core/thumbnailLayout';
import { importInto } from '@/services/workspace';
import { useMounted } from '@/util/useMounted';
import { ensureFreshToken, setThumbnail } from '@/services/youtube';
import { getKey, setKey } from '@/services/keys';
import { textWords } from '@/core/bankV2';
import type { ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

/**
 * Thumbnail studio. A sampled frame is drawn into the 1280x720 card by the
 * renderer (the same Skia text the captions use), so the preview is the file.
 */
export default function ThumbnailScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Thumbnail'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const patchAssets = useStudio((s) => s.patchAssets);

  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [sampling, setSampling] = useState(false);
  const [sampled, setSampled] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [badge, setBadge] = useState('PSYCHOLOGY FACT');

  const longBank: any = project?.mode === 'long' ? (project.script as any).bankV2 : undefined;
  const shortBank: any = project?.mode === 'short' ? (project.script as any).bankV2 : undefined;
  const headline: string =
    longBank?.thumbnailText ??
    shortBank?.hookText ??
    (project?.mode !== 'short' ? (project?.script.title ?? '') : (project.script as ShortScript).hookLine);
  const defaultLines = splitHeadline(headline);
  const [line1, setLine1] = useState(defaultLines[0]);
  const [line2, setLine2] = useState(defaultLines[1]);

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const isShort = project.mode === 'short';
  const aspect = isShort ? 9 / 16 : 16 / 9;

  const sample = async () => {
    if (!project.assets.finalVideo) {
      Alert.alert('Render first', 'Assemble the video before sampling candidate frames.');
      return;
    }
    setSampling(true);
    try {
      const frames = await sampleThumbnailFrames(project.assets.finalVideo, project.slug);
      setCandidates(frames);
      setSelected(0);
      setSampled(true);
    } catch (e) {
      setSampled(true);
      setCandidates([]);
      Alert.alert('Sampling failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSampling(false);
    }
  };

  const draw = async () => {
    const frame = candidates[selected];
    if (!frame) {
      Alert.alert('Pick a frame', 'Sample candidate frames and choose one first.');
      return;
    }
    setDrawing(true);
    try {
      const input: Parameters<typeof renderThumbnail>[0] = {
        frameUri: frame,
        line1,
        line2,
        badge: badge.trim() || undefined,
        layout: isShort ? 'short' : 'long',
      } as any;
      const pack = await ensureHootPack();
      input.mascotUri = pack.idle;
      input.slug = project.slug;
      const uri = await renderThumbnail(input);
      // The file name never changes, so bust the image cache on every redraw.
      setPreview(`${uri}?v=${Date.now()}`);
      patchAssets(project.id, { thumbnail: uri });
    } catch (e) {
      Alert.alert('Could not draw the thumbnail', e instanceof Error ? e.message : String(e));
    } finally {
      setDrawing(false);
    }
  };

  const save = async () => {
    if (!preview) {
      Alert.alert('Draw it first', 'Render the thumbnail before saving it to your gallery.');
      return;
    }
    setSaving(true);
    try {
      const where = await saveToGallery(preview.split('?')[0]);
      Alert.alert(
        'Saved',
        where === 'gallery' ? 'Thumbnail saved to the workspace and your gallery.' : 'Thumbnail saved to the project workspace.'
      );
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const sendToYouTube = async () => {
    const videoId = project.assets.youtubeVideoId;
    const thumbnail = project.assets.thumbnail;
    if (!videoId || !thumbnail) return;
    setSending(true);
    try {
      const [raw, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
      if (!raw || !clientId) throw new Error('Sign in to YouTube on the Publish screen first.');
      const tokens = await ensureFreshToken(clientId, JSON.parse(raw));
      await setKey('youtubeTokens', JSON.stringify(tokens));
      await setThumbnail(tokens.accessToken, videoId, thumbnail);
      Alert.alert('Thumbnail set', 'YouTube now uses this thumbnail. It can take a few minutes to show everywhere.');
    } catch (e) {
      Alert.alert('Thumbnail not set', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const wordCount = longBank ? textWords(`${line1} ${line2}`).length : 0;

  return (
    <Screen>
      {longBank ? <TestAndCompare projectId={project.id} /> : null}
      {shortBank?.viral ? <ViralThumbnail projectId={project.id} /> : null}

      <Card>
        <H2>Thumbnail studio</H2>
        <Small>
          {isShort
            ? "The channel's 16:9 card: the frame blurred behind, sharp down the middle, a yellow first line over a white second, and Hoot breaking the panel at the bottom."
            : 'The deep-dive card: the frame filling the whole thumbnail, a large yellow first line over a white second on the left, and Hoot in the bottom-right corner.'}
        </Small>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Candidate frames</H3>
          <Badge label={`${candidates.length} sampled`} tone={candidates.length ? 'ok' : 'neutral'} />
        </Row>
        {project.assets.finalVideo ? null : (
          <Small style={{ color: colors.warn }}>
            No rendered video for this project yet — assemble it first and the frames come from that.
          </Small>
        )}
        <Button
          label={sampling ? 'Sampling…' : 'Sample 5 frames from the video'}
          variant="secondary"
          loading={sampling}
          disabled={!project.assets.finalVideo}
          onPress={sample}
        />
        {!sampling && sampled && !candidates.length ? (
          <Small style={{ color: colors.warn }}>No frames could be read from that video. Re-render it and try again.</Small>
        ) : null}
        {candidates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }}>
            <Row>
              {candidates.map((uri, i) => (
                <Pressable key={uri} onPress={() => setSelected(i)}>
                  <Image
                    source={{ uri }}
                    style={[s.candidate, { aspectRatio: aspect }, selected === i && s.candidateActive]}
                  />
                </Pressable>
              ))}
            </Row>
          </ScrollView>
        ) : null}
      </Card>

      <Card>
        <H3>Preview</H3>
        {preview ? (
          <Image source={{ uri: preview }} style={[s.canvas, { aspectRatio: THUMB_W / THUMB_H }]} />
        ) : (
          <View style={[s.canvas, { aspectRatio: THUMB_W / THUMB_H, alignItems: 'center', justifyContent: 'center' }]}>
            <Small>Pick a frame, then draw the thumbnail.</Small>
          </View>
        )}
        <Button label={drawing ? 'Drawing…' : 'Draw thumbnail'} variant="secondary" loading={drawing} onPress={draw} />
      </Card>

      <Card>
        <Field label="Line 1 (yellow)" value={line1} onChangeText={setLine1} autoCapitalize="characters" />
        <Field label="Line 2 (white)" value={line2} onChangeText={setLine2} autoCapitalize="characters" />
        {longBank && wordCount > 4 ? (
          <Small style={{ color: colors.warn }}>
            {wordCount} words: a long-form thumbnail carries 4 at most, with Hoot (CR-51).
          </Small>
        ) : null}
        <Field label="Badge" value={badge} onChangeText={setBadge} autoCapitalize="characters" />
        <Button label={saving ? 'Saving…' : 'Save thumbnail'} loading={saving} onPress={save} />
      </Card>

      {project.assets.youtubeVideoId ? (
        <Card>
          <H3>Already on YouTube</H3>
          <Small>
            {project.assets.thumbnail
              ? 'This video is uploaded. Put the thumbnail you drew on it — you can redraw and send it again any time.'
              : 'This video is uploaded. Draw a thumbnail above, then send it to the video from here.'}
          </Small>
          <Button
            label={sending ? 'Sending…' : 'Set as the YouTube thumbnail'}
            loading={sending}
            disabled={!project.assets.thumbnail}
            onPress={sendToYouTube}
          />
        </Card>
      ) : (
        <Small>Publishing the video sends this thumbnail with it.</Small>
      )}
    </Screen>
  );
}

/**
 * An A9 viral Short's thumbnail: 9:16 artwork made from the bank's thumbnail
 * prompt (generated here or imported), with the thumb text drawn top-centre.
 */
function ViralThumbnail({ projectId }: { projectId: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const patchAssets = useStudio((s) => s.patchAssets);
  const viral: ViralInfo | undefined = (project?.script as any)?.bankV2?.viral;
  const [text, setText] = useState(viral?.thumbText ?? '');
  const [busy, setBusy] = useState<'generate' | 'draw' | null>(null);
  const [version, setVersion] = useState(0);
  const mounted = useMounted();

  if (!project || !viral) return null;
  const assets: any = project.assets;
  const art: string | undefined = assets.thumbnailArt?.viral;
  const drawn: string | undefined = assets.thumbnailViral;
  const prompt = viralThumbnailPrompt(viral);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  const setArt = (uri: string) => patchAssets(project.id, { thumbnailArt: { ...(assets.thumbnailArt ?? {}), viral: uri } } as any);

  const generate = async () => {
    setBusy('generate');
    try {
      const apiKey = await getKey('gemini');
      if (!apiKey) throw new Error('Imagen uses the Gemini key. Add it in Settings, or import the artwork.');
      const uri = await generateStill({
        apiKey,
        prompt,
        slug: project.slug,
        key: 'thumb_viral',
        model: useStudio.getState().settings.imageModel,
        aspectRatio: '9:16',
      });
      setArt(uri);
      if (mounted.current) setVersion(Date.now());
    } catch (e) {
      Alert.alert('Artwork not generated', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const importArt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import the thumbnail art.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.length) return;
    try {
      const asset = result.assets[0];
      const ext = (asset.fileName?.split('.').pop() ?? 'png').toLowerCase().replace('jpeg', 'jpg');
      setArt(await importInto('thumbnails', project.slug, asset.uri, `art_viral.${ext}`));
      if (asset.width && asset.height && Math.abs(asset.width / asset.height - 9 / 16) > 0.03) {
        Alert.alert(
          'Check the shape',
          `The art is ${asset.width}x${asset.height}, not 9:16. It is cropped to fill; generate it in portrait 9:16 for the whole picture.`
        );
      }
      if (mounted.current) setVersion(Date.now());
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const draw = async () => {
    if (!art) return;
    setBusy('draw');
    try {
      const uri = await renderViralThumbnail({ slug: project.slug, artUri: art, text });
      patchAssets(project.id, { thumbnail: uri, thumbnailViral: uri } as any);
      if (mounted.current) setVersion(Date.now());
    } catch (e) {
      Alert.alert('Could not draw the thumbnail', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>Viral thumbnail</H3>
        <Badge label={viralBadge(viral)} tone="warn" />
      </Row>
      <Small>
        9:16 artwork from the bank's thumbnail prompt, with the thumb text top-centre in bold white with a black stroke
        (3 words at most). Publishing sends this thumbnail with the Short.
      </Small>
      {prompt ? (
        <>
          <Small style={{ color: colors.textFaint }}>
            {prompt}
          </Small>
          <Button label="Copy the prompt" variant="secondary" onPress={() => void Clipboard.setStringAsync(prompt)} />
        </>
      ) : (
        <Small style={{ color: colors.warn }}>This Short has no thumb_visual, so there is no prompt.</Small>
      )}
      <Row>
        <Button
          label={busy === 'generate' ? 'Generating…' : 'Generate artwork'}
          variant="secondary"
          loading={busy === 'generate'}
          disabled={!prompt || busy !== null}
          onPress={generate}
        />
        <Button label="Import artwork" variant="secondary" disabled={busy !== null} onPress={importArt} />
      </Row>
      {art ? <Image source={{ uri: `${art}?v=${version}` }} style={[s.canvas, { aspectRatio: 9 / 16, width: '50%' }]} /> : null}
      <Field label="Thumb text" value={text} onChangeText={setText} autoCapitalize="characters" />
      {words > 3 ? <Small style={{ color: colors.warn }}>{words} words: the viral thumbnail carries 3 at most.</Small> : null}
      <Button
        label={busy === 'draw' ? 'Drawing…' : 'Draw viral thumbnail'}
        loading={busy === 'draw'}
        disabled={!art || !text.trim() || busy !== null}
        onPress={draw}
      />
      {drawn ? (
        <>
          <Image source={{ uri: `${drawn}?v=${version}` }} style={[s.canvas, { aspectRatio: 9 / 16, width: '60%' }]} />
          <Button label="Save to gallery" variant="secondary" onPress={() => void saveToGallery(drawn)} />
        </>
      ) : null}
    </Card>
  );
}

/**
 * A banked long-form's A/B/C thumbnails for YouTube's Test & Compare: each is
 * drawn from imported art (or the older Hoot template), and one is picked to
 * upload with the video.
 */
function TestAndCompare({ projectId }: { projectId: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const patchAssets = useStudio((s) => s.patchAssets);
  const [busy, setBusy] = useState<'draw' | 'save' | null>(null);
  const [version, setVersion] = useState(0);
  const mounted = useMounted();

  if (!project || project.mode !== 'long') return null;
  const bank = (project.script as any).bankV2;
  if (!bank) return null;

  const variants = thumbnailVariants(bank);
  const assets: any = project.assets;
  const drawn: Record<string, string> = assets.thumbnailsV2 ?? {};
  const props: Record<string, string> = assets.thumbnailProps ?? {};
  const art: Record<string, string> = assets.thumbnailArt ?? {};

  const drawAll = async () => {
    setBusy('draw');
    try {
      const out: Record<string, string> = {};
      for (const v of variants) {
        out[v.variant] = await renderThumbnailV2({
          slug: project.slug,
          variant: v,
          propUri: props[v.variant],
          artUri: art[v.variant],
        });
      }
      const first = out[variants[0].variant];
      patchAssets(project.id, {
        thumbnailsV2: out,
        ...(first && !project.assets.thumbnail ? { thumbnail: first } : {}),
      } as any);
      if (mounted.current) setVersion(Date.now());
    } catch (e) {
      Alert.alert('Could not draw the thumbnails', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const importArt = async (variant: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import the thumbnail art.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.length) return;
    try {
      const asset = result.assets[0];
      const ext = (asset.fileName?.split('.').pop() ?? 'png').toLowerCase().replace('jpeg', 'jpg');
      const uri = await importInto('thumbnails', project.slug, asset.uri, `art_${variant}.${ext}`);
      patchAssets(project.id, { thumbnailArt: { ...art, [variant]: uri } } as any);
      if (asset.width && asset.height && Math.abs(asset.width / asset.height - 16 / 9) > 0.03) {
        Alert.alert(
          'Check the shape',
          `The art is ${asset.width}x${asset.height}, not 16:9. It is cropped to fill; generate it in landscape 16:9 for the whole picture.`
        );
      }
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const importProp = async (variant: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import the prop picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.length) return;
    try {
      const asset = result.assets[0];
      const ext = (asset.fileName?.split('.').pop() ?? 'png').toLowerCase().replace('jpeg', 'jpg');
      const uri = await importInto('thumbnails', project.slug, asset.uri, `prop_${variant}.${ext}`);
      patchAssets(project.id, { thumbnailProps: { ...props, [variant]: uri } } as any);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const saveAll = async () => {
    setBusy('save');
    try {
      let saved = 0;
      for (const uri of Object.values(drawn)) {
        if (!uri) continue;
        if ((await saveToGallery(uri)) === 'gallery') saved++;
      }
      Alert.alert(
        'Saved',
        saved ? `${saved} thumbnails saved to your gallery for Test & Compare in Studio.` : 'Saved to the project workspace.'
      );
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <Card>
      <H2>Test & Compare thumbnails</H2>
      <Small>
        CR-88G: import each variant's art (the 16:9 picture made from thumbnail_prompts.txt, LF03-T1 and LF03-T2) and it
        is drawn full-bleed and sharp, with the 2 to 4 word text outlined in the lower left: no Hoot, no badge, no blur
        or darkening. Without art, the older template (Hoot on white or black) is drawn. Upload the variants in Studio →
        Test & Compare.
      </Small>
      <Button
        label={busy === 'draw' ? 'Drawing…' : `Draw all ${variants.length}`}
        loading={busy === 'draw'}
        variant="secondary"
        onPress={() => void drawAll()}
      />

      {variants.map((v) => {
        const words = v.words.map((w) => w.word.toUpperCase());
        const lines = words.length > 2
          ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
          : [words.join(' ')];
        const size = fullBleedFontSize(lines, (text, px) => text.length * px * 0.5);
        const legibility = thumbnailLegibility(words.length, art[v.variant] ? size : 100);

        return (
          <View key={v.variant} style={{ marginTop: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>
                {v.variant} · {art[v.variant] ? 'full-bleed art' : `${v.background} · Hoot ${v.pose}`}
              </H3>
              {project.assets.thumbnail && project.assets.thumbnail === drawn[v.variant] ? (
                <Badge label="UPLOADS WITH VIDEO" tone="ok" />
              ) : null}
            </Row>
            <Small>
              {v.text.replace(/\*/g, '')}
              {v.concept ? ` — ${v.concept}` : ''}
            </Small>
            {drawn[v.variant] ? (
              <Pressable onPress={() => patchAssets(project.id, { thumbnail: drawn[v.variant] })}>
                <Image
                  source={{ uri: `${drawn[v.variant]}?v=${version}` }}
                  style={[s.canvas, { aspectRatio: THUMB_W / THUMB_H }]}
                />
              </Pressable>
            ) : null}
            {drawn[v.variant] ? (
              <Row style={{ gap: space.sm, alignItems: 'center', marginTop: space.xs }}>
                <Image
                  source={{ uri: `${drawn[v.variant]}?v=${version}` }}
                  style={{
                    width: PREVIEW_WIDTH,
                    height: Math.round((PREVIEW_WIDTH * THUMB_H) / THUMB_W),
                    borderRadius: 4,
                  }}
                />
                <Small style={{ flex: 1, color: legibility.ok ? colors.textDim : colors.danger }}>
                  {legibility.message} (estimate)
                </Small>
              </Row>
            ) : null}
            <Row style={{ gap: space.xs }}>
              <Button
                label={art[v.variant] ? 'Replace art' : 'Import art (16:9)'}
                variant="ghost"
                onPress={() => void importArt(v.variant)}
              />
              {art[v.variant] ? (
                <Button
                  label="Remove art"
                  variant="ghost"
                  onPress={() => patchAssets(project.id, { thumbnailArt: { ...art, [v.variant]: undefined } } as any)}
                />
              ) : null}
            </Row>
            <Row style={{ gap: space.xs }}>
              <Button
                label={props[v.variant] ? 'Replace prop' : 'Import a prop'}
                variant="ghost"
                onPress={() => void importProp(v.variant)}
              />
              {props[v.variant] ? (
                <Button
                  label="Remove prop"
                  variant="ghost"
                  onPress={() => patchAssets(project.id, { thumbnailProps: { ...props, [v.variant]: undefined } } as any)}
                />
              ) : null}
            </Row>
          </View>
        );
      })}

      <Small>
        A prop is optional: make it in the Gemini app from the concept, square, on a plain{' '}
        {variants.some((v) => v.background === 'black') ? 'white (or transparent, for black)' : 'white'} background, and
        it is drawn behind Hoot. Tap a thumbnail to send that one with the upload.
      </Small>
      {Object.keys(drawn).length ? (
        <Button
          label={busy === 'save' ? 'Saving…' : 'Save all to the gallery'}
          loading={busy === 'save'}
          onPress={() => void saveAll()}
        />
      ) : null}
    </Card>
  );
}

/** Splits a headline near its midpoint on a word boundary for the two-line formula. */
function splitHeadline(text: string): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text.trim(), ''];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

const s = StyleSheet.create({
  candidate: {
    width: 150,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  candidateActive: { borderColor: colors.accent },
  canvas: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
});
