/** Filesystem-safe slug, matching the `{date}-{slug}` convention of the desktop studio. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

export function datedSlug(title: string, at: Date = new Date()): string {
  const d = at.toISOString().slice(0, 10);
  return `${d}-${slugify(title)}`;
}

/** `slug`, or `slug-2`, `slug-3`… — the first one not already taken. */
export function uniqueSlug(slug: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const c = `${slug}-${n}`;
    if (!set.has(c)) return c;
  }
}
