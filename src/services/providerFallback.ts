import { ScriptProviderError, isCapacityFailure } from '@/core/retry';

export type ProviderName = 'gemini' | 'anthropic';

export const PROVIDER_LABEL: Record<ProviderName, string> = { gemini: 'Gemini', anthropic: 'Claude' };

export interface FallbackCtx {
  provider: ProviderName;
  model?: string;
  /** The model to ask on the other provider. */
  fallbackModel?: string;
  signal?: AbortSignal;
  onNotice?: (message: string) => void;
}

export interface RunOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  onNotice?: (message: string) => void;
}

/**
 * Runs a call on the chosen provider and, when it is out of capacity, once more
 * on the other provider if a key for it is set.
 */
export async function runWithProviderFallback<T>(
  ctx: FallbackCtx,
  keyFor: (provider: ProviderName) => Promise<string>,
  peekKey: (provider: ProviderName) => Promise<string | null | undefined>,
  run: (provider: ProviderName, opts: RunOptions) => Promise<T>,
): Promise<T> {
  const apiKey = await keyFor(ctx.provider);
  try {
    return await run(ctx.provider, { apiKey, model: ctx.model, signal: ctx.signal, onNotice: ctx.onNotice });
  } catch (err) {
    if (!(err instanceof ScriptProviderError && isCapacityFailure(err.kind) && !ctx.signal?.aborted)) throw err;
    const fromLabel = PROVIDER_LABEL[ctx.provider];
    const other: ProviderName = ctx.provider === 'gemini' ? 'anthropic' : 'gemini';
    const otherLabel = PROVIDER_LABEL[other];
    const otherKey = await peekKey(other);
    if (!otherKey) {
      throw new ScriptProviderError(
        `${err.message}\n\nTip: add a ${otherLabel} key in Settings and the app will switch to it automatically when ${fromLabel} is out of capacity.`,
        err.kind,
        err.provider,
      );
    }
    ctx.onNotice?.(`${fromLabel} is out of capacity — switching to ${otherLabel}…`);
    let result: T;
    try {
      result = await run(other, { apiKey: otherKey, model: ctx.fallbackModel, signal: ctx.signal, onNotice: ctx.onNotice });
    } catch (second) {
      if (ctx.signal?.aborted) throw second;
      const message = second instanceof Error ? second.message : String(second);
      throw new ScriptProviderError(
        `${err.message}\n\n${otherLabel} also failed: ${message}`,
        second instanceof ScriptProviderError ? second.kind : 'other',
        err.provider,
      );
    }
    ctx.onNotice?.(`Written by ${otherLabel} — ${fromLabel} was out of capacity.`);
    return result;
  }
}
