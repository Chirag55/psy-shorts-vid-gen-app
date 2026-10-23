import { DEFAULT_CHANNEL_CONFIG, type HookConfig } from './channelConfig';
import type { WordTiming } from './types';

/**
 * Hook, loop and title rules for Shorts, plus the timing helpers that place the
 * on-screen cards (hook card, list numerals, signs, CTA) around the narration.
 */
export const HOOK_TEXT_MAX_WORDS = 6;
export const INTENSIFIERS = ['secretly', 'instantly', 'really', 'actually', 'literally', 'truly', 'totally', 'seriously', 'completely', 'absolutely', 'deeply', 'silently', 'quietly'];
export const TITLE_MAX_CHARS = 50;
export const TITLE_MIN_WORDS = 3;
export const TITLE_MAX_WORDS = 7;
/** Narration tail kept after the last word before the loop cut. */
export const LOOP_TAIL_SECONDS = 0.12;
export const HOOK_CARD_SECONDS = DEFAULT_CHANNEL_CONFIG.hook.cardSeconds;
export const CTA_CARD_SECONDS = 2;
export const NUMERAL_SECONDS = 0.6;
export const HOOT_DELAYED_ENTRY_SECONDS = 2;

const SECOND_PERSON = /\b(you|your|you're|youre|yourself|you've|you'll|you'd)\b/i;
const THIRD_PERSON_OPENER = /^(people|someone|somebody|they|them|everyone|everybody|others|most people|a person|he|she|humans)\b/i;
const BANNED_OPENER = /^(did you know|have you ever)\b/i;
const TRAILING_FILLER = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are', 'that', 'with', 'your', 'you']);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const normWords = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);

export interface WordBudget {
  min: number;
  max: number;
  hardMax: number;
  beats: number;
  maxBeats?: number;
}

/** Word window for a Short; a bank entry's own word target wins over the format default. */
export function wordBudget(structure?: string, target?: number): WordBudget {
  if (target && target > 0) {
    const b = { min: Math.floor(target * 0.95), max: Math.ceil(target * 1.05), hardMax: Math.ceil(target * 1.12) };
    if (structure === 'rapid') return { ...b, beats: 5, maxBeats: 6 };
    if (structure === 'test') return { ...b, beats: 3, maxBeats: 5 };
    return { ...b, beats: 3 };
  }
  if (structure === 'rapid') return { min: 38, max: 46, hardMax: 50, beats: 5 };
  if (structure === 'list') return { min: 50, max: 76, hardMax: 80, beats: 3 };
  return { min: 44, max: 60, hardMax: 66, beats: 3 };
}

/** The opening line must put the viewer in it, not "people", and must not open with a banned phrase. */
export function checkHook(text: string, tactic?: string, opts: { assigned?: boolean } = {}): string[] {
  const out: string[] = [];
  const t = text.trim().replace(/^["'“‘]+/, '');
  const first6 = words(t).slice(0, 6).join(' ');
  if (BANNED_OPENER.test(t)) out.push('The hook opens with "Did you know" / "Have you ever", which is banned.');
  if (opts.assigned) return out;
  const subject = THIRD_PERSON_OPENER.exec(t)?.[0];
  if (subject) out.push(`The hook's subject is "${subject}". It must be the viewer: "You copy strangers…", not "${subject}…".`);
  else if (!SECOND_PERSON.test(first6)) out.push(`The first six words ("${first6}") don't describe something the viewer does. Lead with "you".`);
  if (tactic && tactic.trim().length > 3 && t.toLowerCase().includes(tactic.trim().toLowerCase())) {
    out.push(`The hook names the tactic ("${tactic}"). Lead with the behaviour; name the tactic in the mechanism.`);
  }
  return out;
}

export function checkHookText(text?: string | null): string[] {
  if (!text?.trim()) return ['No on-screen hook text. The first two seconds will show captions only.'];
  const n = words(text).length;
  return n > HOOK_TEXT_MAX_WORDS ? [`On-screen hook text is ${n} words; keep it to ${HOOK_TEXT_MAX_WORDS} or fewer so it reads at a glance.`] : [];
}

/** The loop bridge is the last 3-6 spoken words, written to run straight back into the hook. */
export function checkLoopBridge(script: { loopBridge?: string; beats: { text: string }[] }): string[] {
  const bridge = script.loopBridge?.trim();
  if (!bridge) return ['No loop bridge. The last line should run straight back into the hook.'];
  const out: string[] = [];
  const b = normWords(bridge);
  if (b.length < 3 || b.length > 6) out.push(`The loop bridge is ${b.length} words; it should be the final 3-6 words of the last line.`);
  const last = script.beats[script.beats.length - 1];
  const tail = last ? normWords(last.text) : [];
  if (tail.slice(-b.length).join(' ') !== b.join(' ')) {
    out.push('The loop bridge is not the end of the last spoken line, so the loop will not read through.');
  }
  return out;
}

/** "…the end of it / you copy strangers…" — how the loop reads across the cut. */
export function loopPreview(script: { loopBridge?: string; beats: { text: string }[] }): string {
  const first = words(script.beats[0]?.text ?? '').slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');
  const bridge = (script.loopBridge ?? '').trim().replace(/[.,;:!?]+$/, '');
  if (!bridge || !first) return '';
  return `…${bridge} / ${first.charAt(0).toLowerCase()}${first.slice(1)}…`;
}

export function intensifiersIn(text: string): string[] {
  const w = normWords(text);
  return INTENSIFIERS.filter((i) => w.includes(i));
}

export function checkShortTitle(title: string, opts: { assigned?: boolean; previousTitle?: string; tactic?: string } = {}): string[] {
  const out: string[] = [];
  const t = title.trim();
  const n = words(t).length;
  if (n < TITLE_MIN_WORDS || n > TITLE_MAX_WORDS) out.push(`${n} words — titles should be ${TITLE_MIN_WORDS}-${TITLE_MAX_WORDS}.`);
  if (t.length > TITLE_MAX_CHARS) out.push(`${t.length} characters — keep it to ${TITLE_MAX_CHARS}.`);
  if (!opts.assigned && !SECOND_PERSON.test(t) && !/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t)) {
    out.push('Not second person. Write it to the viewer ("Why You…"), or lead with a number ("3 Signs…").');
  }
  if (t.includes('#')) out.push('Hashtags belong in the description, not the title.');
  const ints = intensifiersIn(t);
  if (ints.length > 1) out.push(`More than one intensifier (${ints.join(', ')}). Use one at most.`);
  if (ints.length && opts.previousTitle && intensifiersIn(opts.previousTitle).length) {
    out.push(`The last upload also used an intensifier ("${opts.previousTitle}"). Drop "${ints[0]}" this time.`);
  }
  if (!opts.assigned && opts.tactic && opts.tactic.trim().length > 3 && t.toLowerCase().includes(opts.tactic.trim().toLowerCase())) {
    out.push(`Names the tactic ("${opts.tactic}"). Describe the behaviour instead.`);
  }
  return out;
}

/** Where the loop cuts: just after the last spoken word. */
export function loopCutDuration(timings: WordTiming[], duration: number, tail: number = LOOP_TAIL_SECONDS): number {
  const lastEnd = timings.length ? timings[timings.length - 1].end : 0;
  if (!(lastEnd > 0) || !Number.isFinite(lastEnd)) return duration;
  return Math.min(duration, lastEnd + tail);
}

interface HookSource {
  title?: string;
  hookCard?: string;
  hookText?: string;
  bankV2?: { testHook?: string; hookText?: string; hookTextPov?: string } | null;
}

/** The words on the opening card: the bank's hook text, else a short card, else the title cut to fit. */
export function hookCardText(p: HookSource, maxWords: number = DEFAULT_CHANNEL_CONFIG.hook.maxCardWords): string {
  // A10: frame 1 always carries the full hook_text banner (the POV hook test is retired).
  if (p.bankV2?.hookText) return p.bankV2.hookText;
  const title = (p.title ?? '').replace(/#\S+/g, '').replace(/^the psychology of\s+/i, '').replace(/\s+/g, ' ').trim();
  const number = /^(\d+)\b/.exec(title)?.[1];
  const card = p.hookCard?.trim();
  if (card && words(card).length <= maxWords && (!number || card.includes(number))) return card;
  if (!title) return p.hookText?.trim() || '';
  const w = words(title);
  if (w.length <= maxWords) return title;
  const cut = w.slice(0, maxWords);
  while (cut.length > 2 && TRAILING_FILLER.has(cut[cut.length - 1].toLowerCase())) cut.pop();
  return `${cut.join(' ')}…`;
}

export function hookStyleOf(p: HookSource): 'pov' | 'label' {
  return !p.bankV2?.hookText && p.bankV2?.testHook === 'pov' && p.bankV2.hookTextPov ? 'pov' : 'label';
}

export interface CardWindow {
  name: string;
  text: string;
  start: number;
  end: number;
}

/**
 * Card timings for a Short: the hook card from 0, a sign card per beat that has
 * card text (with its list numeral popped first), and the CTA over the last
 * seconds. Nothing overlaps the CTA or the `avoid` window (Hoot's entry).
 */
export function cardWindows(
  script: HookSource & { ctaQuestion?: string; beats: { cardText?: string }[] },
  beatWindows: { start: number; end: number }[],
  duration: number,
  avoid?: { start: number; end: number },
  hook: HookConfig = DEFAULT_CHANNEL_CONFIG.hook,
): CardWindow[] {
  const out: CardWindow[] = [];
  const cardSeconds = hook.cardSeconds;
  const hookText = hookCardText(script, hook.maxCardWords);
  if (hookText) out.push({ name: 'hook', text: hookText, start: 0, end: Math.min(cardSeconds, duration) });
  const cta = script.ctaQuestion?.trim();
  if (cta && duration > CTA_CARD_SECONDS + cardSeconds) {
    out.push({ name: 'cta', text: cta, start: duration - CTA_CARD_SECONDS, end: duration });
  }
  script.beats.forEach((beat, i) => {
    const text = beat.cardText?.trim();
    const seg = beatWindows[i];
    if (!text || !seg || !(seg.end > seg.start)) return;
    const start = Math.max(seg.start, hookText ? Math.min(cardSeconds, duration) : 0);
    const end = Math.min(seg.end, duration);
    const numeral = /^(\d+)\s*[.·)-]/.exec(text)?.[1];
    if (numeral && end - start > NUMERAL_SECONDS + 0.8) {
      out.push({ name: `numeral_${i}`, text: numeral, start, end: start + NUMERAL_SECONDS });
      out.push({ name: `sign_${i}`, text, start: start + NUMERAL_SECONDS, end });
    } else if (end > start) {
      out.push({ name: `sign_${i}`, text, start, end });
    }
  });
  const ctaWin = out.find((w) => w.name === 'cta');
  return out
    .map((w) => {
      let start = w.start;
      let end = w.end;
      if (ctaWin && w !== ctaWin && end > ctaWin.start) end = ctaWin.start;
      if (avoid && start < avoid.end && end > avoid.start) {
        if (start >= avoid.start) start = Math.max(start, avoid.end);
        else end = Math.min(end, avoid.start);
      }
      return { ...w, start, end };
    })
    .filter((w) => w.end - w.start > 0.05);
}

export function delayWindows<T extends { start: number; end: number }>(windows: T[], delay: number): T[] {
  if (!(delay > 0)) return windows;
  return windows.map((w) => ({ ...w, start: Math.max(w.start, delay) })).filter((w) => w.end > w.start);
}

/** The moment to hold on after the hook text has been spoken: between its last word and the next. */
export function holdPoint(timings: WordTiming[], hookText: string): number {
  if (!timings.length) return 0;
  const n = Math.max(1, timings.length ? words(hookText).length : 0);
  const last = timings[Math.min(n, timings.length) - 1];
  const next = timings[n];
  return next ? (last.end + next.start) / 2 : last.end;
}

export function shiftWords(timings: WordTiming[], from: number, by: number): WordTiming[] {
  if (!(by > 0)) return timings;
  return timings.map((w) => (w.start >= from ? { ...w, start: w.start + by, end: w.end + by } : w));
}

/** The leading silence ffmpeg's silencedetect reported, if the narration starts with one. */
export function leadingSilenceFromLog(lines: string[]): number {
  let start: number | undefined;
  for (const line of lines) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s && start === undefined) {
      start = Number(s[1]);
      if (start > 0.01) return 0;
      continue;
    }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start !== undefined) return Number(e[1]);
  }
  return 0;
}

/** How much narration to cut from the front, keeping `preRollMs` before the first word. */
export function narrationTrim(timings: WordTiming[], leadSilence: number, preRollMs: number): number {
  if (!(leadSilence > 0)) return 0;
  const t = timings.length ? Math.min(leadSilence, timings[0].start) : leadSilence;
  return Math.max(0, t - preRollMs / 1000);
}

/**
 * A10: seconds to cut from the head of the voice so the first consonant lands
 * at 0:00.00 (ElevenLabs files open with about 0.15 to 0.25 s of air).
 */
export function firstWordTrim(timings: WordTiming[], leadSilence: number, maxSeconds = 0.6): number {
  const t = timings.length && timings[0].start > 0 ? timings[0].start : leadSilence > 0 ? leadSilence : 0;
  return Math.min(Math.max(0, t), maxSeconds);
}

export function trimWords(timings: WordTiming[], by: number): WordTiming[] {
  if (!(by > 0)) return timings;
  return timings.map((w) => ({ ...w, start: Math.max(0, w.start - by), end: Math.max(0, w.end - by) }));
}

/** Frame 0 must move: if the hook opens on a still, its first clip is moved to the front. */
export function clipFirst<T extends { beatIndex: number; shot: { source: string; held?: boolean } }>(items: T[]): T[] {
  if (items[0]?.shot.held) return items;
  if (!items.length || items[0].beatIndex !== 0 || items[0].shot.source !== 'still') return items;
  const i = items.findIndex((x) => x.beatIndex === 0 && x.shot.source !== 'still');
  if (i < 0) return items;
  return [items[i], ...items.slice(0, i), ...items.slice(i + 1)];
}
