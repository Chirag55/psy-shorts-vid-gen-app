export type ResearchFailureKind = 'quota' | 'key' | 'notEnabled' | 'restricted' | 'retry' | 'offline' | 'other';

/** What a failed YouTube research call means, in plain words. */
export function classifyResearchFailure(status: number, body: string): { kind: ResearchFailureKind; message: string } {
  let reason = '';
  let message = '';
  try {
    const json = JSON.parse(body);
    reason = json.error?.errors?.[0]?.reason ?? json.error?.details?.[0]?.reason ?? '';
    message = json.error?.message ?? json.error?.errors?.[0]?.message ?? '';
  } catch {
    // Not JSON; go by the status.
  }
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    return {
      kind: 'quota',
      message: "YouTube's daily quota for this Google Cloud project is used up. It resets at midnight Pacific time.",
    };
  }
  if (reason === 'keyInvalid' || reason === 'API_KEY_INVALID' || /API key not valid/i.test(message)) {
    return { kind: 'key', message: 'YouTube says this API key is not valid. Check it in Settings.' };
  }
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(message)) {
    return {
      kind: 'notEnabled',
      message:
        "YouTube Data API v3 is not enabled for this key's Google Cloud project. Enable it in Google Cloud Console → APIs & Services.",
    };
  }
  if (
    reason === 'API_KEY_ANDROID_APP_BLOCKED' ||
    reason === 'ipRefererBlocked' ||
    /Android client application|are blocked/i.test(message)
  ) {
    return {
      kind: 'restricted',
      message:
        "The key's restrictions block this app. Allow package com.mindfiles.studio with this build's SHA-1 (shown in Settings), or restrict the key by API only.",
    };
  }
  if (status === 429 || status >= 500) return { kind: 'retry', message: `YouTube is busy (${status}).` };
  if (status === 0) return { kind: 'offline', message: 'No connection to YouTube. Check the internet and try again.' };
  return { kind: 'other', message: `YouTube error ${status}${message ? `: ${message}` : ''}` };
}
