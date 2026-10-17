/** Words that cite or explain where an idea came from, which a narration must not do (CR-87C). */
const ORIGIN =
  /\b(19|20)\d\d\b|researchers?\b|\bstud(y|ies)\b|experiments?\b|psychologists?\b|et al\b|journal|professor|\bin 19|after an old|named after|coined|originally|original authors?|was first (described|named)|comes from the/gi;

export function scriptGateHits(text: string): string[] {
  const hits = new Set<string>();
  for (const m of text.matchAll(ORIGIN)) hits.add(m[0].toLowerCase());
  return [...hits];
}

export function scriptGateMessage(hits: string[]): string {
  return `Script gate (CR-87C): the narration cites or explains an origin ("${hits.join('", "')}"). Rewrite those words out of the script (the bank's narration has none), then render.`;
}
