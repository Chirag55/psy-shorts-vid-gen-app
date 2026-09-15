import React, { useEffect, useState } from 'react';
import { Alert, InteractionManager, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Body, Button, Card, Divider, Field, H2, H3, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { clearKey, getKey, maskKey, setKey } from '@/services/keys';
import { verifyGeminiKey } from '@/services/gemini';
import { verifyAnthropicKey } from '@/services/anthropic';
import { verifyElevenLabsKey } from '@/services/elevenlabs';
import { listModels, PROVIDERS, type ProviderId } from '@/services/scriptProvider';
import { formatBytes, importInto, workspaceSize } from '@/services/workspace';
import type { Emotion } from '@/core/mascot';
import { useMounted } from '@/util/useMounted';

const EMOTIONS: Array<{ key: Emotion; label: string; hint: string }> = [
  { key: 'base', label: 'Base', hint: 'Neutral fallback' },
  { key: 'surprised', label: 'Surprised', hint: 'Hook / mini-hook' },
  { key: 'thinking', label: 'Thinking', hint: 'Mechanism' },
  { key: 'knowing', label: 'Knowing', hint: 'Reframe / outro' },
];

type StoredKeys = Record<'gemini' | 'anthropic' | 'eleven' | 'youtubeApiKey', string | null>;

export default function SettingsScreen() {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const projects = useStudio((s) => s.projects);
  const mounted = useMounted();

  const [draft, setDraft] = useState({ gemini: '', anthropic: '', eleven: '', youtubeApiKey: '' });
  const [stored, setStored] = useState<StoredKeys>({
    gemini: null,
    anthropic: null,
    eleven: null,
    youtubeApiKey: null,
  });
  const [saving, setSaving] = useState(false);
  const [storage, setStorage] = useState(0);
  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const refreshStored = async () => {
    const [gemini, anthropic, eleven, youtubeApiKey] = await Promise.all([
      getKey('gemini'),
      getKey('anthropic'),
      getKey('elevenlabs'),
      getKey('youtubeApiKey'),
    ]);
    if (mounted.current) setStored({ gemini, anthropic, eleven, youtubeApiKey });
  };

  useEffect(() => {
    void refreshStored();

    const task = InteractionManager.runAfterInteractions(() => {
      if (!mounted.current) return;
      try {
        setStorage(workspaceSize());
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
      if (draft.gemini.trim()) {
        await setKey('gemini', draft.gemini.trim());
        if (!(await verifyGeminiKey(draft.gemini.trim()))) {
          warnings.push('Gemini did not accept that key — saved anyway, but generation will fail until it is right.');
        }
      }

      if (draft.anthropic.trim()) {
        await setKey('anthropic', draft.anthropic.trim());
        if (!(await verifyAnthropicKey(draft.anthropic.trim()))) {
          warnings.push('Anthropic did not accept that key — saved anyway.');
        }
      }

      if (draft.eleven.trim()) {
        await setKey('elevenlabs', draft.eleven.trim());
        const check = await verifyElevenLabsKey(draft.eleven.trim());
        if (!check.ok) warnings.push(`ElevenLabs: ${check.reason ?? 'could not verify'} Saved anyway.`);
      }

      if (draft.youtubeApiKey.trim()) {
        await setKey('youtubeApiKey', draft.youtubeApiKey.trim());
      }

      setDraft({ gemini: '', anthropic: '', eleven: '', youtubeApiKey: '' });
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

  const importMascot = async (emotion: Emotion) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media access to import the mascot artwork.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.length) return;

    try {
      const uri = await importInto('stills', '_mascot', result.assets[0].uri, `${emotion}.png`);
      updateSettings({ mascotAssets: { ...settings.mascotAssets, [emotion]: uri } });
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
