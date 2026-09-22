import fs from 'node:fs';
import nodePath from 'node:path';

/**
 * A Node stand-in for `expo-file-system`'s File/Directory API.
 *
 * The dry run exercises the real renderer, and the real renderer writes files.
 * Rather than mock the writes away — which would skip exactly the steps most
 * likely to be wrong — this maps them onto a temporary directory so the output
 * can be inspected afterwards.
 */

let ROOT = nodePath.join(process.cwd(), '.dryrun');

export function setRoot(dir: string): void {
  ROOT = dir;
}

const toPath = (uri: string): string => (uri.startsWith('file://') ? uri.slice(7) : uri);
const toUri = (path: string): string => `file://${path}`;

type Anchor = string | Directory | File;

function resolve(parts: Anchor[]): string {
  const segments = parts.map((p) => (typeof p === 'string' ? toPath(p) : toPath(p.uri)));
  return nodePath.resolve(...(segments as [string, ...string[]]));
}

export class Directory {
  path: string;

  constructor(...parts: Anchor[]) {
    this.path = resolve(parts);
  }

  get uri(): string {
    return toUri(this.path);
  }

  get exists(): boolean {
    return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
  }

  create(opts: { intermediates?: boolean } = {}): void {
    fs.mkdirSync(this.path, { recursive: opts.intermediates !== false });
  }

  delete(): void {
    fs.rmSync(this.path, { recursive: true, force: true });
  }

  list(): Array<File | Directory> {
    return fs.readdirSync(this.path).map((name) => {
      const full = nodePath.join(this.path, name);
      return fs.statSync(full).isDirectory() ? new Directory(full) : new File(full);
    });
  }
}

export class File {
  path: string;

  constructor(...parts: Anchor[]) {
    this.path = resolve(parts);
  }

  get uri(): string {
    return toUri(this.path);
  }

  get exists(): boolean {
    return fs.existsSync(this.path) && fs.statSync(this.path).isFile();
  }

  get size(): number {
    return this.exists ? fs.statSync(this.path).size : 0;
  }

  create(opts: { intermediates?: boolean; overwrite?: boolean } = {}): void {
    if (opts.intermediates !== false) fs.mkdirSync(nodePath.dirname(this.path), { recursive: true });
    if (this.exists && !opts.overwrite) return;
    fs.writeFileSync(this.path, Buffer.alloc(0));
  }

  write(contents: Uint8Array | string, opts: { encoding?: string } = {}): void {
    fs.mkdirSync(nodePath.dirname(this.path), { recursive: true });
    if (typeof contents === 'string') {
      fs.writeFileSync(this.path, contents, (opts.encoding as BufferEncoding) ?? 'utf8');
    } else {
      fs.writeFileSync(this.path, Buffer.from(contents));
    }
  }

  bytes(): Uint8Array {
    return new Uint8Array(fs.readFileSync(this.path));
  }

  textSync(): string {
    return fs.readFileSync(this.path, 'utf8');
  }

  text(): Promise<string> {
    return Promise.resolve(this.textSync());
  }

  delete(): void {
    fs.rmSync(this.path, { force: true });
  }

  async copy(target: File): Promise<void> {
    fs.mkdirSync(nodePath.dirname(target.path), { recursive: true });
    fs.copyFileSync(this.path, target.path);
  }
}

export const Paths = {
  get document(): string {
    fs.mkdirSync(ROOT, { recursive: true });
    return toUri(ROOT);
  },
  get cache(): string {
    const dir = nodePath.join(ROOT, 'cache');
    fs.mkdirSync(dir, { recursive: true });
    return toUri(dir);
  },
};
