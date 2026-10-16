/** The Shorts that feed each long-form, for its description and pinned comment. */
export const FEEDER_MAP: Record<string, { id: string; note?: string }[]> = {
  'MF-L-05': [{ id: 'S-031' }, { id: 'S-051' }, { id: 'D20', note: 'if imported' }, { id: 'S-024', note: 'if published' }],
  'MF-L-02': [{ id: 'D03' }, { id: 'D11' }, { id: 'D19' }, { id: 'D23' }, { id: 'S-039' }],
  'MF-L-01': [{ id: 'D01' }, { id: 'D05', note: 'if imported' }, { id: 'S-036' }, { id: 'S-055' }],
  'MF-L-06': [{ id: 'S-033' }, { id: 'S-037' }, { id: 'S-044' }],
  'MF-L-03': [
    { id: 'D06' },
    { id: 'D10' },
    { id: 'D14' },
    { id: 'D18' },
    { id: 'D22' },
    { id: 'D28' },
    { id: 'D30' },
    { id: 'S-035' },
    { id: 'S-040' },
    { id: 'S-052' },
  ],
  'MF-L-04': [{ id: 'D16' }, { id: 'S-034' }, { id: 'S-056' }],
  'MF-L-07': [
    { id: 'D11' },
    { id: 'D03' },
    { id: 'D19' },
    { id: 'S-033', note: 'guilt trip' },
    { id: 'D47', note: 'the outro' },
    { id: 'the gaslighting Short', note: 'already published' },
    { id: 'the hot-and-cold Short', note: 'already published' },
  ],
};

export function feederLine(longId: string): string {
  return (FEEDER_MAP[longId] ?? []).map((f) => `${f.id}${f.note ? ` (${f.note})` : ''}`).join(', ');
}
