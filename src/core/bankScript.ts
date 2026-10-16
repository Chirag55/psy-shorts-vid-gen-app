import type { Chapter, LongScript, ShortBeat, ShortScript, StimulusCard } from './types';
import type { Shot } from './shots';
import { moveForChapter } from './kenburns';
import { buildSceneVisuals } from './sceneStills';
import { structureForFormat } from './prompts';

/**
 * Scripts built straight from a bank entry's written script, word for word.
 */

/** The closing line a deep dive ends on when its script doesn't. */
export const DEEP_DIVE_SIGN_OFF =
  'Stay curious, keep your eyes wide, and remember: once you see the pattern, you hold the power.';

const COLOURS: Record<string, string> = {
  red: '#FF3030',
  blue: '#1E6BFF',
  green: '#22C55E',
  yellow: '#FFE600',
  purple: '#A855F7',
  orange: '#FF8A00',
  pink: '#FF5FB0',
  black: '#111111',
  white: '#FFFFFF',
  brown: '#8B5A2B',
  grey: '#9CA3AF',
  gray: '#9CA3AF',
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const QUOTED = () => /'((?:[^']|'(?=[A-Za-z]))+)'|"([^"]+)"/g;

function quotedIn(text: string): string[] {
  const out: string[] = [];
  const re = QUOTED();
  let m = re.exec(text);
  while (m) {
    out.push((m[1] ?? m[2]).trim());
    m = re.exec(text);
  }
  return out;
}

/** The narrated beats of a bank script (holds are silent). */
export function spokenBeats(e: { script?: { beats?: { beat: string; line?: string }[] } }) {
  return (e.script?.beats ?? []).filter((b) => b.beat !== 'hold' && Boolean(b.line));
}

/** The title as on-screen hook text, when it is short enough. */
export function hookTextFromTitle(title: string): string | undefined {
  const t = title.replace(/^the psychology of\s+/i, '').trim();
  return words(t).length <= 6 ? t : undefined;
}

/** The tactic's name: the concept up to its first clause break, five words at most. */
export function tacticFromConcept(concept: string): string {
  return words(concept.split(/[:;(,]|\s[-–—]\s|\svs\.?\s/)[0]).slice(0, 5).join(' ');
}

/** A stimulus card laid out from the bank's description of it. */
export function stimulusCardFromText(text: string): StimulusCard | null {
  const light = /\b(white|clean|light)\b[^.]*\b(card|background)\b/i.test(text);
  const background = light ? '#FFFFFF' : '#101418';
  const ink = light ? '#111111' : '#FFFFFF';
  const coloured = [...text.matchAll(/\b([A-Z]{3,})\s+in\s+([a-z]+)\b/g)].filter((m) => COLOURS[m[2].toLowerCase()]);
  if (coloured.length >= 2) {
    const n = coloured.length;
    return {
      background,
      frame: 'none',
      items: coloured.map((m, i) => ({
        text: m[1],
        color: COLOURS[m[2].toLowerCase()],
        size: 'xl',
        x: 0.5,
        y: n !== 1 ? 0.2 + (0.6 * i) / (n - 1) : 0.5,
      })),
    } as StimulusCard;
  }
  const body = text.includes(':') ? text.slice(text.lastIndexOf(':') + 1) : text;
  if (body.includes(' / ')) {
    const parts = body.split(' / ').map((p) => p.trim().replace(/[.'"]+$/, ''));
    const n = parts.length;
    return {
      background,
      frame: /triangle/i.test(text) ? 'triangle' : /sign|box/i.test(text) ? 'box' : 'none',
      items: parts.map((p, i) => ({ text: p, color: ink, size: 'l', x: 0.5, y: 0.58 + (i - (n - 1) / 2) * 0.09 })),
    } as StimulusCard;
  }
  if (/'\+'|\bplus\b|\+/.test(text) && /\bdot\b/i.test(text)) {
    const m = /top text\s*:\s*/i.exec(text);
    const top = m ? quotedIn(text.slice(m.index)).join(' ') : '';
    return {
      background,
      frame: 'none',
      items: [
        ...(top ? [{ text: top, color: ink, size: 'm', x: 0.5, y: 0.2 }] : []),
        { text: '+', color: ink, size: 'xl', x: 0.2, y: 0.5 },
        { text: '●', color: ink, size: 'xl', x: 0.8, y: 0.5 },
      ],
    } as StimulusCard;
  }
  const caps = /:\s*([A-Z][A-Z ,.'’!?-]{15,})$/.exec(text.trim());
  if (caps) {
    return {
      background,
      frame: 'none',
      items: [{ text: caps[1].trim(), color: ink, size: 'l', x: 0.5, y: 0.5 }],
    } as StimulusCard;
  }
  const quotes = quotedIn(text).filter((q) => q.length > 1);
  if (!quotes.length) return null;
  return {
    background,
    frame: 'none',
    items: quotes.map((q, i) => ({ text: q, color: ink, size: 'xl', x: 0.5, y: 0.45 + i * 0.12 })),
  } as StimulusCard;
}

export interface ShortBankVisuals {
  shots: Shot[][];
  characterDescription: string;
  archetype: string;
}

/** A Short script from a bank entry's written beats and its shot lists. */
export function shortScriptFromBank(e: any, visuals: ShortBankVisuals): ShortScript {
  const script = e.script;
  if (!script) throw new Error(`${e.id} has no script.`);
  const spoken = spokenBeats(e) as { beat: string; line: string; on_screen?: string }[];
  const hold = script.beats.find((b: any) => b.beat === 'hold');
  if (visuals.shots.length !== spoken.length) {
    throw new Error(`${e.id}: ${visuals.shots.length} shot lists for ${spoken.length} narrated beats.`);
  }
  const beats: ShortBeat[] = spoken.map((b, i) => ({
    kind: b.beat === 'hook' ? 'hook' : b.beat === 'reframe' || b.beat === 'closer' ? 'reframe' : 'mechanism',
    text: b.line,
    shots: visuals.shots[i],
    ...(b.on_screen ? { cardText: b.on_screen } : {}),
  }));
  const lastLine = spoken[spoken.length - 1]?.line ?? '';
  const lastSentence = lastLine.split(/[.!?]\s+/).pop() ?? lastLine;
  const tail = words(lastSentence);
  const pool = tail.length >= 3 ? tail : words(lastLine);
  const loopBridge =
    script.loops_into_hook && pool.length >= 3 ? pool.slice(-Math.min(5, pool.length)).join(' ') : undefined;
  const wordTarget = words(spoken.map((b) => b.line).join(' ')).length;
  const out: ShortScript = {
    mode: 'short',
    structure: structureForFormat(e.format),
    title: e.title,
    titleOptions: [e.title],
    hookLine: e.hook,
    hookText: e.hook_text ?? hookTextFromTitle(e.title),
    ...(e.hook_text ? { hookCard: e.hook_text } : e.hook_card ? { hookCard: e.hook_card } : {}),
    loopBridge,
    tactic: tacticFromConcept(e.concept),
    characterDescription: visuals.characterDescription,
    archetype: visuals.archetype,
    hashtags: [],
    beats,
    bankEntryId: e.id,
    scriptSource: script.source,
    wordTarget,
    ctaQuestion: e.cta_question,
    tagLine: e.tag_line,
  };
  if (e.format === 'test') {
    out.stimulus = {
      description: e.stimulus ?? '',
      holdSeconds: hold?.duration_s ?? e.stimulus_hold_s ?? 0,
      card: stimulusCardFromText(e.stimulus ?? '') ?? undefined,
    };
  }
  return out;
}

/** Hook, mechanism and reframe out of a chapter's narration. */
function splitChapter(narration: string): { miniHook: string; mechanism: string; microReframe: string } {
  const sentences = narration
    .match(/[^.!?]+[.!?]+["'’”]?|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [narration];
  if (sentences.length >= 3) {
    return {
      miniHook: sentences[0],
      mechanism: sentences.slice(1, -1).join(' '),
      microReframe: sentences[sentences.length - 1],
    };
  }
  return {
    miniHook: sentences[0] ?? narration,
    mechanism: narration,
    microReframe: sentences[sentences.length - 1] ?? narration,
  };
}

export interface LongBankVisuals {
  chapters: { heroA: string; heroB: string; stillPrompt: string }[];
  characterDescription: string;
  archetype: string;
}

/** A long-form script from a bank entry's written chapters. */
export function longScriptFromBank(e: any, visuals: LongBankVisuals): LongScript {
  const script = e.script;
  if (!script) throw new Error(`${e.id} has no script.`);
  if (visuals.chapters.length !== script.chapters.length) {
    throw new Error(`${e.id}: visuals for ${visuals.chapters.length} chapters, the script has ${script.chapters.length}.`);
  }
  const common = {
    characterDescription: visuals.characterDescription,
    archetype: visuals.archetype,
    tags: [] as string[],
    tactics: (e.chapters as { concept: string }[]).map((c) => c.concept),
    bankEntryId: e.id,
    scriptSource: script.source,
  };

  if (!e.scenes?.length) {
    const chapters: Chapter[] = (script.chapters as { title: string; narration: string }[]).map((c, i) => ({
      index: i + 1,
      title: c.title,
      narration: c.narration,
      ...splitChapter(c.narration),
      heroA: visuals.chapters[i].heroA,
      heroB: visuals.chapters[i].heroB,
      stillPrompt: visuals.chapters[i].stillPrompt,
      kenBurns: moveForChapter(i),
    }));
    const signedOff = Boolean(e.structure) || /stay curious, stay sharp\.?$/i.test(script.closing.trim());
    const signOff = signedOff ? '' : DEEP_DIVE_SIGN_OFF;
    const spoken = [script.cold_open, ...chapters.map((c) => c.narration), script.closing, signOff].filter(Boolean).join(' ');
    return {
      mode: 'long',
      structure: 'standard',
      title: e.title,
      coldOpen: script.cold_open,
      chapters,
      closingSynthesis: signOff ? `${script.closing} ${signOff}` : script.closing,
      ...common,
      wordTarget: words(spoken).length,
      ctaQuestion: e.cta_question,
    };
  }

  const units = [
    { title: e.scenes[0].chapter, narration: script.cold_open },
    ...(script.chapters as { title: string; narration: string }[]).map((c) => ({ title: c.title, narration: c.narration })),
    { title: e.scenes[e.scenes.length - 1].chapter, narration: script.closing },
  ].filter((u) => u.narration.trim());
  const indexed = units.map((u, i) => ({ index: i + 1, ...u }));
  const sceneVisuals = buildSceneVisuals(indexed, e.scenes, e.character_looks ?? []);
  const spoken = units.map((u) => u.narration).join(' ');
  const chapters = indexed.map((u, i) => ({
    index: u.index,
    title: u.title,
    narration: u.narration,
    ...splitChapter(u.narration),
    heroA: '',
    heroB: '',
    stillPrompt: '',
    kenBurns: moveForChapter(i),
    visuals: sceneVisuals[i],
  }));
  return {
    mode: 'long',
    structure: 'standard',
    title: e.title,
    coldOpen: '',
    chapters,
    closingSynthesis: '',
    ...common,
    wordTarget: words(spoken).length,
    ctaQuestion: e.cta_question,
  } as LongScript;
}
