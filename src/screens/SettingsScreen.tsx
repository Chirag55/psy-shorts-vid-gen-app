import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Body, Button, Card, Divider, Field, H2, H3, Row, Screen, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { clearKey, getKey, maskKey, setKey } from '@/services/keys';
import { verifyGeminiKey } from '@/services/gemini';
import { verifyElevenLabsKey } from '@/services/elevenlabs';
import { formatBytes, importInto, workspaceSize } from '@/services/workspace';
import type { Emotion } from '@/core/mascot';

const EMOTIONS: Array<{ key: Emotion; label: string; hint: string }> = [
  { key: 'base', label: 'Base', hint: 'Neutral fallback' },
  { key: 'surprised', label: 'Surprised', hint: 'Hook / mini-hook' },
  { key: 'thinking', label: 'Thinking', hint: 'Mechanism' },
  { key: 'knowing', label: 'Knowing', hint: 'Reframe / outro' },
];

export default function SettingsScreen() {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const projects = useStudio((s) => s.projects);

  const [gemini, setGemini] = useState('');
  const [eleven, setEleven] = useState('');
  const [stored, setStored] = useState<{ gemini: string | null; eleven: string | null }>({ gemini: null, eleven: null });
  const [verifying, setVerifying] = useState(false);
  const [storage, setStorage] = useState(0);

  useEffect(() => {
    void (async () => {
      setStored({ gemini: await getKey('gemini'), eleven: await getKey('elevenlabs') });
      try {
        setStorage(workspaceSize());
      } catch {
        setStorage(0);
      }
    })();
  }, []);

  const saveKeys = async () => {
    setVerifying(true);
    try {
      if (gemini.trim()) {
        const ok = await verifyGeminiKey(gemini.trim());
        if (!ok) {
          Alert.alert('Gemini key rejected', 'Google did not accept that key. It was not saved.');
        } else {
          await setKey('gemini', gemini.trim());
          setGemini('');
        }
      }
      if (eleven.trim()) {
        const ok = await verifyElevenLabsKey(eleven.trim());
        if (!ok) {
          Alert.alert('ElevenLabs key rejected', 'That key was not accepted. It was not saved.');
        } else {
          await setKey('elevenlabs', eleven.trim());
          setEleven('');
        }
      }
      setStored({ gemini: await getKey('gemini'), eleven: await getKey('elevenlabs') });
    } finally {
      setVerifying(false);
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

  return (
    <Screen>
      <Card>
        <H2>Settings</H2>
        <Small>Keys are stored in the Android keystore on this device and are never transmitted anywhere but the APIs they belong to.</Small>
      </Card>

      <Card>
        <H3>API keys</H3>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>Gemini</Body>
          <Badge label={maskKey(stored.gemini)} tone={stored.gemini ? 'ok' : 'neutral'} />
        </Row>
        <Field label="New Gemini key" value={gemini} onChangeText={setGemini} autoCapitalize="none" secure />

        <Row style={{ justifyContent: 'space-between' }}>
          <Body>ElevenLabs</Body>
          <Badge label={maskKey(stored.eleven)} tone={stored.eleven ? 'ok' : 'neutral'} />
        </Row>
        <Field label="New ElevenLabs key" value={eleven} onChangeText={setEleven} autoCapitalize="none" secure />

        <Button label={verifying ? 'Verifying…' : 'Verify and save'} loading={verifying} onPress={saveKeys} />
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
                    clearKey('elevenlabs'),
                    clearKey('youtubeClientId'),
                    clearKey('youtubeTokens'),
                  ]);
                  setStored({ gemini: null, eleven: null });
                },
              },
            ])
          }
        />
      </Card>

      <Card>
        <H3>Generation</H3>
        <Field
          label="Gemini model"
          value={settings.geminiModel}
          onChangeText={(v) => updateSettings({ geminiModel: v })}
          autoCapitalize="none"
        />
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
          Import the four expressions from your desktop assets. White backgrounds are keyed out
          automatically at render time, so the source JPGs work as-is.
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
        <Small>
          Delete a project by long-pressing it in the Studio list — that removes its clips, audio and
          renders from the device too.
        </Small>
      </Card>
    </Screen>
  );
}
