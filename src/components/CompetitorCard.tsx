import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Body, Button, Card, Field, H2, H3, Row, Small } from '@/components/ui';
import { space } from '@/theme';
import { useStudio } from '@/store';
import { addChannel, MAX_CHANNELS, playbookChannels, SEEDS } from '@/core/discovery';
import { patternTable } from '@/core/formatDna';
import { findChannel, registryChannels, resolveSeed, runDiscovery } from '@/services/competitors';
import type { ChannelRef } from '@/services/youtube';
import { useMounted } from '@/util/useMounted';

type Busy = 'find' | 'seeds' | 'discover' | null;

/** The watched competitor channels, the discovery inbox, and the title shapes that win. */
export default function CompetitorCard() {
  const weekly = useStudio((s) => s.weekly);
  const bank = useStudio((s) => s.bank);
  const setChannels = useStudio((s) => s.setChannels);
  const dismissSuggested = useStudio((s) => s.dismissSuggested);
  const mounted = useMounted();
  const channels = weekly.channels ?? playbookChannels(new Date(0));
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ChannelRef[]>([]);
  const [busy, setBusy] = useState<Busy>(null);

  const add = (c: { id: string; name: string; handle?: string }, source: string) => {
    const r = addChannel(registryChannels(), {
      id: c.id,
      name: c.name,
      ...(c.handle ? { handle: c.handle } : {}),
      addedAt: new Date().toISOString(),
      source,
    });
    if (r.error) {
      Alert.alert('Not added', r.error);
      return;
    }
    setChannels(r.list);
    setCandidates([]);
    setQuery('');
  };

  const search = async () => {
    setBusy('find');
    try {
      const found = await findChannel(query);
      if (!mounted.current) return;
      setCandidates(found);
      if (!found.length) {
        Alert.alert(
          'No channel found',
          "Try the channel URL, its @handle or its UCxxxx ID. A name search costs 100 of the day's 10,000 quota units; a URL or handle costs 1.",
        );
      }
    } catch (e) {
      Alert.alert('Could not search', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  /** Resolves the brief's seed channels; any that are ambiguous are left for the user to pick. */
  const seeds = async () => {
    setBusy('seeds');
    try {
      const unresolved: string[] = [];
      for (const seed of SEEDS) {
        if (registryChannels().some((c) => c.name.toLowerCase() === seed.name.toLowerCase())) continue;
        const r = await resolveSeed(seed);
        if (r.kind === 'resolved') {
          add(r.channel, 'seed');
        } else {
          unresolved.push(seed.name);
          if (mounted.current) setCandidates((c) => [...c, ...r.candidates]);
        }
      }
      if (unresolved.length) {
        Alert.alert(
          'Pick these yourself',
          `${unresolved.join(', ')} did not resolve to exactly one channel. The candidates are listed under Add a channel: tap the right one.`,
        );
      }
    } catch (e) {
      Alert.alert('Could not look up the seeds', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const discover = async () => {
    setBusy('discover');
    try {
      const r = await runDiscovery(bank.map((e: any) => e.title));
      Alert.alert(
        'Discovery',
        `${r.searches} topic search${r.searches === 1 ? '' : 'es'} (${r.searches * 100} quota units). ${r.suggested.length} channel${r.suggested.length === 1 ? '' : 's'} in the inbox.` +
          (r.errors.length ? `\n\nNot read: ${r.errors.join('; ')}` : ''),
      );
    } catch (e) {
      Alert.alert('Could not run discovery', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const patterns = patternTable(weekly.competitorVideos ?? []);
  const suggested: any[] = weekly.suggested ?? [];

  return (
    <Card>
      <H2>
        Competitor channels ({channels.length}/{MAX_CHANNELS})
      </H2>
      <Small>
        The channels the Monday run reads: titles, view counts and dates only. No script, thumbnail, voice or music is
        ever fetched.
      </Small>
      {channels.map((c) => (
        <Row key={c.id} style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Body style={{ flex: 1, fontSize: 14 }}>{c.name}</Body>
          <Button
            label="Remove"
            variant="ghost"
            onPress={() => setChannels(channels.filter((x) => x.id !== c.id))}
          />
        </Row>
      ))}

      <H3>Add a channel</H3>
      <Field
        label="Name, @handle, URL or channel ID"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="@psych2go"
      />
      <Row style={{ gap: space.xs }}>
        <Button
          label={busy === 'find' ? 'Looking…' : 'Find'}
          loading={busy === 'find'}
          variant="secondary"
          onPress={() => void search()}
          disabled={!query.trim()}
        />
        <Button
          label={busy === 'seeds' ? 'Looking…' : "Find the brief's five"}
          loading={busy === 'seeds'}
          variant="ghost"
          onPress={() => void seeds()}
        />
      </Row>
      {candidates.map((c) => (
        <Row key={c.id} style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Small style={{ flex: 1 }}>
            {c.name}
            {c.handle ? ` · ${c.handle}` : ''}
          </Small>
          <Button label="Add" variant="ghost" onPress={() => add(c, 'user')} />
        </Row>
      ))}

      <H3>Suggested channels ({suggested.length})</H3>
      <Small>
        Found by searching your topics: new channels with a video at 2× their own median. Nothing is added until you tap
        Add.
      </Small>
      <Button
        label={busy === 'discover' ? 'Searching…' : 'Run discovery now'}
        loading={busy === 'discover'}
        variant="ghost"
        onPress={() => void discover()}
      />
      {suggested.map((s) => (
        <View key={s.id} style={{ marginTop: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ flex: 1, fontWeight: '800', fontSize: 14 }}>{s.name}</Body>
            <Badge label={`${s.video.score.toFixed(1)}×`} tone="ok" />
          </Row>
          <Small>Outlier: {s.video.title}</Small>
          <Row style={{ gap: space.xs }}>
            <Button
              label="Add"
              variant="ghost"
              onPress={() => {
                add({ id: s.id, name: s.name }, 'suggested');
                dismissSuggested(s.id);
              }}
            />
            <Button label="Dismiss" variant="ghost" onPress={() => dismissSuggested(s.id)} />
          </Row>
        </View>
      ))}

      <H3>Title patterns that win</H3>
      {patterns.length ? (
        <>
          <Small>
            Median views against each channel's own median, per title shape. The top three (8 videos or more) steer title
            suggestions.
          </Small>
          {patterns.slice(0, 14).map((p) => (
            <Row key={`${p.pattern}${p.format}`} style={{ justifyContent: 'space-between' }}>
              <Small style={{ flex: 1 }}>
                {p.pattern.replace('_', ' ').toLowerCase()} · {p.format}
              </Small>
              <Small>
                {p.videos} videos · {p.medianScore.toFixed(1)}× · {Math.round(p.outlierShare * 100)}% outliers
              </Small>
            </Row>
          ))}
        </>
      ) : (
        <Small>Appears after the first scan; it works offline from then on.</Small>
      )}
    </Card>
  );
}
