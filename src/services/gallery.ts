import * as MediaLibrary from 'expo-media-library';

/** Saves a file to the phone's gallery; without permission it stays in the app's workspace. */
export async function saveToGallery(uri: string): Promise<'gallery' | 'workspace-only'> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) return 'workspace-only';
  await MediaLibrary.Asset.create(uri);
  return 'gallery';
}
