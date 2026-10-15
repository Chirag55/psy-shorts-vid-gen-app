/** The spoken sign-off, which is never counted as a citation. */
const SIGN_OFF = /\s*\.\.\.and that's the mind for you\.\s*Stay curious, stay sharp\.\s*$/i;
const CITATION = /\b(?:19|20)\d\d\b|\bresearchers?\b|\bstud(?:y|ies)\b|\bexperiments?\b|\bpsychologists?\b|\bet al\b|\bjournal\b|\bprofessor\b/gi;

export function spokenBody(text: string): string {
  return text.replace(SIGN_OFF, '').trim();
}

/** Words that make the voice cite its source (a year, "researchers", "a study"…), deduplicated, lower-case. */
export function citationHits(text: string): string[] {
  const body = text.replace(SIGN_OFF, '').trim();
  return [...new Set([...body.matchAll(CITATION)].map((m) => m[0].toLowerCase()))];
}
