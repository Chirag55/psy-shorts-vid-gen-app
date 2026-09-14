/** The Mind Files brand palette — matches the desktop studio's dashboard. */
export const colors = {
  bg: '#0b0e14',
  surface: '#141924',
  surfaceAlt: '#1c2231',
  border: '#2a3244',
  text: '#e8ecf4',
  textDim: '#94a1b8',
  textFaint: '#5d6982',
  /** Brand gold — the thumbnail line-2 colour from the spec. */
  accent: '#f59e0b',
  accentDim: '#b4770a',
  /** Neon yellow used for the active subtitle word (&H0000FFFF& in ASS BGR). */
  neon: '#ffff00',
  ok: '#34d399',
  warn: '#fbbf24',
  danger: '#f87171',
  info: '#60a5fa',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const type = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 19, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 14, color: colors.text },
  small: { fontSize: 12, color: colors.textDim },
  mono: { fontSize: 12, fontFamily: 'monospace', color: colors.textDim },
};
