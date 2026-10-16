const ERROR_WORDS =
  /(error|invalid|unknown|no such file|not found|failed|cannot|can't|unable|does not|mismatch|out of memory|permission denied|unsupported|too many)/i;
/** Lines that say only that something failed, not what. */
const GENERIC_FAILURE =
  /^(conversion failed!?|error while filtering\b.*|exiting normally.*|error opening output files?: .*)$/i;

const shorten = (line: string) => {
  const s = line.replace(/(?:file:\/\/)?\/(?:[^\s/'":]+\/)+([^\s/'":]+)/g, '$1');
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
};

/** The line of an FFmpeg log that says why it failed, without paths. */
export function ffmpegReason(log: string): string | undefined {
  const lines = log
    .split('\n')
    .map((l) => l.replace(/^\[[^\]]*@ 0x[0-9a-f]+\]\s*/i, '').trim())
    .filter(Boolean);
  let generic: string | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!ERROR_WORDS.test(line)) continue;
    if (!GENERIC_FAILURE.test(line)) return shorten(line);
    generic = generic ?? line;
  }
  return generic ? shorten(generic) : undefined;
}
