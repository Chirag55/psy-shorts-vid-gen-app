import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'releases';

let ready: Promise<boolean> | null = null;

/** Sets up the handler and channel once and asks for permission; false when refused. */
export function ensureNotifications(): Promise<boolean> {
  if (ready == null) {
    ready = (async () => {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Releases',
          description: 'Checks on scheduled videos after they go public',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        if (!current.canAskAgain) return false;
        return (await Notifications.requestPermissionsAsync()).granted;
      } catch {
        return false;
      }
    })();
  }
  return ready;
}

export async function notifyNow(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!(await ensureNotifications())) return;
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: { channelId: CHANNEL_ID } });
  } catch {
    // A missed notification is never worth an error.
  }
}

/** Schedules a notification; returns its id, or undefined when the time has passed or it could not be set. */
export async function notifyAt(
  at: Date,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<string | undefined> {
  try {
    if (at.getTime() <= Date.now()) return undefined;
    if (!(await ensureNotifications())) return undefined;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
  } catch {
    return undefined;
  }
}

export async function cancelNotification(id: string | undefined): Promise<void> {
  try {
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or gone.
  }
}
