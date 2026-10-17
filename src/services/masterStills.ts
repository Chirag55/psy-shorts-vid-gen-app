import { Alert, Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { unzipSync } from 'fflate';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useStudio } from '@/store';
import { masterStills, prefixOfId, type PickedFile } from '@/core/stillMaster';
import { shortCostLine, shortMasters } from '@/core/shortMaster';
import { framingProblems } from '@/core/framing';
import { probeSize } from './ffmpeg';
import { importInto } from './workspace';

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;
const VIDEO_FILE = /\.(mp4|mov|webm|m4v)$/i;

export type MasterKind = 'still' | 'clip';

export interface MasterGroup {
  kind: MasterKind;
  prefix: string;
  label: string;
  lines: string[];
  manifest: { id: string; key: string; hash: string }[];
  text: string;
  fileName: string;
  manifestName: string;
  json: string;
}

function visualsOf(projectId: string) {
  const project = useStudio.getState().projects.find((p) => p.id === projectId);
  const visuals: any[] =
    project?.script.mode !== 'long' ? [] : (project.script as any).chapters.flatMap((c: any) => c.visuals ?? []);
  return { project, visuals };
}

/** Records what was exported, replacing the earlier export of the same kind. */
function remember(projectId: string, group: MasterGroup): void {
  const project = useStudio.getState().projects.find((p) => p.id === projectId);
  const prev = project?.stillMaster;
  const keep = (id: string) => prefixOfId(id) !== group.prefix;
  const mapped = Object.fromEntries(Object.entries(prev?.mapped ?? {}).filter(([id]) => keep(id)));
  useStudio.getState().updateProject(projectId, {
    stillMaster: {
      exportedAt: Date.now(),
      entries: [
        ...(prev?.entries ?? []).filter((e: any) => keep(e.id)),
        ...group.manifest.map((m) => ({ id: m.id, key: m.key, hash: m.hash })),
      ],
      mapped,
    },
  });
}

function sizeOf(uri: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(undefined),
    );
  });
}

/** The master prompt groups for a project: stills and clips for a Short, stills for a long video. */
export function masterFor(projectId: string): { cost: string; groups: MasterGroup[] } | null {
  const { project, visuals } = visualsOf(projectId);
  if (!project) return null;
  if (project.script.mode !== 'long') {
    const m = shortMasters(project.script as any, project.slug);
    if (!m.groups.length) return null;
    return {
      cost: shortCostLine(m, useStudio.getState().channelConfig.flow.creditsPerClip),
      groups: m.groups,
    };
  }
  const m = masterStills(visuals);
  if (!m.manifest.length) return null;
  return {
    cost: m.cost,
    groups: [
      {
        prefix: 'S',
        kind: 'still',
        label: 'Stills (images)',
        lines: m.lines,
        manifest: m.manifest,
        text: m.text,
        fileName: m.fileName,
        manifestName: m.manifestName,
        json: m.json,
      },
    ],
  };
}

export async function copyMasterPrompt(projectId: string, group: MasterGroup): Promise<void> {
  await Clipboard.setStringAsync(group.text);
  remember(projectId, group);
}

export async function copyOnePrompt(projectId: string, group: MasterGroup, index: number): Promise<void> {
  await Clipboard.setStringAsync(group.lines[index]);
  remember(projectId, group);
}

/** Saves the master prompt and its manifest through the share sheet. */
export async function saveMasterFiles(projectId: string, group: MasterGroup): Promise<void> {
  remember(projectId, group);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  for (const [name, text, mimeType] of [
    [group.fileName, group.text, 'text/plain'],
    [group.manifestName, group.json, 'application/json'],
  ]) {
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  }
}

/** Picks downloaded pictures or clips, unpacking any zip; stills carry their pixel size. */
export async function pickDownload(kind: MasterKind = 'still'): Promise<PickedFile[]> {
  const pattern = kind === 'clip' ? VIDEO_FILE : IMAGE_FILE;
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: [kind === 'clip' ? 'video/*' : 'image/*', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  });
  if (res.canceled) return [];
  const files: PickedFile[] = [];
  const dir = new Directory(Paths.cache, `flow_${Date.now()}`);
  for (const asset of res.assets) {
    if (/\.zip$/i.test(asset.name)) {
      const entries = unzipSync(await new File(asset.uri).bytes());
      if (!dir.exists) dir.create();
      let n = 0;
      for (const [path, data] of Object.entries(entries)) {
        const name = path.replace(/^.*\//, '');
        if (!pattern.test(name) || name.startsWith('.') || path.startsWith('__MACOSX')) continue;
        const file = new File(dir, `${n++}_${name}`);
        file.create({ overwrite: true });
        file.write(data);
        files.push({ name, uri: file.uri, modified: asset.lastModified });
      }
    } else if (pattern.test(asset.name)) {
      files.push({ name: asset.name, uri: asset.uri, modified: asset.lastModified });
    }
  }
  if (kind === 'still') {
    for (const f of files) Object.assign(f, await sizeOf(f.uri as string));
  }
  return files;
}

/** Imports the chosen file for each key, warns about pictures that will be cropped; returns how many were imported. */
export async function applyPicks(
  projectId: string,
  picks: Record<string, string>,
  files: PickedFile[],
  kind: MasterKind = 'still',
): Promise<number> {
  const { project } = visualsOf(projectId);
  if (!project) throw new Error('Project not found.');
  const { setStill, setClip, updateProject } = useStudio.getState();
  const mapped: Record<string, string> = { ...(project.stillMaster?.mapped ?? {}) };
  const idByKey = new Map<string, string>((project.stillMaster?.entries ?? []).map((e: any) => [e.key, e.id]));
  let imported = 0;
  const warnings: string[] = [];
  for (const [key, name] of Object.entries(picks)) {
    const file = files.find((f) => f.name === name);
    if (!file) continue;
    let size: { width: number; height: number } | null | undefined;
    let probed = true;
    try {
      size = await probeSize(file.uri as string);
    } catch {
      // A size we cannot read is no reason to refuse the file.
      probed = false;
    }
    if (probed) {
      const target = project.mode !== 'long' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
      const problems = framingProblems(
        { width: size?.width ?? file.width ?? 0, height: size?.height ?? file.height ?? 0 },
        target,
      );
      if (problems.length) warnings.push(`${name}: ${problems.join('; ')}`);
    }
    if (kind !== 'clip') {
      const ext = (IMAGE_FILE.exec(name)?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg');
      const uri = await importInto('stills', project.slug, file.uri as string, `${key}_still.${ext}`);
      setStill(projectId, key, uri);
    } else {
      const uri = await importInto('clips', project.slug, file.uri as string, `${key}.mp4`);
      setClip(projectId, key, uri);
    }
    mapped[idByKey.get(key) ?? key] = name;
    imported += 1;
  }
  updateProject(projectId, {
    stillMaster: { ...(project.stillMaster ?? { exportedAt: Date.now(), entries: [] }), mapped },
  });
  if (warnings.length) Alert.alert('Check the framing', `${warnings.join('\n\n')}\n\nThey were imported.`);
  return imported;
}

/** Picks one file for one manifest row. */
export async function importOne(projectId: string, group: MasterGroup, index: number): Promise<number> {
  const files = await pickDownload(group.kind);
  if (!files.length) return 0;
  return applyPicks(projectId, { [group.manifest[index].key]: files[0].name }, files, group.kind);
}
