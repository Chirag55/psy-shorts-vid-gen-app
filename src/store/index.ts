import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Emotion } from '@/core/mascot';
import type { AssetState, Project, ScriptBody, TopicBankEntry, WordTiming } from '@/core/types';
import { datedSlug } from '@/core/slug';
import { DEFAULT_VOICE_ID } from '@/services/elevenlabs';
import { deleteProjectFiles } from '@/services/workspace';

const emptyAssets = (): AssetState => ({
  clips: {},
  stills: {},
  audio: {},
  alignment: {},
  segments: {},
});

export interface Settings {
  voiceId: string;
  geminiModel: string;
  includeMascot: boolean;
  includeCaptions: boolean;
  draftRender: boolean;
  defaultPrivacy: 'private' | 'unlisted' | 'public';
  mascotAssets: Partial<Record<Emotion, string>>;
  /** Locally tracked ElevenLabs spend, so the guard works even offline. */
  voiceCharsUsed: number;
  voiceCharLimit: number;
}

interface StudioState {
  projects: Project[];
  topics: TopicBankEntry[];
  settings: Settings;
  hydrated: boolean;

  createProject: (input: { topic: string; category: string; script: ScriptBody }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  patchAssets: (id: string, patch: Partial<AssetState>) => void;
  setClip: (id: string, key: string, uri: string) => void;
  setStill: (id: string, key: string, uri: string) => void;
  setAudio: (id: string, key: string, uri: string, words: WordTiming[]) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;

  addTopics: (entries: Array<{ topic: string; category: string }>) => void;
  markTopicUsed: (id: string) => void;
  removeTopic: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  addVoiceSpend: (chars: number) => void;

  /** Archetypes from the last 10 scripts, fed back into generation to stop repeats. */
  recentArchetypes: () => string[];
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      projects: [],
      topics: [],
      hydrated: false,
      settings: {
        voiceId: DEFAULT_VOICE_ID,
        geminiModel: 'gemini-2.5-flash',
        includeMascot: true,
        includeCaptions: true,
        draftRender: true,
        defaultPrivacy: 'private',
        mascotAssets: {},
        voiceCharsUsed: 0,
        voiceCharLimit: 10_000,
      },

      createProject: ({ topic, category, script }) => {
        const now = Date.now();
        const project: Project = {
          id: newId(),
          slug: datedSlug(script.title || topic, new Date(now)),
          mode: script.mode,
          topic,
          category,
          createdAt: now,
          updatedAt: now,
          script,
          assets: emptyAssets(),
          voiceId: get().settings.voiceId,
          publish: {
            title: script.title,
            description: '',
            tags: (script.mode === 'short' ? script.hashtags : script.tags).join(', '),
            privacyStatus: get().settings.defaultPrivacy,
          },
        };
        set((s) => ({ projects: [project, ...s.projects] }));
        return project;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
        })),

      patchAssets: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, assets: { ...p.assets, ...patch }, updatedAt: Date.now() } : p
          ),
        })),

      setClip: (id, key, uri) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, assets: { ...p.assets, clips: { ...p.assets.clips, [key]: uri } }, updatedAt: Date.now() }
              : p
          ),
        })),

      setStill: (id, key, uri) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, assets: { ...p.assets, stills: { ...p.assets.stills, [key]: uri } }, updatedAt: Date.now() }
              : p
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
              : p
          ),
        })),

      deleteProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (project) {
          try {
            deleteProjectFiles(project.slug);
          } catch {
            // A missing workspace directory is not a reason to keep a dead project row.
          }
        }
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
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

      recentArchetypes: () =>
        get()
          .projects.slice(0, 10)
          .map((p) => p.script.archetype)
          .filter(Boolean),
    }),
    {
      name: 'mindfiles-studio',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ projects: s.projects, topics: s.topics, settings: s.settings }),
      onRehydrateStorage: () => () => {
        useStudio.setState({ hydrated: true });
      },
    }
  )
);

// A cold start with no persisted state never fires onRehydrateStorage, so mark
// hydration directly when the middleware reports it is already done.
if (useStudio.persist?.hasHydrated?.()) {
  useStudio.setState({ hydrated: true });
}
