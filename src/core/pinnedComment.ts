/** The comment to post (and pin by hand) under a video: the Short's pinned comment, or the long video's question. */
export function pinnedCommentOf(script: any): string | undefined {
  const text = script.mode !== 'short' ? script.bankV2?.commentQuestion : script.bankV2?.pinnedComment;
  return text?.trim() || undefined;
}
