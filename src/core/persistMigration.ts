import { withChannelDefaults } from './channelConfig';

/**
 * Upgrades and merges the persisted studio store. Kept pure so it can be tested
 * without AsyncStorage; the store passes its current version and defaults.
 */
type Obj = Record<string, any>;

/** The persisted short-clip budget before it became configurable. */
const OLD_DEFAULT_CLIP_BUDGET = 2;

/** Settings that are rebuilt on every launch and must never come from disk. */
const NON_PERSISTED_SETTINGS = ['mascotAssets'];

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function migrateStudio(persisted: unknown, version: number, clipBudget: number): unknown {
  if (!isObject(persisted) || !isObject(persisted.settings)) return persisted;
  let s: Obj = persisted.settings;
  if (version < 1 && (s.shortClipBudget === undefined || s.shortClipBudget === OLD_DEFAULT_CLIP_BUDGET)) {
    s = { ...s, shortClipBudget: clipBudget };
  }
  if (version < 2) s = { ...s, draftRender: false };
  if (version < 3) s = { ...s, includeMascot: false, mascot: 'off' };
  // v5 brings Hoot back: on at the end card unless he was fully on before.
  if (version < 5) s = { ...s, includeMascot: true, mascot: s.mascot === 'full' ? 'full' : 'endcard' };
  if (version < 4 && s.shortClipBudget === 1) s = { ...s, shortClipBudget: clipBudget };
  return s !== persisted.settings ? { ...persisted, settings: s } : persisted;
}

/**
 * Persisted state over current defaults, defensively: a setting of the wrong
 * type is dropped, missing collections fall back to the defaults.
 */
export function mergeStudio<T extends Obj>(persisted: unknown, current: T): T {
  if (!isObject(persisted)) return current;
  const merged: Obj = { ...current, ...persisted };

  if (isObject(current.settings)) {
    const saved = isObject(persisted.settings) ? persisted.settings : {};
    const settings: Obj = { ...current.settings };
    for (const [k, v] of Object.entries(saved)) {
      if (NON_PERSISTED_SETTINGS.includes(k)) continue;
      const def = current.settings[k];
      if (def !== undefined && v !== undefined && v !== null) {
        if (typeof v === typeof def && Array.isArray(v) === Array.isArray(def)) settings[k] = v;
      } else if (v !== undefined && v !== null) {
        settings[k] = v;
      }
    }
    merged.settings = settings;
  }

  if (isObject(current.research) && isObject(persisted.research)) {
    merged.research = {
      ...current.research,
      ...persisted.research,
      filtersVersion: persisted.research.filtersVersion ?? 1,
      keywordsVersion: persisted.research.keywordsVersion ?? 1,
    };
  }

  if ('channelConfig' in current) {
    merged.channelConfig = withChannelDefaults(isObject(persisted.channelConfig) ? persisted.channelConfig : undefined);
  }

  for (const k of ['releaseWatch', 'ypp', 'weekly']) {
    if (k in current && !isObject(merged[k])) merged[k] = current[k];
  }
  for (const k of ['ypp', 'weekly']) {
    if (isObject(current[k]) && isObject(persisted[k])) merged[k] = { ...current[k], ...persisted[k] };
  }
  for (const k of ['projects', 'topics', 'bank', 'bankMeta', 'channelUploads', 'experimentLog']) {
    if (k in current && !Array.isArray(merged[k])) merged[k] = current[k];
  }
  if ('analytics' in current && !isObject(merged.analytics)) merged.analytics = current.analytics;
  return merged as T;
}
