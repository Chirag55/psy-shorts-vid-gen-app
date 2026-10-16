/**
 * Variety for long-form stills: the mix of cast / reenactment / metaphor /
 * insert pictures, sizes, compositions and who is in frame.
 * Rebuilt from 6.1.13.
 */
import { CAST, CAST_STYLE } from '../assets/cast';

export type StillRole = 'cast' | 'reenactment' | 'metaphor' | 'insert';
export type StillSize = 'wide' | 'medium' | 'close' | 'object' | 'symbolic';

export const MIX_MIN = { metaphor: 0.15, insert: 0.15 };
export const SETTINGS = [
  'the agency office, open-plan desks',
  'a small apartment, living room with a sofa',
  'a corner café with window seats',
  'a crowded local train carriage',
  "a family home's kitchen",
  'a rooftop at dusk',
  'a quiet office corridor',
  'a balcony with potted plants',
];
export const LIGHTING = [
  'soft morning light',
  'warm golden hour',
  'night with warm lamps',
  'rain on the window, cool light',
  'indoor tungsten, cosy',
];
export const COMPOSITIONS = [
  '',
  'from a low angle',
  'seen from above',
  'in strong side light',
  'shot through glass',
  'with a shallow depth of field',
  'in cool backlight',
  'in warm close light',
];
export const SIZE_PHRASE: Record<StillSize, string> = {
  wide: 'a wide shot',
  medium: 'a medium shot',
  close: 'a close-up on the face and hands',
  object: 'an extreme close-up',
  symbolic: 'a symbolic composition',
};
const CAST_SIZES: StillSize[] = ['wide', 'medium', 'close'];
const REENACT_SIZES: StillSize[] = ['wide', 'medium'];
const ORDER: StillRole[] = ['reenactment', 'cast', 'metaphor', 'insert'];

export function sizeFor(role: StillRole, i: number): StillSize {
  if (role === 'metaphor') return 'symbolic';
  if (role === 'insert') return 'object';
  const sizes = role === 'cast' ? CAST_SIZES : REENACT_SIZES;
  return sizes[i % sizes.length];
}

export interface MixInput {
  stills: number;
  capShare: number;
  chapterWords: number;
  castWords: number;
  avgWords: number;
  needReenactment: boolean;
}

/** Role per still: cast within its share of the runtime, at least 15% metaphor and insert, no role twice in a row. */
export function allocateMix(input: MixInput): StillRole[] {
  const { stills } = input;
  if (stills <= 0) return [];
  const castMax = Math.max(
    0,
    Math.floor((input.capShare * input.chapterWords - input.castWords) / Math.max(1, input.avgWords)),
  );
  const mix: Record<StillRole, number> = {
    cast: Math.min(castMax, Math.round(0.3 * stills)),
    reenactment: input.needReenactment ? Math.max(1, Math.round(0.2 * stills)) : 0,
    metaphor: Math.ceil(MIX_MIN.metaphor * stills),
    insert: Math.ceil(MIX_MIN.insert * stills),
  };
  const sum = () => mix.cast + mix.reenactment + mix.metaphor + mix.insert;
  const floor = stills >= 3 ? 1 : 0;
  while (sum() > stills) {
    if (mix.cast > 0) mix.cast--;
    else if (mix.reenactment > 1) mix.reenactment--;
    else if (mix.metaphor >= mix.insert && mix.metaphor > floor) mix.metaphor--;
    else if (mix.insert > floor) mix.insert--;
    else if (mix.reenactment > 0 && !input.needReenactment) mix.reenactment--;
    else break;
  }
  for (let k = 0; sum() < stills; k++) mix[k % 2 ? 'insert' : 'metaphor']++;
  const out: StillRole[] = [];
  let last: StillRole | undefined;
  for (let i = 0; i < stills; i++) {
    let role: StillRole;
    if (i === 0 && mix.reenactment > 0) {
      role = 'reenactment';
    } else {
      const avail = ORDER.filter((r) => mix[r] > 0);
      const fresh = avail.filter((r) => r !== last);
      role = (fresh.length ? fresh : avail).sort((a, b) => mix[b] - mix[a] || ORDER.indexOf(a) - ORDER.indexOf(b))[0];
    }
    mix[role]--;
    out.push(role);
    last = role;
  }
  return out;
}

const castLine = (id: string, outfit: number) => {
  const c = CAST[id];
  return `${c.name}: ${c.look}, wearing ${c.outfits[outfit % c.outfits.length]}`;
};

/** Looks of the cast named in `text` (or the protagonist), for one still. */
export function castFor(sp: { cast: string[]; protagonist?: string }, text: string, outfit: number): string {
  const ids = sp.cast.length ? sp.cast : sp.protagonist ? [sp.protagonist] : [];
  let named = ids.filter((id) => CAST[id] && new RegExp(`\\b${CAST[id].name.replace('.', '\\.')}`, 'i').test(text));
  if (!named.length) named = sp.protagonist && CAST[sp.protagonist] ? [sp.protagonist] : ids.slice(0, 1);
  return named
    .filter((id) => CAST[id])
    .map((id) => castLine(id, outfit))
    .join('; ');
}

export function composition(perChapter: number, i: number): string {
  const k = Math.floor(i / Math.max(1, perChapter));
  return COMPOSITIONS[k % COMPOSITIONS.length] + (k >= COMPOSITIONS.length ? `, variation ${k}` : '');
}

export interface StillSpec {
  role: StillRole;
  size: StillSize;
  subject: string;
  moment: string;
  lighting: string;
  setting?: string;
  cast?: string;
  era?: string;
  look?: string;
  composition?: string;
}

export function stillPrompt(p: StillSpec): string | undefined {
  const comp = p.composition ? `, ${p.composition}` : '';
  const end = 'A single still frame, nothing written anywhere.';
  switch (p.role) {
    case 'cast':
      return `${SIZE_PHRASE[p.size]} of this scene: ${p.subject}. ${p.cast ?? ''}. Setting: ${p.setting}; ${p.lighting}${comp}. The moment: "${p.moment}". ${CAST_STYLE}. ${end}`;
    case 'reenactment':
      return `${SIZE_PHRASE[p.size]}, a ${p.era} reenactment: ${p.subject}. Look: ${p.look || 'period-accurate'}${comp}. Anonymous people, no real person's likeness, no cast characters. The moment it supports: "${p.moment}". ${end}`;
    case 'metaphor':
      return `A symbolic image: ${p.subject}${comp}. ${p.lighting}. No people in frame, illustrative and calm. The line it supports: "${p.moment}". ${end}`;
    case 'insert':
      return `An extreme close-up of ${p.subject}${comp}, on a table surface, shallow depth of field, ${p.lighting}. No people in frame. The line it supports: "${p.moment}". ${end}`;
    default:
      return undefined;
  }
}

/** Who a cast still shows, rotating face / other side / hands / two-shot. */
export function castFocus(
  sp: { cast: string[]; protagonist?: string },
  i: number,
  setting: string,
  outfit: number,
): { subject: string; cast: string; face: boolean } {
  const pid = sp.protagonist && CAST[sp.protagonist] ? sp.protagonist : sp.cast.find((id) => CAST[id]);
  if (!pid) return { subject: setting, cast: '', face: false };
  const others = sp.cast.filter((id) => id !== pid && CAST[id]);
  const other = others.length ? others[Math.floor(i / 4) % others.length] : undefined;
  const name = CAST[pid].name;
  const face = { subject: `${name} reacting, in ${setting}`, cast: castLine(pid, outfit), face: true };
  const hands = {
    subject: `${name}'s hands and what they do, no face in frame, in ${setting}`,
    cast: castLine(pid, outfit),
    face: false,
  };
  const options = other
    ? [
        face,
        { subject: `${CAST[other].name}, the other side of the scene, in ${setting}`, cast: castLine(other, outfit), face: false },
        hands,
        {
          subject: `${name} and ${CAST[other].name} together, in ${setting}`,
          cast: `${castLine(pid, outfit)}; ${castLine(other, outfit)}`,
          face: true,
        },
      ]
    : [face, hands];
  return options[i % options.length];
}
