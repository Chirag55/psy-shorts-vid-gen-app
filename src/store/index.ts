import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetProjectsForBank } from '@/core/bankReset';
import { DEFAULT_PLAYLIST_NAMES } from '@/core/playlists';
import { DEFAULT_CLIP_BUDGET } from '@/core/shots';
import { mergeStudio, migrateStudio } from '@/core/persistMigration';
import { datedSlug, uniqueSlug } from '@/core/slug';
import type { AssetState, Project, ScriptBody, TopicBankEntry, WordTiming } from '@/core/types';
import type { BankTopic } from '@/core/topicBank';
import { DEFAULT_VOICE_ID } from '@/services/elevenlabs';
import { DEFAULT_GEMINI_MODEL } from '@/services/gemini';
import { DEFAULT_ANTHROPIC_MODEL } from '@/services/anthropic';
import { DEFAULT_IMAGE_MODEL } from '@/services/imagen';
import { deleteProjectFiles } from '@/services/workspace';
import {
  BREAKOUT,
  DEFAULT_DAILY_CAP,
  DEFAULT_ENTITY_BLOCKLIST,
  DEFAULT_FILTERS,
  DEFAULT_PODCAST_TERMS,
  DEFAULT_PROFILES,
  FILTERS_VERSION,
  KEYWORDS_VERSION,
  type ResearchProfile,
} from '@/core/researchConfig';
import { currentLedger, type QuotaLedger } from '@/core/researchQuota';
import { normalizeHistory, recordRun, type KeywordHistory } from '@/core/researchHistory';
import { mergeLayer2Cache, type Layer2Cache } from '@/core/researchLayer2';
import { DEFAULT_CHANNEL_CONFIG, type ChannelConfig } from '@/core/channelConfig';
import { canTry, fallbackToStill, flowFor, logTry, markStill } from '@/core/flowCredits';
import type { VideoAnalytics } from '@/core/analytics';
import type { YppManualReading, YppSnapshot } from '@/core/ypp';

const STORE_NAME = 'mindfiles-studio';

const emptyAssets = (): AssetState => ({
  clips: {},
  stills: {},
  audio: {},
  alignment: {},
  segments: {},
});

export interface Settings {
  voiceId: string;
  /** Which service writes the scripts. */
  scriptProvider: 'gemini' | 'anthropic';
  geminiModel: string;
  anthropicModel: string;
  /** Model used for connective stills — Imagen or a Gemini image model. */
  imageModel: string;
  /** Needed to read a channel with an API key, which has no notion of "me". */
  youtubeChannelId: string;
  /** Feed recent channel performance into generation prompts. */
  usePerformanceContext: boolean;
  topicSource: string;
  shotPlanner: string;
  shortClipBudget: number;
  includeMascot: boolean;
  textWatermark: boolean;
  includeCaptions: boolean;
  draftRender: boolean;
  musicBed: boolean;
  cutWhoosh: boolean;
  spokenSignoff: boolean;
  styleProfile: string;
  mascot: string;
  wordCaptions: boolean;
  narrationPace: string;
  punchIn: boolean;
  endQuestionCard: boolean;
  planDebug: boolean;
  defaultPrivacy: 'private' | 'unlisted' | 'public';
  hootSide: string;
  playlistNames: Record<string, string>;
  /** Locally tracked ElevenLabs spend, so the guard works even offline. */
  voiceCharsUsed: number;
  voiceCharLimit: number;
  reviewerName: string;
  neutralTerms: string[];
  [key: string]: any;
}

export interface ResearchState {
  quota: QuotaLedger;
  cap: number;
  profiles: ResearchProfile[];
  profileId: string;
  filters: any;
  runs: any[];
  seen: Record<string, string[]>;
  entityBlocklist: string[];
  podcastTerms: string[];
  keywordHistory: Record<string, KeywordHistory>;
  filtersVersion: number;
  keywordsVersion: number;
  layer2Enabled: boolean;
  layer2Cache: Layer2Cache;
  channelCache: Record<string, { at: string; [key: string]: any }>;
  [key: string]: any;
}

export interface WeeklyState {
  viewedRates: Record<string, number>;
  avoid: { title: string; hook?: string; at?: string; [key: string]: any }[];
  competitors: any[];
  competitorsSkip: string[];
  competitorsAt?: string;
  channels?: any[];
  competitorVideos?: any[];
  suggested?: any[];
  suggestedDismissed?: string[];
  discoveryAt?: string;
  discoveryCursor?: any;
  lastWeek?: string;
  report?: any;
}

export interface FlowVerdict {
  ok: boolean;
  [key: string]: any;
}

interface StudioState {
  projects: Project[];
  topics: TopicBankEntry[];
  analytics: Record<string, VideoAnalytics>;
  metadataLog: any[];
  research: ResearchState;
  tacticRanking?: any;
  bank: BankTopic[];
  bankMeta: any;
  bankAuto?: any;
  acceptedConditional: string[];
  channelConfig: ChannelConfig;
  channelUploads: any[];
  experimentLog: any[];
  releaseWatch: Record<string, any>;
  ypp: { snapshot?: YppSnapshot; manual: YppManualReading[] };
  weekly: WeeklyState;
  weekPlan?: any;
  stillQueues: Record<string, any>;
  settings: Settings;
  hydrated: boolean;
  /** Set when the saved store could not be read at launch. */
  loadProblem?: string;

  setYppSnapshot: (snapshot: YppSnapshot) => void;
  addYppReading: (reading: YppManualReading) => void;
  setCompetitors: (competitors: any[], at: string) => void;
  skipCompetitor: (id: string) => void;
  setChannels: (channels: any[]) => void;
  setCompetitorVideos: (videos: any[], at: string) => void;
  setSuggested: (suggested: any[], at: string, cursor: any) => void;
  dismissSuggested: (id: string) => void;
  setWeeklyReport: (report: any) => void;
  setViewedRate: (key: string, rate: number | undefined) => void;

  createProject: (input: {
    topic: string;
    category: string;
    script: ScriptBody;
    bankEntryId?: string;
    style?: Project['style'];
  }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  patchAssets: (id: string, patch: Partial<AssetState>) => void;
  setClip: (id: string, key: string, uri: string) => void;
  setStillQueue: (id: string, queue: any) => void;
  setStill: (id: string, key: string, uri: string) => void;
  logFlowTry: (id: string, key: string, force?: boolean) => FlowVerdict;
  recordRetention: (id: string, window: 'h48' | 'd7', snapshot: any) => void;
  setStayedToWatch: (id: string, percent: number) => void;
  setViewedPercent: (id: string, percent: number) => void;
  clipToStill: (id: string, key: string) => void;
  setAudio: (id: string, key: string, uri: string, words: WordTiming[]) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;

  addTopics: (entries: Array<{ topic: string; category: string }>) => void;
  markTopicUsed: (id: string) => void;
  removeTopic: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  addVoiceSpend: (chars: number) => void;
  mergeAnalytics: (fresh: Record<string, VideoAnalytics>) => void;

  chargeResearchQuota: (units: number) => void;
  refundResearchQuota: (units: number) => void;
  updateResearch: (patch: Partial<ResearchState>) => void;
  recordKeywordRates: (profileId: string, runId: string, at: string, rates: Record<string, number>) => void;
  cacheLayer2Labels: (labels: Layer2Cache) => void;
  cacheChannelRecent: (entries: Record<string, any>) => void;
  recordResearchRun: (run: any) => void;
  updateResearchRun: (id: string, patch: any) => void;
  removeResearchRuns: (ids: string[]) => void;
  markResearchSeen: (profileId: string, ids: string[]) => void;
  clearResearch: () => void;

  logMetadataChange: (entry: any) => void;
  setTacticRanking: (ranking: any) => void;
  updateChannelConfig: (patch: Partial<ChannelConfig>) => void;
  recordChannelUploads: (rows: any[]) => void;
  logExperiment: (entry: any) => void;
  watchRelease: (watch: any) => void;
  updateReleaseWatch: (videoId: string, patch: any) => void;
  setWeekPlan: (plan: any) => void;
  applyBankImport: (bank: BankTopic[], meta: any, changedIds?: string[]) => void;
  applyAutoImport: (result: { plan: { next: BankTopic[]; banks: any; reset: string[] }; record: any }) => void;
  acceptConditional: (id: string) => void;
  acknowledgeBankImport: () => void;
  updateBankEntry: (id: string, patch: any) => void;

  /** Archetypes from the last 10 scripts, fed back into generation to stop repeats. */
  recentArchetypes: () => string[];
}

/** True while the saved store is unreadable, so nothing overwrites it. */
let writesBlocked = false;

/** Keeps a copy of an unreadable store before the studio starts empty. */
async function backUpUnreadableStore(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(STORE_NAME);
    if (raw === null) {
      writesBlocked = false;
      return '';
    }
    const key = `${STORE_NAME}.unreadable-${Date.now()}`;
    await AsyncStorage.setItem(key, raw);
    writesBlocked = false;
    return `Your saved projects could not be loaded. A copy was kept (${key}) and the studio started empty.`;
  } catch {
    return 'Your saved projects could not be loaded. Nothing will be saved this session so they are not overwritten — restart the app, and if this repeats, send the diagnostics from Settings.';
  }
}

const guardedStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => {
    if (writesBlocked) return;
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (writesBlocked) return;
    await AsyncStorage.removeItem(name);
  },
};

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const freshResearch = (): ResearchState => ({
  quota: currentLedger(undefined),
  cap: DEFAULT_DAILY_CAP,
  profiles: DEFAULT_PROFILES,
  profileId: DEFAULT_PROFILES[0].id,
  filters: DEFAULT_FILTERS,
  runs: [],
  seen: {},
  entityBlocklist: DEFAULT_ENTITY_BLOCKLIST,
  podcastTerms: DEFAULT_PODCAST_TERMS,
  keywordHistory: {},
  filtersVersion: FILTERS_VERSION,
  keywordsVersion: KEYWORDS_VERSION,
  layer2Enabled: true,
  layer2Cache: {},
  channelCache: {},
});

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      projects: [],
      topics: [],
      analytics: {},
      metadataLog: [],
      research: freshResearch(),
      bank: [],
      bankMeta: [],
      channelConfig: DEFAULT_CHANNEL_CONFIG,
      channelUploads: [],
      experimentLog: [],
      releaseWatch: {},
      ypp: { manual: [] },
      setYppSnapshot: (snapshot) => set((s) => ({ ypp: { ...s.ypp, snapshot } })),
      addYppReading: (reading) => set((s) => ({ ypp: { ...s.ypp, manual: [reading, ...s.ypp.manual].slice(0, 52) } })),
      weekly: { viewedRates: {}, avoid: [], competitors: [], competitorsSkip: [] },
      setCompetitors: (competitors, at) =>
        set((s) => ({ weekly: { ...s.weekly, competitors, competitorsAt: at } })),
      skipCompetitor: (id) =>
        set((s) => ({
          weekly: {
            ...s.weekly,
            competitorsSkip: [...new Set([id, ...(s.weekly.competitorsSkip ?? [])])].slice(0, 500),
          },
        })),
      setChannels: (channels) => set((s) => ({ weekly: { ...s.weekly, channels } })),
      setCompetitorVideos: (videos, at) =>
        set((s) => ({ weekly: { ...s.weekly, competitorVideos: videos.slice(0, 1200), competitorsAt: at } })),
      setSuggested: (suggested, at, cursor) =>
        set((s) => ({ weekly: { ...s.weekly, suggested, discoveryAt: at, discoveryCursor: cursor } })),
      dismissSuggested: (id) =>
        set((s) => ({
          weekly: {
            ...s.weekly,
            suggested: (s.weekly.suggested ?? []).filter((x) => x.id !== id),
            suggestedDismissed: [...new Set([id, ...(s.weekly.suggestedDismissed ?? [])])].slice(0, 300),
          },
        })),
      setWeeklyReport: (report) =>
        set((s) => {
          const stamped = report.avoid.map((a: any) => ({ ...a, at: report.at }));
          const avoid = [
            ...stamped,
            ...s.weekly.avoid.filter((old) => !stamped.some((n: any) => n.title === old.title)),
          ].slice(0, 40);
          return { weekly: { ...s.weekly, lastWeek: report.week, report, avoid } };
        }),
      setViewedRate: (key, rate) =>
        set((s) => {
          const viewedRates = { ...s.weekly.viewedRates };
          if (rate !== undefined) viewedRates[key] = rate;
          else delete viewedRates[key];
          return { weekly: { ...s.weekly, viewedRates } };
        }),
      hydrated: false,
      settings: {
        voiceId: DEFAULT_VOICE_ID,
        scriptProvider: 'gemini',
        geminiModel: DEFAULT_GEMINI_MODEL,
        anthropicModel: DEFAULT_ANTHROPIC_MODEL,
        imageModel: DEFAULT_IMAGE_MODEL,
        youtubeChannelId: '',
        usePerformanceContext: true,
        topicSource: 'bank',
        shotPlanner: 'phone',
        shortClipBudget: DEFAULT_CLIP_BUDGET,
        includeMascot: true,
        textWatermark: false,
        includeCaptions: true,
        draftRender: false,
        musicBed: false,
        cutWhoosh: false,
        spokenSignoff: true,
        styleProfile: 'auto',
        mascot: 'endcard',
        wordCaptions: false,
        narrationPace: 'normal',
        punchIn: false,
        endQuestionCard: true,
        planDebug: false,
        defaultPrivacy: 'private',
        hootSide: 'right',
        playlistNames: { ...DEFAULT_PLAYLIST_NAMES },
        voiceCharsUsed: 0,
        voiceCharLimit: 10_000,
        reviewerName: '',
        neutralTerms: [],
      },

      createProject: ({ topic, category, script, bankEntryId, style }) => {
        const now = Date.now();
        const project: Project = {
          id: newId(),
          slug: uniqueSlug(
            datedSlug(script.title || topic, new Date(now)),
            get().projects.map((p) => p.slug),
          ),
          mode: script.mode,
          topic,
          category,
          createdAt: now,
          updatedAt: now,
          script,
          assets: emptyAssets(),
          voiceId: get().settings.voiceId,
          ...(bankEntryId ? { bankEntryId } : {}),
          ...(style ? { style } : {}),
          publish: {
            title: script.title,
            description: '',
            tags: (script.mode !== 'short' ? script.tags : script.hashtags).join(', '),
            privacyStatus: get().settings.defaultPrivacy,
          },
        };
        set((s) => ({
          projects: [project, ...s.projects],
          bank: bankEntryId
            ? s.bank.map((e) =>
                e.id === bankEntryId && e.status !== 'published'
                  ? { ...e, status: 'in_progress', projectId: project.id, startedAt: now }
                  : e,
              )
            : s.bank,
        }));
        return project;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
        })),

      patchAssets: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, assets: { ...p.assets, ...patch }, updatedAt: Date.now() } : p,
          ),
        })),

      setClip: (id, key, uri) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, assets: { ...p.assets, clips: { ...p.assets.clips, [key]: uri } }, updatedAt: Date.now() }
              : p,
          ),
        })),

      stillQueues: {},
      setStillQueue: (id, queue) =>
        set((s) => {
          const stillQueues = { ...s.stillQueues };
          if (queue) stillQueues[id] = queue;
          else delete stillQueues[id];
          return { stillQueues };
        }),

      setStill: (id, key, uri) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, assets: { ...p.assets, stills: { ...p.assets.stills, [key]: uri } }, updatedAt: Date.now() }
              : p,
          ),
        })),

      logFlowTry: (id, key, force = false) => {
        const state = get();
        const p = state.projects.find((x) => x.id === id);
        const verdict = canTry(p?.flow, key, flowFor(p?.script, state.channelConfig.flow)) as FlowVerdict;
        if (!p || (!verdict.ok && !force)) return verdict;
        set((s) => ({
          projects: s.projects.map((x) =>
            x.id === id ? { ...x, flow: logTry(x.flow, key), updatedAt: Date.now() } : x,
          ),
        }));
        return verdict;
      },

      recordRetention: (id, window, snapshot) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  virality: { ...p.virality, snapshots: { ...p.virality?.snapshots, [window]: snapshot } },
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),

      setStayedToWatch: (id, percent) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  stayedToWatch: {
                    percent: Math.min(100, Math.max(0, Math.round(percent * 10) / 10)),
                    at: new Date().toISOString(),
                  },
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),

      setViewedPercent: (id, percent) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            const snaps: Record<string, any> = p.virality?.snapshots ?? {};
            const key = snaps.d7 ? 'd7' : 'h48';
            const base = snaps[key] ?? {
              at: new Date().toISOString(),
              views: 0,
              averageViewPercentage: 0,
              averageViewDuration: 0,
            };
            return {
              ...p,
              virality: { ...p.virality, snapshots: { ...snaps, [key]: { ...base, viewedPercent: percent } } },
              updatedAt: Date.now(),
            };
          }),
        })),

      clipToStill: (id, key) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id && p.script.mode === 'long'
              ? { ...p, script: fallbackToStill(p.script as any, key), flow: markStill(p.flow, key), updatedAt: Date.now() }
              : p,
          ),
        })),

      setAudio: (id, key, uri, words) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  assets: {
                    ...p.assets,
                    audio: { ...p.assets.audio, [key]: uri },
                    alignment: { ...p.assets.alignment, [key]: words },
                  },
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),

      deleteProject: (id) => {
        const p = get().projects.find((x) => x.id === id);
        // Two projects can share a folder; only delete it when this is the last.
        const shared = p ? get().projects.some((x) => x.id !== id && x.slug === p.slug) : false;
        if (p && !shared) {
          try {
            deleteProjectFiles(p.slug);
          } catch {
            // Files are best-effort; the record still goes.
          }
        }
        set((s) => ({
          projects: s.projects.filter((x) => x.id !== id),
          bank: s.bank.map((e) =>
            e.projectId === id && e.status === 'in_progress' ? { ...e, status: 'unused', projectId: undefined } : e,
          ),
        }));
      },

      getProject: (id) => get().projects.find((p) => p.id === id),

      addTopics: (entries) =>
        set((s) => {
          const existing = new Set(s.topics.map((t) => t.topic.toLowerCase()));
          const fresh = entries
            .filter((e) => !existing.has(e.topic.toLowerCase()))
            .map((e) => ({ id: newId(), topic: e.topic, category: e.category, used: false }));
          return { topics: [...fresh, ...s.topics] };
        }),

      markTopicUsed: (id) =>
        set((s) => ({
          topics: s.topics.map((t) => (t.id === id ? { ...t, used: true, usedAt: Date.now() } : t)),
        })),

      removeTopic: (id) => set((s) => ({ topics: s.topics.filter((t) => t.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addVoiceSpend: (chars) =>
        set((s) => ({ settings: { ...s.settings, voiceCharsUsed: s.settings.voiceCharsUsed + chars } })),

      mergeAnalytics: (fresh) => set((s) => ({ analytics: { ...s.analytics, ...fresh } })),

      chargeResearchQuota: (units) =>
        set((s) => {
          const quota = currentLedger(s.research.quota);
          return { research: { ...s.research, quota: { ...quota, unitsUsed: quota.unitsUsed + units } } };
        }),

      refundResearchQuota: (units) =>
        set((s) => {
          const quota = currentLedger(s.research.quota);
          return {
            research: { ...s.research, quota: { ...quota, unitsUsed: Math.max(0, quota.unitsUsed - units) } },
          };
        }),

      updateResearch: (patch) => set((s) => ({ research: { ...s.research, ...patch } })),

      recordKeywordRates: (profileId, runId, at, rates) =>
        set((s) => {
          const next = recordRun(normalizeHistory(s.research.keywordHistory[profileId]), runId, at, rates);
          return { research: { ...s.research, keywordHistory: { ...s.research.keywordHistory, [profileId]: next } } };
        }),

      cacheLayer2Labels: (labels) =>
        set((s) => ({
          research: { ...s.research, layer2Cache: mergeLayer2Cache(s.research.layer2Cache ?? {}, labels, new Date()) },
        })),

      cacheChannelRecent: (entries) =>
        set((s) => {
          const cutoff = Date.now() - BREAKOUT.cacheDays * 86400000;
          const merged = Object.entries({ ...(s.research.channelCache ?? {}), ...entries }).filter(
            ([, v]) => new Date(v.at).getTime() >= cutoff,
          );
          return { research: { ...s.research, channelCache: Object.fromEntries(merged) } };
        }),

      recordResearchRun: (run) =>
        set((s) => ({ research: { ...s.research, runs: [run, ...s.research.runs].slice(0, 100) } })),

      updateResearchRun: (id, patch) =>
        set((s) => ({
          research: { ...s.research, runs: s.research.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
        })),

      removeResearchRuns: (ids) =>
        set((s) => ({ research: { ...s.research, runs: s.research.runs.filter((r) => !ids.includes(r.id)) } })),

      markResearchSeen: (profileId, ids) =>
        set((s) => {
          const seen = [...new Set([...ids, ...(s.research.seen[profileId] ?? [])])].slice(0, 10000);
          return { research: { ...s.research, seen: { ...s.research.seen, [profileId]: seen } } };
        }),

      clearResearch: () =>
        set((s) => ({
          research: {
            ...freshResearch(),
            quota: s.research.quota,
            cap: s.research.cap,
            profiles: s.research.profiles,
            filters: s.research.filters,
            filtersVersion: s.research.filtersVersion,
            keywordsVersion: s.research.keywordsVersion,
            layer2Enabled: s.research.layer2Enabled,
            profileId: s.research.profileId,
            entityBlocklist: s.research.entityBlocklist,
            podcastTerms: s.research.podcastTerms,
          },
        })),

      logMetadataChange: (entry) => set((s) => ({ metadataLog: [entry, ...s.metadataLog].slice(0, 200) })),

      setTacticRanking: (ranking) => set({ tacticRanking: ranking }),

      updateChannelConfig: (patch) =>
        set((s) => {
          const c = s.channelConfig;
          return {
            channelConfig: {
              ...c,
              ...patch,
              schedule: { ...c.schedule, ...patch.schedule },
              flow: { ...c.flow, ...patch.flow },
              verification: { ...c.verification, ...patch.verification },
              titles: { ...c.titles, ...patch.titles },
              hook: { ...c.hook, ...patch.hook },
              picker: { ...c.picker, ...patch.picker },
            },
          };
        }),

      recordChannelUploads: (rows) =>
        set((s) => {
          const byId = new Map(s.channelUploads.map((r) => [r.videoId, r]));
          for (const r of rows) byId.set(r.videoId, r);
          return { channelUploads: [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300) };
        }),

      logExperiment: (entry) => set((s) => ({ experimentLog: [entry, ...s.experimentLog].slice(0, 1000) })),

      watchRelease: (watch) => set((s) => ({ releaseWatch: { ...s.releaseWatch, [watch.videoId]: watch } })),

      updateReleaseWatch: (videoId, patch) =>
        set((s) =>
          s.releaseWatch[videoId]
            ? { releaseWatch: { ...s.releaseWatch, [videoId]: { ...s.releaseWatch[videoId], ...patch } } }
            : {},
        ),

      setWeekPlan: (plan) => set({ weekPlan: plan }),

      applyBankImport: (bank, meta, changedIds = []) =>
        set((s) => ({
          bank,
          bankMeta: meta,
          ...(changedIds.length ? { projects: resetProjectsForBank(s.projects, changedIds, Date.now()).projects } : {}),
        })),

      acceptedConditional: [],
      applyAutoImport: (result) =>
        set((s) => ({
          bank: result.plan.next,
          bankMeta: result.plan.banks,
          bankAuto: result.record,
          ...(result.plan.reset.length
            ? { projects: resetProjectsForBank(s.projects, result.plan.reset, result.record.at).projects }
            : {}),
        })),

      acceptConditional: (id) =>
        set((s) => (s.acceptedConditional.includes(id) ? {} : { acceptedConditional: [...s.acceptedConditional, id] })),

      acknowledgeBankImport: () => set((s) => (s.bankAuto ? { bankAuto: { ...s.bankAuto, seen: true } } : {})),

      updateBankEntry: (id, patch) =>
        set((s) => ({ bank: s.bank.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      recentArchetypes: () =>
        get()
          .projects.slice(0, 10)
          .map((p) => p.script.archetype)
          .filter(Boolean),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (s) => ({
        projects: s.projects,
        topics: s.topics,
        settings: s.settings,
        analytics: s.analytics,
        metadataLog: s.metadataLog,
        research: s.research,
        tacticRanking: s.tacticRanking,
        bank: s.bank,
        bankMeta: s.bankMeta,
        bankAuto: s.bankAuto,
        acceptedConditional: s.acceptedConditional,
        channelConfig: s.channelConfig,
        channelUploads: s.channelUploads,
        experimentLog: s.experimentLog,
        releaseWatch: s.releaseWatch,
        ypp: s.ypp,
        weekly: s.weekly,
        weekPlan: s.weekPlan,
      }),
      version: 5,
      migrate: (persisted, version) => migrateStudio(persisted, version, DEFAULT_CLIP_BUDGET) as any,
      merge: (persisted, current) => mergeStudio(persisted, current),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          useStudio.setState({ hydrated: true });
          return;
        }
        writesBlocked = true;
        useStudio.setState({ hydrated: true });
        backUpUnreadableStore().then((message) => {
          if (message) useStudio.setState({ loadProblem: message });
        });
      },
    },
  ),
);

if (useStudio.persist?.hasHydrated?.()) useStudio.setState({ hydrated: true });
