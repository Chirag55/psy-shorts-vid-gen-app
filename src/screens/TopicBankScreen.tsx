import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Body, Button, Card, Empty, Field, H2, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { generateTopicIdeas } from '@/services/scriptProvider';
import { fetchPerformanceContext } from '@/services/performance';
import type { RootStackParamList } from '@/navigation/types';
import type { Mode } from '@/core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TopicBankScreen() {
  const nav = useNavigation<Nav>();
  const topics = useStudio((s) => s.topics);
  const addTopics = useStudio((s) => s.addTopics);
  const removeTopic = useStudio((s) => s.removeTopic);
  const settings = useStudio((s) => s.settings);

  const [category, setCategory] = useState('Social Dynamics');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('short');

  const refill = async () => {
    setBusy(true);
    try {
      const model =
        settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;
      const performanceContext = await fetchPerformanceContext(mode === 'short');

      const ideas = await generateTopicIdeas(
        { provider: settings.scriptProvider, model, performanceContext },
        category,
        8,
        topics.map((t) => t.topic)
      );
      addTopics(ideas.map((i) => ({ topic: i.topic, category: i.category || category })));
    } catch (e) {
      Alert.alert('Ideation failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unused = topics.filter((t) => !t.used);
  const used = topics.filter((t) => t.used);

  return (
    <Screen>
      <Card>
        <H2>Topic bank</H2>
        <Small>Ideas live on this device. Tap one to open the generator pre-filled.</Small>
      </Card>

      <Card>
        <Field label="Category to ideate" value={category} onChangeText={setCategory} />
        <Small style={{ marginBottom: space.xs }}>Generate as</Small>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'short', label: 'Short' },
            { value: 'long', label: 'Deep Dive' },
          ]}
        />
        <Button
          label={busy ? 'Thinking…' : 'Suggest 8 topics'}
          loading={busy}
          onPress={refill}
          style={{ marginTop: space.md }}
        />
      </Card>

      {!topics.length ? (
        <Empty title="Bank is empty" hint="Suggest some topics, or just type one straight into the generator." />
      ) : null}

      {unused.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => nav.navigate('Generate', { mode, topic: t.topic, category: t.category, topicId: t.id })}
          onLongPress={() =>
            Alert.alert('Remove topic', t.topic, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeTopic(t.id) },
            ])
          }
          style={({ pressed }) => [s.topic, pressed && { opacity: 0.8 }]}
        >
          <Badge label={t.category} tone="info" />
          <Body style={{ fontSize: 14, lineHeight: 20 }}>{t.topic}</Body>
        </Pressable>
      ))}

      {used.length ? (
        <View style={{ gap: space.sm }}>
          <Small style={{ fontWeight: '800', letterSpacing: 1 }}>ALREADY USED</Small>
          {used.map((t) => (
            <Row key={t.id} style={s.usedRow}>
              <Body style={{ flex: 1, fontSize: 13, color: colors.textFaint }}>{t.topic}</Body>
              <Badge label="USED" tone="neutral" />
            </Row>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topic: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  usedRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: space.md,
  },
});
