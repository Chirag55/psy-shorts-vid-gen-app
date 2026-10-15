/** Default playlist titles per channel pillar slot (A-E plus the Manipulation & Defense pillar). */
export const DEFAULT_PLAYLIST_NAMES: Record<string, string> = {
  A: 'Psychology of People Who…',
  B: '',
  C: 'Every X Explained',
  D: 'Book Summaries (Science-Checked)',
  E: '',
  MD: 'Manipulation Defense',
};

export const PLAYLIST_SLOT_LABELS: Record<string, string> = {
  A: 'A · Identity',
  B: 'B · Aspirational',
  C: 'C · Explainer ("Every X")',
  D: 'D · Book summary',
  E: 'E · Calm compilation',
  MD: 'Manipulation & Defense pillar',
};

/** The playlists a video belongs in: its slot's playlist, plus the pillar playlist for MD topics. */
export function playlistTitlesFor(slot: string | undefined, category: string | undefined, names: Record<string, string>): string[] {
  const list = [slot ? names[slot] ?? '' : '', category === 'Manipulation & Defense' ? names.MD ?? '' : ''].map((s) => s.trim());
  return [...new Set(list.filter(Boolean))];
}
