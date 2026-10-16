/** YouTube's size limit for a custom thumbnail. */
export const THUMBNAIL_MAX_BYTES = 2097152;

export function thumbnailContentType(uri: string): string {
  return /\.png(\?|$)/i.test(uri) ? 'image/png' : 'image/jpeg';
}

/** A plain reason for a failed thumbnails.set call. */
export function describeThumbnailFailure(status: number, body: string): string {
  let reason = '';
  let message = '';
  try {
    const json = JSON.parse(body);
    reason = json.error?.errors?.[0]?.reason ?? '';
    message = json.error?.errors?.[0]?.message ?? json.error?.message ?? '';
  } catch {
    // Not JSON; fall back to the status.
  }
  if (status === 401) return 'YouTube sign-in has expired. Sign in again on the Publish screen.';
  if (status === 404 || reason === 'videoNotFound') return 'YouTube cannot find that video. It may have been deleted.';
  if (status === 403 || reason === 'forbidden') {
    return 'YouTube refused a custom thumbnail for this channel. Custom thumbnails need the channel to be verified (a one-time phone check at youtube.com/verify), and YouTube can take up to a day to allow them after that.';
  }
  if (status === 429 || reason === 'uploadRateLimitExceeded') return 'Too many thumbnail uploads in a short time. Try again later.';
  if (reason === 'invalidImage' || reason === 'mediaBodyRequired') {
    return 'YouTube could not read the image. Draw the thumbnail again and retry.';
  }
  return `YouTube rejected the thumbnail (${status})${message ? `: ${message}` : '.'}`;
}
