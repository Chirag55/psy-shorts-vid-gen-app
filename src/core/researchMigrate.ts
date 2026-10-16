import { KEYWORD_MIGRATION_V132, V132_NICHE_TERMS } from './researchConfig';

export interface MigratableProfile {
  id: string;
  name: string;
  seedKeywords: string[];
  nicheTerms: string[];
  [key: string]: unknown;
}

/** The 1.3.2 keyword clean-up: drop, rename and add seeds on the default profile, and fill in niche terms. */
export function migrateProfilesV132<P extends MigratableProfile>(profiles: P[]): { profiles: P[]; changes: string[] } {
  const changes: string[] = [];
  const m = KEYWORD_MIGRATION_V132;
  const out = profiles.map((p) => {
    let seeds = p.seedKeywords;
    let niche = p.nicheTerms;
    if (p.id === m.profileId) {
      const lower = (s: string) => s.trim().toLowerCase();
      const dropped = seeds.filter((k) => m.drop.includes(lower(k)));
      const kept = seeds.filter((k) => !m.drop.includes(lower(k)));
      const renamed: string[] = [];
      const mapped = kept.map((k) => {
        const to = m.rename[lower(k)];
        if (to) renamed.push(`"${k}" → "${to}"`);
        return to ?? k;
      });
      const have = new Set(mapped.map(lower));
      const added = m.add.filter((k) => !have.has(k));
      seeds = [...new Set([...mapped, ...added])];
      if (dropped.length) changes.push(`${p.name}: dropped ${dropped.map((k) => `"${k}"`).join(', ')}`);
      if (renamed.length) changes.push(`${p.name}: renamed ${renamed.join(', ')}`);
      if (added.length) changes.push(`${p.name}: added ${added.map((k) => `"${k}"`).join(', ')}`);
    }
    if (niche.some((t) => t.toLowerCase() === 'psychology')) {
      const missing = V132_NICHE_TERMS.filter((t) => !niche.map((x) => x.toLowerCase()).includes(t));
      if (missing.length) {
        niche = [...niche, ...missing];
        changes.push(`${p.name}: niche terms added ${missing.join(', ')}`);
      }
    }
    return seeds === p.seedKeywords && niche === p.nicheTerms ? p : { ...p, seedKeywords: seeds, nicheTerms: niche };
  });
  return { profiles: out, changes };
}
