import { Directory, File, Paths } from 'expo-file-system';

/**
 * On-device mirror of the desktop studio's `outputs/` tree:
 *
 *   outputs/audio/{slug}/      chapter voiceovers + alignment JSON
 *   outputs/clips/{slug}/      imported Veo clips
 *   outputs/stills/{slug}/     connective stills + Ken Burns MP4s
 *   outputs/segments/{slug}/   independently rendered chapter MP4s
 *   outputs/final/{slug}/      assembled videos
 *   outputs/thumbnails/{slug}/ candidate frames + rendered thumbnails
 *   outputs/subs/{slug}/       generated .ass subtitle files
 */
const ROOT = 'outputs';

export type Bucket = 'audio' | 'clips' | 'stills' | 'segments' | 'final' | 'thumbnails' | 'subs';

function ensure(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function workspaceRoot(): Directory {
  return ensure(new Directory(Paths.document, ROOT));
}

export function bucketDir(bucket: Bucket, slug: string): Directory {
  return ensure(new Directory(workspaceRoot(), bucket, slug));
}

export function bucketFile(bucket: Bucket, slug: string, name: string): File {
  return new File(bucketDir(bucket, slug), name);
}

/** FFmpeg needs a plain filesystem path, not a file:// URI. */
export function toFsPath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

export function writeText(file: File, contents: string): File {
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(contents);
  return file;
}

export function writeBase64(file: File, base64: string): File {
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(base64, { encoding: 'base64' });
  return file;
}

/** Copies an imported clip into the workspace so it survives the picker's cache being cleared. */
export async function importInto(bucket: Bucket, slug: string, sourceUri: string, name: string): Promise<string> {
  const source = new File(sourceUri);
  const target = new File(bucketDir(bucket, slug), name);
  if (target.exists) target.delete();
  await source.copy(target);
  return target.uri;
}

export function deleteProjectFiles(slug: string): void {
  const buckets: Bucket[] = ['audio', 'clips', 'stills', 'segments', 'final', 'thumbnails', 'subs'];
  for (const b of buckets) {
    const dir = new Directory(workspaceRoot(), b, slug);
    if (dir.exists) dir.delete();
  }
}

/** Recursive byte total, for the Settings screen's storage readout. */
export function workspaceSize(): number {
  const walk = (dir: Directory): number => {
    if (!dir.exists) return 0;
    let total = 0;
    for (const entry of dir.list()) {
      if (entry instanceof Directory) total += walk(entry);
      else total += entry.size ?? 0;
    }
    return total;
  };
  return walk(workspaceRoot());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
