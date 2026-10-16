import { titleDna, titlePatternOf } from './formatDna';

export const LONG_TITLE_MAX = 60;
export const SHORT_TITLE_MAX = 70;
export const SHORT_ALT_MAX = 70;
/** Thumbnail words that still read at 120 px wide. */
export const THUMB_WORDS_MAX = 4;

const UNPROVEN = /\b(science (proves|says|shows)|scientifically proven|proven to|guaranteed|100% (works|effective))\b/i;
const CLINICAL =
  /\byou (have|are suffering from|suffer from|might have|probably have|definitely have)\s+(depression|anxiety|adhd|autism|bipolar|ptsd|bpd|ocd|npd|narcissistic personality|a personality disorder|trauma)\b|\bdiagnos(e|is|ed)\b/i;
const FIRST_NUMBER_WORD = /^(one|two|three|four|five|six|seven|eight|nine|ten)$/i;
const COUNT_WORDS: Record<number, string> = { 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven' };
const HASHTAG = /\s*#[\p{L}\p{N}_]+/gu;

/** Concept names a Short title shouldn't open on. */
export const CONCEPT_LEADS = [
  'anchoring', 'scarcity', 'reciprocity', 'pratfall', 'foot in the door', 'door in the face', 'sunk cost',
  'confirmation bias', 'availability heuristic', 'hindsight bias', 'loss aversion', 'halo effect', 'spotlight effect',
  'decoy effect', 'barnum effect', 'framing effect', 'mere exposure', 'social proof', 'authority bias',
  'labeling effect', 'ben franklin effect', 'chameleon effect', 'planning fallacy', 'choice overload',
  'illusion of transparency', 'misattribution', 'cognitive dissonance', 'endowment effect', 'ikea effect',
  'peak end rule', 'liking gap', 'darvo', 'gaslighting', 'love bombing', 'intermittent reinforcement', 'ostracism',
  'prestige', 'dominance', 'priming', 'nudge', 'bystander effect',
];

export interface TitleIssue {
  level: 'red' | 'amber';
  rule: string;
  message: string;
}

export interface LongTitleInput {
  title: string;
  itemCount?: number;
  keywords?: string[];
  thumbnailText?: string;
}

export function lintLongTitle(input: LongTitleInput): TitleIssue[] {
  const title = input.title.trim().replace(/\s+/g, ' ');
  const out: TitleIssue[] = [];
  const dna = titleDna(title);
  const pattern = titlePatternOf(title);
  if (
    !/^psychology of\b/i.test(title) &&
    pattern !== 'NUMBERED_SIGNS' &&
    pattern !== 'NUMBERED_REASONS' &&
    pattern !== 'NUMBERED_TRICKS' &&
    pattern !== 'WHY_YOU'
  ) {
    out.push({
      level: 'red',
      rule: 'search-pattern',
      message: 'Not a searchable pattern: use "N Signs/Reasons/Ways/Tricks…", "Why You…" or "Psychology of …: …".',
    });
  }
  let stated: number | undefined;
  const m = /\b(\d{1,2})\s+[A-Za-z' -]{0,30}?(signs?|reasons?|ways?|tricks?|tactics?|things?|red flags?)\b/i.exec(title);
  if (m) stated = Number(m[1]);
  else if (FIRST_NUMBER_WORD.test(title.split(' ')[0] ?? '')) stated = dna.number;
  if (input.itemCount !== undefined && dna.number !== undefined && (stated ?? dna.number) !== input.itemCount) {
    out.push({
      level: 'red',
      rule: 'count',
      message: `The title says ${stated ?? dna.number} but the episode lists ${input.itemCount}.`,
    });
  }
  if (title.length > LONG_TITLE_MAX) {
    out.push({ level: 'red', rule: 'length', message: `${title.length} characters; ${LONG_TITLE_MAX} or fewer.` });
  }
  if (input.keywords?.length && !input.keywords.some((k) => k.trim() && title.toLowerCase().includes(k.trim().toLowerCase()))) {
    out.push({
      level: 'amber',
      rule: 'keyword',
      message: `No plain-language keyword a viewer would type (${input.keywords.slice(0, 3).join(', ')}).`,
    });
  }
  if (!dna.hasSecondPerson) out.push({ level: 'amber', rule: 'you', message: 'No "you" or "your".' });
  if (UNPROVEN.test(title)) {
    out.push({ level: 'red', rule: 'unproven', message: 'An unproven claim ("science proves", "guaranteed").' });
  }
  if (CLINICAL.test(title)) out.push({ level: 'red', rule: 'clinical', message: 'Clinical or diagnostic phrasing.' });
  const caps = title
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ''))
    .filter((w) => w.length >= 2 && w === w.toUpperCase());
  if (caps.length > 1) {
    out.push({ level: 'amber', rule: 'caps', message: `${caps.length} all-caps words (${caps.join(', ')}); one acronym is fine.` });
  }
  if (input.thumbnailText !== undefined) out.push(...lintThumbText(input.thumbnailText));
  return out;
}

/** The first of the title and its alternatives that passes with no red issue. */
export function searchIntentTitle(input: LongTitleInput, alternatives: string[] = []): string | undefined {
  return [input.title, ...alternatives].find(
    (t) => Boolean(t.trim()) && !lintLongTitle({ ...input, title: t, thumbnailText: undefined }).some((i) => i.level === 'red'),
  );
}

export function lintThumbText(text: string): TitleIssue[] {
  const words = text.replace(/\*/g, '').trim().split(/\s+/).filter(Boolean);
  if (!(words.length > THUMB_WORDS_MAX)) return [];
  return [
    {
      level: 'red',
      rule: 'thumb-words',
      message: `Thumbnail text is ${words.length} words; ${THUMB_WORDS_MAX} or fewer so it reads at 120 px wide.`,
    },
  ];
}

/** The count a Short's script promises in its opening, three when it names none. */
export function promisedCount(script: string): number {
  const m = /\b(three|four|five|six|seven)\b/i.exec(script.split(/\s+/).slice(0, 14).join(' '));
  if (!m) return 3;
  return Number(Object.entries(COUNT_WORDS).find(([, w]) => w === m[1].toLowerCase())?.[0]);
}

/** The concept name a title opens on, if any. */
export function conceptLead(title: string): string | undefined {
  const norm = title
    .split('|')[0]
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lead = ` ${norm.split(' ').slice(0, 3).join(' ')} `;
  return CONCEPT_LEADS.find((c) => lead.includes(` ${c} `) || `${norm} `.startsWith(`${c} `));
}

export interface ShortTitlesInput {
  title: string;
  alt?: string;
  count?: number;
  numbered?: boolean;
}

export function lintShortTitles(input: ShortTitlesInput): TitleIssue[] {
  const out: TitleIssue[] = [];
  const check = (label: string, raw: string, max: number) => {
    const full = raw.trim();
    const text = full.replace(HASHTAG, '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (text.length > max) {
      out.push({ level: 'red', rule: 'length', message: `${label} is ${text.length} characters; ${max} or fewer.` });
    }
    const count = input.count ?? 3;
    const word = COUNT_WORDS[count] ?? count;
    const both = [input.title, input.alt ?? ''];
    const hasWhy = both.some((t) => /^why\b/i.test(t.trim()));
    if (input.numbered) {
      const says = (t: string) => new RegExp(`\\b(${count}|${word})\\b`, 'i').test(t.replace(HASHTAG, ''));
      if (!says(text)) {
        const level = hasWhy || both.some(says) ? 'amber' : 'red';
        out.push({
          level,
          rule: 'count',
          message: `${label} should say "${count}" or "${word}": the Short lists ${word}.`,
        });
      }
    }
    if (UNPROVEN.test(text)) out.push({ level: 'red', rule: 'unproven', message: `${label} has an unproven claim.` });
    if (CLINICAL.test(text)) {
      out.push({ level: 'red', rule: 'clinical', message: `${label} has clinical or diagnostic phrasing.` });
    }
    const lead = conceptLead(text);
    if (lead) {
      out.push({
        level: 'amber',
        rule: 'concept-first',
        message: `${label} opens on a concept name ("${lead}"); lead with the viewer's situation or a number and put the concept after a "|".`,
      });
    }
    if (/\([^)]*\)/.test(text)) {
      out.push({ level: 'amber', rule: 'parenthetical', message: `${label} has a parenthetical; use "|" for the keyword instead.` });
    }
    const tags = full.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > 3) {
      out.push({
        level: 'amber',
        rule: 'title-hashtags',
        message: `${label} has ${tags.length} hashtags; #shorts and two topical ones at most.`,
      });
    }
    if (full.length > 100) {
      out.push({
        level: 'amber',
        rule: 'title-total',
        message: `${label} is ${full.length} characters with its hashtags; 100 or fewer: drop hashtags before shortening the title.`,
      });
    }
  };
  check('The title', input.title, SHORT_TITLE_MAX);
  if (input.alt) check('The alt title', input.alt, SHORT_ALT_MAX);
  return out;
}
