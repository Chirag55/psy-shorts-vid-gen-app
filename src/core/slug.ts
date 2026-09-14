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
