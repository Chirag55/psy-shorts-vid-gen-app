import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import {
  conceptOf,
  exportBankMarkdown,
  findDuplicates,
  parseBankMarkdown,
  planImport,
  type ImportPlan,
} from '@/core/topicBank';
import { importReport } from '@/core/importReport';
import { gateLogMarkdown } from '@/core/authenticity';
import { useStudio } from '@/store';
import { resolveYouTubeAuth } from './performanceContext';
import { fetchChannel, fetchUploadsPage } from './youtube';

type Published = { title: string; concept?: string };

/** Everything already published: app projects, bank entries marked published, and channel uploads. */
async function publishedContext(): Promise<{ items: Published[]; note?: string }> {
  const state = useStudio.getState();
  let items: Published[] = [
    ...state.projects
      .filter((p) => p.assets.youtubeVideoId)
      .map((p) => {
        const title = p.publish.title || p.script.title;
        return { title, concept: p.mode === 'short' ? (p.script as any).tactic : title };
      }),
    ...state.bank.filter((e) => e.status === 'published').map((e) => ({ title: e.title, concept: conceptOf(e) })),
  ];
  try {
    const auth = await resolveYouTubeAuth();
    if (!auth) return { items, note: 'YouTube is not connected, so uploads made outside the app were not checked.' };
    const channel = await fetchChannel(auth);
    const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, undefined, 50);
    items = [...items, ...page.videos.map((v) => ({ title: v.title }))];
    return { items };
  } catch (e) {
    return { items, note: `Channel uploads could not be read (${e instanceof Error ? e.message : String(e)}).` };
  }
}

export interface ImportPreview {
  fileName: string;
  markdown: string;
  accepted: string[];
  report: ReturnType<typeof importReport>;
  plan: ImportPlan;
  warnings: { id: string; message: string }[];
  libraryNote?: string;
}

/** Parses a bank file and plans the import against the current bank, without applying it. */
export async function previewImport(fileName: string, markdown: string, accepted: string[] = []): Promise<ImportPreview> {
  const state = useStudio.getState();
  const parsed = parseBankMarkdown(markdown);
  const plan = planImport(state.bank, parsed, state.bankMeta, Date.now(), { accept: accepted });
  const ctx = await publishedContext();
  const excludeConcepts = plan.banks.flatMap((b: any) => b.excludeConcepts);
  const incoming = parsed.entries.map((e: any) => ({ id: e.id, title: e.title, concept: conceptOf(e) }));
  const others = state.bank.map((e) => ({ id: e.id, title: e.title, concept: conceptOf(e) }));
  const warnings = findDuplicates(incoming, { excludeConcepts, published: ctx.items, others });
  return {
    fileName,
    markdown,
    accepted,
    report: importReport(parsed, plan, { neutralTerms: state.settings.neutralTerms }),
    plan,
    warnings,
    libraryNote: ctx.note,
  };
}

/** Lets the user choose a bank file; null when they cancel. */
export async function pickBankFile(): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = await new File(asset.uri).text();
  if (!/```yaml/.test(text)) throw new Error(`"${asset.name}" has no \`\`\`yaml blocks, so it is not a topic bank file.`);
  return { name: asset.name, text };
}

/** Near-copies of one bank entry among published videos. */
export async function duplicatesForEntry(id: string): Promise<{ id: string; message: string }[]> {
  const state = useStudio.getState();
  const entry = state.bank.find((e) => e.id === id);
  if (!entry) return [];
  const ctx = await publishedContext();
  const excludeConcepts = state.bankMeta.find((b: any) => b.bankId === (entry as any).bankId)?.excludeConcepts ?? [];
  return findDuplicates([{ id: entry.id, title: entry.title, concept: conceptOf(entry) }], {
    excludeConcepts,
    published: ctx.items,
  });
}

/** Shares the bank with each entry's status as Markdown. */
export async function exportBank(): Promise<void> {
  const state = useStudio.getState();
  if (!state.bank.length) throw new Error('The topic bank is empty — import a bank file first.');
  const md = exportBankMarkdown(state.bank, state.bankMeta);
  const file = new File(Paths.cache, `topic-bank-status-${new Date().toISOString().slice(0, 10)}.md`);
  file.create({ overwrite: true });
  file.write(md);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Export topic bank status' });
}

/** Shares every project's authenticity gate runs as Markdown. */
export async function exportGateLog(): Promise<void> {
  const rows = useStudio
    .getState()
    .projects.filter((p) => p.gateLog?.length)
    .map((p) => ({ title: p.publish.title || p.script.title, videoId: p.assets.youtubeVideoId, log: p.gateLog ?? [] }));
  if (!rows.length) throw new Error('No gate runs yet: the log fills as videos are rendered through the gate.');
  const file = new File(Paths.cache, `gate-log-${new Date().toISOString().slice(0, 10)}.md`);
  file.create({ overwrite: true });
  file.write(gateLogMarkdown(rows, new Date()));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Export the gate log' });
}
