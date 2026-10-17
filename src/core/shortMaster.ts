import { clipKeyFor, flattenShots, type BeatWithShots } from './shots';
import { finalisePrompt } from './styleLock';
import { MASTER_HEADER, sha1, stillId } from './stillMaster';
import { castIn } from './fillSheet';

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface ShortManifestRow {
  id: string;
  beat: number;
  seconds: number;
  cast: string[];
  hash: string;
  key: string;
  label: string;
}

export interface ShortMasterGroup {
  kind: 'still' | 'clip';
  prefix: 'S' | 'C';
  label: string;
  lines: string[];
  manifest: ShortManifestRow[];
  text: string;
  fileName: string;
  manifestName: string;
  json: string;
}

/** A Short's master prompt files, one for stills and one for clips, with manifests to match downloads back. */
export function shortMasters(
  script: { beats: BeatWithShots[]; characterDescription?: string },
  slug: string,
): { groups: ShortMasterGroup[] } {
  const character = script.characterDescription?.trim() ?? '';
  const flat = flattenShots(script);
  const groups: ShortMasterGroup[] = [];
  for (const kind of ['still', 'clip'] as const) {
    const prefix = kind === 'still' ? 'S' : 'C';
    const items = flat.filter((f) => f.shot.source === kind && f.shot.clipPrompt && f.shot.reuse === undefined);
    if (!items.length) continue;
    const prompts = items.map((f) =>
      oneLine(
        f.shot.promptFinal
          ? (f.shot.clipPrompt as string)
          : finalisePrompt(f.shot.clipPrompt as string, { character: f.shot.isCutaway ? undefined : character }),
      ),
    );
    const manifest = items.map(
      (f, i): ShortManifestRow => ({
        id: (f.shot.beatId as string | undefined) ?? stillId(i, prefix),
        beat: f.beatIndex + 1,
        seconds: f.shot.durationSec,
        cast: castIn(prompts[i]).map((c) => c.toLowerCase()),
        hash: sha1(prompts[i]),
        key: clipKeyFor(f.flatIndex),
        label: `${f.shot.setting ? f.shot.setting.charAt(0).toUpperCase() + f.shot.setting.slice(1) : 'Shot'}${f.shot.interrupt ? ' · surprise shot' : ''}`,
      }),
    );
    const lines = prompts.map((p, i) => `${manifest[i].id} | ${p}`);
    const noun = kind === 'still' ? 'stills' : 'clips';
    const header = items.every((f) => f.shot.promptFinal) ? '' : `${MASTER_HEADER}\n`;
    groups.push({
      kind,
      prefix,
      label: kind === 'still' ? 'Stills (images)' : 'Clips (videos)',
      lines,
      manifest,
      text: `${header}${lines.join('\n')}\n`,
      fileName: `${slug}_${noun}_master_prompt.txt`,
      manifestName: `${slug}_${noun}_manifest.json`,
      json: JSON.stringify(manifest.map(({ key: _key, ...rest }) => rest)),
    });
  }
  return { groups };
}

export function shortCostLine(m: { groups: ShortMasterGroup[] }, creditsPerClip: number): string {
  const clips = m.groups.find((g) => g.kind === 'clip')?.manifest.length ?? 0;
  const stills = m.groups.find((g) => g.kind === 'still')?.manifest.length ?? 0;
  return `${clips} clip${clips === 1 ? '' : 's'} = ${clips * creditsPerClip} Flow credits. ${stills} still${stills === 1 ? '' : 's'} use none.`;
}
