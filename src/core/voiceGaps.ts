/** Long-video tracks with words to speak and no voiceover yet, by label. */
export function unvoicedTracks(
  script: { coldOpen: string; chapters: { index: number; narration: string }[]; closingSynthesis: string },
  audio: Record<string, string | undefined>,
): string[] {
  const tracks: [string, string, string][] = [
    ['0', 'Cold open', script.coldOpen],
    ...script.chapters.map((c): [string, string, string] => [String(c.index), `Chapter ${c.index}`, c.narration]),
    ['99', 'Closing', script.closingSynthesis],
  ];
  return tracks.filter(([key, , text]) => text.trim() && !audio[key]).map(([, label]) => label);
}
