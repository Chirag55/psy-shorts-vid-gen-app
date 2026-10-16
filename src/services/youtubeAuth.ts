import { getKey, setKey } from './keys';
import { MetadataUpdateError } from './metadataUpdate';
import { authorize, ensureFreshToken } from './youtube';

/** A fresh access token from the stored sign-in, saved back if refreshed. */
export async function youtubeAccessToken(): Promise<string> {
  const [stored, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!stored || !clientId) throw new MetadataUpdateError('Sign in to YouTube in Settings first.', 'auth');
  const tokens = await ensureFreshToken(clientId, JSON.parse(stored));
  await setKey('youtubeTokens', JSON.stringify(tokens));
  return tokens.accessToken;
}

/** Runs the Google sign-in again, e.g. after a permissions failure. */
export async function signInAgain(): Promise<void> {
  const clientId = await getKey('youtubeClientId');
  if (!clientId) throw new MetadataUpdateError('Add your OAuth client ID in Settings first.', 'auth');
  const tokens = await authorize(clientId);
  await setKey('youtubeTokens', JSON.stringify(tokens));
}
