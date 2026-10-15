import { DIVERSITY, jaccard, sceneWords } from './diversityLint';

/**
 * Long-form still budgeting: a chapter's stills of the same class (people,
 * object, symbol) can share one generated image. Groups are merged until the
 * plan fits STILL_TARGET images, near-duplicates are folded together, and if
 * there is room the busiest groups are split again. Mutates the visuals: every
 * still but each group's lead gets `reuse` (the lead's key) and its prompt.
 */

export const STILL_TARGET = 40;
/** A group with more uses than this is split first when there is room. */
export const STILL_USES_PREFERRED = 2;

type Klass = 'people' | 'object' | 'symbol';

export interface ReusableVisual {
  key: string;
  kind: string;
  role?: string;
  prompt?: string;
  reuse?: string;
}

interface Group {
  chapter: number;
  klass: Klass;
  members: number[];
}

function classOf(v: ReusableVisual): Klass {
  if (v.role === 'insert') return 'object';
  return v.role === 'metaphor' ? 'symbol' : 'people';
}

export function reuseStills(
  chapters: ReusableVisual[][],
  target: number = STILL_TARGET,
  keepObjects: Set<number> = new Set(),
): { images: number; segments: number; overTarget: boolean } {
  const groups: Group[] = [];
  let segments = 0;
  chapters.forEach((visuals, chapter) => {
    const byClass = new Map<Klass, number[]>();
    visuals.forEach((v, i) => {
      if (v.kind !== 'still') return;
      segments++;
      const k = classOf(v);
      byClass.set(k, [...(byClass.get(k) ?? []), i]);
    });
    for (const [klass, members] of byClass) groups.push({ chapter, klass, members });
  });

  const live = () => groups.filter((g) => g.members.length);
  const perChapter = (chapter: number) => live().filter((g) => g.chapter === chapter);
  const removable = (g: Group) => perChapter(g.chapter).length > 1 && (g.klass === 'symbol' || (g.klass === 'object' && !keepObjects.has(g.chapter)));

  /** Moves each member of `g` into the sibling group whose latest earlier member is nearest. */
  const fold = (g: Group, others: Group[]) => {
    for (const m of g.members) {
      const before = (o: Group) => Math.max(...o.members.filter((x) => x < m));
      const into = others.filter((o) => o.members.some((x) => x < m)).sort((a, b) => before(b) - before(a))[0] ?? others[0];
      into.members.push(m);
    }
    g.members = [];
  };

  const removeOne = (): boolean => {
    const g = live()
      .filter(removable)
      .sort((a, b) => (a.klass !== b.klass ? (a.klass === 'symbol' ? -1 : 1) : a.members.length - b.members.length))[0];
    if (!g) return false;
    fold(g, live().filter((o) => o !== g && o.chapter === g.chapter));
    return true;
  };
  while (live().length > target && removeOne());

  const leadPrompt = (g: Group) => {
    const vis = chapters[g.chapter];
    const lead = g.members.filter((i) => classOf(vis[i]) === g.klass)[0] ?? g.members[0];
    return vis[lead]?.prompt ?? '';
  };

  // Fold groups whose pictures would come out alike anyway.
  let changed = true;
  while (changed) {
    changed = false;
    const snapshot = live();
    for (const g of snapshot.filter(removable)) {
      const words = sceneWords(leadPrompt(g));
      const alike = snapshot.some((o) => o !== g && o.members.length && jaccard(words, sceneWords(leadPrompt(o))) >= DIVERSITY.jaccard);
      if (!alike) continue;
      const others = live().filter((o) => o !== g && o.chapter === g.chapter);
      if (!others.length) continue;
      fold(g, others);
      changed = true;
      break;
    }
  }

  // With room to spare, split the busiest groups so fewer stills repeat.
  while (live().length < target) {
    const big = live()
      .filter((g) => g.members.length > STILL_USES_PREFERRED)
      .sort((a, b) => b.members.length - a.members.length)[0];
    if (!big) break;
    const sorted = [...big.members].sort((a, b) => a - b);
    const half = Math.ceil(sorted.length / 2);
    big.members = sorted.slice(0, half);
    groups.push({ chapter: big.chapter, klass: big.klass, members: sorted.slice(half) });
  }

  let images = 0;
  for (const g of live()) {
    const vis = chapters[g.chapter];
    const sorted = [...g.members].sort((a, b) => a - b);
    const same = sorted.filter((i) => classOf(vis[i]) === g.klass);
    const lead = same.find((i) => vis[i].role === 'reenactment') ?? same[0] ?? sorted[0];
    images++;
    for (const m of sorted) {
      if (m === lead) continue;
      vis[m].reuse = vis[lead].key;
      vis[m].prompt = vis[lead].prompt;
    }
  }
  return { images, segments, overTarget: images > target };
}

export function imagesToMake<T extends ReusableVisual>(visuals: T[]): T[] {
  return visuals.filter((v) => v.kind === 'still' && !v.reuse);
}
