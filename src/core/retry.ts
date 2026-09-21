/**
 * Retry policy for transient upstream failures.
 *
 * Model APIs return 503 "high demand" and 429 rate limits routinely, and both
 * clear on their own within seconds. Surfacing them immediately as a failure
 * turns a brief capacity spike into a dead button, which is what an outage felt
 * like from the app before this existed.
 */

/** Statuses worth retrying. Anything else is a real error and fails fast. */
export function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export interface RetryPlan {
  attempts: number;
  /** Base delay in milliseconds; each attempt doubles it. */
  baseDelayMs: number;
}

export const DEFAULT_RETRY: RetryPlan = { attempts: 4, baseDelayMs: 1200 };

/**
 * Exponential backoff with jitter.
 *
 * The jitter matters when several chapters are synthesised in a loop: without
 * it every retry lands at the same instant and re-creates the spike that caused
 * the failure.
 */
export function backoffDelay(attempt: number, plan: RetryPlan = DEFAULT_RETRY): number {
  const exponential = plan.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * plan.baseDelayMs;
  return Math.min(15_000, exponential + jitter);
}

/** Human explanation for a status, used instead of echoing provider JSON. */
export function describeTransient(status: number, provider: string): string {
  if (status === 429) {
    return `${provider} is rate limiting this key. Wait a moment and try again.`;
  }
  if (status === 503) {
    return `${provider} is temporarily overloaded — this is on their side, not yours, and usually clears within a minute. Retrying did not help this time.`;
  }
  return `${provider} is having trouble right now (${status}). It usually clears on its own.`;
}

export interface AttemptResult<T> {
  value?: T;
  status: number;
  retryable: boolean;
}

/**
 * Runs `attempt` until it reports success, a non-retryable status, or the plan
 * runs out. `sleep` is injectable so tests do not have to wait.
 */
export async function withRetry<T>(
  attempt: (attemptIndex: number) => Promise<AttemptResult<T>>,
  plan: RetryPlan = DEFAULT_RETRY,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<AttemptResult<T>> {
  let last: AttemptResult<T> = { status: 0, retryable: true };

  for (let i = 0; i < plan.attempts; i++) {
    last = await attempt(i);
    if (!last.retryable) return last;
    if (i < plan.attempts - 1) await sleep(backoffDelay(i, plan));
  }

  return last;
}
