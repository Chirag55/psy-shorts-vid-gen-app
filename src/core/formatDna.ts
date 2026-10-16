export const TITLE_PATTERNS = [
  'NUMBERED_SIGNS',
  'NUMBERED_REASONS',
  'NUMBERED_TRICKS',
  'WHY_YOU',
  'QUESTION',
  'STATEMENT',
  'OTHER',
] as const;
export type TitlePattern = (typeof TITLE_PATTERNS)[number];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const SIGNS = /^(signs?|red flags?|clues?|symptoms?|warning signs?|tells?)$/;
const REASONS = /^(reasons?|ways?|causes?|things?|habits?|traits?|types?|mistakes?|questions?|facts?)$/;
const TRICKS = /^(tricks?|tactics?|techniques?|hacks?|secrets?|lines?|phrases?|strategies|tips?|methods?)$/;

/** A score at or above this (views ÷ the channel's usual) counts as an outlier. */
export const OUTLIER_SCORE = 2;
/** Recent uploads per format the channel's usual views are taken from. */
export const MEDIAN_WINDOW = 30;
/** Videos a pattern needs before it's trusted. */
export const MIN_PATTERN_VIDEOS = 8;

const PATTERN_LABELS: Record<TitlePattern, string> = {
  NUMBERED_SIGNS: 'a number and "signs" ("N Signs You…")',
  NUMBERED_REASONS: 'a number and "reasons" or "ways" ("N Reasons Why You…")',
  NUMBERED_TRICKS: 'a number and "tricks" ("N Tricks People Use…")',
  WHY_YOU: '"Why You…"',
  QUESTION: 'a question to the viewer',
  STATEMENT: 'a direct statement to the viewer',
  OTHER: 'a free-form title',
};

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const tokens = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The count a title leads with, as digits or a word, in its first eight words. */
export function titleNumber(title: string): number | undefined {
  for (const t of tokens(title).slice(0, 8)) {
    if (/^\d{1,3}$/.test(t)) return Number(t);
    if (NUMBER_WORDS[t]) return NUMBER_WORDS[t];
  }
  return undefined;
}

export function titlePatternOf(title: string): TitlePattern {
  const c = clean(title);
  const toks = tokens(c);
  for (let i = 0; i < Math.min(toks.length, 8); i++) {
    if (!(/^\d{1,3}$/.test(toks[i]) || Boolean(NUMBER_WORDS[toks[i]]))) continue;
    for (const t of toks.slice(i + 1, i + 4)) {
      if (SIGNS.test(t)) return 'NUMBERED_SIGNS';
      if (TRICKS.test(t)) return 'NUMBERED_TRICKS';
      if (REASONS.test(t)) return 'NUMBERED_REASONS';
    }
  }
  if (/^why\b/i.test(c) && /\b(you|your|you're|you’re|we|our)\b/i.test(c)) return 'WHY_YOU';
  if (/\?\s*(\(|$)/.test(c) || /^(how|what|do|does|did|is|are|can|could|should|would|will|why|when|who)\b/i.test(c)) {
    return 'QUESTION';
  }
  if (/^(you|your|you're|you’re|if|they|he|she|we|i|this|that|these|those|the|a|an|when|every|stop|never|always)\b/i.test(c)) {
    return 'STATEMENT';
  }
  return 'OTHER';
}

export function titleDna(title: string) {
  const t = clean(title);
  const n = titleNumber(t);
  return {
    pattern: titlePatternOf(t),
    ...(n !== undefined ? { number: n } : {}),
    wordCount: t ? t.split(' ').length : 0,
    charCount: t.length,
    hasSecondPerson: /\b(you|your|you're|you’re|yours|yourself)\b/i.test(t),
    hasParentheticalKeyword: /\([^)]{2,}\)\s*$/.test(t),
  };
}

export function isShortVideo(v: { durationSeconds: number; title?: string; description?: string }): boolean {
  if (v.durationSeconds <= 0) return false;
  if (v.durationSeconds <= 60) return true;
  return v.durationSeconds <= 180 && /#shorts?\b/i.test(`${v.title ?? ''} ${v.description ?? ''}`);
}

export interface WatchedVideo {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  views: number;
  likes: number;
  comments: number;
  isShort: boolean;
  pattern: TitlePattern;
  score: number;
}

/** A watched channel's uploads, each scored against its format's usual views. */
export function watchChannel(
  channelId: string,
  uploads: {
    videoId: string;
    title: string;
    description?: string;
    publishedAt: string;
    durationSeconds: number;
    viewCount: number;
    likeCount?: number;
    commentCount?: number;
  }[],
): WatchedVideo[] {
  const items = uploads
    .map((u) => ({ u, short: isShortVideo(u) }))
    .sort((a, b) => b.u.publishedAt.localeCompare(a.u.publishedAt));
  const usual = {
    short: median(items.filter((i) => i.short).slice(0, MEDIAN_WINDOW).map((i) => i.u.viewCount)),
    long: median(items.filter((i) => !i.short).slice(0, MEDIAN_WINDOW).map((i) => i.u.viewCount)),
  };
  return items.map(({ u, short }) => {
    const base = short ? usual.short : usual.long;
    return {
      videoId: u.videoId,
      channelId,
      title: u.title,
      publishedAt: u.publishedAt,
      durationSeconds: u.durationSeconds,
      views: u.viewCount,
      likes: u.likeCount ?? 0,
      comments: u.commentCount ?? 0,
      isShort: short,
      pattern: titlePatternOf(u.title),
      score: base > 0 ? Math.round((u.viewCount / base) * 100) / 100 : 0,
    };
  });
}

export interface PatternRow {
  pattern: TitlePattern;
  format: 'short' | 'long';
  videos: number;
  medianScore: number;
  outlierShare: number;
}

export function patternTable(rows: WatchedVideo[]): PatternRow[] {
  const out: PatternRow[] = [];
  for (const format of ['short', 'long'] as const) {
    for (const pattern of TITLE_PATTERNS) {
      const vs = rows.filter((r) => r.pattern === pattern && r.isShort === (format === 'short') && r.score > 0);
      if (!vs.length) continue;
      out.push({
        pattern,
        format,
        videos: vs.length,
        medianScore: Math.round(median(vs.map((v) => v.score)) * 100) / 100,
        outlierShare: Math.round((vs.filter((v) => v.score >= OUTLIER_SCORE).length / vs.length) * 100) / 100,
      });
    }
  }
  return out.sort((a, b) => b.medianScore - a.medianScore);
}

export function topPatterns(table: PatternRow[], format: 'short' | 'long', n = 3): PatternRow[] {
  return table.filter((r) => r.format === format && r.videos >= MIN_PATTERN_VIDEOS && r.pattern !== 'OTHER').slice(0, n);
}

/** A planner note on the title shapes winning in the niche. */
export function patternHint(top: PatternRow[]): string {
  if (!top.length) return '';
  return `Title shapes that are winning in this niche right now: ${top
    .map((p) => `${PATTERN_LABELS[p.pattern]} (median ${p.medianScore.toFixed(1)}× its channel's usual views)`)
    .join('; ')}. Follow the shape, never reuse a specific competitor title.`;
}
