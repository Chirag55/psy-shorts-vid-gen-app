import React, { useEffect, useState } from 'react';
import { Alert, InteractionManager, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Body, Button, Card, Divider, Field, H2, H3, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { clearKey, describeSanitisation, getKey, maskKey, sanitiseKey, setKey } from '@/services/keys';
import { describeElevenLabsKey } from '@/core/keyHygiene';
import { verifyGeminiKey } from '@/services/gemini';
import { verifyAnthropicKey } from '@/services/anthropic';
import { diagnoseKey, verifyElevenLabsKey } from '@/services/elevenlabs';
import { authorize, redirectUri } from '@/services/youtube';
import { listModels, PROVIDERS, type ProviderId } from '@/services/scriptProvider';
import { listImageModels } from '@/services/imagen';
import * as audioCache from '@/services/audioCache';
import { formatBytes, workspaceSize } from '@/services/workspace';
import { prepareMascot } from '@/services/mascotPrep';
import type { Emotion } from '@/core/mascot';
import { useMounted } from '@/util/useMounted';

const EMOTIONS: Array<{ key: Emotion; label: string; hint: string }> = [
  { key: 'base', label: 'Base', hint: 'Neutral fallback' },
  { key: 'surprised', label: 'Surprised', hint: 'Hook / mini-hook' },
  { key: 'thinking', label: 'Thinking', hint: 'Mechanism' },
  { key: 'knowing', label: 'Knowing', hint: 'Reframe / outro' },
];

type StoredKeys = Record<
  'gemini' | 'anthropic' | 'eleven' | 'youtubeApiKey' | 'youtubeClientId',
  string | null
>;

export default function SettingsScreen() {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const projects = useStudio((s) => s.projects);
  const mounted = useMounted();

  const [draft, setDraft] = useState({
    gemini: '',
    anthropic: '',
    eleven: '',
    youtubeApiKey: '',
    youtubeClientId: '',
  });
  const [stored, setStored] = useState<StoredKeys>({
    gemini: null,
    anthropic: null,
    eleven: null,
    youtubeApiKey: null,
    youtubeClientId: null,
  });
  const [youtubeSignedIn, setYoutubeSignedIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storage, setStorage] = useState(0);
  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [imageModels, setImageModels] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingImageModels, setLoadingImageModels] = useState(false);
  const [cache, setCache] = useState<audioCache.CacheStats>({ entries: 0, bytes: 0, charactersSaved: 0 });

  const refreshStored = async () => {
    const [gemini, anthropic, eleven, youtubeApiKey, youtubeClientId, tokens] = await Promise.all([
      getKey('gemini'),
      getKey('anthropic'),
      getKey('elevenlabs'),
      getKey('youtubeApiKey'),
      getKey('youtubeClientId'),
      getKey('youtubeTokens'),
    ]);
    if (!mounted.current) return;
    setStored({ gemini, anthropic, eleven, youtubeApiKey, youtubeClientId });
    setYoutubeSignedIn(Boolean(tokens));
  };

  useEffect(() => {
    void refreshStored();

    const task = InteractionManager.runAfterInteractions(() => {
      if (!mounted.current) return;
      try {
        setStorage(workspaceSize());
        setCache(audioCache.stats());
      } catch {
        setStorage(0);
      }
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Saves every key that was typed.
   *
   * Verification is advisory, never a gate. Refusing to save a key because a
   * probe failed locks you out of the app over a scoped credential or a flaky
   * network, which is exactly what happened with ElevenLabs keys that only
   * carry text-to-speech permission.
   */
  const saveKeys = async () => {
    setSaving(true);
    const warnings: string[] = [];

    try {
      const clean = {
        gemini: sanitiseKey(draft.gemini),
        anthropic: sanitiseKey(draft.anthropic),
        eleven: sanitiseKey(draft.eleven),
        youtubeApiKey: sanitiseKey(draft.youtubeApiKey),
        youtubeClientId: sanitiseKey(draft.youtubeClientId),
      };

      for (const [label, raw, cleaned] of [
        ['Gemini', draft.gemini, clean.gemini],
        ['Anthropic', draft.anthropic, clean.anthropic],
        ['ElevenLabs', draft.eleven, clean.eleven],
        ['YouTube', draft.youtubeApiKey, clean.youtubeApiKey],
        ['YouTube client ID', draft.youtubeClientId, clean.youtubeClientId],
      ] as const) {
        const note = raw.trim() ? describeSanitisation(raw, cleaned) : null;
        if (note) warnings.push(`${label}: ${note}`);
      }

      if (clean.gemini) {
        await setKey('gemini', clean.gemini);
        if (!(await verifyGeminiKey(clean.gemini))) {
          warnings.push('Gemini did not accept that key — saved anyway, but generation will fail until it is right.');
        }
      }

      if (clean.anthropic) {
        await setKey('anthropic', clean.anthropic);
        if (!(await verifyAnthropicKey(clean.anthropic))) {
          warnings.push('Anthropic did not accept that key — saved anyway.');
        }
      }

      if (clean.eleven) {
        await setKey('elevenlabs', clean.eleven);

        // Shape is checked before the network call: a masked or truncated paste
        // explains a rejection far better than a bare 401 does.
        const shape = describeElevenLabsKey(clean.eleven);
        if (!shape.looksValid) warnings.push(`ElevenLabs key shape: ${shape.summary}`);

        const check = await verifyElevenLabsKey(clean.eleven);
        if (!check.ok) warnings.push(`ElevenLabs: ${check.reason ?? 'could not verify'}`);
      }

      if (clean.youtubeApiKey) {
        await setKey('youtubeApiKey', clean.youtubeApiKey);
      }

      if (clean.youtubeClientId) {
        await setKey('youtubeClientId', clean.youtubeClientId);
      }

      setDraft({ gemini: '', anthropic: '', eleven: '', youtubeApiKey: '', youtubeClientId: '' });
      await refreshStored();

      Alert.alert(
        warnings.length ? 'Saved with warnings' : 'Saved',
        warnings.length ? warnings.join('\n\n') : 'Keys stored on this device.'
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  /** Asks the provider which models this key can actually call. */
  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const list = await listModels(settings.scriptProvider);
      if (mounted.current) setModels(list);
      if (!list.length) Alert.alert('No models', 'The provider returned an empty model list.');
    } catch (e) {
      Alert.alert('Could not load models', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoadingModels(false);
    }
  };

  /** Live probe plus shape analysis, for when a key "works elsewhere". */
  const testElevenLabs = async () => {
    const key = await getKey('elevenlabs');
    if (!key) {
      Alert.alert('No key saved', 'Save an ElevenLabs key first.');
      return;
    }

    const d = await diagnoseKey(key);
    Alert.alert(
      d.ok ? 'Key works' : `Key rejected (HTTP ${d.status})`,
      [
        `Server said: ${d.serverMessage}`,
        '',
        `Key shape: ${d.shape}`,
        '',
        d.ok
          ? 'Synthesis will work.'
          : 'An ElevenLabs key is tied to the account, not the device — the same string cannot work on one machine and fail on another. If it works elsewhere, the two are different strings.',
      ].join('\n')
    );
  };

  /** Runs the Google consent flow using the stored client ID. */
  const signInToYouTube = async () => {
    const clientId = await getKey('youtubeClientId');
    if (!clientId) {
      Alert.alert('Client ID needed', 'Paste your Android OAuth client ID above and save it first.');
      return;
    }

    setSigningIn(true);
    try {
      const tokens = await authorize(clientId);
      await setKey('youtubeTokens', JSON.stringify(tokens));
      if (mounted.current) setYoutubeSignedIn(true);
      Alert.alert('Signed in', 'This device can now publish to your channel and see private uploads.');
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSigningIn(false);
    }
  };

  const showOAuthSetup = async () => {
    const clientId = (await getKey('youtubeClientId')) ?? '';
    Alert.alert(
      'Registering the OAuth client',
      [
        'In Google Cloud Console, create an OAuth client of type Android with:',
        '',
        'Package name:',
        'com.mindfiles.studio',
        '',
        'SHA-1 certificate fingerprint:',
        '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25',
        '',
        'Enable YouTube Data API v3, add the youtube and youtube.upload scopes to the consent screen, and add your own Google account as a test user while the app is unverified.',
        '',
        clientId ? `Redirect URI in use:\n${redirectUri(clientId)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  };

  const loadImageModels = async () => {
    const apiKey = await getKey('gemini');
    if (!apiKey) {
      Alert.alert('Gemini key needed', 'Image models are listed with the Gemini key.');
      return;
    }
    setLoadingImageModels(true);
    try {
      const list = await listImageModels(apiKey);
      if (mounted.current) setImageModels(list);
      if (!list.length) {
        Alert.alert('No image models', 'This key cannot call any image model. Stills will have to be imported by hand.');
      }
    } catch (e) {
      Alert.alert('Could not load image models', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoadingImageModels(false);
    }
  };

  const importMascot = async (emotion: Emotion) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import the mascot artwork.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.length) return;

    try {
      const prepared = await prepareMascot(result.assets[0].uri, emotion);
      updateSettings({ mascotAssets: { ...settings.mascotAssets, [emotion]: prepared.uri } });

      const pct = Math.round(prepared.report.clearedFraction * 100);
      Alert.alert(
        prepared.report.warning ? 'Imported, but check it' : 'Imported',
        prepared.report.warning
          ? `${prepared.report.warning}\n\n${pct}% of the image was made transparent.`
          : `Background removed — ${pct}% of the image is now transparent. Enclosed white, such as the eyes, is preserved.`
      );
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const activeModel =
    settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;

  const setActiveModel = (id: string) =>
    updateSettings(
      settings.scriptProvider === 'anthropic' ? { anthropicModel: id } : { geminiModel: id }
    );

  return (
    <Screen>
      <Card>
        <H2>Settings</H2>
        <Small>
          Keys are stored in the Android keystore on this device and are never sent anywhere but the
          APIs they belong to.
        </Small>
      </Card>

      <Card>
        <H3>Script provider</H3>
        <Small>Either service can write scripts and topics. Gemini also generates the Imagen stills.</Small>
        <Segmented
          value={settings.scriptProvider}
          onChange={(v: ProviderId) => {
            updateSettings({ scriptProvider: v });
            setModels([]);
          }}
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        />
        <Small>{PROVIDERS.find((p) => p.id === settings.scriptProvider)?.blurb}</Small>
      </Card>

      <Card>
        <H3>Model</H3>
        <Field
          label={settings.scriptProvider === 'anthropic' ? 'Anthropic model' : 'Gemini model'}
          value={activeModel}
          onChangeText={setActiveModel}
          autoCapitalize="none"
        />
        <Button
          label={loadingModels ? 'Loading…' : 'Load available models'}
          variant="secondary"
          loading={loadingModels}
          onPress={loadModels}
        />
        {models.length ? (
          <View style={{ gap: space.xs, marginTop: space.sm }}>
            <Small>Tap one to use it:</Small>
            {models.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setActiveModel(m.id)}
                style={[s.modelRow, m.id === activeModel && s.modelRowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.modelId, m.id === activeModel && { color: colors.accent }]}>{m.id}</Text>
                  {m.label !== m.id ? <Small>{m.label}</Small> : null}
                </View>
                {m.id === activeModel ? <Badge label="IN USE" tone="ok" /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <Small style={{ color: colors.textFaint }}>
            Providers retire model names without warning. If generation returns a 404, load the list
            and pick a current one.
          </Small>
        )}
      </Card>

      <Card>
        <H3>Image model</H3>
        <Small>
          Used for the connective stills. Imagen is not enabled on every Gemini key — if stills
          return a 404, load the list and pick one that is.
        </Small>
        <Field
          label="Image model"
          value={settings.imageModel}
          onChangeText={(v) => updateSettings({ imageModel: v })}
          autoCapitalize="none"
        />
        <Button
          label={loadingImageModels ? 'Loading…' : 'Load image models'}
          variant="secondary"
          loading={loadingImageModels}
          onPress={loadImageModels}
        />
        {imageModels.length ? (
          <View style={{ gap: space.xs, marginTop: space.sm }}>
            {imageModels.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => updateSettings({ imageModel: m.id })}
                style={[s.modelRow, m.id === settings.imageModel && s.modelRowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.modelId, m.id === settings.imageModel && { color: colors.accent }]}>{m.id}</Text>
                </View>
                {m.id === settings.imageModel ? <Badge label="IN USE" tone="ok" /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <H3>Voice credit protection</H3>
        <Small>
          Every synthesis is cached by the exact text and voice, so re-rendering or retrying never
          bills the same words twice. The cache survives deleting a project.
        </Small>
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small>Cached takes</Small>
          <Small style={{ color: colors.text }}>{cache.entries}</Small>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Characters not re-billed</Small>
          <Small style={{ color: colors.ok }}>~{cache.charactersSaved.toLocaleString()}</Small>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Cache size</Small>
          <Small style={{ color: colors.text }}>{formatBytes(cache.bytes)}</Small>
        </Row>
        <Button
          label="Clear audio cache"
          variant="ghost"
          onPress={() =>
            Alert.alert(
              'Clear audio cache',
              'Re-synthesising anything cleared will spend characters again. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    audioCache.clear();
                    setCache({ entries: 0, bytes: 0, charactersSaved: 0 });
                  },
                },
              ]
            )
          }
        />
      </Card>

      <Card>
        <H3>API keys</H3>
        <KeyRow label="Gemini" value={stored.gemini} />
        <Field
          label="New Gemini key"
          value={draft.gemini}
          onChangeText={(v) => setDraft((d) => ({ ...d, gemini: v }))}
          autoCapitalize="none"
          secure
        />

        <KeyRow label="Anthropic" value={stored.anthropic} />
        <Field
          label="New Anthropic key"
          value={draft.anthropic}
          onChangeText={(v) => setDraft((d) => ({ ...d, anthropic: v }))}
          autoCapitalize="none"
          secure
        />

        <KeyRow label="ElevenLabs" value={stored.eleven} />
        <Field
          label="New ElevenLabs key"
          value={draft.eleven}
          onChangeText={(v) => setDraft((d) => ({ ...d, eleven: v }))}
          autoCapitalize="none"
          secure
        />

        <Button label={saving ? 'Saving…' : 'Save keys'} loading={saving} onPress={saveKeys} />
        <Button label="Test ElevenLabs key" variant="secondary" onPress={testElevenLabs} />
        <Small style={{ color: colors.textFaint }}>
          Keys are always saved. Verification runs afterwards and only warns, so a scoped key that
          works for one service is never thrown away.
        </Small>
      </Card>

      <Card>
        <H3>YouTube</H3>
        <Small>
          An API key browses public uploads with no sign-in. Signing in on the Publish screen also
          shows unlisted and private videos, and is required to publish.
        </Small>
        <KeyRow label="YouTube API key" value={stored.youtubeApiKey} />
        <Field
          label="New YouTube API key"
          value={draft.youtubeApiKey}
          onChangeText={(v) => setDraft((d) => ({ ...d, youtubeApiKey: v }))}
          autoCapitalize="none"
          secure
        />
        <Field
          label="Channel ID (needed for API key access)"
          value={settings.youtubeChannelId}
          onChangeText={(v) => updateSettings({ youtubeChannelId: v.trim() })}
          placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
          autoCapitalize="none"
        />
        <Small style={{ color: colors.textFaint }}>
          Find it at youtube.com/account_advanced. An API key cannot ask "which channel is mine", so
          it has to be named.
        </Small>

        <Divider />

        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Sign in to publish</H3>
          <Badge label={youtubeSignedIn ? 'SIGNED IN' : 'SIGNED OUT'} tone={youtubeSignedIn ? 'ok' : 'neutral'} />
        </Row>
        <Small>
          Publishing, and seeing unlisted or private uploads, needs Google sign-in rather than an API
          key. Android OAuth clients issue no secret, so nothing sensitive is stored in the app.
        </Small>
        <KeyRow label="OAuth client ID" value={stored.youtubeClientId} />
        <Field
          label="Android OAuth client ID"
          value={draft.youtubeClientId}
          onChangeText={(v) => setDraft((d) => ({ ...d, youtubeClientId: v }))}
          placeholder="xxxxx.apps.googleusercontent.com"
          autoCapitalize="none"
        />
        <Button label="Show setup details" variant="ghost" onPress={showOAuthSetup} />
        <Button
          label={youtubeSignedIn ? 'Sign in again' : 'Sign in with Google'}
          variant={youtubeSignedIn ? 'ghost' : 'primary'}
          loading={signingIn}
          onPress={signInToYouTube}
        />
      </Card>

      <Card>
        <H3>Write from results</H3>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Use channel performance</Body>
            <Small>
              Feeds your best and worst performing titles into script and topic generation, so new
              ideas lean on what this audience actually responded to.
            </Small>
          </View>
          <Switch
            value={settings.usePerformanceContext}
            onValueChange={(v) => updateSettings({ usePerformanceContext: v })}
            trackColor={{ true: colors.accentDim, false: colors.border }}
            thumbColor={settings.usePerformanceContext ? colors.accent : colors.textFaint}
          />
        </Row>
        <Small style={{ color: colors.textFaint }}>
          Needs YouTube connected, and at least four published videos older than two days — below
          that there is not enough signal to be worth following.
        </Small>
      </Card>

      <Card>
        <H3>Voice</H3>
        <Field
          label="ElevenLabs monthly character limit"
          value={String(settings.voiceCharLimit)}
          onChangeText={(v) => updateSettings({ voiceCharLimit: Number.parseInt(v, 10) || 0 })}
          keyboardType="numeric"
        />
      </Card>

      <Card>
        <H3>Professor Hoot</H3>
        <Small>
          Import the four expressions from your desktop assets. White backgrounds are keyed out at
          render time, so the source JPGs work as-is.
        </Small>
        <View style={{ gap: space.xs, marginTop: space.sm }}>
          {EMOTIONS.map((e) => (
            <Row key={e.key} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>{e.label}</Body>
                <Small>{e.hint}</Small>
              </View>
              <Badge
                label={settings.mascotAssets[e.key] ? 'LOADED' : 'MISSING'}
                tone={settings.mascotAssets[e.key] ? 'ok' : 'neutral'}
              />
              <Button label="Import" variant="ghost" onPress={() => importMascot(e.key)} />
            </Row>
          ))}
        </View>
      </Card>

      <Card>
        <H3>Storage</H3>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Workspace</Small>
          <Small style={{ color: colors.text }}>{formatBytes(storage)}</Small>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Projects</Small>
          <Small style={{ color: colors.text }}>{projects.length}</Small>
        </Row>
        <Divider />
        <Button
          label="Clear all keys"
          variant="danger"
          onPress={() =>
            Alert.alert('Clear keys', 'Remove every stored credential from this device?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: async () => {
                  await Promise.all([
                    clearKey('gemini'),
                    clearKey('anthropic'),
                    clearKey('elevenlabs'),
                    clearKey('youtubeApiKey'),
                    clearKey('youtubeClientId'),
                    clearKey('youtubeTokens'),
                  ]);
                  await refreshStored();
                },
              },
            ])
          }
        />
      </Card>
    </Screen>
  );
}

function KeyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
      <Body>{label}</Body>
      <Badge label={maskKey(value)} tone={value ? 'ok' : 'neutral'} />
    </Row>
  );
}

const s = StyleSheet.create({
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  modelRowActive: { borderColor: colors.accent },
  modelId: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
