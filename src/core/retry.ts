/**
 * Gemini failure handling: classify each HTTP failure, decide whether to retry
 * the same model or move to the next one, and explain an all-models failure in
 * plain words instead of echoing provider JSON.
 */

export type FailureKind =
  | 'quota-day'
  | 'rate-minute'
  | 'overloaded'
  | 'unavailable'
  | 'auth'
  | 'bad-request'
  | 'network'
  | 'other';

export interface GeminiFailure {
  kind: FailureKind;
  status: number;
  retryAfterMs?: number;
  detail?: string;
  limit?: number;
  window?: 'minute' | 'day';
}

export type NextStep = { action: 'retry-same'; waitMs: number } | { action: 'next-model' } | { action: 'stop' };

/** Longest retry delay worth waiting out in place; anything longer moves to the next model. */
export const MAX_INLINE_WAIT_MS = 20_000;

/** Model families that are not text generators and can never write a script. */
const NOT_SCRIPT_MODELS = ['embedding', 'aqa', 'tts', 'image', 'imagen', 'veo', 'live', 'native-audio', 'robotics', 'computer-use', 'learnlm'];

export class ScriptProviderError extends Error {
  kind: FailureKind;
  provider: string;
  constructor(message: string, kind: FailureKind, provider: string) {
    super(message);
    this.name = 'ScriptProviderError';
    this.kind = kind;
    this.provider = provider;
  }
}

function parseBody(body?: string): any {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parseLimit(values: unknown[], message: string): number | undefined {
  for (const v of values) {
    const n = Number(v);
    if (v !== undefined && v !== '' && Number.isFinite(n)) return n;
  }
  const m = /limit:\s*(\d+)/i.exec(message);
  return m ? Number(m[1]) : undefined;
}

/** "1.5s" / "800ms" → milliseconds. */
export function parseRetryDelay(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*$/i.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(m[2].toLowerCase() === 'ms' ? n : n * 1000);
}

export function classifyGeminiFailure(status: number, body?: string): GeminiFailure {
  if (status === 0) return { kind: 'network', status };
  const json = parseBody(body);
  const details: any[] = json?.error?.details ?? [];
  const detail: string | undefined = json?.error?.message?.slice(0, 240);
  const retryAfterMs = details.map((d) => parseRetryDelay(d.retryDelay)).find((d) => d !== undefined);
  if (status === 429) {
    const violations = details.flatMap((d) => d.violations ?? []);
    const text = `${violations.map((v: any) => `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`).join(' ')} ${json?.error?.message ?? ''}`;
    const daily = /perday|per_day|per day|daily/.test(text.toLowerCase());
    const limit = parseLimit(violations.map((v: any) => v.quotaValue), json?.error?.message ?? '');
    if (limit === 0) return { kind: 'unavailable', status, detail: 'not included in the free tier on this key (limit 0)', limit };
    return { kind: daily ? 'quota-day' : 'rate-minute', status, retryAfterMs, detail, limit, window: daily ? 'day' : 'minute' };
  }
  if (status === 404) return { kind: 'unavailable', status, detail };
  if (status === 401 || status === 403) return { kind: 'auth', status, detail };
  if (status === 400) return { kind: 'bad-request', status, detail };
  if (status === 500 || status === 502 || status === 503 || status === 504) return { kind: 'overloaded', status, retryAfterMs, detail };
  return { kind: 'other', status, detail };
}

/** What to do after `failure` on attempt `attempt` (0-based) of the same model. */
export function nextStep(failure: GeminiFailure, attempt: number): NextStep {
  switch (failure.kind) {
    case 'auth':
    case 'bad-request':
      return { action: 'stop' };
    case 'quota-day':
    case 'unavailable':
      return { action: 'next-model' };
    case 'rate-minute': {
      const wait = failure.retryAfterMs ?? 4000;
      return attempt === 0 && wait <= MAX_INLINE_WAIT_MS ? { action: 'retry-same', waitMs: wait } : { action: 'next-model' };
    }
    case 'overloaded':
    case 'network':
      return attempt < 2 ? { action: 'retry-same', waitMs: 1500 * 2 ** attempt } : { action: 'next-model' };
    default:
      return attempt < 1 ? { action: 'retry-same', waitMs: 1500 } : { action: 'next-model' };
  }
}

function isScriptCapable(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('gemini-') && !NOT_SCRIPT_MODELS.some((x) => m.includes(x));
}

function familyRank(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('flash-lite')) return 1;
  if (m.includes('flash')) return 0;
  if (m.includes('pro')) return 3;
  return 2;
}

/**
 * The order to try models in: the preferred one first, then flash before
 * flash-lite before pro, "latest" aliases first, previews last, newest version first.
 */
export function planModelOrder(preferred: string | undefined, available: string[], max = 5): string[] {
  const sorted = [...new Set(available.filter(isScriptCapable))].sort((a, b) => {
    const r = familyRank(a) - familyRank(b);
    if (r) return r;
    const la = a.includes('latest') ? 0 : 1;
    const lb = b.includes('latest') ? 0 : 1;
    if (la !== lb) return la - lb;
    const pa = /preview|exp/.test(a) ? 1 : 0;
    const pb = /preview|exp/.test(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return b.localeCompare(a, undefined, { numeric: true });
  });
  const order = preferred ? [preferred, ...sorted.filter((m) => m !== preferred)] : sorted;
  return order.slice(0, max);
}

export function isCapacityFailure(kind: FailureKind): boolean {
  return kind === 'rate-minute' || kind === 'quota-day' || kind === 'overloaded' || kind === 'unavailable' || kind === 'network';
}

/** One line per attempt: "gemini-2.5-flash: per-minute limit hit (limit 10/minute)". */
export function describeAttempt(model: string, f: GeminiFailure): string {
  const limit = f.limit !== undefined ? ` (limit ${f.limit}/${f.window ?? 'period'})` : '';
  switch (f.kind) {
    case 'quota-day':
      return `${model}: today's free quota used up${limit}`;
    case 'rate-minute':
      return `${model}: per-minute limit hit${limit}`;
    case 'unavailable':
      return `${model}: ${f.detail?.includes('limit 0') ? f.detail : 'not available on this key'}`;
    case 'overloaded':
      return `${model}: Google overloaded (HTTP ${f.status})`;
    case 'network':
      return `${model}: no connection`;
    case 'auth':
      return `${model}: key rejected (HTTP ${f.status})`;
    default:
      return `${model}: HTTP ${f.status}${f.detail ? ` — ${f.detail}` : ''}`;
  }
}

/** The kind shared by every attempt, else the most telling capacity kind present. */
export function summariseKinds(kinds: FailureKind[]): FailureKind {
  if (!kinds.length) return 'other';
  if (kinds.every((k) => k === kinds[0])) return kinds[0];
  for (const k of ['rate-minute', 'overloaded', 'quota-day', 'network', 'unavailable'] as FailureKind[]) {
    if (kinds.includes(k)) return k;
  }
  return 'other';
}

export function describeExhausted(kind: FailureKind, provider: string, tried: string[]): string {
  const t = tried.length ? ` (tried ${tried.join(', ')})` : '';
  switch (kind) {
    case 'quota-day':
      return `Every ${provider} model on this key has used up today's free quota${t}. It resets daily at midnight US Pacific time. Switch the script provider in Settings, or enable billing on the key's project.`;
    case 'rate-minute':
      return `${provider} is rate-limiting every model on this key right now${t}. This clears within a minute or two.`;
    case 'unavailable':
      return `None of the ${provider} models tried are available on this key${t}. "Load available models" in Settings shows what the key can use.`;
    case 'overloaded':
      return `${provider} is overloaded right now${t}. This is on their side and usually clears within a minute.`;
    case 'network':
      return `Could not reach ${provider}. Check the connection and try again.`;
    case 'auth':
      return `${provider} rejected the API key. Check it in Settings.`;
    default:
      return `${provider} could not write the script${t}.`;
  }
}

export function describeAllFailed(provider: string, attempts: { model: string; failure: GeminiFailure }[]): string {
  const kinds = attempts.map((a) => a.failure.kind);
  const same = kinds.every((k) => k === kinds[0]);
  const head = same ? describeExhausted(kinds[0] ?? 'other', provider, []) : `No ${provider} model on this key could take the request.`;
  const lines = attempts.map((a) => `• ${describeAttempt(a.model, a.failure)}`).join('\n');
  const daily = kinds.includes('quota-day')
    ? "\n\nDaily free quotas reset at midnight US Pacific. Enabling billing on the key's Google Cloud project lifts them."
    : '';
  return `${head}\n\n${lines}${daily}`;
}
