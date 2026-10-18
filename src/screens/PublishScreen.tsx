import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Badge, Button, Card, Empty, Field, H2, H3, ProgressBar, Row, Screen, Segmented, Small } from '@/components/ui';
import { colors, space } from '@/theme';
import { useStudio } from '@/store';
import { isV2, relatedShortIds } from '@/core/topicBank';
import { normalizeSeo } from '@/core/seoNormalizer';
import { ViralityCard } from '@/components/ViralityCard';
import { variantOf } from '@/core/viralityInput';
import { firstSentence, hookShell } from '@/core/virality';
import { passedGateFor } from '@/core/authenticity';
import { postPublishTasks, v2SeoInputs } from '@/core/funnel';
import { hasLongformLink, metadataProblems, withTitleHashtags } from '@/core/seoLint';
import { plannableLongs, poolUse, poolWarnings, rotationHistory, rotationProblems } from '@/core/rotation';
import { longClipCount } from '@/core/v2Script';
import { longDays } from '@/core/weekPlan';
import { KEYWORD_LABELS } from '@/core/researchConfig';
import { workingKeywords } from '@/core/researchHistory';
import { getKey, setKey } from '@/services/keys';
import { appendToDescription, ensureFreshToken, setThumbnail, shortsUrl, uploadVideo, watchUrl } from '@/services/youtube';
import { finishLongUpload, longUploadPending } from '@/services/longformPublish';
import { postPinnedComment } from '@/services/pinnedComment';
import { canSchedule, longBudget, measuredShortCost, projectItems } from '@/core/flowBudget';
import { buildChapterTimestamps } from '@/core/timestamps';
import { withPauseDurations } from '@/core/screenplayPlan';
import { alignmentDurations, fillSeoDescription, tagsLength } from '@/core/seoMeta';
import { proposeSeo } from '@/core/projectSeo';
import { auditSeo } from '@/core/seo';
import { probeDuration } from '@/services/ffmpeg';
import { checkShortTitle } from '@/core/hooks';
import {
  checkRelease,
  classifySlot,
  collectReleases,
  formatRelease,
  localParts,
  MIN_LEAD_MINUTES,
  nextValidSlot,
  slotAt,
  weekStrip,
} from '@/core/schedule';
import { lintTitle } from '@/core/titleRules';
import { watchScheduledRelease } from '@/services/releaseWatch';
import { deepDiveLine, findRelatedDeepDive, previousUploadTitle } from '@/core/related';
import { checkTitleGrammar } from '@/services/scriptProvider';
import { useMounted } from '@/util/useMounted';
import { applyHookVariant, variantTitle } from '@/core/hookVariants';
import type { LongScript, ShortScript } from '@/core/types';
import type { RootStackParamList } from '@/navigation/types';

type Choice = { text: string; value: string; style?: 'cancel' | 'destructive' | 'default' };

export default function PublishScreen() {
  const { id } = useRoute<RouteProp<RootStackParamList, 'Publish'>>().params;
  const project = useStudio((s) => s.projects.find((p) => p.id === id));
  const updateProject = useStudio((s) => s.updateProject);
  const patchAssets = useStudio((s) => s.patchAssets);

  const [signedIn, setSignedIn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [progress, setProgress] = useState(0);
  const mounted = useMounted();
  // An upload must never be started twice — that publishes two videos.
  const uploadingRef = useRef(false);
  // The last virality audit, reported by the card; a low score asks before publishing.
  const viralityRef = useRef<any>(null);

  const [title, setTitle] = useState(project?.publish.title ?? '');
  const [description, setDescription] = useState(project?.publish.description ?? '');
  const [tags, setTags] = useState(project?.publish.tags ?? '');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted'>(
    project?.publish.privacyStatus === 'unlisted' ? 'unlisted' : 'private'
  );

  const projects = useStudio((s) => s.projects);
  const settings = useStudio((s) => s.settings);
  const bank = useStudio((s) => s.bank);
  const entryId = project?.bankEntryId ?? project?.script.bankEntryId;
  const bankEntry = useMemo(() => bank.find((e) => e.id === entryId), [bank, entryId]);

  // A long video's chapter timestamps need each chapter's real length.
  const [durations, setDurations] = useState<Record<string, number> | undefined>(undefined);
  useEffect(() => {
    if (!project || project.mode !== 'long') return;
    let alive = true;
    void (async () => {
      const d = alignmentDurations(project.assets.alignment);
      await Promise.all(
        Object.entries(project.assets.audio).map(async ([key, uri]) => {
          const seconds = await probeDuration(uri as string);
          if (seconds > 0) d[key] = seconds;
        })
      );
      if (alive) setDurations(withPauseDurations(project.script as any, d));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.mode, project?.assets.audio, project?.assets.alignment]);

  const releaseWatch = useStudio((s) => s.releaseWatch);
  const analytics = useStudio((s) => s.analytics);
  const research = useStudio((s) => s.research);
  const bankV2: any = project ? (project.script as any).bankV2 : undefined;

  const { longform, feederShorts, nextVideo } = useMemo(
    () =>
      v2SeoInputs(project, projects, releaseWatch, new Date(), {
        watchUrl,
        shortUrl: shortsUrl,
        viewsOf: (vid: string) => analytics[vid]?.views,
        orderOf: (p: any) => (bank.find((e: any) => e.id === (p.bankEntryId ?? p.script.bankEntryId)) as any)?.order ?? 0,
      } as any) as any,
    [project, projects, releaseWatch, analytics, bank]
  );

  const researchKeywords = useMemo(
    () => workingKeywords(research.keywordHistory[research.profileId] ?? {}, KEYWORD_LABELS.keep),
    [research.keywordHistory, research.profileId]
  );

  const deepDive = useMemo(() => {
    if (project?.mode !== 'short') return undefined;
    const dd = findRelatedDeepDive(project.script as any, projects);
    return dd?.assets.youtubeVideoId ? { title: dd.script.title, url: watchUrl(dd.assets.youtubeVideoId) } : undefined;
  }, [project, projects]);

  const proposal: any = useMemo(() => {
    if (!project) return null;
    if (project.mode === 'long' && !durations) return null;
    return proposeSeo({
      project,
      bankEntry,
      bank,
      durations,
      deepDive,
      mode: project.mode,
      shortUrl: shortsUrl,
      longform,
      feederShorts,
      nextVideo,
      researchKeywords,
    } as any);
  }, [project, bankEntry, bank, durations, deepDive, longform, feederShorts, nextVideo, researchKeywords]);

  const channelConfig = useStudio((s) => s.channelConfig);
  const channelUploads = useStudio((s) => s.channelUploads);
  const schedule = channelConfig.schedule;
  const format = project?.mode === 'long' ? 'long' : 'short';
  const releases = useMemo(() => collectReleases(projects, channelUploads as any), [projects, channelUploads]);
  const videoId = project?.assets.youtubeVideoId;

  const [when, setWhen] = useState<'scheduled' | 'now'>('scheduled');
  const [synthetic, setSynthetic] = useState<boolean>(project?.containsSyntheticMedia ?? false);
  const [slot, setSlot] = useState<Date>(() => nextValidSlot(format, releases, schedule, new Date(), videoId).at);

  /** The release rules at a time: gap problems can be overridden, rotation refusals can't. */
  const rulesAt = (at: Date) => {
    const problems: string[] = [...checkRelease(at, format, releases, schedule, new Date(), videoId).problems];
    const refusals: string[] = [];
    if (project && bankV2 && project.mode === 'short') {
      const entry = project.bankEntryId ?? project.script.bankEntryId ?? project.id;
      const { history } = rotationHistory(bank, releases, schedule, new Date(), false);
      refusals.push(
        ...rotationProblems({ id: entry, format: bankV2.format, pillar: bankV2.pillar }, localParts(at, schedule).day, history)
      );
    }
    if (project && bankV2 && project.mode === 'long') {
      const entry = project.bankEntryId ?? project.script.bankEntryId ?? project.id;
      const days = longDays(
        undefined,
        bank.filter((e) => e.id !== entry),
        projects
      );
      const mine = { id: entry, day: localParts(at, schedule).day, clips: longClipCount(project.script) };
      problems.push(...poolWarnings(poolUse([...days, mine], channelConfig.flow), channelConfig.flow));
    }
    return { problems, refusals };
  };

  const rules = rulesAt(slot);
  const rulesOk = !rules.problems.length && !rules.refusals.length;
  const ruleIssues = [...rules.refusals, ...rules.problems];
  const week = useMemo(() => weekStrip(releases, schedule, new Date()), [releases, schedule]);

  const shortScript = project?.mode === 'short' ? (project.script as ShortScript) : null;
  const previousTitle = useMemo(() => previousUploadTitle(projects, id), [projects, id]);
  const titleProblems: string[] = bankV2
    ? metadataProblems({ title, description }, project?.mode === 'long' ? 'long' : 'short')
    : shortScript
      ? checkShortTitle(title, {
          previousTitle,
          tactic: shortScript.tactic,
          assigned: Boolean(shortScript.bankEntryId),
        })
      : [];
  // The house title rules, minus what the checks above already say.
  const lintIssues: string[] =
    shortScript && !bankV2
      ? lintTitle(title, channelConfig.titles).filter((m) => {
          if (/"#"/.test(m) && titleProblems.some((p) => /Hashtag/.test(p))) return false;
          return !(/characters;/.test(m) && titleProblems.some((p) => /characters/.test(p)));
        })
      : [];
  const relatedDeepDive = useMemo(
    () => (shortScript ? findRelatedDeepDive(shortScript as any, projects) : undefined),
    [shortScript, projects]
  );

  useEffect(() => {
    void (async () => {
      try {
        setSignedIn(Boolean(await getKey('youtubeTokens')));
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  // Seed the description and tags from the proposal the first time this opens.
  useEffect(() => {
    if (!project || description || !proposal) return;
    setDescription(proposal.description);
    if (!tags.trim()) setTags(proposal.tags.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, description, proposal, tags]);

  const seoAudit = useMemo(
    () =>
      project
        ? auditSeo(
            {
              title,
              description,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            },
            { mode: project.mode, keyword: proposal?.keyword, deepDiveUrl: deepDive?.url } as any
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, title, description, tags, proposal?.keyword, deepDive?.url]
  );

  if (!project) return <Screen><Empty title="Project not found" /></Screen>;

  const switchHookVariant = (variant: string) => {
    if (variant === (project.hookVariant ?? 'default') || project.mode !== 'short') return;
    if (project.assets.youtubeVideoId) {
      Alert.alert('Already published', 'This Short is on YouTube; its variant is fixed.');
      return;
    }
    const apply = () => {
      const script = applyHookVariant(project.script as any, variant as any);
      const v2 = (project.script as any).bankV2;
      const base = variantTitle(variant as any, project.script.title, v2?.titleAlt);
      const nextTitle = v2 ? withTitleHashtags(base, { hashtags: undefined, effect: v2.effect }) : base;
      const audio = { ...project.assets.audio };
      delete audio.short;
      const alignment = { ...(project.assets.alignment ?? {}) };
      delete alignment.short;
      updateProject(project.id, {
        script,
        hookVariant: variant,
        review: undefined,
        publish: { ...project.publish, title: nextTitle },
      });
      patchAssets(project.id, { audio, alignment, finalVideo: undefined });
      setTitle(nextTitle);
    };
    if (project.assets.audio.short) {
      Alert.alert('Switch the hook?', 'The voiceover and the render are cleared and must be made again.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', style: 'destructive', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  /** Grammar-checks a free title before upload; returns the title to use, or 'cancel'. */
  const reviewTitle = async (current: string): Promise<string> => {
    const ask = (heading: string, body: string, choices: Choice[]) =>
      new Promise<string>((resolve) =>
        Alert.alert(
          heading,
          body,
          choices.map((c) => ({ text: c.text, style: c.style, onPress: () => resolve(c.value) })),
          { cancelable: true, onDismiss: () => resolve('cancel') }
        )
      );

    // An assigned title stays as the bank wrote it.
    const assigned = project.bankEntryId || project.script.bankEntryId ? project.script.title.trim() : '';
    if (assigned && current.trim() === assigned) return current;

    try {
      const anthropic = settings.scriptProvider === 'anthropic';
      const result: any = await checkTitleGrammar(
        {
          provider: settings.scriptProvider,
          model: anthropic ? settings.anthropicModel : settings.geminiModel,
          fallbackModel: anthropic ? settings.geminiModel : settings.anthropicModel,
        } as any,
        current
      );
      if (result.ok || !result.corrected.trim() || result.corrected.trim() === current.trim()) return current;
      return ask('Check the title', `${result.issue}\n\nSuggested: "${result.corrected.trim()}"`, [
        { text: 'Cancel', value: 'cancel', style: 'cancel' },
        { text: 'Keep mine', value: current },
        { text: 'Use suggestion', value: result.corrected.trim() },
      ]);
    } catch (e) {
      return ask('Title not checked', `The grammar check could not run: ${e instanceof Error ? e.message : String(e)}`, [
        { text: 'Cancel', value: 'cancel', style: 'cancel' },
        { text: 'Upload anyway', value: current },
      ]);
    }
  };

  /** Offers to put the long-form's link in each published Short's description. */
  const offerRelatedLinks = (
    accessToken: string,
    longVideoId: string,
    shorts: { id: string; title: string; videoId: string }[]
  ) => {
    const line = `Full video: ${watchUrl(longVideoId)}`;
    Alert.alert(
      'Link related Shorts?',
      `Add "${line}" to the description of:\n${shorts.map((s) => `• ${s.id} ${s.title}`).join('\n')}\n\nSetting each Short's "Related video" in YouTube Studio stays manual — the API can't do it.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Add links',
          onPress: () => {
            void (async () => {
              const lines: string[] = [];
              for (const s of shorts) {
                try {
                  const result = await appendToDescription(accessToken, s.videoId, line);
                  lines.push(`${s.id}: ${result === 'added' ? 'linked' : 'already linked'}`);
                } catch (e) {
                  lines.push(`${s.id}: failed — ${e instanceof Error ? e.message : String(e)}`);
                }
              }
              Alert.alert('Related Shorts', lines.join('\n'));
            })();
          },
        },
      ]
    );
  };

  /** The published Shorts a long-form's bank entry points back to. */
  const relatedShorts = () => {
    const state = useStudio.getState();
    const entry: any = project.bankEntryId ? state.bank.find((e) => e.id === project.bankEntryId) : undefined;
    if (entry?.kind !== 'long') return [];
    return state.bank
      .filter((e: any) => relatedShortIds(entry, state.bank).includes(e.id) && e.status === 'published' && e.videoId)
      .map((e: any) => ({ id: e.id, title: e.title, videoId: e.videoId }));
  };

  const linkRelatedNow = async () => {
    const longVideoId = project.assets.youtubeVideoId;
    const shorts = relatedShorts();
    if (!longVideoId || !shorts.length) return;
    try {
      const [raw, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
      if (!raw || !clientId) throw new Error('Sign in to YouTube first.');
      const tokens = await ensureFreshToken(clientId, JSON.parse(raw));
      await setKey('youtubeTokens', JSON.stringify(tokens));
      offerRelatedLinks(tokens.accessToken, longVideoId, shorts);
    } catch (e) {
      Alert.alert('Could not link Shorts', e instanceof Error ? e.message : String(e));
    }
  };

  const release = () => {
    uploadingRef.current = false;
    if (mounted.current) setUploading(false);
  };

  const publish = async (force = false) => {
    if (uploadingRef.current) return;
    try {
      await publishNow(force);
    } catch (e) {
      Alert.alert('Could not schedule', e instanceof Error ? e.message : String(e));
    } finally {
      release();
    }
  };

  const publishNow = async (force = false) => {
    if (!project.assets.finalVideo) {
      Alert.alert('Nothing to publish', 'Assemble the video first.');
      return;
    }
    if (project.mode === 'short' && (project.assets.renderInfo as any)?.draft) {
      Alert.alert(
        'This is a draft render',
        'It was rendered as a 720p draft. Turn "Draft quality" off in Assembly and render again before publishing.'
      );
      return;
    }
    if (project.assets.youtubeVideoId && !force) {
      Alert.alert('Already published', 'This project is already on YouTube. Uploading again creates a duplicate video.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upload again', style: 'destructive', onPress: () => void publish(true) },
      ]);
      return;
    }
    if (!passedGateFor(project.gateLog, project.script)) {
      Alert.alert(
        'Not through the authenticity gate',
        'This script, as it is now, has no passing gate run. Open Assembly, review it and render through the gate (CR-45), then publish.'
      );
      return;
    }

    const audit = viralityRef.current;
    if (audit && audit.gate === 'confirm') {
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          `Virality audit: ${audit.score}/100`,
          `${audit.topFixes.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}\n\nThis scores low on what drives reach. Publish anyway?`,
          [
            { text: 'Fix first', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Publish anyway', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      );
      if (!go) return;
    }

    if (project.mode === 'long' && when !== 'scheduled') {
      Alert.alert(
        'Long-form goes out scheduled',
        'A private or unlisted long-form earns no watch hours. Schedule it for its Saturday slot instead.'
      );
      return;
    }

    uploadingRef.current = true;
    let raw: string | null = null;
    let clientId: string | null = null;
    try {
      raw = await getKey('youtubeTokens');
      clientId = await getKey('youtubeClientId');
    } catch {
      raw = null;
      clientId = null;
    }
    if (!raw || !clientId) {
      uploadingRef.current = false;
      if (mounted.current) setSignedIn(false);
      Alert.alert(
        'Not signed in',
        'Sign in to YouTube first: Settings, under YouTube, paste your Android OAuth client ID and sign in.'
      );
      return;
    }
    if (mounted.current) setSignedIn(true);

    let finalTitle = title;
    let publishAt: string | undefined;
    let override: string | undefined;
    let desc: string;
    let tagList: string[];

    try {
      if (shortScript) {
        const reviewed = await reviewTitle(title);
        if (reviewed === 'cancel') {
          uploadingRef.current = false;
          return;
        }
        finalTitle = reviewed;
        if (mounted.current) setTitle(reviewed);
      }

      if (when === 'scheduled') {
        const earliest = Date.now() + MIN_LEAD_MINUTES * 60000;
        const at = slot.getTime() < earliest ? nextValidSlot(format, releases, schedule, new Date(), videoId).at : slot;
        const r = rulesAt(at);
        if (r.refusals.length) {
          uploadingRef.current = false;
          Alert.alert(
            'This day breaks the format rotation',
            `${r.refusals.join('\n\n')}\n\nPick another day, or swap topics in the queue.`
          );
          return;
        }
        const check = { ok: !r.problems.length, problems: r.problems };
        if (!check.ok) {
          const go = await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Outside the release rules',
              `${check.problems.join('\n\n')}\n\nNext valid slot: ${formatRelease(
                nextValidSlot(format, releases, schedule, new Date(), videoId).at,
                schedule
              )}.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Schedule anyway', style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) }
            )
          );
          if (!go) {
            uploadingRef.current = false;
            return;
          }
          override = check.problems.join(' ');
        }
        publishAt = at.toISOString();
      }

      desc = fillSeoDescription(description, {
        chapters: project.mode === 'long' ? buildChapterTimestamps(project.script as LongScript, durations) : undefined,
      });

      // A scheduled video must fit the Flow credit pool of its period.
      if (publishAt) {
        const flow = useStudio.getState().channelConfig.flow;
        const all = useStudio.getState().projects;
        const items = projectItems(all, flow, project.id);
        const item: any =
          project.mode !== 'long'
            ? { id: project.id, day: publishAt.slice(0, 10), kind: 'short' }
            : { id: project.id, day: publishAt.slice(0, 10), kind: 'long', credits: longBudget(project.script, flow) };
        const fit: any = canSchedule(items, item, flow, measuredShortCost(all, flow));
        if (!fit.ok) {
          const go = await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Over the Flow budget',
              `${fit.reason}${fit.nextFeasible ? `\n\nThe next period that fits starts ${fit.nextFeasible}.` : ''}\n\nThe video is already made, so this only counts what is still to be generated.`,
              [
                { text: 'Choose another day', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Schedule anyway', onPress: () => resolve(true) },
              ]
            )
          );
          if (!go) return;
        }
      }

      const v2: any = bankEntry && isV2(bankEntry as any) ? bankEntry : undefined;
      const normalized = normalizeSeo(
        {
          title: finalTitle,
          description: desc,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
        {
          mode: project.mode,
          keyword: proposal?.keyword,
          bankHashtags: v2?.hashtags,
          bankTags: v2?.tags,
          suggestedTags: researchKeywords,
        } as any
      );
      desc = normalized.meta.description;
      tagList = normalized.meta.tags;

      const hook =
        project.mode === 'short' ? firstSentence((project.script as ShortScript).beats.map((b) => b.text).join(' ')).text : undefined;

      updateProject(project.id, {
        ...(audit
          ? {
              virality: {
                ...project.virality,
                audit: {
                  score: audit.score,
                  at: new Date().toISOString(),
                  checks: audit.checks.map((c: any) => ({ id: c.id, status: c.status })),
                },
                ...(project.mode !== 'short'
                  ? {}
                  : { variant: variantOf(project), hook, hookShell: hook ? (hookShell(hook) ?? undefined) : undefined }),
              },
            }
          : {}),
        publish: {
          title: finalTitle,
          description: desc,
          tags: tagList.join(', '),
          privacyStatus: publishAt ? 'private' : privacy,
        },
        containsSyntheticMedia: synthetic,
        // A Short from the bank says "coming soon" until its long-form is live.
        funnelPending: project.mode === 'short' && Boolean(bankV2) && !hasLongformLink(desc),
      });
    } catch (e) {
      release();
      throw e;
    }

    setUploading(true);
    setProgress(0);
    try {
      const tokens = await ensureFreshToken(clientId, JSON.parse(raw));
      await setKey('youtubeTokens', JSON.stringify(tokens));
      const uploadedId = await uploadVideo(
        tokens.accessToken,
        project.assets.finalVideo,
        {
          title: finalTitle,
          description: desc,
          tags: tagList,
          privacyStatus: publishAt ? 'private' : privacy,
          publishAt,
          containsSyntheticMedia: synthetic,
        } as any,
        (fraction) => {
          if (mounted.current) setProgress(fraction);
        }
      );

      patchAssets(project.id, {
        youtubeVideoId: uploadedId,
        publishedAt: publishAt ? new Date(publishAt).getTime() : Date.now(),
        scheduledFor: publishAt,
      } as any);

      if (publishAt) {
        const at = new Date(publishAt);
        if (override) {
          useStudio.getState().logExperiment({
            at: new Date().toISOString(),
            kind: 'schedule_override',
            projectId: project.id,
            videoId: uploadedId,
            ...(project.bankEntryId ? { bankEntryId: project.bankEntryId } : {}),
            detail: `${formatRelease(at, schedule)} (${classifySlot(at, format, schedule)}): ${override}`,
          });
        }
        void watchScheduledRelease({ videoId: uploadedId, title: finalTitle, projectId: project.id, publicAt: at } as any);
      }

      if (project.bankEntryId) {
        useStudio.getState().updateBankEntry(project.bankEntryId, {
          status: 'published',
          videoId: uploadedId,
          publishedAt: publishAt ? new Date(publishAt).getTime() : Date.now(),
          uploaded: { title: finalTitle, description: desc, tags: tagList },
        });
      }

      if (project.assets.thumbnail) {
        try {
          await setThumbnail(tokens.accessToken, uploadedId, project.assets.thumbnail);
        } catch (e) {
          Alert.alert(
            'Uploaded, thumbnail not set',
            `${e instanceof Error ? e.message : String(e)}\n\nThe video is up. You can send the thumbnail later from the Thumbnail screen.`
          );
        }
      }

      const latest = () => useStudio.getState().projects.find((p) => p.id === project.id) ?? project;
      if (project.mode === 'long') {
        const finished = await finishLongUpload(tokens.accessToken, latest(), uploadedId, durations);
        if (finished.errors.length) {
          Alert.alert(
            'Uploaded; not everything finished',
            `${finished.errors.join('\n\n')}\n\nThe video is up. Retry from the card on this screen.`
          );
        }
      }
      const comment = await postPinnedComment(tokens.accessToken, latest(), uploadedId);
      if (comment.error) {
        Alert.alert(
          'Uploaded; the comment did not post',
          `${comment.error}\n\nThe video is up. Post it by hand from the checklist.`
        );
      }

      const entry: any = project.bankEntryId
        ? useStudio.getState().bank.find((e) => e.id === project.bankEntryId)
        : undefined;
      const shorts: any[] =
        entry?.kind !== 'long'
          ? []
          : useStudio
              .getState()
              .bank.filter(
                (e: any) =>
                  relatedShortIds(entry, useStudio.getState().bank).includes(e.id) && e.status === 'published' && e.videoId
              );
      if (shorts.length && !publishAt) {
        offerRelatedLinks(
          tokens.accessToken,
          uploadedId,
          shorts.map((e) => ({ id: e.id, title: e.title, videoId: e.videoId }))
        );
      }

      Alert.alert(
        publishAt ? 'Scheduled' : 'Uploaded',
        publishAt
          ? `Goes public ${formatRelease(new Date(publishAt), schedule)}. It stays private until then, and is checked after it goes live.`
          : `Uploaded as ${privacy}.`,
        [{ text: 'OK' }, { text: 'Open on YouTube', onPress: () => void Linking.openURL(watchUrl(uploadedId)) }]
      );
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      release();
    }
  };

  const retryLong = async () => {
    setRetrying(true);
    try {
      const [raw, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
      if (!raw || !clientId) throw new Error('Sign in to YouTube in Settings first.');
      const tokens = await ensureFreshToken(clientId, JSON.parse(raw));
      await setKey('youtubeTokens', JSON.stringify(tokens));
      const result = await finishLongUpload(tokens.accessToken, project, project.assets.youtubeVideoId!, durations);
      Alert.alert(
        result.errors.length ? 'Still not finished' : 'Done',
        [result.done.length ? `Added: ${result.done.join(', ')}.` : '', ...result.errors].filter(Boolean).join('\n\n')
      );
    } catch (e) {
      Alert.alert('Retry failed', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setRetrying(false);
    }
  };

  const tagCount = tagsLength(
    tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  );
  const scheduledAhead = Boolean(project.assets.scheduledFor && new Date(project.assets.scheduledFor) > new Date());
  const tasks = project.assets.youtubeVideoId
    ? postPublishTasks(
        project,
        projects,
        releaseWatch,
        new Date(),
        watchUrl,
        plannableLongs(bank).map((e) => e.title)
      )
    : [];
  const tasksDone: string[] = project.tasksDone ?? [];

  return (
    <Screen>
      <Card>
        <H2>Publish</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>YouTube Data API v3 · resumable upload</Small>
          <Badge label={signedIn ? 'SIGNED IN' : 'SIGNED OUT'} tone={signedIn ? 'ok' : 'neutral'} />
        </Row>
      </Card>

      {signedIn ? null : (
        <Card>
          <H3>Not connected</H3>
          <Small>
            Publishing needs Google sign-in. It lives in Settings, under YouTube, alongside the other credentials — paste
            your Android OAuth client ID there and sign in, then come back.
          </Small>
        </Card>
      )}

      {shortScript && (shortScript as any).bankV2?.hookAlt ? (
        <Card>
          <H3>Hook version (A/B test)</H3>
          <Small>
            {`Default: "${(shortScript as any).bankV2.hookDefault}"\nAlt: "${(shortScript as any).bankV2.hookAlt}"${
              (shortScript as any).bankV2.titleAlt ? `\nAlt title: ${(shortScript as any).bankV2.titleAlt}` : ''
            }`}
          </Small>
          <Segmented
            value={(project.hookVariant ?? 'default') as string}
            onChange={switchHookVariant}
            options={[
              { value: 'default', label: 'Default hook' },
              { value: 'alt', label: 'Alt hook' },
            ]}
          />
          <Small>
            Switching rewrites the first sentence and clears the voiceover, which must be made again; the review is
            voided. The result is tagged for the test.
          </Small>
        </Card>
      ) : null}

      <Card>
        {shortScript?.titleOptions && shortScript.titleOptions.length > 1 ? (
          <>
            <Small style={{ marginBottom: space.xs }}>Title options — tap to use</Small>
            <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
              {shortScript.titleOptions.map((t) => (
                <Button
                  key={t}
                  label={t}
                  variant={t === title ? 'primary' : 'ghost'}
                  onPress={() => setTitle(t)}
                  style={{ paddingHorizontal: space.md, minHeight: 38 }}
                />
              ))}
            </Row>
          </>
        ) : null}
        <Field label="Title" value={title} onChangeText={setTitle} />
        {titleProblems.map((p) => (
          <Small key={p} style={{ color: colors.warn, marginBottom: space.xs }}>
            • {p}
          </Small>
        ))}
        {lintIssues.map((p) => (
          <Small key={p} style={{ color: colors.warn, marginBottom: space.xs }}>
            • {p}
          </Small>
        ))}
        {shortScript && !titleProblems.length && !lintIssues.length ? (
          <Small style={{ color: colors.ok, marginBottom: space.sm }}>
            Title follows the rules. Grammar is checked before upload.
          </Small>
        ) : null}
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <Field label="Tags (comma separated)" value={tags} onChangeText={setTags} autoCapitalize="none" />
        {tagCount >= 500 ? (
          <Small style={{ color: colors.warn, marginBottom: space.xs }}>
            Tags are {tagCount} of YouTube's 500 characters; the last ones will be left off.
          </Small>
        ) : null}
        {proposal && (description !== proposal.description || tags !== proposal.tags.join(', ')) ? (
          <Button
            label={proposal.source === 'bank' ? "Use the bank's description and tags" : 'Use the recommended description and tags'}
            variant="ghost"
            onPress={() => {
              setDescription(proposal.description);
              setTags(proposal.tags.join(', '));
            }}
          />
        ) : null}
        {proposal ? (
          <Small style={{ marginBottom: space.xs }}>
            {proposal.source === 'bank'
              ? `Description and tags come from the topic bank (${bankEntry?.id}).`
              : 'Description and tags are generated for search from the script.'}{' '}
            Edit anything before uploading.
          </Small>
        ) : null}
      </Card>

      {project.mode === 'short' || durations ? (
        <ViralityCard
          project={project}
          durations={durations}
          onAudit={(a) => {
            viralityRef.current = a;
          }}
        />
      ) : null}

      {seoAudit ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>SEO check</H3>
            <Badge
              label={`${seoAudit.score}/100`}
              tone={seoAudit.score >= 90 ? 'ok' : seoAudit.score >= 70 ? 'warn' : 'danger'}
            />
          </Row>
          {seoAudit.checks.filter((c) => !c.ok).length ? (
            seoAudit.checks
              .filter((c) => !c.ok)
              .map((c) => (
                <Small key={c.id} style={{ color: colors.warn }}>
                  • {c.label}: {c.detail}
                </Small>
              ))
          ) : (
            <Small style={{ color: colors.ok }}>Every check passes.</Small>
          )}
          {relatedDeepDive?.assets.youtubeVideoId && !description.includes(relatedDeepDive.assets.youtubeVideoId) ? (
            <Button
              label="Add link to the related deep dive"
              variant="ghost"
              onPress={() =>
                setDescription(
                  `${description.trim()}\n\n${deepDiveLine(watchUrl(relatedDeepDive.assets.youtubeVideoId))}`
                )
              }
            />
          ) : null}
        </Card>
      ) : null}

      {proposal?.pinnedComment ? (
        <Card>
          <H3>Pinned comment</H3>
          <Small style={{ color: colors.text }}>{proposal.pinnedComment}</Small>
          <Button
            label="Copy comment"
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(proposal.pinnedComment ?? '');
              Alert.alert('Copied', 'Post it on the video, then pin it in YouTube Studio — the API cannot pin comments.');
            }}
          />
        </Card>
      ) : null}

      <Card>
        <H3>When</H3>
        {format !== 'long' ? (
          <Segmented
            value={when}
            onChange={setWhen}
            options={[
              { value: 'scheduled', label: 'Daily slot' },
              { value: 'now', label: 'Upload now (not public)' },
            ]}
          />
        ) : (
          <Small>
            Long-form goes out on its Saturday slot. Private or unlisted long-form isn't offered: it would earn no watch
            hours (CR-57).
          </Small>
        )}
        {when === 'scheduled' ? (
          <>
            <Row style={{ marginTop: space.sm, gap: 4 }}>
              {week.map((d) => {
                const selected = localParts(slot, schedule).day === d.day;
                return (
                  <Pressable
                    key={d.day}
                    onPress={() => setSlot(slotAt(d.day, format === 'long' ? 'longform' : 'primary', schedule))}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 6,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? colors.surfaceAlt : 'transparent',
                    }}
                  >
                    <Text style={{ color: colors.textDim, fontSize: 10 }}>{d.label}</Text>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>
                      {d.releases.length ? d.releases.map((r) => (r.kind === 'short' ? 'S' : 'L')).join(' ') : '·'}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm }}>
              <Button
                label="◀ Day"
                variant="ghost"
                onPress={() => setSlot((d) => new Date(d.getTime() - 86400000))}
              />
              <Small style={{ color: colors.text, fontWeight: '800' }}>{formatRelease(slot, schedule)}</Small>
              <Button
                label="Day ▶"
                variant="ghost"
                onPress={() => setSlot((d) => new Date(d.getTime() + 86400000))}
              />
            </Row>
            {format === 'short' ? (
              <Segmented
                value={classifySlot(slot, 'short', schedule) === 'fallback' ? 'fallback' : 'primary'}
                onChange={(which) => setSlot((d) => slotAt(localParts(d, schedule).day, which, schedule))}
                options={[
                  { value: 'primary', label: `Primary ${schedule.primarySlot}` },
                  { value: 'fallback', label: `Fallback ${schedule.fallbackSlot}` },
                ]}
              />
            ) : null}
            {rulesOk ? (
              <Small style={{ color: colors.ok, marginTop: space.xs }}>
                Uploaded as private; YouTube makes it public at this time. Every gap rule is met.
              </Small>
            ) : (
              <View style={{ marginTop: space.xs }}>
                {ruleIssues.map((p) => (
                  <Small key={p} style={{ color: colors.danger }}>
                    • {p}
                  </Small>
                ))}
                <Button
                  label={`Use the next valid slot: ${formatRelease(
                    nextValidSlot(format, releases, schedule, new Date(), videoId).at,
                    schedule
                  )}`}
                  variant="secondary"
                  onPress={() => setSlot(nextValidSlot(format, releases, schedule, new Date(), videoId).at)}
                />
              </View>
            )}
          </>
        ) : (
          <>
            <Small style={{ marginVertical: space.xs }}>
              Public releases go through the slot, so the first day's numbers stay comparable. Uploading now is private
              or unlisted only.
            </Small>
            <Segmented
              value={privacy}
              onChange={setPrivacy}
              options={[
                { value: 'private', label: 'Private' },
                { value: 'unlisted', label: 'Unlisted' },
              ]}
            />
          </>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <H3>Altered or synthetic content</H3>
            <Small>
              Turn on when the visuals or voice could be mistaken for real people or events (realistic Flow or Veo
              footage). Off for the channel's anime footage and Hoot (CR-49).
            </Small>
          </View>
          <Switch
            value={synthetic}
            onValueChange={setSynthetic}
            trackColor={{ true: colors.accentDim, false: colors.border }}
            thumbColor={synthetic ? colors.accent : colors.textFaint}
          />
        </Row>
      </Card>

      {passedGateFor(project.gateLog, project.script) ? null : (
        <Card>
          <Small style={{ color: colors.danger }}>
            This script hasn't passed the authenticity gate as it is now. Review it and render it in Assembly before
            publishing (CR-45, CR-57).
          </Small>
        </Card>
      )}

      {uploading ? (
        <Card>
          <H3>Uploading</H3>
          <ProgressBar fraction={progress} />
          <Small>{Math.round(progress * 100)}%</Small>
        </Card>
      ) : null}

      <Button
        label={
          project.assets.youtubeVideoId
            ? 'Publish again'
            : when === 'scheduled'
              ? '🗓 Schedule on YouTube'
              : `⬆ Upload as ${privacy}`
        }
        onPress={() => void publish()}
        loading={uploading}
      />

      {project.assets.youtubeVideoId ? (
        <Card>
          <Small style={{ color: colors.ok }}>
            {scheduledAhead
              ? `Scheduled for ${formatRelease(new Date(project.assets.scheduledFor as any), schedule)}: `
              : 'Live: '}
            {watchUrl(project.assets.youtubeVideoId)}
          </Small>
          <Button
            label="Open on YouTube"
            variant="secondary"
            onPress={() => void Linking.openURL(watchUrl(project.assets.youtubeVideoId!))}
          />
          {!bankV2 && relatedShorts().length && !scheduledAhead ? (
            <Button label="Link this video from its related Shorts" variant="ghost" onPress={() => void linkRelatedNow()} />
          ) : null}
          {project.funnelPending ? (
            <Small>Line 2 says "coming soon" until the long-form is live; the app then swaps in the link (CR-48).</Small>
          ) : null}
        </Card>
      ) : null}

      {project.mode === 'long' && longUploadPending(project) ? (
        <Card>
          <H3>Captions and playlists</H3>
          <Small>
            {project.captionsUploaded
              ? 'Captions are up.'
              : 'The narration still has to go up as the caption track (CR-59).'}{' '}
            {(project.playlistsAdded ?? []).length
              ? `In: ${(project.playlistsAdded ?? []).join(', ')}.`
              : 'Not in its playlists yet (CR-60).'}
          </Small>
          <Button
            label={retrying ? 'Working…' : 'Retry now'}
            loading={retrying}
            variant="secondary"
            onPress={() => void retryLong()}
          />
        </Card>
      ) : null}

      {tasks.length ? (
        <Card>
          <H3>After publishing, in YouTube Studio</H3>
          {tasks.map((t: any) => {
            const done = tasksDone.includes(t.id);
            return (
              <View key={t.id} style={{ marginTop: space.sm, gap: 4 }}>
                <Small style={{ color: done ? colors.ok : t.ready ? colors.text : colors.textDim, fontWeight: '800' }}>
                  {done ? '✓ ' : ''}
                  {t.title}
                </Small>
                <Small>{t.detail}</Small>
                {t.ready ? (
                  <Row style={{ flexWrap: 'wrap' }}>
                    <Button label="Open in Studio" variant="secondary" onPress={() => void Linking.openURL(t.url)} />
                    {t.copy ? (
                      <Button
                        label="Copy comment"
                        variant="ghost"
                        onPress={() => {
                          void Clipboard.setStringAsync(t.copy ?? '');
                          Alert.alert('Copied', t.copy);
                        }}
                      />
                    ) : null}
                    <Button
                      label={done ? 'Mark not done' : 'Mark done'}
                      variant="ghost"
                      onPress={() =>
                        updateProject(project.id, {
                          tasksDone: done ? tasksDone.filter((x) => x !== t.id) : [...tasksDone, t.id],
                        })
                      }
                    />
                  </Row>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
