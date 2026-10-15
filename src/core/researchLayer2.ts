import { LAYER2 } from './researchConfig';

/**
 * Research layer 2: a cheap model labels each candidate Short from its title
 * and hashtags, so only real psychology explainers survive. Labels are cached
 * per title+hashtags hash so a re-run costs nothing.
 */

export interface Layer2Item {
  videoId: string;
  titleClean: string;
  hashtags: string[];
}

export interface Layer2Label {
  label: string;
  confidence: number;
}

export interface Layer2CacheEntry extends Layer2Label {
  key: string;
  at: string;
}

export type Layer2Cache = Record<string, Layer2CacheEntry>;

export interface Layer2Result {
  labels: Record<string, Layer2Label>;
  fresh: Layer2Cache;
  status: 'run' | 'partial' | 'failed';
  sent: number;
  error?: string;
}

export function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function cacheKey(item: Layer2Item): string {
  return `${LAYER2.promptVersion}:${fnv1a(`${item.titleClean}|${item.hashtags.join(' ')}`)}`;
}

export function layer2Prompt(items: Layer2Item[]): string {
  const lines = items
    .map((it, i) => `t${i + 1} | ${it.titleClean.replace(/\|/g, '/')} | ${it.hashtags.map((h) => `#${h}`).join(' ')}`)
    .join('\n');
  return (
    'You classify YouTube Shorts for a faceless psychology-explainer channel\n(topics: manipulation tactics, body language, persuasion, cognitive biases, social behaviour,\nrelationships, emotions, work and family life).\n\n' +
    'For each title, answer with one label:\n- EXPLAINER: teaches a psychology concept, tactic, bias, or behaviour pattern.\n- CLIP: a TV, movie, anime or fan-edit clip, or a scene from a show.\n- SKIT: comedy, prank, meme, or a relationship or family sketch.\n- MOTIVATION: motivational, "sigma", grindset, success or self-help hype with no psychology explained.\n- LONGFORM_CLIP: a clip cut from a podcast, interview, lecture or long video.\n- OFFTOPIC: anything else.\n\n' +
    'Give a confidence from 0 to 1. Judge the title and hashtags only.\n\nReturn JSON only: {"items": [{"id": "t1", "label": "EXPLAINER", "confidence": 0.9}, ...]}, one per title.\n\nTitles (id | title | hashtags):\n' +
    lines
  );
}

/** Model JSON → videoId → label; unknown labels become OFFTOPIC, confidence clamped to 0-1. */
export function parseLayer2Response(json: any, items: Layer2Item[]): Map<string, Layer2Label> {
  const out = new Map<string, Layer2Label>();
  const list = Array.isArray(json) ? json : json?.items;
  if (!Array.isArray(list)) return out;
  for (const row of list) {
    const m = /^t(\d+)$/.exec(String(row.id ?? '').trim());
    const item = m ? items[Number(m[1]) - 1] : undefined;
    if (!item) continue;
    const raw = String(row.label ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const label = LAYER2.labels.includes(raw) ? raw : 'OFFTOPIC';
    const c = Number(row.confidence);
    out.set(item.videoId, { label, confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0 });
  }
  return out;
}

export function isKept(l: Layer2Label): boolean {
  return l.label === LAYER2.keep && l.confidence >= LAYER2.minConfidence;
}

export function layer2Reason(l: Layer2Label): string {
  if (l.label !== LAYER2.keep) return `Layer 2: ${l.label} (${l.confidence.toFixed(2)})`;
  return `Layer 2: EXPLAINER below ${LAYER2.minConfidence} (${l.confidence.toFixed(2)})`;
}

/**
 * Labels every item: cached labels first, the rest in batches; a batch's
 * missing rows are asked once more. A failure keeps what was labelled.
 */
export async function runLayer2(
  items: Layer2Item[],
  cache: Layer2Cache,
  classify: (batch: Layer2Item[]) => Promise<Map<string, Layer2Label>>,
  onProgress?: (done: number, total: number) => void,
  now: Date = new Date(),
): Promise<Layer2Result> {
  const labels: Record<string, Layer2Label> = {};
  const fresh: Layer2Cache = {};
  const pending: Layer2Item[] = [];
  for (const it of items) {
    const c = cache[it.videoId];
    if (c && c.key === cacheKey(it)) labels[it.videoId] = { label: c.label, confidence: c.confidence };
    else pending.push(it);
  }
  const store = (it: Layer2Item, l: Layer2Label) => {
    labels[it.videoId] = l;
    fresh[it.videoId] = { ...l, key: cacheKey(it), at: now.toISOString() };
  };
  let sent = 0;
  try {
    for (let i = 0; i < pending.length; i += LAYER2.batchSize) {
      const batch = pending.slice(i, i + LAYER2.batchSize);
      onProgress?.(i, pending.length);
      sent += batch.length;
      const got = await classify(batch);
      for (const it of batch) {
        const l = got.get(it.videoId);
        if (l) store(it, l);
      }
      const missing = batch.filter((it) => !labels[it.videoId]);
      if (missing.length) {
        const again = await classify(missing);
        for (const it of missing) {
          const l = again.get(it.videoId);
          if (l) store(it, l);
        }
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { labels, fresh, status: Object.keys(labels).length ? 'partial' : 'failed', sent, error };
  }
  return { labels, fresh, status: 'run', sent };
}

/** Old and new cache merged, expired entries dropped, newest kept up to the cap. */
export function mergeLayer2Cache(old: Layer2Cache, fresh: Layer2Cache, now: Date): Layer2Cache {
  const cutoff = now.getTime() - LAYER2.cacheDays * 86_400_000;
  const kept = Object.entries({ ...old, ...fresh })
    .filter(([, v]) => new Date(v.at).getTime() >= cutoff)
    .sort((a, b) => b[1].at.localeCompare(a[1].at));
  return Object.fromEntries(kept.slice(0, LAYER2.cacheMax));
}
