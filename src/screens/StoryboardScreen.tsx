import React, { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import StillQueueCard from '@/components/StillQueueCard';
import MasterStillsCard from '@/components/MasterStillsCard';
import FillSheetCard from '@/components/FillSheetCard';
import { Badge, Body, Card, Divider, Empty, H2, H3, Row, Screen, Small } from '@/components/ui';
import { PromptCard } from '@/components/PromptCard';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { importInto } from '@/services/workspace';
import { generateStill } from '@/services/imagen';
import { getKey } from '@/services/keys';
import { characterReferencePrompt, finalisePrompt } from '@/core/styleLock';
import { auditShots, clipKeyFor, flattenShots, type Shot } from '@/core/shots';
import { loopPreview } from '@/core/hooks';
import { useMounted } from '@/util/useMounted';
import { SHOT_LISTS } from '@/assets/shotLists';
import { ShotListStoryboard } from '@/screens/ShotListStoryboard';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function StoryboardScreen() {
  const navigation = useNavigation<Nav>();
  const { id } = useRoute<RouteProp<RootStackParamList, 'Storyboard'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const setClip = useStudio((s) => s.setClip);
  const setStill = useStudio((s) => s.setStill);
  const settings = useStudio((s) => s.settings);

  // Several stills can be generating at once; the ref is the source of truth.
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const generatingRef = useRef<Set<string>>(new Set());
  const mounted = useMounted();

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const script: any = project.script;
  const character = script.characterDescription?.trim() ?? '';

  // A long video built from a known shot list carries that list's style prefix on every prompt.
  const firstPrompt: string | undefined =
    script.mode === 'long'
      ? script.chapters.flatMap((c: any) => c.visuals ?? []).find((v: any) => v.kind !== 'card')?.prompt
      : undefined;
  const list = firstPrompt ? Object.values(SHOT_LISTS).find((l) => firstPrompt.startsWith(l.style)) : undefined;
  const isBankLong = script.mode === 'long' && Boolean(script.bankV2?.cueCounts);

  const shotPrompt = (shot: Shot) =>
    shot.promptFinal
      ? (shot.clipPrompt ?? '')
      : finalisePrompt(shot.clipPrompt ?? '', { character: shot.isCutaway ? undefined : character });

  /** Imports a Veo result from the camera roll into the project workspace. */
  const importClip = async (key: string) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow media access to import clips you generated in Flow.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const uri = await importInto('clips', project.slug, result.assets[0].uri, `${key}.mp4`);
      setClip(project.id, key, uri);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  /** Imports one still made in the Gemini app or Flow. */
  const importStill = async (key: string) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow media access to import stills.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const ext = stillExtension(asset.fileName, asset.mimeType);
      if (!ext) {
        Alert.alert('Unsupported image', 'Use a PNG, JPEG or WebP image. HEIC photos cannot be rendered — Flow downloads are fine.');
        return;
      }
      const uri = await importInto('stills', project.slug, asset.uri, `${key}_still.${ext}`);
      setStill(project.id, key, uri);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  /** Imports several stills at once, matched in tap order to the keys still missing. */
  const importStillsInOrder = async (keys: string[]) => {
    if (!keys.length) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import stills.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: keys.length,
      orderedSelection: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const placed: string[] = [];
    const skipped: string[] = [];
    for (let i = 0; i < Math.min(keys.length, result.assets.length); i++) {
      const asset = result.assets[i];
      const ext = stillExtension(asset.fileName, asset.mimeType);
      if (!ext) {
        skipped.push(`#${i + 1} (not PNG, JPEG or WebP)`);
        continue;
      }
      try {
        const uri = await importInto('stills', project.slug, asset.uri, `${keys[i]}_still.${ext}`);
        setStill(project.id, keys[i], uri);
        placed.push(keys[i]);
      } catch (e) {
        skipped.push(`#${i + 1} (${e instanceof Error ? e.message : String(e)})`);
      }
    }

    const names = placed.map((k) => k.split('_v')[1] ?? k).map((n) => `still ${n}`).join(', ');
    Alert.alert(
      'Stills imported',
      `${placed.length} of ${keys.length} placed in order (${names || 'none'}).` +
        (skipped.length ? `\n\nSkipped: ${skipped.join('; ')}` : '') +
        (result.assets.length < keys.length ? `\n\n${keys.length - result.assets.length} still need a picture.` : ''),
    );
  };

  const makeStill = async (key: string, prompt: string) => {
    if (generatingRef.current.has(key)) return;
    generatingRef.current.add(key);
    const sync = () => {
      if (mounted.current) setGenerating(new Set(generatingRef.current));
    };
    sync();
    try {
      const apiKey = await getKey('gemini');
      if (!apiKey) {
        Alert.alert('Gemini key missing', 'Imagen uses the same key. Add it in Settings.');
        return;
      }
      const uri = await generateStill({
        apiKey,
        prompt,
        slug: project.slug,
        key,
        model: useStudio.getState().settings.imageModel,
        aspectRatio: project.mode === 'short' ? '9:16' : '16:9',
      });
      setStill(project.id, key, uri);
    } catch (e) {
      Alert.alert('Still generation failed', e instanceof Error ? e.message : String(e));
    } finally {
      generatingRef.current.delete(key);
      sync();
    }
  };

  const clipStatus = (key: string) =>
    project.assets.clips[key]
      ? ({ label: 'IMPORTED', tone: 'ok' } as const)
      : ({ label: 'PENDING', tone: 'neutral' } as const);

  const stillStatus = (key: string) =>
    project.assets.stills[key]
      ? ({ label: 'READY', tone: 'ok' } as const)
      : ({ label: 'PENDING', tone: 'neutral' } as const);

  const short = project.mode === 'short' ? (script as ShortScript) : null;
  const audit = short ? auditShots(short as any, settings.shortClipBudget) : null;

  const renderChapterVisuals = (ch: any) => {
    const assets = project.assets;
    const hybrid = ch.visuals?.length
      ? ch.visuals.some((v: any) => (v.kind === 'clip' ? assets.clips[v.key] : assets.stills[v.reuse ?? v.key])) ||
        !(assets.clips[`${ch.index}_a`] || assets.clips[`${ch.index}_b`] || assets.stills[String(ch.index)])
      : false;

    if (hybrid) {
      return (
        <HybridVisuals
          visuals={ch.visuals}
          character={character}
          clips={assets.clips}
          stills={assets.stills}
          onImportClip={importClip}
          onImportStill={importStill}
          onImportStillsInOrder={importStillsInOrder}
        />
      );
    }

    return (
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {ch.heroA ? (
          <PromptCard
            label="CLIP A — HOOK ACTION"
            prompt={finalisePrompt(ch.heroA, { character })}
            status={clipStatus(`${ch.index}_a`)}
            onImport={() => importClip(`${ch.index}_a`)}
          />
        ) : null}
        {ch.heroB ? (
          <PromptCard
            label="CLIP B — MECHANISM ESCALATION"
            prompt={finalisePrompt(ch.heroB, { character })}
            status={clipStatus(`${ch.index}_b`)}
            onImport={() => importClip(`${ch.index}_b`)}
          />
        ) : null}
        {ch.heroA || ch.heroB ? null : (
          <Small>No Flow clip for this chapter within the long-form's credit budget: its still carries it.</Small>
        )}
        <PromptCard
          label="STILL — REFRAME METAPHOR"
          prompt={ch.stillPrompt}
          status={stillStatus(String(ch.index))}
          onImport={() => importStill(String(ch.index))}
          onGenerate={() => makeStill(String(ch.index), ch.stillPrompt)}
          generating={generating.has(String(ch.index))}
        />
      </View>
    );
  };

  const renderShot = (f: ReturnType<typeof flattenShots>[number]) => {
    const { shot } = f;
    const key = clipKeyFor(f.flatIndex);
    let body: React.ReactNode = null;

    if (shot.promptFinal) {
      body =
        shot.reuse === undefined ? (
          <Small>
            {String(shot.beatId)} · {shot.source === 'clip' ? 'clip' : 'still'} · {shot.setting}
          </Small>
        ) : null;
    } else if (shot.reuse !== undefined) {
      body = (
        <Small>
          SHOT {f.flatIndex + 1} — punch-in on shot {shot.reuse + 1}'s{' '}
          {shot.source === 'clip' ? 'clip (plays on from where it stopped)' : 'picture'}. Nothing to make.
        </Small>
      );
    } else if (shot.source !== 'still') {
      body = (
        <PromptCard
          label={`SHOT ${f.flatIndex + 1} — CLIP${shot.setting ? ` · ${shot.setting}` : ''}`}
          prompt={shotPrompt(shot)}
          status={clipStatus(key)}
          onImport={() => importClip(key)}
        />
      );
    } else {
      body = (
        <PromptCard
          label={`SHOT ${f.flatIndex + 1} — STILL${shot.interrupt ? ' · PATTERN INTERRUPT' : ''}${
            shot.isCutaway ? ' · CUTAWAY' : ''
          }${shot.setting ? ` · ${shot.setting}` : ''}`}
          prompt={shotPrompt(shot)}
          status={stillStatus(key)}
          onImport={() => importStill(key)}
          onGenerate={() => makeStill(key, shotPrompt(shot))}
          generating={generating.has(key)}
        />
      );
    }

    return (
      <View key={f.flatIndex} style={{ marginTop: space.sm }}>
        {body}
      </View>
    );
  };

  const long = project.mode !== 'short' ? (script as LongScript) : null;

  return (
    <Screen>
      <Card>
        <H2>Storyboard</H2>
        <Small>
          Copy a prompt, paste it into Google Flow or the Gemini app on this phone, then import the finished clip or
          still back here. Every prompt carries its video's locked style.
        </Small>
      </Card>

      {character ? (
        <Card>
          <H3>Character reference — make this first</H3>
          <Small>
            Generate this image in Flow before any clip, then add it as an ingredient (reference image) on every clip
            and still that shows the character. Text alone drifts; a reference image keeps the same face and outfit
            across the whole video.
          </Small>
          <Divider />
          <PromptCard label="CHARACTER REFERENCE IMAGE" prompt={characterReferencePrompt(character)} />
        </Card>
      ) : null}

      {short && (short.hookText || short.loopBridge || short.stimulus) ? (
        <Card>
          <H3>Packaging</H3>
          {short.hookText ? (
            <Small>
              On screen for the first 2 s:{' '}
              <Small style={{ color: colors.accent, fontWeight: '800' }}>{short.hookText?.toUpperCase()}</Small>
            </Small>
          ) : null}
          {short.tactic ? <Small>Tactic: {short.tactic}</Small> : null}
          {loopPreview(short) ? <Small>Loop reads: {loopPreview(short)}</Small> : null}
          {short.stimulus ? (
            <Small>
              Test stimulus, drawn by the app and held {short.stimulus?.holdSeconds} s in silence after the hook:{' '}
              {short.stimulus?.description}
              {short.stimulus?.card ? '' : ' (no layout came back — shown as plain text)'}
            </Small>
          ) : null}
          {short.ctaQuestion ? <Small>On screen for the last 1.5 s: {short.ctaQuestion}</Small> : null}
        </Card>
      ) : null}

      {audit ? (
        <Card>
          <H3>Shot budget</H3>
          <Small>
            {`${audit.shotCount} shots — ${audit.clipCount} generated clip${audit.clipCount === 1 ? '' : 's'} (budget ${
              settings.shortClipBudget
            }) and ${audit.stillCount} still${
              audit.stillCount === 1 ? '' : 's'
            }. Stills cost a fraction of a clip and still move on screen.`}
          </Small>
        </Card>
      ) : null}

      {audit && audit.warnings.length ? (
        <Card>
          <H3>Shot list needs work</H3>
          <Small>
            These are what make a Short read as edited rather than filmed in one take. Regenerate the script if they
            matter to you.
          </Small>
          {audit.warnings.map((w) => (
            <Small key={w} style={{ color: colors.warn, marginTop: space.xs }}>
              • {w}
            </Small>
          ))}
        </Card>
      ) : null}

      {short ? <MasterStillsCard projectId={project.id} /> : null}

      {long ? (
        <>
          {long.coldOpen.trim() ? (
            <Card>
              <H3>Cold Open</H3>
              <Body style={{ fontSize: 14, lineHeight: 20 }}>{long.coldOpen}</Body>
              <Small>Voiced as chapter 0. Its visuals reuse chapter 1's hero clips.</Small>
            </Card>
          ) : null}

          {list || isBankLong ? (
            <ShotListStoryboard
              project={project}
              list={list}
              onImportClip={importClip}
              onImportStill={importStill}
              onImportStillsInOrder={importStillsInOrder}
              onPreview={() => navigation.navigate('Assembly', { id: project.id })}
            />
          ) : null}

          {list || isBankLong ? null : (
            <>
              <FillSheetCard projectId={project.id} />
              <MasterStillsCard projectId={project.id} />
              <StillQueueCard projectId={project.id} />
            </>
          )}

          {(list || isBankLong ? [] : long.chapters).map((ch: any) => (
            <Card key={ch.index}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H3>Ch {ch.index} · {ch.title}</H3>
                <Badge label={ch.kenBurns.replace('_', ' ')} tone="info" />
              </Row>

              <Small style={{ color: colors.accent }}>MINI-HOOK</Small>
              <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.miniHook}</Body>
              <Small style={{ color: colors.accent }}>MECHANISM</Small>
              <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.mechanism}</Body>
              <Small style={{ color: colors.accent }}>MICRO-REFRAME</Small>
              <Body style={{ fontSize: 13, lineHeight: 19 }}>{ch.microReframe}</Body>

              {renderChapterVisuals(ch)}
            </Card>
          ))}

          {long.closingSynthesis.trim() ? (
            <Card>
              <H3>Closing Synthesis</H3>
              <Body style={{ fontSize: 14, lineHeight: 20 }}>{long.closingSynthesis}</Body>
              <Small>Voiced as chapter 99. Its visuals reuse the last chapter's still.</Small>
            </Card>
          ) : null}
        </>
      ) : (
        short!.beats.map((beat, i) => (
          <Card key={i}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>Beat {i + 1} · {beat.kind.toUpperCase()}</H3>
              <Badge label={`${beat.text.trim().split(/\s+/).length}w`} tone="info" />
            </Row>
            <Body style={{ fontSize: 14, lineHeight: 20 }}>{beat.text}</Body>
            {beat.cardText ? (
              <Small style={{ color: colors.accent, fontWeight: '800' }}>On screen: {beat.cardText.toUpperCase()}</Small>
            ) : null}
            {flattenShots(short as any)
              .filter((f) => f.beatIndex === i)
              .map(renderShot)}
          </Card>
        ))
      )}

      <Card>
        <Small>
          Stills and cards cost no Flow credits; a long-form keeps its Veo clips to the hook and a hero moment or two
          (120 credits). Hoot is added at assembly, never generated.
        </Small>
      </Card>
    </Screen>
  );
}

/**
 * A planned chapter's visuals: its Veo clips one by one, then every still as one
 * numbered prompt for the Gemini app, imported back together in order.
 */
function HybridVisuals({
  visuals,
  character,
  clips,
  stills,
  onImportClip,
  onImportStill,
  onImportStillsInOrder,
}: {
  visuals: any[];
  character: string;
  clips: Record<string, string>;
  stills: Record<string, string>;
  onImportClip: (key: string) => void;
  onImportStill: (key: string) => void;
  onImportStillsInOrder: (keys: string[]) => void;
}) {
  const [showEach, setShowEach] = useState(false);
  const own = visuals.filter((v) => v.kind === 'still' && !v.reuse);
  const missing = own.filter((v) => !stills[v.key]).map((v) => v.key);
  const numbered = own.map((v, i) => `${i + 1}. ${v.prompt}`).join('\n\n');

  return (
    <View style={{ gap: space.sm, marginTop: space.sm }}>
      {visuals
        .filter((v) => v.kind === 'clip')
        .map((v, i) => (
          <View key={v.key}>
            <PromptCard
              label={`VEO CLIP ${i + 1} · ${Math.round(v.words / 2.4)} s of narration`}
              prompt={finalisePrompt(v.prompt, { character })}
              status={clips[v.key] ? { label: 'IMPORTED', tone: 'ok' } : { label: 'PENDING', tone: 'neutral' }}
              onImport={() => onImportClip(v.key)}
            />
            <Small>Covers: {v.text}</Small>
          </View>
        ))}

      <Row style={{ justifyContent: 'space-between' }}>
        <Small style={{ color: colors.text, fontWeight: '800' }}>
          {own.length} stills · {own.length - missing.length} imported
        </Small>
        <Badge label={missing.length ? `${missing.length} TO MAKE` : 'ALL IN'} tone={missing.length ? 'neutral' : 'ok'} />
      </Row>
      <Small>
        Make these in the Gemini app (your AI Pro plan; no API cost), in order, then import them together: they are
        matched in the order you tap them to the stills still missing. A missing still is covered by the one before it.
      </Small>
      <PromptCard label={`ALL ${own.length} STILL PROMPTS, NUMBERED`} prompt={numbered} />

      {missing.length ? (
        <Pressable onPress={() => onImportStillsInOrder(missing)} style={{ paddingVertical: space.xs }}>
          <Small style={{ color: colors.accent, fontWeight: '800' }}>
            Import the next {missing.length} still{missing.length === 1 ? '' : 's'} in order →
          </Small>
        </Pressable>
      ) : null}

      <Pressable onPress={() => setShowEach((s) => !s)} style={{ paddingVertical: space.xs }}>
        <Small style={{ color: colors.accent }}>{showEach ? 'Hide' : 'Show'} each still</Small>
      </Pressable>

      {showEach
        ? own.map((v, i) => (
            <View key={v.key}>
              <PromptCard
                label={`STILL ${i + 1} · ${(v.kenBurns ?? 'zoom_in').replace('_', ' ')}`}
                prompt={v.prompt}
                status={stills[v.key] ? { label: 'READY', tone: 'ok' } : { label: 'PENDING', tone: 'neutral' }}
                onImport={() => onImportStill(v.key)}
              />
              <Small>Covers: {v.text}</Small>
            </View>
          ))
        : null}
    </View>
  );
}

/** The file extension a still is stored under, or null for formats the renderer cannot read (HEIC). */
function stillExtension(fileName?: string | null, mimeType?: string | null): string | null {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  const fromMime = mimeType?.split('/').pop()?.toLowerCase();
  for (const ext of [fromName, fromMime]) {
    if (ext === 'png' || ext === 'webp') return ext;
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  }
  // Nothing to go on: assume the picker handed back a PNG.
  return fromName || fromMime ? null : 'png';
}
