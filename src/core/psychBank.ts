/**
 * The psychology-Shorts bank ("## MF-0xx | Title" with "- field: value"
 * lines): parse, lint, and convert to v2 YAML entries; lint its long-form
 * plans. Rebuilt from 6.1.13.
 */
import { checkLfPlan, lfSpoken, parseLfPlans, shortsEvidence, type LfCheck } from './longformPlan';
import { CLIP_MOVES, STILL_MOVES, TYPED_PATTERN } from './shortFormat';

export const PSYCH_SHORT_HEADING = /^## (MF-\d{3}) \| (.*)$/;
/** Psych ids already in the v2 bank under a D code. */
export const D_CODE_OF: Record<string, string> = {
  'MF-024': 'D11', 'MF-023': 'D03', 'MF-019': 'D14', 'MF-026': 'D19', 'MF-046': 'D20', 'MF-013': 'D35',
  'MF-007': 'D31', 'MF-039': 'D49', 'MF-014': 'D36', 'MF-044': 'D54', 'MF-031': 'D43', 'MF-033': 'D44',
  'MF-011': 'D05', 'MF-045': 'D59', 'MF-037': 'D47', 'MF-053': 'D10', 'MF-041': 'D51', 'MF-008': 'D32',
  'MF-054': 'D30', 'MF-065': 'D01', 'MF-042': 'D52', 'MF-012': 'D34', 'MF-043': 'D53', 'MF-018': 'D38',
  'MF-048': 'D06', 'MF-029': 'D41', 'MF-009': 'D33', 'MF-020': 'D18', 'MF-021': 'D39', 'MF-016': 'D28',
  'MF-015': 'D37', 'MF-058': 'D64', 'MF-022': 'D40', 'MF-034': 'D45', 'MF-040': 'D50', 'MF-050': 'D67',
  'MF-052': 'D22', 'MF-030': 'D42', 'MF-035': 'D46', 'MF-059': 'D66', 'MF-038': 'D48',
};
/** D codes kept from the old bank. */
export const RETAINED_D = ['D23', 'D16', 'D55', 'D56', 'D57', 'D58', 'D60', 'D61', 'D62', 'D63', 'D65'];
const PUBLISHED_AT: Record<string, string> = { 'MF-024': '2026-10-05', 'MF-038': '2026-10-06' };

export function dCodeFor(id: string): string {
  return D_CODE_OF[id] ?? `D${100 + Number(id.slice(3))}`;
}

const TACTIC_IDS = new Set(['MF-023', 'MF-024', 'MF-025', 'MF-026', 'MF-027', 'MF-032', 'MF-062']);
const MYTH_IDS = new Set(['MF-028', 'MF-029', 'MF-033', 'MF-064']);
const DEFENSE_IDS = new Set(['MF-037']);
const TACTIC_CATEGORIES = new Set(['Persuasion & Influence']);
const LF_MAP: Record<string, string> = {
  'LF-01': 'MF-L-01',
  'LF-02': 'MF-L-03',
  'LF-03': 'MF-L-07',
  'LF-04': 'MF-L-01',
  'LF-05': 'MF-L-03',
  'LF-06': 'MF-L-05',
};
const CITATION_RE =
  /\b(19|20)\d\d\b|researchers?\b|\bstud(y|ies)\b|experiments?\b|psychologists?\b|et al|journal|professor|\bin 19|after an old|named after|coined|original authors?|was first (described|named)|comes from the/i;
const CULTURE_RE = /rupee|lakh|crore|diwali|holi\b|chai\b|rickshaw|mumbai|delhi|bangalore|\bflat\b|\bhoot\b|\bowl|\bowls\b/i;
const SIGN_OFF = 'Stay curious, stay sharp.';
const MOTION_RE =
  /\b(slam|snap|slap|jab|jolt|yank|rip|flick|race|spin|swipe|scroll|slip|snatch|typ|delet|flip|grab|throw|thrown|toss|drop|trip|pil(?:e|ing)|light(?:s|ing)? up|lights?\b|dim|blink|wilt|flash|swirl|jerk|burst|shatter|spill|crash|buzz|vibrat|rush|tear|pour|swing|knock|dart|nod|tighten|unwrap|taps?\b|appear|stack|swap|turns?\b|pulls?\b|push|press|lifts?\b|lowers?\b|clos(?:e|es|ing)\b|loosen|curl|stand|rise|scribbl|clap|flinch|slid|shov|freez|bounc|bob|puls|sprint|banks?\b|climb|leap|jump|thump|spik|flutter|flicker|circl|lock|drift|stop|pop|tilt|clench|sweep|polish)/i;
const CATEGORIES = ['Persuasion & Influence', 'Cognitive Bias', 'Relationship Dynamics', 'Body Language'];
const TACTIC_STOP = new Set([
  'effect', 'bias', 'technique', 'fallacy', 'rule', 'heuristic', 'stress', 'the', 'and', 'of', 'in', 'on', 'a', 'to',
  'facts', 'about', 'you', 'used', 'tricks',
]);
const PRIORITY: Record<string, string> = { A: 'high', B: 'medium', C: 'low', published: 'medium' };
const REQUIRED = [
  'yt_title', 'yt_title_final', 'yt_hashtags', 'yt_description', 'yt_tags', 'yt_pinned_comment', 'ig_keywords',
  'ig_line1', 'ig_hashtags', 'ig_first_comment', 'source_line', 'priority', 'evidence', 'hook', 'hook_alt',
  'hook_text', 'narration',
];

const firstSentence = (s: string) => s.split(/(?<=[.?!])\s/)[0] ?? '';
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);
const tagOf = (id: string) => id.replace('-', '');
const q = (v: unknown) => JSON.stringify(v);
const list = (key: string, items: string[]) => (items.length ? [`${key}:`, ...items.map((x) => `  - ${q(x)}`)] : []);

export interface PsychShort {
  id: string;
  title: string;
  fields: Record<string, string>;
}

export function isPsychBank(md: string): boolean {
  return /^## MF-\d{3} \| /m.test(md) && /^- yt_title_final:/m.test(md);
}

export function fieldsOf(chunk: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of chunk.split(/\r?\n/)) {
    const m = /^- (\w+): (.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function parsePsychBank(md: string): { shorts: PsychShort[]; queue: string[]; plans: string[] } {
  const [shortsPart, lfPart = ''] = md.split(/^# Long-form episodes.*$/m);
  const shorts: PsychShort[] = [];
  for (const chunk of shortsPart.split(/\r?\n(?=## MF-\d{3} \|)/)) {
    const m = PSYCH_SHORT_HEADING.exec(chunk.split(/\r?\n/)[0]);
    if (m) shorts.push({ id: m[1], title: m[2].trim(), fields: fieldsOf(chunk) });
  }
  const ids = (re: RegExp) => re.exec(shortsPart)?.[1]?.match(/MF-\d{3}/g) ?? [];
  const queue = [...ids(/\*\*Days 1 to 14[^*]*\*\*\s*(.*)/), ...ids(/\*\*Days 15 to 30[^*]*\*\*\s*(.*)/)];
  const plans = [...lfPart.matchAll(/^## (LF-\d{2}) \|/gm)].map((m) => m[1]);
  return { shorts, queue, plans };
}

/** CR-88B: the opening clip must already be moving in its first second. */
export function psychShortWarnings(s: PsychShort): string[] {
  const out: string[] = [];
  if ((s.fields.status ?? '').includes('published')) return out;
  const beats = (s.fields.visual_beats ?? '').split('//').map((b) => b.split('|').map((p) => p.trim()));
  const c1 = beats.find((b) => /-C1\b/.test(b[0] ?? ''));
  if (c1 && c1[3] && !MOTION_RE.test(c1[3])) {
    out.push(
      `${s.id}: the opening clip (C1) shows no movement in its first second ("${c1[3]}"); write it so the action is already underway (CR-88B)`,
    );
  }
  return out;
}

/** The A/B test a queue day runs: profile alternates daily, hook every two days. */
export function scheduledTest(day: number): { profile: 'calm' | 'punchy'; hook: 'label' | 'pov' } {
  return {
    profile: day % 2 === 1 ? 'calm' : 'punchy',
    hook: Math.floor((day - 1) / 2) % 2 === 1 ? 'pov' : 'label',
  };
}

export function lintPsychShort(s: PsychShort): string[] {
  const f = s.fields;
  const out: string[] = [];
  const published = (f.status ?? '').includes('published');
  if (!CATEGORIES.includes(f.category)) out.push('category');
  for (const k of REQUIRED) if (!f[k]) out.push(`missing ${k}`);
  if (published) return out;

  const narration = f.narration ?? '';
  const body = narration.replace(" ...and that's the mind for you. Stay curious, stay sharp.", '');
  const n = wordsOf(body).length;
  const numbered = f.format === 'numbered_list' || ['MF-041', 'MF-042', 'MF-043'].includes(s.id);
  if (!narration.endsWith(SIGN_OFF)) out.push('sign-off');
  const cite = CITATION_RE.exec(body);
  if (cite) out.push(`citation: "${cite[0]}"`);
  if (/\b(19|20)\d\d\b/.test([f.yt_title, f.yt_title_alt, f.hook_text].filter(Boolean).join(' '))) {
    out.push('year in title/alt/hook_text');
  }
  if (!(n >= 36 && n <= (numbered ? 82 : 66))) out.push(`${n} words`);
  if (45 < n / 2.1 + 2) out.push(`estimated length ${Math.round(n / 2.1 + 2)} s, over 45 s`);
  if (f.queue_day !== undefined) {
    const pov = f.hook_text_pov ?? '';
    const pw = wordsOf(pov).length;
    if (!pov.startsWith('POV:') || pw < 3 || pw > 9 || /\b(19|20)\d\d\b/.test(pov)) out.push('hook_text_pov invalid');
    if (f.test_profile !== 'calm' && f.test_profile !== 'punchy') out.push('test_profile');
    if (f.test_hook !== 'label' && f.test_hook !== 'pov') out.push('test_hook');
    const day = Number(f.queue_day);
    const t = scheduledTest(day);
    if (!Number.isInteger(day) || f.test_profile !== t.profile || f.test_hook !== t.hook) out.push('test schedule mismatch');
  }
  for (const k of ['hook', 'hook_alt']) {
    if (f[k] && wordsOf(firstSentence(f[k])).length > 12) out.push(`${k} first sentence over 12 words`);
  }
  if (f.hook && !body.startsWith(firstSentence(f.hook))) out.push('hook is not the start of the narration');
  const hw = wordsOf(f.hook_text ?? '').length;
  if (!(hw >= 2 && hw <= 6)) out.push('hook_text is not 2 to 6 words');
  if ((f.yt_title ?? '').length > 60) out.push('yt_title over 60');
  const opening = body
    .split(/(?<=[.?!])\s/)
    .slice(0, 3)
    .join(' ')
    .toLowerCase()
    .replace(/'/g, '');
  const terms =
    (f.tactic ?? '')
      .toLowerCase()
      .replace(/'/g, '')
      .match(/[a-z]{4,}/g)
      ?.filter((w) => !TACTIC_STOP.has(w)) ?? [];
  if (terms.length && !numbered && !terms.some((t) => opening.includes(t))) out.push('tactic not in the first 3 sentences');

  const beats = (f.visual_beats ?? '').split('//').map((b) => b.trim());
  if (beats.length === 6) {
    const sizes: string[] = [];
    const settings = new Set<string>();
    const cams: string[] = [];
    beats.forEach((beat, i) => {
      const p = beat.split('|').map((x) => x.trim());
      if (p.length !== 5) {
        out.push('beat fields');
        return;
      }
      const [id, type = ''] = p[0].split(/\s+/);
      if (type !== TYPED_PATTERN[i]) out.push(`beat type ${id}`);
      if (!id.startsWith(tagOf(s.id))) out.push(`beat id ${id}`);
      sizes.push(p[1].toLowerCase());
      settings.add(p[2].toLowerCase());
      cams.push(p[4]);
      if (type.startsWith('clip') && !CLIP_MOVES.includes(p[4])) out.push(`clip move ${p[4]}`);
      if (type === 'still' && !STILL_MOVES.includes(p[4])) out.push(`still move ${p[4]}`);
    });
    if (new Set(cams).size !== cams.length) out.push('a camera move repeats');
    if (sizes.some((sz, i) => i < 5 && sz === sizes[i + 1])) out.push('neighbouring beats share a shot size');
    if (settings.size < 4) out.push(`${settings.size} settings`);
    const culture = CULTURE_RE.exec(f.visual_beats + body);
    if (culture) out.push(`culture term "${culture[0]}"`);
  } else {
    out.push(`${beats.length} beats`);
  }

  const tag = tagOf(s.id);
  if ((f.clip_ids ?? '').split(/\s+/).join(' ') !== `${tag}-C1 ${tag}-C2 ${tag}-C3`) out.push('clip_ids');
  if ((f.still_ids ?? '').split(/\s+/).join(' ') !== `${tag}-S1 ${tag}-S2 ${tag}-S3`) out.push('still_ids');
  const final = f.yt_title_final ?? '';
  if (final.length > 100) out.push('yt_title_final over 100');
  if (!final.includes('#shorts') || !final.includes('#psychology')) out.push('title lacks #shorts #psychology');
  const ytTags = (f.yt_hashtags ?? '').split(/\s+/).filter(Boolean);
  if (ytTags.length !== 3 || ytTags[0] !== '#shorts') out.push('yt_hashtags');
  const desc = f.yt_description ?? '';
  if (/coming soon/i.test(desc)) out.push('"coming soon" in the description');
  const lastLine = desc.split('\\n').pop() ?? '';
  if ((lastLine.match(/#\w+/g) ?? []).length < 5 || !lastLine.includes('#shorts')) {
    out.push('the description does not end with 5 hashtags');
  }
  const source = f.source_line ?? '';
  if (!desc.includes(source.replace('Based on', 'Source:')) && !desc.includes(source)) {
    out.push('the description lacks the source');
  }
  const tags = (f.yt_tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length < 8 || tags.length > 12) out.push(`${tags.length} tags`);
  if (tags.some((t) => t.length > 30)) out.push('a tag over 30 characters');
  if (tags.reduce((a, t) => a + t.length + 1, 0) > 450) out.push('tags too long');
  if (tags.some((t) => t.toLowerCase() === (f.yt_title ?? '').toLowerCase() || CATEGORIES.includes(t))) {
    out.push('a tag equals the title or a category');
  }
  const ig = (f.ig_hashtags ?? '').split(/\s+/).filter(Boolean);
  if (ig.length !== 5 || !ig[0].startsWith('#TheMindFiles')) out.push('ig_hashtags');
  if ((f.ig_line1 ?? '').length > 125) out.push('ig_line1 over 125');
  const norm = (t: string) => t.toLowerCase().replace(/-/g, ' ').replace(/'/g, '');
  const keyword = norm((f.ig_keywords ?? '').split(',')[0].trim());
  if (keyword && !norm(f.ig_line1 ?? '').includes(keyword)) out.push('first ig keyword is not in ig_line1');
  if (!(f.yt_pinned_comment ?? '').endsWith('?')) out.push('the pinned comment is not a question');
  const culture = CULTURE_RE.exec([f.yt_description, f.yt_tags, f.yt_title].join(' '));
  if (culture) out.push(`culture term "${culture[0]}" in the metadata`);
  return out;
}

export function pillarOf(id: string, category: string): string {
  if (TACTIC_IDS.has(id) || DEFENSE_IDS.has(id)) return 'Manipulation & Defense';
  if (category === 'Persuasion & Influence') return 'Persuasion & Influence';
  if (category === 'Cognitive Bias') return 'Cognitive Bias';
  return 'Body Language & Social';
}

export function formatOf(id: string, f: Record<string, string>): string {
  if (f.format === 'numbered_list') return 'LIST';
  if (MYTH_IDS.has(id)) return 'MYTH';
  if (DEFENSE_IDS.has(id)) return 'DEFENSE';
  if (TACTIC_IDS.has(id) || TACTIC_CATEGORIES.has(f.category)) return 'TACTIC';
  return f.category === 'Cognitive Bias' ? 'STUDY' : 'SCEN';
}

export function longformOf(id: string, f: Record<string, string>): string {
  const lf = /LF-\d{2}/.exec(f.lf_tie ?? '')?.[0];
  if (lf && LF_MAP[lf]) return LF_MAP[lf];
  if (TACTIC_IDS.has(id)) return 'MF-L-02';
  if (f.category === 'Persuasion & Influence') return 'MF-L-01';
  if (f.category === 'Cognitive Bias') return 'MF-L-03';
  if (f.category === 'Body Language') return 'MF-L-04';
  return 'MF-L-05';
}

/** One psych Short as a v2 bank entry (heading, YAML block, narration). */
export function shortToV2(s: PsychShort, queue: string[]): string {
  const f = s.fields;
  const d = dCodeFor(s.id);
  const published = f.priority === 'published' || (f.status ?? '').includes('published');
  const hashtags = (f.yt_hashtags ?? '')
    .split(/\s+/)
    .filter((h) => !/^#(shorts|psychology)$/i.test(h))
    .map((h) => h.replace(/^#/, '').toLowerCase());
  const tags = (f.yt_tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const order = queue.indexOf(s.id) + 1;
  const source = (f.source_line ?? f.evidence ?? '').replace(/^Based on\s+/i, '').trim();
  const pillar = pillarOf(s.id, f.category);
  const mood = f.mood === 'dark' || f.mood === 'warm' ? f.mood : pillar === 'Manipulation & Defense' ? 'dark' : 'warm';
  const beats = f.visual_beats ? f.visual_beats.split('//').map((b) => b.trim()) : null;
  const lines = [
    `### ${d} — ${f.yt_title || s.title}`,
    '```yaml',
    `id: MF-S-${d}`,
    `pillar: ${q(pillar)}`,
    `format: ${formatOf(s.id, f)}`,
    'ending: SIGNOFF',
    `hook_text: ${q(f.hook_text)}`,
    `related_longform: ${longformOf(s.id, f)}`,
    `source: ${q(source)}`,
    `effect: ${q((f.tactic ?? '').toLowerCase())}`,
    `hashtags: [${hashtags.join(', ')}]`,
    ...list('tags', tags),
    ...(published ? ['status: published', `published_at: ${PUBLISHED_AT[s.id] ?? '2026-10-05'}`] : []),
    `virality: ${PRIORITY[f.priority] ?? 'medium'}`,
    `pinned_comment: ${q(f.yt_pinned_comment ?? '')}`,
    `hook_alt: ${q(f.hook_alt ?? '')}`,
    `title_alt: ${q(f.yt_title_alt ?? '')}`,
    `source_line: ${q(f.source_line ?? '')}`,
    ...(beats ? list('visual_beats', beats) : []),
    `mood: ${mood}`,
    ...(f.audit ? [`audit: ${q(f.audit)}`] : []),
    ...(f.hook_text_pov ? [`hook_text_pov: ${q(f.hook_text_pov)}`] : []),
    ...(f.test_profile === 'calm' || f.test_profile === 'punchy' ? [`test_profile: ${f.test_profile}`] : []),
    ...(f.test_hook === 'label' || f.test_hook === 'pov' ? [`test_hook: ${f.test_hook}`] : []),
    `bank_id: ${q(s.id)}`,
    `priority: ${q(f.priority)}`,
    ...(order ? [`queue: ${order}`] : []),
    `title_final: ${q(f.yt_title_final ?? '')}`,
    `description_full: ${q(f.yt_description ?? '')}`,
    `evidence: ${q(f.evidence ?? '')}`,
    `ig_keywords: ${q(f.ig_keywords ?? '')}`,
    `ig_line1: ${q(f.ig_line1 ?? '')}`,
    `ig_hashtags: ${q(f.ig_hashtags ?? '')}`,
    `ig_first_comment: ${q(f.ig_first_comment ?? '')}`,
    ...(f.clip_ids ? [`clip_ids: ${q(f.clip_ids)}`] : []),
    ...(f.still_ids ? [`still_ids: ${q(f.still_ids)}`] : []),
    '```',
    '**narration:**',
    f.narration ?? '',
    '',
    '---',
    '',
  ];
  return lines.join('\n');
}

export function lintLfPlans(md: string): LfCheck[] {
  const evidence = shortsEvidence(md);
  return parseLfPlans(md).map((plan) => {
    const r = checkLfPlan(plan, evidence);
    const spoken = lfSpoken(plan);
    const cite = CITATION_RE.exec(spoken)?.[0];
    if (cite) r.problems.push(`banned word in spoken long-form text: ${cite}`);
    const culture = CULTURE_RE.exec(`${spoken} ${plan.descLine1} ${plan.descBody}`)?.[0];
    if (culture) r.problems.push(`culture term in long-form: ${culture}`);
    return r;
  });
}

export function lfReportLine(r: LfCheck): string {
  const secs = Math.floor(r.seconds);
  const verbatim = LF_MAP[r.id] === 'MF-L-07' ? ' (spoken verbatim as MF-L-07)' : '';
  return `${r.id}: ${r.words.toLocaleString('en-US')} words, about ${Math.floor(secs / 60)}:${String(secs % 60).padStart(
    2,
    '0',
  )}, ${r.voiceChars.toLocaleString('en-US')} voice characters, description ${r.descWords} words | ${
    r.problems.length ? r.problems.join('; ') : 'OK'
  }${verbatim}`;
}

export function convertPsychBank(md: string): {
  markdown: string;
  converted: number;
  rejected: { id: string; reason: string }[];
  warnings: string[];
  plans: string[];
  queue: string[];
  longforms: LfCheck[];
} {
  const bank = parsePsychBank(md);
  const rejected: { id: string; reason: string }[] = [];
  const warnings: string[] = [];
  const blocks: string[] = [];
  for (const s of bank.shorts) {
    warnings.push(...psychShortWarnings(s));
    const errs = lintPsychShort(s);
    if (!errs.length) blocks.push(shortToV2(s, bank.queue));
    else rejected.push({ id: s.id, reason: `${s.id}: refused by the bank's lint (${errs.join('; ')})` });
  }
  return {
    markdown: ['# Psychology Shorts (converted)', '', ...blocks].join('\n'),
    converted: blocks.length,
    rejected,
    warnings,
    plans: bank.plans,
    queue: bank.queue,
    longforms: lintLfPlans(md),
  };
}
