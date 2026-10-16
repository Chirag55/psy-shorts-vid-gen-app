const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The newest published deep dive that covers a Short's tactic. */
export function findRelatedDeepDive(short: { tactic?: string }, projects: any[]): any | undefined {
  if (!short.tactic) return undefined;
  const tactic = normalise(short.tactic);
  return projects
    .filter((p) => p.mode === 'long' && p.assets.youtubeVideoId)
    .filter((p) => {
      const names: string[] = [...(p.script.tactics ?? []), ...p.script.chapters.map((c: any) => c.title)];
      if (!tactic) return false;
      return names.some((n) => {
        const x = normalise(n);
        return x === tactic || x.includes(tactic) || tactic.includes(x);
      });
    })
    .sort((a, b) => (b.assets.publishedAt ?? b.updatedAt) - (a.assets.publishedAt ?? a.updatedAt))[0];
}

export function deepDiveLine(url: string): string {
  return `Full breakdown: ${url}`;
}

/** The title of the most recent upload other than this project. */
export function previousUploadTitle(projects: any[], currentId: string): string | undefined {
  return projects
    .filter((p) => p.id !== currentId && p.assets.youtubeVideoId)
    .sort((a, b) => (b.assets.publishedAt ?? 0) - (a.assets.publishedAt ?? 0))[0]?.publish.title;
}
