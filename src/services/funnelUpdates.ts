import { useStudio } from '@/store';
import { pendingFunnel } from '@/core/funnel';
import { addFullBreakdownLine } from '@/core/seoLint';
import { getKey, setKey } from './keys';
import { notifyNow } from './notifications';
import { editDescription, ensureFreshToken, watchUrl } from './youtube';

let running: Promise<number> | null = null;

/** Points each feeding Short's description at its long-form once that is live. Returns how many were linked. */
async function doUpdates(now: Date): Promise<number> {
  const s = useStudio.getState();
  const groups = pendingFunnel(s.projects, s.releaseWatch, now);
  if (!groups.length) return 0;
  const [tokensJson, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!tokensJson || !clientId) return 0;
  const tokens = await ensureFreshToken(clientId, JSON.parse(tokensJson));
  await setKey('youtubeTokens', JSON.stringify(tokens));

  let linked = 0;
  const failures: string[] = [];
  for (const { long, shorts } of groups) {
    const target = { title: long.publish.title || long.script.title, url: watchUrl(long.assets.youtubeVideoId) };
    for (const short of shorts) {
      try {
        await editDescription(tokens.accessToken, short.assets.youtubeVideoId, (d) => addFullBreakdownLine(d, target));
        useStudio.getState().updateProject(short.id, {
          funnelPending: false,
          publish: {
            ...short.publish,
            description: addFullBreakdownLine(short.publish.description, target) ?? short.publish.description,
          },
        });
        linked += 1;
      } catch (e) {
        failures.push(`${short.publish.title || short.script.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (linked) {
    await notifyNow(
      'Shorts linked to the full file',
      `${linked} Short${linked === 1 ? '' : 's'} now point${linked === 1 ? 's' : ''} to the live long-form.`,
    );
  } else if (failures.length) {
    await notifyNow('Some Shorts could not be linked', failures.slice(0, 3).join('\n'));
  }
  return linked;
}

/** Runs the funnel updates once at a time; a second call joins the run in progress. */
export function runFunnelUpdates(now: Date = new Date()): Promise<number> {
  if (running == null) {
    running = doUpdates(now).finally(() => {
      running = null;
    });
  }
  return running;
}
