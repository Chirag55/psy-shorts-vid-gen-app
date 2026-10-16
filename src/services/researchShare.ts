import * as Sharing from 'expo-sharing';

/** Hands the saved Markdown report to the Android share sheet. */
export async function shareReport(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'text/markdown', dialogTitle: 'Share outlier report' });
}
