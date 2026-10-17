import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, InteractionManager, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Badge, Body, Button, Card, Divider, Field, H2, H3, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { useStudio } from '@/store';
import { clearKey, describeSanitisation, getKey, maskKey, sanitiseKey, setKey } from '@/services/keys';
import { describeElevenLabsKey } from '@/core/keyHygiene';
import { verifyGeminiKey } from '@/services/gemini';
import { verifyAnthropicKey } from '@/services/anthropic';
import { diagnoseKey, verifyElevenLabsKey } from '@/services/elevenlabs';
import { authorize, fetchChannel, redirectUri } from '@/services/youtube';
import { redirectSchemeFor, schemeIsRegistered } from '@/core/oauth';
import { listModels, PROVIDERS, type ProviderId } from '@/services/scriptProvider';
import { listImageModels } from '@/services/imagen';
import * as audioCache from '@/services/audioCache';
import { formatBytes, workspaceSize } from '@/services/workspace';
import { ANDROID_PACKAGE, formattedSha1 } from '@/core/androidIdentity';
import { testYouTubeKey } from '@/services/research';
import { DEFAULT_ENTITY_BLOCKLIST, DEFAULT_PODCAST_TERMS } from '@/core/researchConfig';
import { parseTermList } from '@/core/relevanceChecks';
import {
  DEFAULT_CHANNEL_CONFIG,
  flowProblems,
  scheduleProblems,
  shortClipCap,
  type ChannelConfig,
} from '@/core/channelConfig';
import { HERO_CLIPS, HOOK_CLIPS } from '@/core/hybridPlan';
import { forecastPeriods, measuredShortCost, type BudgetItem } from '@/core/flowBudget';
import { exportGateLog } from '@/services/bankImport';
import { NEUTRAL_TERMS } from '@/core/neutralLint';
import { HOOT_POSES, HOOT_VERSION } from '@/core/hoot';
import { PLAYLIST_SLOT_LABELS } from '@/core/playlists';
import { useMounted } from '@/util/useMounted';

type StoredKeys = Record<'gemini' | 'anthropic' | 'eleven' | 'youtubeApiKey' | 'youtubeClientId', string | null>;

type RulesDraft = {
  primarySlot: string;
  fallbackSlot: string;
  latestAllowed: string;
  longformSlot: string;
  minGapHoursShort: string;
  minGapHoursAny: string;
  cardSeconds: string;
  preRollMs: string;
  conceptTerms: string;
  creditsPerClip: string;
  shortDailyFree: string;
  monthlyPool: string;
  poolResetDay: string;
  longformCredits: string;
  longformCap: string;
};

function toRulesDraft(c: ChannelConfig): RulesDraft {
  return {
    primarySlot: c.schedule.primarySlot,
    fallbackSlot: c.schedule.fallbackSlot,
    latestAllowed: c.schedule.latestAllowed,
    longformSlot: c.schedule.longformSlot,
    minGapHoursShort: String(c.schedule.minGapHoursShort),
    minGapHoursAny: String(c.schedule.minGapHoursAny),
    cardSeconds: String(c.hook.cardSeconds),
    preRollMs: String(c.hook.maxPreRollMs),
    conceptTerms: c.titles.conceptTerms.join(', '),
    creditsPerClip: String(c.flow.creditsPerClip),
    shortDailyFree: String(c.flow.shortDailyFree),
    monthlyPool: String(c.flow.monthlyPool),
    poolResetDay: String(c.flow.poolResetDay),
    longformCredits: String(c.flow.longformCredits),
    longformCap: String(c.flow.longformCap),
  };
}

export default function SettingsScreen() {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const entityBlocklist = useStudio((s) => s.research.entityBlocklist);
  const podcastTerms = useStudio((s) => s.research.podcastTerms);
  const layer2Enabled = useStudio((s) => s.research.layer2Enabled);
  const updateResearch = useStudio((s) => s.updateResearch);
  const [blocklistDraft, setBlocklistDraft] = useState(entityBlocklist.join(', '));
  const [podcastDraft, setPodcastDraft] = useState(podcastTerms.join(', '));
  const [neutralDraft, setNeutralDraft] = useState(useStudio.getState().settings.neutralTerms.join(', '));
  const channelConfig = useStudio((s) => s.channelConfig);
  const updateChannelConfig = useStudio((s) => s.updateChannelConfig);
  const [rules, setRules] = useState(() => toRulesDraft(channelConfig));
  const projects = useStudio((s) => s.projects);
  const bank = useStudio((s) => s.bank);
  const weekPlan = useStudio((s) => s.weekPlan);
  const measured = measuredShortCost(projects, channelConfig.flow);
  const forecast = useMemo(() => {
    if (!weekPlan) return [];
    const items: BudgetItem[] = [
      ...weekPlan.days.map((d: any) => ({ id: d.entryId, day: d.day, kind: 'short' as const })),
      ...(weekPlan.long ?? []).map((l: any) => {
        const e: any = bank.find((b: any) => b.id === l.entryId);
        const credits = e && e.kind === 'long' && 'screenplay' in e ? e.screenplay?.flow_budget_credits : undefined;
        return { id: l.entryId, day: l.day, kind: 'long' as const, ...(credits ? { credits } : {}) };
      }),
    ];
    return forecastPeriods(items, channelConfig.flow, measured);
  }, [weekPlan, bank, channelConfig.flow, measured]);
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
  const [linkedChannel, setLinkedChannel] = useState<string | null>(null);
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

  // A sign-out elsewhere in the app (an expired grant) should show here on return.
  useFocusEffect(
    useCallback(() => {
      void refreshStored();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

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

  const [testingYouTubeKey, setTestingYouTubeKey] = useState(false);

  /** Spends one quota unit to prove the research key works before a run depends on it. */
  const testKey = async () => {
    const key = await getKey('youtubeApiKey');
    if (!key) return;
    setTestingYouTubeKey(true);
    const result = await testYouTubeKey(key);
    setTestingYouTubeKey(false);
    if (result.ok) useStudio.getState().chargeResearchQuota(1);
    Alert.alert(
      result.ok ? 'Key works' : 'Key failed',
      result.ok ? 'YouTube accepted the key. Research is ready.' : result.message,
    );
  };

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
    const saved: string[] = [];

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
        saved.push('Gemini');
        if (!(await verifyGeminiKey(clean.gemini))) {
          warnings.push('Gemini did not accept that key — saved anyway, but generation will fail until it is right.');
        }
      }

      if (clean.anthropic) {
        await setKey('anthropic', clean.anthropic);
        saved.push('Anthropic');
        if (!(await verifyAnthropicKey(clean.anthropic))) {
          warnings.push('Anthropic did not accept that key — saved anyway.');
        }
      }

      if (clean.eleven) {
        await setKey('elevenlabs', clean.eleven);
        saved.push('ElevenLabs');

        // Shape is checked before the network call: a masked or truncated paste
        // explains a rejection far better than a bare 401 does.
        const shape = describeElevenLabsKey(clean.eleven);
        if (!shape.looksValid) warnings.push(`ElevenLabs key shape: ${shape.summary}`);

        const check = await verifyElevenLabsKey(clean.eleven);
        if (!check.ok) warnings.push(`ElevenLabs: ${check.reason ?? 'could not verify'}`);
      }

      if (clean.youtubeApiKey) {
        await setKey('youtubeApiKey', clean.youtubeApiKey);
        saved.push('YouTube API key');
      }

      if (clean.youtubeClientId) {
        await setKey('youtubeClientId', clean.youtubeClientId);
        saved.push('YouTube client ID');
      }

      setDraft({ gemini: '', anthropic: '', eleven: '', youtubeApiKey: '', youtubeClientId: '' });
      await refreshStored();

      Alert.alert(
        warnings.length ? 'Saved with warnings' : 'Saved',
        warnings.length ? warnings.join('\n\n') : 'Keys stored on this device.',
      );
    } catch (e) {
      // The keystore can refuse a write; say which keys made it so nothing is silently lost.
      Alert.alert(
        'Keys not saved',
        `${e instanceof Error ? e.message : String(e)}\n\n${saved.length ? `Saved: ${saved.join(', ')}. ` : ''}The rest were not stored — try Save again.`,
      );
      await refreshStored().catch(() => undefined);
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
      ].join('\n'),
    );
  };

  /** Runs the Google consent flow using the stored client ID. */
  const signInToYouTube = async () => {
    const clientId = await getKey('youtubeClientId');
    if (!clientId) {
      Alert.alert('Client ID needed', 'Paste your Android OAuth client ID above and save it first.');
      return;
    }

    // The redirect scheme is baked into the APK; a client ID it doesn't match can never complete sign-in.
    if (!schemeIsRegistered(clientId, Constants.expoConfig?.scheme)) {
      const scheme = Constants.expoConfig?.scheme;
      const list = (Array.isArray(scheme) ? scheme : [scheme])
        .filter((s): s is string => typeof s === 'string' && s.startsWith('com.googleusercontent'))
        .join('\n');
      Alert.alert(
        'This build cannot receive that client',
        `This APK can only accept a redirect for:\n\n${list || '(none registered)'}\n\nThat client ID needs:\n${redirectSchemeFor(clientId)}\n\nUse the original client ID, or ask for a build that registers this one.`,
      );
      return;
    }

    setSigningIn(true);
    try {
      const tokens = await authorize(clientId);
      await setKey('youtubeTokens', JSON.stringify(tokens));
      if (mounted.current) setYoutubeSignedIn(true);
      let title: string | null = null;
      try {
        title = (await fetchChannel({ kind: 'oauth', accessToken: tokens.accessToken })).title;
      } catch {
        // The sign-in itself worked; the channel name is only a confirmation.
      }
      if (mounted.current) setLinkedChannel(title);
      Alert.alert(
        'Signed in',
        title
          ? `Linked to "${title}".\n\nIf that is the wrong channel, tap "Unlink this channel" and sign in again.`
          : 'Signed in, but the channel could not be read. Check that this Google account has a YouTube channel.',
      );
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSigningIn(false);
    }
  };

  const unlinkYouTube = () => {
    Alert.alert(
      'Unlink this channel?',
      'The app forgets its YouTube sign-in. Your API keys and projects are untouched, and signing in again lets you pick a different Google account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            await clearKey('youtubeTokens');
            if (mounted.current) {
              setYoutubeSignedIn(false);
              setLinkedChannel(null);
            }
            await refreshStored();
          },
        },
      ],
    );
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
        'In that client\'s Advanced Settings, turn ON "Custom URI scheme". Google disables it by default now, and without it sign-in fails with "Error 400: invalid_request — Custom URI scheme is not enabled for your Android client."',
        '',
        'Enable YouTube Data API v3, add the youtube and youtube.upload scopes to the consent screen, and add your own Google account as a test user while the app is unverified.',
        '',
        'Stop weekly sign-outs: while the consent screen is in "Testing", Google revokes the sign-in every 7 days. Once sign-in works, open Google Auth Platform → Audience and press "Publish app" (In production). No review is needed for your own use; Google shows an "unverified app" warning at sign-in — tap Advanced → Go to the app.',
        '',
        clientId ? `Redirect URI in use:\n${redirectUri(clientId)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
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

  const saveRules = () => {
    const schedule = {
      ...channelConfig.schedule,
      primarySlot: rules.primarySlot.trim(),
      fallbackSlot: rules.fallbackSlot.trim(),
      latestAllowed: rules.latestAllowed.trim(),
      longformSlot: rules.longformSlot.trim(),
      minGapHoursShort: Number(rules.minGapHoursShort),
      minGapHoursAny: Number(rules.minGapHoursAny),
    };
    const flow = {
      creditsPerClip: Number(rules.creditsPerClip),
      shortDailyFree: Number(rules.shortDailyFree),
      monthlyPool: Number(rules.monthlyPool),
      poolResetDay: Number(rules.poolResetDay),
      longformCredits: Number(rules.longformCredits),
      longformCap: Number(rules.longformCap),
    };
    const problems = [...scheduleProblems(schedule), ...flowProblems(flow)];
    const cardSeconds = Number(rules.cardSeconds);
    const preRoll = Number(rules.preRollMs);
    if (!(cardSeconds >= 1 && cardSeconds <= 5)) problems.push('Title card seconds must be 1 to 5.');
    if (!(preRoll >= 0 && preRoll <= 500)) problems.push('Pre-roll must be 0 to 500 ms.');
    if (problems.length) {
      Alert.alert('Not saved', problems.join('\n'));
      return;
    }
    updateChannelConfig({
      schedule,
      flow,
      hook: { cardSeconds, maxPreRollMs: preRoll },
      titles: { conceptTerms: parseTermList(rules.conceptTerms) },
    } as any);
    Alert.alert('Saved', 'New slots apply to the next schedule; the title and hook rules to the next script and render.');
  };

  const ruleField = (key: keyof RulesDraft) => (v: string) => setRules((r) => ({ ...r, [key]: v }));

  const activeModel = settings.scriptProvider === 'anthropic' ? settings.anthropicModel : settings.geminiModel;

  const setActiveModel = (id: string) =>
    updateSettings(settings.scriptProvider === 'anthropic' ? { anthropicModel: id } : { geminiModel: id });

  const clipCap = shortClipCap(channelConfig.flow);
  const weekday = channelConfig.schedule.longformWeekday;

  return (
    <Screen>
      <Card>
        <H2>Settings</H2>
        <Small>
          Keys are stored in the Android keystore on this device and are never sent anywhere but the APIs they
          belong to.
        </Small>
      </Card>

      <Card>
        <H3>Topic source</H3>
        <Small>
          Imported bank: topics come from bank files you import on the Topics screen, and the model is never asked
          for topic ideas. AI refill is the older option that asks the model for eight ideas.
        </Small>
        <Segmented
          value={settings.topicSource}
          onChange={(v: string) => updateSettings({ topicSource: v })}
          options={[
            { value: 'bank', label: 'Imported bank' },
            { value: 'ai', label: 'AI refill (legacy)' },
          ]}
        />
      </Card>

      <Card>
        <H3>Shot planning for bank scripts</H3>
        <Small>
          {settings.shotPlanner === 'phone'
            ? "On the phone: the character and shot list are planned from the bank's visual brief, instantly and with no AI call."
            : 'AI planner: one call to the script provider plans the character and shots. If it is busy or fails, the phone plans them instead.'}{' '}
          Either way, the bank's words are never changed.
        </Small>
        <Segmented
          value={settings.shotPlanner}
          onChange={(v: string) => updateSettings({ shotPlanner: v })}
          options={[
            { value: 'phone', label: 'On the phone' },
            { value: 'ai', label: 'AI planner' },
          ]}
        />
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
            Providers retire model names without warning. If generation returns a 404, load the list and pick a
            current one.
          </Small>
        )}
      </Card>

      <Card>
        <H3>Flow clip budget</H3>
        <Small>
          How many shots per Short may be generated video. Everything else becomes a still that the renderer pushes
          in on — a fraction of the cost, and for a prop, a screen or a hand it looks the same once it is moving.
          Lower this if Flow credits are tight; the shot count stays the same either way.
        </Small>
        <Field
          label="Generated clips per Short"
          value={String(settings.shortClipBudget)}
          onChangeText={(v) => {
            const n = Number(v.replace(/[^0-9]/g, ''));
            updateSettings({ shortClipBudget: Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : 0 });
          }}
          keyboardType="numeric"
        />
        {settings.shortClipBudget > clipCap ? (
          <Small style={{ color: colors.warn }}>
            The free {channelConfig.flow.shortDailyFree} Flow credits a day pay for {clipCap} clip
            {clipCap === 1 ? '' : 's'} at {channelConfig.flow.creditsPerClip} each, so Shorts are planned with{' '}
            {clipCap} (CR-50).
          </Small>
        ) : null}
        <Small>
          Long-forms are held to {channelConfig.flow.longformCap} Flow credits each, retries included (CR-66): up to{' '}
          {HOOK_CLIPS} Veo clips over the first 30 s and {HERO_CLIPS} hero clips, at {channelConfig.flow.creditsPerClip}{' '}
          credits each, from the {channelConfig.flow.monthlyPool.toLocaleString()}-credit monthly pool. Stills made in
          the Gemini app and cards the app draws carry the rest. A long-form made from a screenplay carries its own
          budget (200 credits, about 10 clips). Edit the numbers under Channel rules.
        </Small>
        <Divider />
        <H3>Flow budget (CR-75)</H3>
        <Small>
          Forecast: the scheduled Shorts at {measured} credits each (measured from the last ten you made, 60 until
          there are any), the long-forms at their own budgets, and a 10% retry buffer, against the free{' '}
          {channelConfig.flow.shortDailyFree} credits a day plus the {channelConfig.flow.monthlyPool.toLocaleString()}
          -credit pool. A plan that goes over is flagged in the Topic Bank.
        </Small>
        {forecast.length ? (
          forecast.map((p) => (
            <Small key={p.period} style={{ color: p.over ? colors.danger : colors.text, marginTop: space.xs }}>
              From {p.period}: {p.total.toLocaleString()} of {p.available.toLocaleString()} credits ({p.shorts} Shorts,{' '}
              {p.longs.length} long-form{p.longs.length === 1 ? '' : 's'}){p.over ? ' — over budget' : ''}
            </Small>
          ))
        ) : (
          <Small>Nothing is scheduled yet; plan the queue in the Topic Bank to see the month.</Small>
        )}
      </Card>

      <Card>
        <H3>Shorts engagement (CR-80E)</H3>
        <Small>
          The description questions are not visible in the Shorts feed. With this on, a bank Short shows its closing
          question on screen for the last 2 s. It is never spoken, so the narration and the loop into the hook stay as
          written. After publishing, a task card asks you to pin the comment and reply to every comment in the first
          hour.
        </Small>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>Closing question on screen</Body>
          <Switch value={settings.endQuestionCard} onValueChange={(v) => updateSettings({ endQuestionCard: v })} />
        </Row>
        <Small>
          Spoken sign-off (CR-82E): "…and that's the mind for you. Stay curious, stay sharp." is the weakest 4 seconds
          of a Short. Switch it off and a SIGNOFF Short is voiced without it and ends on the words "Stay curious, stay
          sharp." as end-card text for 2 s instead. Applies to Shorts you start from now on.
        </Small>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>Speak the sign-off</Body>
          <Switch value={settings.spokenSignoff} onValueChange={(v) => updateSettings({ spokenSignoff: v })} />
        </Row>
      </Card>

      <Card>
        <H3>Style test (CR-84B)</H3>
        <Small>
          Two Short styles, one a day, to see which holds viewers. P (punchy): word captions, a cut at least every 2.5
          s. C (calm cinematic): four long shots (about 6 s each) with slow moves, captions as phrases in the lower
          third, an ambient bed, dark moody light for every topic, calm voice. Auto alternates them from one Short to
          the next. Five Shorts each, read at 72 hours; a gap over 10 points in "stayed to watch" is a signal, less is
          noise. Applies to Shorts you start from now on.
        </Small>
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          {(['auto', 'P', 'C'] as const).map((p) => (
            <Button
              key={p}
              label={p === 'auto' ? 'Auto (alternate)' : p === 'P' ? 'Always P' : 'Always C'}
              variant={settings.styleProfile === p ? 'primary' : 'secondary'}
              onPress={() => updateSettings({ styleProfile: p })}
            />
          ))}
        </Row>
        <Small>
          No mascot (CR-91): Hoot is never drawn, on Shorts or long-form. Optional: a small "@TheMindFiles" text at 40%
          opacity in a Short's top-left corner.
        </Small>
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          {[false, true].map((v) => (
            <Button
              key={String(v)}
              label={v ? '@TheMindFiles text' : 'No watermark'}
              variant={settings.textWatermark === v ? 'primary' : 'secondary'}
              onPress={() => updateSettings({ textWatermark: v })}
            />
          ))}
        </Row>
        <Small>
          Captions (CR-87B). Phrases of 5 to 7 words in the lower third, never over the face. Word-by-word is kept as a
          setting for profile P.
        </Small>
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          {[false, true].map((v) => (
            <Button
              key={String(v)}
              label={v ? 'Word by word (P)' : 'Phrases'}
              variant={settings.wordCaptions === v ? 'primary' : 'secondary'}
              onPress={() => updateSettings({ wordCaptions: v })}
            />
          ))}
        </Row>
        <Small>
          Voice pace (CR-86C). Calm slows the narration to about 2.1 words a second. Profile C Shorts are always calm.
          Applies to voiceovers made from now on.
        </Small>
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          {(['normal', 'calm'] as const).map((p) => (
            <Button
              key={p}
              label={p === 'normal' ? 'Normal' : 'Calm'}
              variant={settings.narrationPace === p ? 'primary' : 'secondary'}
              onPress={() => updateSettings({ narrationPace: p })}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <H3>Queue debug (CR-81A)</H3>
        <Small>
          Shows, under each relaxed or empty day in the Topic Bank queue, the topics that were rejected and the rotation
          rule that rejected each.
        </Small>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>Show why topics were rejected</Body>
          <Switch value={settings.planDebug} onValueChange={(v) => updateSettings({ planDebug: v })} />
        </Row>
      </Card>

      <Card>
        <H3>Neutral cast (CR-78)</H3>
        <Small>
          The channel is for a global audience: no city, country, festival, food, currency, name or "flat" (apartment)
          tied to one place in a script, a vignette or a picture prompt. The cast is Maya, Alex, Leo, Nora and Ryan.
          Applied everywhere (CR-92): the import gate refuses an unpublished topic with one, and the long-form QA gate
          blocks it, on {NEUTRAL_TERMS.length} built-in words such as rupee, chai, Diwali, Mumbai and Indian first
          names. Add your own here, separated by commas. The posting clock (India time) is not affected.
        </Small>
        <Field
          label="Extra words to flag"
          value={neutralDraft}
          onChangeText={setNeutralDraft}
          placeholder="e.g. cricket, monsoon"
          autoCapitalize="none"
        />
        <Button
          label="Save the words"
          variant="secondary"
          onPress={() => {
            const terms = parseTermList(neutralDraft);
            setNeutralDraft(terms.join(', '));
            updateSettings({ neutralTerms: terms });
          }}
        />
      </Card>

      <Card>
        <H3>Authenticity gate</H3>
        <Small>
          Every render is checked first: human review, similarity to recent uploads, a source, the hook rules and the
          length (CR-45 to CR-47). The checks can't be switched off (CR-57). The log is your evidence if a
          monetization review ever needs appealing.
        </Small>
        <Field
          label="Reviewer name"
          value={settings.reviewerName}
          onChangeText={(v) => updateSettings({ reviewerName: v })}
          placeholder="Your name"
        />
        <Button
          label="Export the gate log"
          variant="secondary"
          onPress={() => {
            exportGateLog().catch((e) => Alert.alert('Export failed', e instanceof Error ? e.message : String(e)));
          }}
        />
      </Card>

      <Card>
        <H3>Image model</H3>
        <Small>
          Used for the connective stills. Imagen is not enabled on every Gemini key — if stills return a 404, load the
          list and pick one that is.
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
          Every synthesis is cached by the exact text and voice, so re-rendering or retrying never bills the same words
          twice. The cache survives deleting a project.
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
            Alert.alert('Clear audio cache', 'Re-synthesising anything cleared will spend characters again. Continue?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: () => {
                  audioCache.clear();
                  setCache({ entries: 0, bytes: 0, charactersSaved: 0 });
                },
              },
            ])
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
          Keys are always saved. Verification runs afterwards and only warns, so a scoped key that works for one service
          is never thrown away.
        </Small>
      </Card>

      <Card>
        <H3>YouTube</H3>
        <Small>
          An API key browses public uploads with no sign-in. Signing in on the Publish screen also shows unlisted and
          private videos, and is required to publish.
        </Small>
        <KeyRow label="YouTube API key" value={stored.youtubeApiKey} />
        <Field
          label="New YouTube API key"
          value={draft.youtubeApiKey}
          onChangeText={(v) => setDraft((d) => ({ ...d, youtubeApiKey: v }))}
          autoCapitalize="none"
          secure
        />
        {stored.youtubeApiKey ? (
          <Button
            label={testingYouTubeKey ? 'Testing…' : 'Test key'}
            variant="secondary"
            loading={testingYouTubeKey}
            onPress={() => void testKey()}
          />
        ) : null}
        <Small>
          The same key runs Outlier Research. To set it up: in Google Cloud Console, enable "YouTube Data API v3" and
          create an API key. Restrict it to that API, and if you restrict it to this app use package {ANDROID_PACKAGE}{' '}
          with SHA-1 {formattedSha1()}. Research spends the project's free daily quota (10,000 units), shared with
          publishing if the OAuth client is in the same project.
        </Small>
        <Field
          label="Channel ID (needed for API key access)"
          value={settings.youtubeChannelId}
          onChangeText={(v) => updateSettings({ youtubeChannelId: v.trim() })}
          placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
          autoCapitalize="none"
        />
        <Small style={{ color: colors.textFaint }}>
          Find it at youtube.com/account_advanced. An API key cannot ask "which channel is mine", so it has to be named.
        </Small>

        <Divider />

        <Row style={{ justifyContent: 'space-between' }}>
          <H3>Sign in to publish</H3>
          <Badge label={youtubeSignedIn ? 'SIGNED IN' : 'SIGNED OUT'} tone={youtubeSignedIn ? 'ok' : 'neutral'} />
        </Row>
        <Small>
          Publishing, and seeing unlisted or private uploads, needs Google sign-in rather than an API key. Android OAuth
          clients issue no secret, so nothing sensitive is stored in the app.
        </Small>
        {linkedChannel ? <KeyRow label="Linked channel" value={linkedChannel} /> : null}
        <KeyRow label="OAuth client ID" value={stored.youtubeClientId} />
        <Field
          label="Android OAuth client ID"
          value={draft.youtubeClientId}
          onChangeText={(v) => setDraft((d) => ({ ...d, youtubeClientId: v }))}
          placeholder="xxxxx.apps.googleusercontent.com"
          autoCapitalize="none"
        />
        <Small style={{ color: colors.textFaint }}>
          Signed out about every 7 days? Your Google Cloud consent screen is in "Testing", where Google revokes sign-ins
          weekly. Fix once: Google Auth Platform → Audience → "Publish app". Details below.
        </Small>
        <Button label="Show setup details" variant="ghost" onPress={showOAuthSetup} />
        <Button
          label={youtubeSignedIn ? 'Sign in with a different account' : 'Sign in with Google'}
          variant={youtubeSignedIn ? 'ghost' : 'primary'}
          loading={signingIn}
          onPress={signInToYouTube}
        />
        {youtubeSignedIn ? <Button label="Unlink this channel" variant="danger" onPress={unlinkYouTube} /> : null}
      </Card>

      <Card>
        <H3>Channel rules</H3>
        <Small>
          Times are {channelConfig.schedule.zoneLabel}. Shorts go public at the primary slot, or the fallback if not
          ready in time; never after the latest time; never two Shorts within the gap. One long-form a week, on{' '}
          {weekday ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}days` : 'any day'} at the long-form slot
          (CR-50).
        </Small>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Primary slot" value={rules.primarySlot} onChangeText={ruleField('primarySlot')} autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Fallback slot" value={rules.fallbackSlot} onChangeText={ruleField('fallbackSlot')} autoCapitalize="none" />
          </View>
        </Row>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Latest allowed" value={rules.latestAllowed} onChangeText={ruleField('latestAllowed')} autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Long-form slot" value={rules.longformSlot} onChangeText={ruleField('longformSlot')} autoCapitalize="none" />
          </View>
        </Row>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Hours between Shorts"
              value={rules.minGapHoursShort}
              onChangeText={ruleField('minGapHoursShort')}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Hours, long-form to any"
              value={rules.minGapHoursAny}
              onChangeText={ruleField('minGapHoursAny')}
              keyboardType="numeric"
            />
          </View>
        </Row>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Title card seconds" value={rules.cardSeconds} onChangeText={ruleField('cardSeconds')} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Voice pre-roll (ms)" value={rules.preRollMs} onChangeText={ruleField('preRollMs')} keyboardType="numeric" />
          </View>
        </Row>
        <Small style={{ fontWeight: '800', marginTop: space.sm }}>Google Flow credits (CR-50)</Small>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Credits per clip"
              value={rules.creditsPerClip}
              onChangeText={ruleField('creditsPerClip')}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Free credits a day (Shorts)"
              value={rules.shortDailyFree}
              onChangeText={ruleField('shortDailyFree')}
              keyboardType="numeric"
            />
          </View>
        </Row>
        <Row style={{ gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Monthly pool (long-form)"
              value={rules.monthlyPool}
              onChangeText={ruleField('monthlyPool')}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Pool resets on day"
              value={rules.poolResetDay}
              onChangeText={ruleField('poolResetDay')}
              keyboardType="numeric"
            />
          </View>
        </Row>
        <Field
          label="Credit cap per long-form (retries included)"
          value={rules.longformCap}
          onChangeText={ruleField('longformCap')}
          keyboardType="numeric"
        />
        <Field
          label="Credits per older (non-v2) long-form"
          value={rules.longformCredits}
          onChangeText={ruleField('longformCredits')}
          keyboardType="numeric"
        />
        <Field
          label="Concept terms a title must not open with"
          value={rules.conceptTerms}
          onChangeText={ruleField('conceptTerms')}
          multiline
          autoCapitalize="none"
        />
        <Button label="Save channel rules" variant="secondary" onPress={saveRules} />
        <Button
          label="Reset to defaults"
          variant="ghost"
          onPress={() => {
            updateChannelConfig(DEFAULT_CHANNEL_CONFIG);
            setRules(toRulesDraft(DEFAULT_CHANNEL_CONFIG));
          }}
        />
      </Card>

      <Card>
        <H3>Research</H3>
        <Small>
          Outlier Research drops a Short whose title, hashtags or channel name carries one of these names (fan edits
          and TV clips), and flags podcast clips instead of dropping them. Separate entries with commas.
        </Small>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>LLM relevance check (layer 2)</Body>
            <Small>
              The script model labels each title that passed the word filters: explainer, clip, skit, motivation,
              long-form clip or off-topic. Only explainers are kept. Labels are cached for 30 days; if the model fails,
              the run carries on with the word filters alone.
            </Small>
          </View>
          <Switch
            value={layer2Enabled !== false}
            onValueChange={(v) => updateResearch({ layer2Enabled: v })}
            trackColor={{ true: colors.accentDim, false: colors.border }}
            thumbColor={layer2Enabled !== false ? colors.accent : colors.textFaint}
          />
        </Row>
        <Field
          label="Fandom and TV names (dropped)"
          value={blocklistDraft}
          onChangeText={setBlocklistDraft}
          multiline
          autoCapitalize="none"
        />
        <Field
          label="Podcast clip names (flagged)"
          value={podcastDraft}
          onChangeText={setPodcastDraft}
          multiline
          autoCapitalize="none"
        />
        <Button
          label="Save research lists"
          variant="secondary"
          onPress={() => {
            const blocklist = parseTermList(blocklistDraft);
            const podcasts = parseTermList(podcastDraft);
            updateResearch({ entityBlocklist: blocklist, podcastTerms: podcasts });
            setBlocklistDraft(blocklist.join(', '));
            setPodcastDraft(podcasts.join(', '));
            Alert.alert(
              'Saved',
              `${blocklist.length} names dropped, ${podcasts.length} flagged. "Re-score saved run" on the Research tab applies them for free.`,
            );
          }}
        />
        <Button
          label="Reset to defaults"
          variant="ghost"
          onPress={() => {
            updateResearch({ entityBlocklist: [...DEFAULT_ENTITY_BLOCKLIST], podcastTerms: [...DEFAULT_PODCAST_TERMS] });
            setBlocklistDraft(DEFAULT_ENTITY_BLOCKLIST.join(', '));
            setPodcastDraft(DEFAULT_PODCAST_TERMS.join(', '));
          }}
        />
      </Card>

      <Card>
        <H3>Write from results</H3>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Use channel performance</Body>
            <Small>
              Feeds your best and worst performing titles into script and topic generation, so new ideas lean on what
              this audience actually responded to.
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
          Needs YouTube connected, and at least four published videos older than two days — below that there is not
          enough signal to be worth following.
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
          Retired (CR-91): the Gemini audits found the mascot hurt the channel, so no render draws him, on Shorts,
          long-form or thumbnails. The asset pack v{HOOT_VERSION} ({HOOT_POSES.length} states) stays in the app only so
          older projects open.
        </Small>
      </Card>

      <Card>
        <H3>Playlists (CR-60)</H3>
        <Small>
          Each long-form joins its format's playlist when it uploads, and Manipulation & Defense videos the defence
          playlist too. A playlist that doesn't exist yet is created, public, with this exact name. Leave a name empty
          for none.
        </Small>
        {Object.keys(PLAYLIST_SLOT_LABELS).map((key) => (
          <Field
            key={key}
            label={PLAYLIST_SLOT_LABELS[key]}
            value={settings.playlistNames[key] ?? ''}
            onChangeText={(v) => updateSettings({ playlistNames: { ...settings.playlistNames, [key]: v } })}
          />
        ))}
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
