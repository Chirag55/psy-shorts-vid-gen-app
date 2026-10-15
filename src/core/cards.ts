/**
 * On-screen cards for long-forms, drawn by the app as plain shapes and text
 * (no generated video can render text reliably). Each card is a list of
 * drawing ops per animation frame; the renderer turns them into PNG frames and
 * an ffconcat list.
 */

export const CARD_CANVAS = { width: 1920, height: 1080 };
export const CARD_COLOURS = { background: '#FBF5E7', ink: '#3F3F3F', blue: '#90B3D1', red: '#E53935', muted: '#8A8577' };
/** Cap height of the card font as a fraction of its size. */
export const CAP = 0.8605;

/** Frames a counting-up number takes. */
const COUNT_FRAMES = 4;
const W = CARD_CANVAS.width;
const H = CARD_CANVAS.height;
const MARGIN = 140;

export type Card =
  | { kind: 'stat'; label: string; value: string; note?: string }
  | { kind: 'stats'; rows: { label: string; value: string }[] }
  | { kind: 'guess' }
  | { kind: 'bars'; values: number[]; labels: string[]; unit: string }
  | { kind: 'flip'; from: string; to: string; captions: string[] }
  | { kind: 'split'; pairs: { from: string; to: string; caption: string }[] }
  | { kind: 'prices'; prices: string[]; labels: string[]; fade: number }
  | { kind: 'pulse' }
  | { kind: 'icons'; labels: string[] }
  | { kind: 'label'; lines: string[]; accentLast?: boolean }
  | { kind: 'study'; name: string; meta: string }
  | { kind: 'title'; text: string }
  | { kind: 'end'; text: string };

export type CardOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; fill: string; radius?: number; stroke?: string; strokeWidth?: number }
  | { op: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | { op: 'poly'; points: [number, number][]; fill: string }
  | { op: 'text'; text: string; cx: number; baseline: number; size: number; colour: string };

/** Width of `text` at `size` in the card font. */
export type Measure = (text: string, size: number) => number;

/** "+38%" → sign, number and the rest, so it can count up. */
export function statParts(value: string): { sign: string; n: number; rest: string } | null {
  const m = /^([+−-]?)(\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  return m ? { sign: m[1], n: Number(m[2]), rest: m[3] } : null;
}

/** The value shown on frame `frame` of `frames`: counts up, landing on the exact text. */
export function statValueAt(value: string, frame: number, frames: number): string {
  const p = statParts(value);
  if (!p || frame >= frames - 1) return value;
  const v = ((frame + 1) / frames) * p.n;
  const shown = Number.isInteger(p.n) ? Math.round(v) : Math.round(v * 10) / 10;
  return `${p.sign}${shown}${p.rest}`;
}

export function cardFrameCount(card: Card): number {
  switch (card.kind) {
    case 'stat':
      return statParts(card.value) ? COUNT_FRAMES : 1;
    case 'stats':
      return card.rows.some((r) => statParts(r.value)) ? COUNT_FRAMES : 1;
    case 'guess':
      return 2;
    case 'bars':
      return Math.max(1, card.values.length);
    case 'flip':
      return 2;
    case 'split':
      return Math.max(1, card.pairs.length);
    case 'prices':
      return 2;
    case 'pulse':
      return 3;
    default:
      return 1;
  }
}

/** How long each frame holds within `total` seconds: quick steps, the last frame holds the rest. */
export function cardFrameSeconds(card: Card, total: number): number[] {
  const n = cardFrameCount(card);
  if (n === 1) return [total];
  const step = card.kind === 'pulse' ? 0.35 : card.kind === 'stat' || card.kind === 'stats' ? 0.2 : card.kind === 'guess' ? 0.4 : 0.9;
  const each = Math.min(step, (total * 0.6) / (n - 1));
  const out = Array.from({ length: n - 1 }, () => each);
  out.push(total - each * (n - 1));
  return out;
}

/** An ffconcat list that plays the frames for their durations. */
export function frameConcat(frames: { path: string; seconds: number }[]): string {
  const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const lines = ['ffconcat version 1.0'];
  for (const f of frames) lines.push(`file ${quote(f.path)}`, `duration ${f.seconds.toFixed(4)}`);
  const last = frames[frames.length - 1];
  if (last) lines.push(`file ${quote(last.path)}`);
  return `${lines.join('\n')}\n`;
}

/** Shrinks `size` in steps of 4 until `text` fits `maxWidth`, never below `min`. */
function fit(text: string, size: number, maxWidth: number, measure: Measure, min = 40): number {
  let s = size;
  while (s > min && measure(text, s) > maxWidth) s -= 4;
  return s;
}

function textOp(text: string, baseline: number, size: number, colour: string, cx: number = W / 2): CardOp {
  return { op: 'text', text, cx, baseline, size, colour };
}

/** One line if it fits; otherwise two lines split where their widths are closest. */
function wrapTwo(text: string, size: number, maxWidth: number, measure: Measure): string[] {
  if (measure(text, size) <= maxWidth) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(measure(words.slice(0, i).join(' '), size) - measure(words.slice(i).join(' '), size));
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => (b.length > a.length ? b : a), '');
}

function captionOps(text: string, cx: number, top: number, size: number, maxWidth: number, colour: string, measure: Measure): CardOp[] {
  return wrapTwo(text, size, maxWidth, measure).map((line, i) => textOp(line, top + size * CAP + i * (size * CAP + 12), size, colour, cx));
}

/** Drawing ops for frame `frame` of a card. */
export function cardOps(card: Card, frame: number, measure: Measure): CardOp[] {
  const C = CARD_COLOURS;
  const ops: CardOp[] = [{ op: 'rect', x: 0, y: 0, w: W, h: H, fill: C.background }];
  const maxW = W - 280;
  const colX = (colW: number, i: number) => MARGIN + colW * i + colW / 2;
  switch (card.kind) {
    case 'end': {
      ops.push(textOp('THE NEXT FILE', 407.445, 90, C.red));
      const lines = wrapTwo(card.text.toUpperCase(), 170, maxW, measure);
      const size = fit(longest(lines), 170, maxW, measure, 70);
      lines.forEach((l, i) => ops.push(textOp(l, 520 + size * CAP + i * (size * CAP + 28), size, C.ink)));
      break;
    }
    case 'guess': {
      const size = fit('GUESS?', frame === 0 ? 380 : 430, maxW, measure, 200);
      ops.push(textOp('GUESS?', H / 2 + (size * CAP) / 2, size, C.red));
      break;
    }
    case 'stats': {
      const frames = cardFrameCount(card);
      const n = card.rows.length;
      const colW = maxW / n;
      card.rows.forEach((row, i) => {
        const cx = colX(colW, i);
        ops.push({ op: 'rect', x: cx - colW / 2 + 30, y: 200, w: colW - 60, h: 680, radius: 24, fill: '#FFFFFF', stroke: C.ink, strokeWidth: 8 });
        const label = row.label.toUpperCase();
        const lines = wrapTwo(label, 70, colW - 140, measure);
        const ls = fit(longest(lines), 70, colW - 140, measure, 36);
        lines.forEach((l, j) => ops.push(textOp(l, 290 + ls * CAP + j * (ls * CAP + 16), ls, C.ink, cx)));
        const vs = fit(row.value, 260, colW - 120, measure, 90);
        ops.push(textOp(statValueAt(row.value, frame, frames), 560 + vs * CAP, vs, i === n - 1 ? C.red : C.blue, cx));
      });
      break;
    }
    case 'stat': {
      const label = card.label.toUpperCase();
      const ls = fit(label, 110, maxW, measure, 50);
      ops.push(textOp(label, 250 + ls * CAP, ls, C.ink));
      const value = statValueAt(card.value, frame, cardFrameCount(card));
      const vs = fit(card.value, 400, maxW, measure, 160);
      const vBase = 430 + vs * CAP;
      ops.push(textOp(value, vBase, vs, C.red));
      if (card.note) {
        const note = card.note.toUpperCase();
        const ns = fit(note, 80, maxW, measure, 40);
        ops.push(textOp(note, vBase + 120 + ns * CAP, ns, C.muted));
      }
      break;
    }
    case 'icons': {
      const colW = maxW / card.labels.length;
      card.labels.forEach((label, i) => {
        const cx = colX(colW, i);
        const r = Math.min(120, colW * 0.34);
        ops.push({ op: 'circle', cx, cy: 460, r, fill: i === 0 ? C.red : C.blue, stroke: C.ink, strokeWidth: 10 });
        ops.push({ op: 'circle', cx: cx - r * 0.3, cy: 460 - r * 0.32, r: r * 0.16, fill: '#FFFFFF' });
        const text = label.toUpperCase();
        const size = fit(text, 60, colW - 20, measure, 30);
        ops.push(textOp(text, 460 + r + 70 + 51.63, size, C.ink, cx));
      });
      break;
    }
    case 'prices': {
      const n = card.prices.length;
      const colW = maxW / n;
      for (let i = 0; i < n; i++) {
        if (frame === 1 && i === card.fade) continue;
        const cx = colX(colW, i);
        ops.push({ op: 'rect', x: cx - colW / 2 + 30, y: 260, w: colW - 60, h: 560, radius: 24, fill: '#FFFFFF', stroke: C.ink, strokeWidth: 8 });
        const size = fit(card.prices[i], 200, colW - 120, measure, 80);
        ops.push(textOp(card.prices[i], 470 + (size * CAP) / 2, size, i === n - 1 ? C.red : C.ink, cx));
        if (card.labels[i]) {
          const label = card.labels[i].toUpperCase();
          const ls = fit(label, 56, colW - 100, measure, 30);
          ops.push(...captionOps(label, cx, 640, ls, colW - 100, C.muted, measure));
        }
      }
      break;
    }
    case 'split': {
      const n = card.pairs.length;
      const colW = maxW / n;
      for (let i = 0; i <= Math.min(frame, n - 1); i++) {
        const cx = colX(colW, i);
        ops.push({ op: 'rect', x: cx - colW / 2 + 30, y: 170, w: colW - 60, h: 760, radius: 24, fill: '#FFFFFF', stroke: C.ink, strokeWidth: 8 });
        const p = card.pairs[i];
        const fs = fit(p.from, 150, colW - 140, measure, 70);
        let y = 250 + fs * CAP;
        ops.push(textOp(p.from, y, fs, C.blue, cx));
        y += 36;
        ops.push({ op: 'rect', x: cx - 8, y, w: 16, h: 64, fill: C.ink });
        ops.push({ op: 'poly', points: [[cx - 34, y + 60], [cx + 34, y + 60], [cx, y + 104]], fill: C.ink });
        const ts = fit(p.to, 220, colW - 140, measure, 90);
        y = y + 104 + 40 + ts * CAP;
        ops.push(textOp(p.to, y, ts, C.red, cx));
        const caption = p.caption.toUpperCase();
        const cs = fit(caption, 50, colW - 120, measure, 30);
        ops.push(...captionOps(caption, cx, y + 50, cs, colW - 120, C.muted, measure));
      }
      break;
    }
    case 'flip': {
      const first = frame === 0;
      const word = first ? card.from : card.to;
      const caption = card.captions[first ? 0 : 1];
      const size = fit(word, 480, maxW, measure, 200);
      ops.push(textOp(word, 560 + (size * CAP) / 2 - 60, size, first ? C.ink : C.red));
      if (caption) {
        const text = caption.toUpperCase();
        const cs = fit(text, 70, maxW, measure, 40);
        ops.push(...captionOps(text, W / 2, 780, cs, maxW, C.muted, measure));
      }
      break;
    }
    case 'bars': {
      const n = card.values.length;
      const shown = Math.min(n, frame + 1);
      const max = Math.max(...card.values, 1);
      const colW = maxW / n;
      const barW = Math.min(300, colW * 0.6);
      for (let i = 0; i < shown; i++) {
        const cx = colX(colW, i);
        const h = Math.max(24, (card.values[i] / max) * 520);
        ops.push({ op: 'rect', x: cx - barW / 2, y: 800 - h, w: barW, h, radius: 14, fill: card.values[i] === max ? C.red : C.blue, stroke: C.ink, strokeWidth: 8 });
        const text = `${card.values[i]}${card.unit}`;
        const s = fit(text, 120, colW - 30, measure, 60);
        ops.push(textOp(text, 800 - h - 28, s, C.ink, cx));
        if (card.labels[i]) {
          const label = card.labels[i].toUpperCase();
          const ls = fit(label, 60, colW - 30, measure, 36);
          ops.push(...captionOps(label, cx, 836, ls, colW - 30, C.ink, measure));
        }
      }
      ops.push({ op: 'rect', x: MARGIN, y: 800, w: maxW, h: 10, fill: C.ink });
      break;
    }
    case 'study': {
      const lines = wrapTwo(card.name, 150, maxW, measure);
      const size = fit(longest(lines), 150, maxW, measure, 70);
      const ms = fit(card.meta, 80, maxW, measure, 40);
      const lineH = size * CAP + 24;
      const top = (H - (lines.length * lineH + 40 + ms * CAP)) / 2;
      lines.forEach((l, i) => ops.push(textOp(l, top + size * CAP + i * lineH, size, C.ink)));
      const ruleY = top + lines.length * lineH + 20;
      ops.push({ op: 'rect', x: W / 2 - 110, y: ruleY, w: 220, h: 10, fill: C.red });
      ops.push(textOp(card.meta, ruleY + 50 + ms * CAP, ms, C.muted));
      break;
    }
    case 'label': {
      const lines = card.lines.map((l) => l.toUpperCase());
      const size = Math.min(...lines.map((l) => fit(l, lines.length > 2 ? 150 : 210, maxW, measure, 80)));
      const lineH = size * CAP + 36;
      const top = (H - (lines.length * lineH - 36)) / 2;
      lines.forEach((l, i) => {
        const colour = card.accentLast && i === lines.length - 1 ? C.red : C.ink;
        ops.push(textOp(l, top + size * CAP + i * lineH, size, colour));
      });
      break;
    }
    case 'pulse': {
      const r = [250, 310, 250][frame] ?? 250;
      const cy = H / 2 + 20;
      ops.push({ op: 'circle', cx: W / 2, cy, r: r + 50, fill: '#F1D4D2' });
      ops.push({ op: 'circle', cx: W / 2, cy, r, fill: C.red, stroke: C.ink, strokeWidth: 14 });
      ops.push({ op: 'circle', cx: W / 2 - r * 0.32, cy: cy - r * 0.34, r: r * 0.16, fill: '#EF7B77' });
      break;
    }
    case 'title': {
      const [head = '', ...rest] = card.text.split(/\s*(?:[·•]|\s—\s)\s*/);
      const sub = rest.join(' · ');
      if (!sub) {
        const s = fit(head, 220, maxW, measure);
        ops.push(textOp(head, H / 2 + (s * CAP) / 2, s, C.ink));
        break;
      }
      const s = fit(head, 120, maxW, measure);
      const base = 380 + s * CAP;
      ops.push(textOp(head, base, s, C.red));
      ops.push({ op: 'rect', x: W / 2 - 110, y: base + 40, w: 220, h: 10, fill: C.ink });
      const lines = wrapTwo(sub, 200, maxW, measure);
      const ls = fit(longest(lines), 200, maxW, measure, 80);
      lines.forEach((l, i) => ops.push(textOp(l, 640 + ls * CAP + i * (ls * CAP + 24), ls, C.ink)));
      break;
    }
  }
  return ops;
}

/** Stable cache key for a rendered card (djb2 of the card and a salt). */
export function cardKey(card: Card, salt: string): string {
  const s = `${salt}|${JSON.stringify(card)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}
