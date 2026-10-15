import { readFileSync } from 'fs';
import { parseBankV2, isV2Bank } from '../../src/core/bankV2';
for (const f of ['topic-bank-v4-gemini-compliant-8.md', 'topic-bank-v4-gemini-compliant-9.md']) {
  const md = readFileSync('/home/user/psy-shorts-vid-gen-app/recovery/banks/' + f, 'utf8');
  const r = parseBankV2(md);
  console.log(f, isV2Bank(md), 'entries', r.entries.length, 'short', r.entries.filter(e => e.kind === 'short').length, 'long', r.entries.filter(e=>e.kind==='long').length, 'rejected', r.rejected.length, 'ignored', r.ignored.length, 'warnings', r.warnings.length, 'skips', r.skips.length);
  console.log(r.rejected.slice(0, 8).map(x => x.reason).join('\n'));
  console.log(r.warnings.slice(0, 5).map(x => x.reason).join('\n'));
  console.log(JSON.stringify(r.ignored.slice(0,3)));
  const l = r.entries.find(e => e.kind === 'long') as any;
  if (l) console.log(l.id, l.chapters.length, l.screenplay ? Object.keys(l.screenplay).join(',') : 'no screenplay', l.screenplay?.hoot_moments?.length);
}
