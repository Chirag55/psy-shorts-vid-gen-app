/**
 * Builds src/assets/topicBankV2.ts from a topic bank export (CR-78 neutral cast).
 *
 * Unpublished topics (unused, in progress, skipped):
 *   - one-off character names become the five-person cast,
 *   - every look line becomes that person's fixed look (never skin tone or ethnicity),
 *   - "flat" in the dwelling sense becomes "apartment"; "flat" as an adjective stays.
 * Published topics are copied exactly as they went out. Narration is otherwise untouched.
 *
 *   npx tsx scripts/bundleBank.ts recovery/banks/topic-bank-v4-gemini-compliant-9.md
 *   npx tsx scripts/bundleBank.ts <bank.md> --stdout     (print the transformed markdown)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/** One-off names in the bank and the cast member who takes each part. */
const NAMES: Record<string, string> = {
  Nina: 'Maya',
  Jamie: 'Maya',
  Mara: 'Maya',
  Meera: 'Maya',
  Ella: 'Nora',
  Riley: 'Nora',
  Tess: 'Nora',
  Ben: 'Leo',
  Jordan: 'Leo',
  Kai: 'Leo',
  Drew: 'Leo',
  Chris: 'Alex',
  Sam: 'Ryan',
};

/** Legacy cast ids that still appear in the bank's cast lists. */
const IDS: Record<string, string> = {
  meera_v1: 'maya_v1',
  kabir_v1: 'leo_v1',
  ritu_v1: 'nora_v1',
  dev_v1: 'leo_v1',
};

/** Real people who share a first name with the old cast; never renamed. */
const PROTECTED = ['Ben Franklin', 'Ben FRANKLIN', 'BenFranklin'];

/** Culture-tied phrasing in planning notes, made place-neutral (CR-78). */
const NEUTRAL_PHRASES: [string, string][] = [
  ['a strategist in ancient India', 'a strategist in the ancient world'],
  ['Indian city traffic visuals.', 'City traffic visuals, no named place.'],
  ['Culturally Indian; gentle,', 'Gentle,'],
];

/** The fixed looks, in cast order. Appearance only: no skin tone or ethnicity. */
const LOOKS: [string, string][] = [
  ['Alex', 'Alex, 28: short slightly messy dark-brown hair, brown eyes, medium build, navy hoodie over a plain white tee, grey trousers, white sneakers.'],
  ['Maya', 'Maya, 27: shoulder-length wavy black hair in a low ponytail, dark eyes, small round silver earrings, mustard-yellow cardigan over a soft grey top, dark jeans.'],
  ['Leo', 'Leo, 29: swept-back light-brown hair, hazel eyes, an easy wide smile, olive bomber jacket over a black tee, dark chinos.'],
  ['Ryan', 'Ryan, 29: short sandy-blond hair, light stubble, red-and-brown plaid shirt, tan chinos.'],
  ['Nora', 'Nora, 31: auburn chin-length bob with side-swept bangs, green-brown eyes, cream turtleneck, camel wool coat.'],
];

// A name starts after a non-letter, or right after an escaped "\n" inside a quoted string.
const NAME_RE = new RegExp(`(?<=^|[^A-Za-z]|\\\\n)(${Object.keys(NAMES).join('|')})(?![a-z])`, 'g');

/**
 * "flat" meaning a home: after a possessive or a determiner-like word, in the plural,
 * or as the noun of a setting line. "a flat hand", "fell flat", "flat light" stay.
 */
const DWELLING_RE = new RegExp(
  [
    String.raw`(?<='s (?:\w+ )?)flats?\b`,
    String.raw`(?<=\b(?:my|his|her|their|our|your|shared|empty|new|own|tiny|small|rented|first|cheerful)\s)flat\b(?!\s+(?:hand|light|shadow|voice|tone|nod|chart|line)\b)(?!,\s*completely)`,
    String.raw`\bflats\b`,
    String.raw`(?<=\bsetting:\s(?:a|an|the)\s(?:\w+\s)*)flat\b(?=\s+(?:at|in|on)\b|,|$)`,
    String.raw`\bflat(?=mates?\b|-hunting\b)`,
  ].join('|'),
  'gm'
);

function renameCast(text: string): string {
  const held: string[] = [];
  let out = text;
  PROTECTED.forEach((p, i) => {
    out = out.split(p).join(`\u0000${i}\u0000`);
    held[i] = p;
  });
  out = out.replace(NAME_RE, (n) => NAMES[n]);
  for (const [from, to] of Object.entries(IDS)) out = out.split(from).join(to);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
}

const LOOK_LINE = /^(\s*)- "(\w+), \d+:/;

/**
 * Each run of look lines becomes the fixed looks of the people in it, once each,
 * as written; a run that recasts someone follows the topic's cast list instead.
 * Runs before the names are changed, so it can tell who was recast.
 */
function fixLooks(text: string): string {
  const lines = text.split('\n');
  const castOrder = (text.match(/^\s*- (\w+_v1)$/gm) ?? []).map((l) => {
    const id = IDS[l.trim().slice(2)] ?? l.trim().slice(2);
    return id.charAt(0).toUpperCase() + id.slice(1, -3);
  });
  const rank = (name: string, i: number) => {
    const at = castOrder.indexOf(name);
    return at < 0 ? castOrder.length + i : at;
  };
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const first = LOOK_LINE.exec(lines[i]);
    if (!first) {
      out.push(lines[i++]);
      continue;
    }
    const names: string[] = [];
    let recast = false;
    while (i < lines.length && LOOK_LINE.test(lines[i])) {
      const written = LOOK_LINE.exec(lines[i++])![2];
      recast ||= written in NAMES;
      const name = NAMES[written] ?? written;
      if (!names.includes(name)) names.push(name);
    }
    names
      .map((name, j) => ({ name, at: recast ? rank(name, j) : j }))
      .sort((x, y) => x.at - y.at)
      .forEach(({ name }) => {
        const look = LOOKS.find(([n]) => n === name)?.[1];
        if (look) out.push(`${first[1]}- "${look}"`);
      });
  }
  return out.join('\n');
}

function apartments(text: string): string {
  return text.replace(DWELLING_RE, (w) => (w.endsWith('s') ? 'apartments' : 'apartment'));
}

function neutralPhrases(text: string): string {
  return NEUTRAL_PHRASES.reduce((t, [from, to]) => t.split(from).join(to), text);
}

export function bundleEntry(block: string): string {
  if (/^ {0,2}status: (\S+)$/m.exec(block)?.[1] === 'published') return block;
  return neutralPhrases(apartments(renameCast(fixLooks(block))));
}

export function bundleBank(markdown: string): string {
  return markdown
    .split(/^(?=#{2,3} |- id: )/m)
    .map((part) => (/^(?:- )?id: /m.test(part) ? bundleEntry(part) : part))
    .join('');
}

if (process.argv[1] && basename(process.argv[1]).startsWith('bundleBank')) {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error('Usage: npx tsx scripts/bundleBank.ts <bank.md> [--stdout]');
  const bundled = bundleBank(readFileSync(file, 'utf8'));
  if (flag === '--stdout') {
    process.stdout.write(bundled);
  } else {
    const exported = /Exported (\d{4}-\d{2}-\d{2})/.exec(bundled)?.[1] ?? 'unknown';
    writeFileSync(
      'src/assets/topicBankV2.ts',
      `/** The bundled v2 topic bank (exported ${exported}), built from ${basename(file)} by scripts/bundleBank.ts. */\n` +
        `export const TOPIC_BANK_V2_FILE = "mindfiles-topic-bank-v2.md";\n\n` +
        `export const TOPIC_BANK_V2 = ${JSON.stringify(bundled)};\n`
    );
    console.log(`Wrote src/assets/topicBankV2.ts (${bundled.length.toLocaleString()} characters).`);
  }
}
