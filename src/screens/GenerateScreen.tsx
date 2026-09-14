import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Card, Field, H2, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { getKey } from '@/services/keys';
import { generateLongScript, generateShortScript } from '@/services/gemini';
import { validateScript } from '@/core/guardrails';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORIES = [
  'Social Dynamics',
  'Attachment & Relationships',
  'Cognitive Bias',
  'Self-Sabotage',
  'Emotional Regulation',
  'Persuasion & Influence',
];

export default function GenerateScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Generate'>>();

  const createProject = useStudio((s) => s.createProject);
  const markTopicUsed = useStudio((s) => s.markTopicUsed);
  const recentArchetypes = useStudio((s) => s.recentArchetypes);
  const geminiModel = useStudio((s) => s.settings.geminiModel);

  const [mode, setMode] = useState(route.params.mode);
  const [topic, setTopic] = useState(route.params.topic ?? '');
  const [category, setCategory] = useState(route.params.category ?? CATEGORIES[0]);
  const [chapters, setChapters] = useState('4');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Give the generator a specific psychological pattern to work from.');
      return;
    }

    const apiKey = await getKey('gemini');
    if (!apiKey) {
      Alert.alert('Gemini key missing', 'Add your Gemini API key in Settings before generating.');
      return;
    }

    setBusy(true);
    try {
      const archetypes = recentArchetypes();
      const script =
        mode === 'short'
          ? await generateShortScript({ apiKey, model: geminiModel }, topic, category, archetypes)
          : await generateLongScript(
              { apiKey, model: geminiModel },
              topic,
              category,
              Math.max(3, Math.min(6, Number.parseInt(chapters, 10) || 4)),
              archetypes
            );

      const issues = validateScript(script);
      const errors = issues.filter((i) => i.severity === 'error');

      const proceed = () => {
        const project = createProject({ topic, category, script });
        if (route.params.topicId) markTopicUsed(route.params.topicId);
        nav.replace('Project', { id: project.id });
      };

      if (errors.length) {
        // A hard cap breach means the audio will not fit the clip budget, so make
        // the tradeoff explicit rather than letting it surface at render time.
        Alert.alert(
          'Guardrail breach',
          `${errors.map((e) => e.message).join('\n\n')}\n\nKeep it anyway, or regenerate?`,
          [
            { text: 'Regenerate', style: 'cancel', onPress: () => void generate() },
            { text: 'Keep anyway', onPress: proceed },
          ]
        );
      } else {
        proceed();
      }
    } catch (e) {
      Alert.alert('Generation failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'short', label: '9:16 Short' },
          { value: 'long', label: '16:9 Deep Dive' },
        ]}
      />

      <Card>
        <H2>{mode === 'short' ? 'Short-form brief' : 'Deep dive brief'}</H2>
        <Small>
          {mode === 'short'
            ? '55–70 spoken words across hook, mechanism and reframe. Three ~10s hero clips.'
            : '450–700 spoken words. Cold open, chapters, closing synthesis — two hero clips and one connective still per chapter.'}
        </Small>
      </Card>

      <Card>
        <Field
          label="Topic"
          value={topic}
          onChangeText={setTopic}
          placeholder="e.g. Why being left on read triggers a threat response"
          multiline
        />

        <Small style={{ marginBottom: space.xs }}>Category</Small>
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              label={c}
              variant={c === category ? 'primary' : 'ghost'}
              onPress={() => setCategory(c)}
              style={{ paddingHorizontal: space.md, minHeight: 38 }}
            />
          ))}
        </Row>

        {mode === 'long' ? (
          <Field label="Chapters (3–6)" value={chapters} onChangeText={setChapters} keyboardType="numeric" />
        ) : null}

        <Button label={busy ? 'Writing…' : 'Generate script'} onPress={generate} loading={busy} />
      </Card>

      <Card>
        <Body style={{ color: colors.textDim }}>
          The style lock is appended to every visual prompt automatically, and archetypes from your last ten
          projects are excluded so characters never repeat.
        </Body>
      </Card>
    </Screen>
  );
}
