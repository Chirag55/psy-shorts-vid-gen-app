import { LONGFORM_RESPONSE_SCHEMA, SHORTFORM_RESPONSE_SCHEMA, TOPIC_IDEAS_SCHEMA } from '@/core/schemas';
import { longFormInstruction, shortFormInstruction, topicIdeasInstruction } from '@/core/prompts';
import { withStyleLock } from '@/core/styleLock';
import { moveForChapter } from '@/core/kenburns';
import type { Chapter, LongScript, ShortBeat, ShortScript } from '@/core/types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export class GeminiError extends Error {}

interface GenerateOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

async function generateJson<T>(
  opts: GenerateOptions,
  instruction: string,
  schema: unknown
): Promise<T> {
  const model = opts.model || DEFAULT_MODEL;

  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': opts.apiKey,
    },
    signal: opts.signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: instruction }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 400) || res.statusText}`);
  }

  const payload = await res.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason ?? payload?.promptFeedback?.blockReason;
    throw new GeminiError(
      reason ? `Gemini returned no content (${reason}).` : 'Gemini returned an empty response.'
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError('Gemini returned malformed JSON despite the response schema.');
  }
}

export async function generateShortScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  recentArchetypes: string[] = []
): Promise<ShortScript> {
  const raw = await generateJson<{
    title: string;
    hookLine: string;
    characterDescription: string;
    archetype: string;
    beats: ShortBeat[];
    hashtags: string[];
  }>(opts, shortFormInstruction(topic, category, recentArchetypes), SHORTFORM_RESPONSE_SCHEMA);

  // The style lock is in the prompt, but enforce it here too — a clip generated
  // without it breaks visual continuity for the whole video and wastes credits.
  return {
    mode: 'short',
    title: raw.title,
    hookLine: raw.hookLine,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    hashtags: raw.hashtags ?? [],
    beats: (raw.beats ?? []).map((b) => ({ ...b, clipPrompt: withStyleLock(b.clipPrompt) })),
  };
}

export async function generateLongScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  chapterCount = 4,
  recentArchetypes: string[] = []
): Promise<LongScript> {
  const raw = await generateJson<{
    title: string;
    coldOpen: string;
    characterDescription: string;
    archetype: string;
    closingSynthesis: string;
    chapters: Array<Omit<Chapter, 'index' | 'kenBurns'>>;
    tags: string[];
  }>(opts, longFormInstruction(topic, category, chapterCount, recentArchetypes), LONGFORM_RESPONSE_SCHEMA);

  return {
    mode: 'long',
    title: raw.title,
    coldOpen: raw.coldOpen,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    closingSynthesis: raw.closingSynthesis,
    tags: raw.tags ?? [],
    chapters: (raw.chapters ?? []).map((c, i) => ({
      ...c,
      index: i + 1,
      kenBurns: moveForChapter(i),
      heroA: withStyleLock(c.heroA),
      heroB: withStyleLock(c.heroB),
      stillPrompt: withStyleLock(c.stillPrompt),
    })),
  };
}

export interface TopicIdea {
  topic: string;
  category: string;
  angle: string;
}

export async function generateTopicIdeas(
  opts: GenerateOptions,
  category: string,
  count: number,
  existing: string[]
): Promise<TopicIdea[]> {
  const raw = await generateJson<{ topics: TopicIdea[] }>(
    opts,
    topicIdeasInstruction(category, count, existing),
    TOPIC_IDEAS_SCHEMA
  );
  return raw.topics ?? [];
}

/** Cheap reachability probe for the Settings screen's key status row. */
export async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: { 'x-goog-api-key': apiKey } });
    return res.ok;
  } catch {
    return false;
  }
}
