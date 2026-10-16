/** Titles of the bundled bank's entries, parsed once. Rebuilt from 6.1.13. */
import { TOPIC_BANK_V2 } from '../assets/topicBankV2';
import { parseBankV2 } from './bankV2';

let titles: Map<string, string> | null = null;

export function bundledTitle(id: string): string | undefined {
  if (!titles) titles = new Map(parseBankV2(TOPIC_BANK_V2).entries.map((e) => [e.id, e.title]));
  return titles.get(id);
}
