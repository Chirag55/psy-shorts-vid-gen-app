import { feederLine } from './feeder';
import { relevantShorts } from './seoLint';

/** A by-hand Studio step after an upload. */
export interface FunnelTask {
  id: string;
  title: string;
  detail: string;
  url: string;
  copy?: string;
  ready: boolean;
}

/** What the release watcher has confirmed for a video. */
export interface ReleaseWatchState {
  done: string[];
  alerts: { stage: string }[];
}

const STUDIO = 'https://studio.youtube.com/video/';
const studioEdit = (id: string) => `${STUDIO}${id}/edit`;
const studioEditor = (id: string) => `${STUDIO}${id}/editor`;
const studioComments = (id: string) => `${STUDIO}${id}/comments`;
const studioAnalytics = (id: string) => `${STUDIO}${id}/analytics/tab-overview/period-default`;
const studioTranslations = (id: string) => `${STUDIO}${id}/translations`;
/** How soon before release the community poll card shows. */
const POLL_LEAD_MS = 259200000;

const entryIdOf = (p: any): string | undefined => p.bankEntryId ?? p.script.bankEntryId;

/** The long-form project a Short feeds. */
export function longformProjectFor(project: any, projects: any[]): any | undefined {
  const id = project.mode === 'short' ? project.script.bankV2?.relatedLongform : undefined;
  if (!id) return undefined;
  return projects.find((p) => p.mode === 'long' && entryIdOf(p) === id);
}

/** Whether a project's video is public now, as far as the release watcher knows. */
export function isLive(project: any, watches: Record<string, ReleaseWatchState>, now: Date): boolean {
  const videoId = project?.assets.youtubeVideoId;
  if (!project || !videoId) return false;
  const at = project.assets.scheduledFor
    ? new Date(project.assets.scheduledFor).getTime()
    : project.publish.privacyStatus === 'public'
      ? (project.assets.publishedAt ?? 0)
      : Infinity;
  if (!(at <= now.getTime())) return false;
  const watch = watches[videoId];
  if (!watch) return true;
  return watch.done.includes('status') && !watch.alerts.some((a) => a.stage === 'status');
}

/** Uploaded Shorts that feed a long-form project. */
export function feederProjects(long: any, projects: any[]): any[] {
  const id = entryIdOf(long);
  if (!id) return [];
  return projects.filter(
    (p) => p.mode === 'short' && p.script.bankV2?.relatedLongform === id && p.assets.youtubeVideoId,
  );
}

/** Live long-forms whose feeder Shorts still need their description updated. */
export function pendingFunnel(
  projects: any[],
  watches: Record<string, ReleaseWatchState>,
  now: Date,
): { long: any; shorts: any[] }[] {
  return projects
    .filter((p) => p.mode === 'long' && p.script.bankV2 && isLive(p, watches, now))
    .map((long) => ({ long, shorts: feederProjects(long, projects).filter((s) => s.funnelPending) }))
    .filter((x) => x.shorts.length);
}

/** The by-hand Studio steps for an uploaded bank video, each ready once what it needs is live. */
export function postPublishTasks(
  project: any,
  projects: any[],
  watches: Record<string, ReleaseWatchState>,
  now: Date,
  urlOf: (videoId: string) => string,
  nextTopics?: string[],
): FunnelTask[] {
  const videoId = project.assets.youtubeVideoId;
  if (!videoId) return [];
  if (project.mode === 'short') {
    const bank = project.script.bankV2;
    if (!bank) return [];
    const longId = project.mode === 'short' ? project.script.bankV2?.relatedLongform : undefined;
    const long = longId ? projects.find((p) => p.mode === 'long' && entryIdOf(p) === longId) : undefined;
    const longLive = isLive(long, watches, now);
    const longVideo = long?.assets.youtubeVideoId;
    const longTitle = long?.publish.title || long?.script.title || bank.relatedLongform;
    const pinTasks: FunnelTask[] = bank.pinnedComment
      ? [
          {
            id: 'pin-comment',
            title: 'Pin your comment',
            detail:
              (project.commentPosted
                ? 'The app posted it when the video went up. In Studio: Comments → ⋮ → Pin. The API can post but not pin.'
                : 'Post the comment below on the Short, then pin it in Studio. The API can post but not pin.') +
              ' Then reply to every comment in the first hour.',
            url: studioComments(videoId),
            copy: bank.pinnedComment,
            ready: true,
          },
        ]
      : [];
    return [
      ...pinTasks,
      {
        id: 'related',
        title: `Set Related video → ${longTitle}`,
        detail: longLive
          ? 'In Studio: Details → Related video → pick the long-form. The API has no field for it.'
          : `Waiting for ${bank.relatedLongform} to go live; a Short can only link a public video.`,
        url: studioEdit(videoId),
        ready: longLive,
      },
      {
        id: 'pin',
        title: 'Pin a comment pointing to the full file',
        detail: longLive
          ? 'Post the comment below on the Short, then pin it in Studio. The API can post but not pin.'
          : `Waiting for ${bank.relatedLongform} to go live.`,
        url: studioComments(videoId),
        ...(longLive && longVideo
          ? { copy: `${bank.pinnedComment ? `${bank.pinnedComment}\n` : ''}▶ Full file: ${longTitle} — ${urlOf(longVideo)}` }
          : {}),
        ready: longLive,
      },
    ];
  }
  const bank = project.script.bankV2;
  if (!bank) return [];
  const script = project.script;
  const live = isLive(project, watches, now);
  const next: string | undefined = bank.nextVideo;
  const nextProject = next ? projects.find((p) => p.mode === 'long' && entryIdOf(p) === next) : undefined;
  const nextLive = isLive(nextProject, watches, now);
  const nextTitle = nextProject?.publish.title || nextProject?.script.title || next;
  const goesAt = project.assets.scheduledFor
    ? new Date(project.assets.scheduledFor).getTime()
    : (project.assets.publishedAt ?? now.getTime());
  const titles = [script.title, ...(bank.titleAlts ?? [])];
  const tasks: FunnelTask[] = [
    {
      id: 'testcompare',
      title: `Test & Compare: ${Math.max(1, (bank.thumbnailTexts ?? []).length)} thumbnails + ${titles.length} titles`,
      detail:
        'In Studio: Details → Thumbnail → Test & Compare. Upload the A/B/C thumbnails from the Thumbnail screen (saved to your gallery) and add the titles below. YouTube keeps the one with the most watch time.',
      url: studioEdit(videoId),
      copy: titles.join('\n'),
      ready: true,
    },
    {
      id: 'dubbing',
      title: 'Turn on auto-dubbing',
      detail:
        'In Studio: Languages → auto-dubbing on (Spanish, Portuguese and Hindi first). Each language is a new way in for recommendations.',
      url: studioTranslations(videoId),
      ready: true,
    },
    {
      id: 'endscreen',
      title: 'Add end screen → Best for viewer + Subscribe',
      detail: next
        ? `In Studio: Editor → End screen → a video element set to "Best for viewer" and a Subscribe element. When ${next} is live a second card says to point it there. The API can't add end screens.`
        : "In Studio: Editor → End screen → a video element and a Subscribe element. The API can't add end screens.",
      url: studioEditor(videoId),
      ready: true,
    },
  ];
  if (next) {
    tasks.push({
      id: `endscreen-${next}`,
      title: `Point the end screen at ${nextTitle}`,
      detail: nextLive
        ? `The narration hands off to ${nextTitle} ("It's on screen now"). In Studio: Editor → End screen → change the video element from "Best for viewer" to this video.`
        : nextProject
          ? `Waiting for ${next} to go live; an end screen can only show a public video.`
          : `${next} isn't in the topic bank yet; this card waits until it is made and live.`,
      url: studioEditor(videoId),
      ...(nextLive && nextProject?.assets.youtubeVideoId ? { copy: urlOf(nextProject.assets.youtubeVideoId) } : {}),
      ready: nextLive,
    });
  }
  if (bank.commentQuestion) {
    tasks.push({
      id: 'pin',
      title: 'Post and pin the question',
      detail: live
        ? project.commentPosted
          ? 'The app posted it with the upload. In Studio: Comments → ⋮ → Pin.'
          : 'Post the comment below on the video, then pin it in Studio. The API can post but not pin.'
        : 'Once the video is live: pin the question below (the app posts it with the upload).',
      url: studioComments(videoId),
      copy: bank.commentQuestion,
      ready: live,
    });
  }
  const feeders = feederLine(project.bankEntryId ?? script.bankEntryId ?? '');
  if (feeders) {
    tasks.push({
      id: 'related-feeders',
      title: 'Set Related video on the feeder Shorts',
      detail: live
        ? `In Studio, on each of these Shorts: Details → Related video → this long-form. ${feeders}. A Short that isn't on the channel yet gets it when it goes up.`
        : `Once this video is public, set Related video on: ${feeders}. Until then point each at its best related Short.`,
      url: 'https://studio.youtube.com',
      ...(live && videoId ? { copy: urlOf(videoId) } : {}),
      ready: live,
    });
  }
  if (!live && goesAt - now.getTime() <= POLL_LEAD_MS) {
    const copy = bank.flagship
      ? 'Which is hardest to spot?\n- Guilt trips\n- The silent treatment\n- Hot and cold'
      : `Which file should Professor Hoot open next?${(nextTopics ?? [])
          .slice(0, 4)
          .map((t) => `\n- ${t}`)
          .join('')}`;
    tasks.push({
      id: 'poll',
      title: 'Post a community poll before it goes live',
      detail:
        'In the YouTube app: Create → Post → Poll. It seeds demand for the next files and tells you what to make. Edit the options to the next topics.',
      url: 'https://studio.youtube.com',
      copy,
      ready: true,
    });
  }
  if (bank.flagship) {
    tasks.push(
      {
        id: 'measure-48h',
        title: 'At 48 hours: click rate and the first 30 seconds',
        detail:
          "In Studio: Analytics → Reach (click rate against your channel median) and Engagement (viewers still watching at 0:30). A weak click rate: swap the thumbnail and title in Test & Compare. A weak 0:30: rework the next episode's hook, not its items.",
        url: studioAnalytics(videoId),
        ready: live,
      },
      {
        id: 'measure-7d',
        title: 'At 7 days: average % viewed, the drop-off item and the numbers in the comments',
        detail:
          'Viewers leaving at one item: move that tactic later, or cut it next time. Comments quoting a number: that item is the next Short sequel. Write what you learn as a proposed lesson.',
        url: studioAnalytics(videoId),
        ready: live,
      },
    );
  }
  return tasks;
}

/** Ready Studio steps not yet ticked off, across all projects. */
export function openTasks(
  projects: any[],
  watches: Record<string, ReleaseWatchState>,
  now: Date,
  urlOf: (videoId: string) => string,
  nextTopics?: string[],
): { project: any; task: FunnelTask }[] {
  return projects.flatMap((project) =>
    postPublishTasks(project, projects, watches, now, urlOf, nextTopics)
      .filter((t) => t.ready && !(project.tasksDone ?? []).includes(t.id))
      .map((task) => ({ project, task })),
  );
}

/** Links a v2 project's description can include: its long-form, or its feeder Shorts and next video. */
export function v2SeoInputs(
  project: any,
  projects: any[],
  watches: Record<string, ReleaseWatchState>,
  now: Date,
  links: {
    shortUrl: (videoId: string) => string;
    watchUrl: (videoId: string) => string;
    viewsOf: (videoId: string) => number | undefined;
    orderOf: (project: any) => number;
  },
): {
  longform?: { title: string; url: string };
  feederShorts?: { title: string; url: string }[];
  nextVideo?: { title: string; url: string };
} {
  if (!project) return {};
  if (project.mode === 'short' && project.script.bankV2) {
    const long = longformProjectFor(project, projects);
    if (!long || !isLive(long, watches, now)) return {};
    return {
      longform: { title: long.publish.title || long.script.title, url: links.watchUrl(long.assets.youtubeVideoId) },
    };
  }
  if (project.mode !== 'long' || !project.script.bankV2) return {};
  const feeders = feederProjects(project, projects)
    .filter((s) => isLive(s, watches, now))
    .map((s) => ({
      title: s.publish.title || s.script.title,
      url: links.shortUrl(s.assets.youtubeVideoId),
      views: links.viewsOf(s.assets.youtubeVideoId),
      order: links.orderOf(s),
    }));
  const nextId = project.script.bankV2?.nextVideo;
  const nextProject = nextId
    ? projects.find((p) => p.mode === 'long' && p.id !== project.id && entryIdOf(p) === nextId)
    : undefined;
  const nextVideo =
    nextProject?.assets.youtubeVideoId && isLive(nextProject, watches, now)
      ? {
          title: nextProject.publish.title || nextProject.script.title,
          url: links.watchUrl(nextProject.assets.youtubeVideoId),
        }
      : undefined;
  return {
    feederShorts: relevantShorts(feeders).map(({ title, url }) => ({ title, url })),
    ...(nextVideo ? { nextVideo } : {}),
  };
}
