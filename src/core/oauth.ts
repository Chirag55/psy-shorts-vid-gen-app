/** Google sign-in helpers shared by the YouTube service and Settings. */

/** Everyday sign-in: refresh token, account picker. */
export const AUTH_EXTRA_PARAMS = { access_type: 'offline', prompt: 'select_account' };
/** Forces the consent screen, so Google issues a fresh refresh token. */
export const AUTH_CONSENT_PARAMS = { access_type: 'offline', prompt: 'consent' };

export const SIGN_IN_EXPIRED_MESSAGE =
  'Your Google sign-in has expired or was revoked, so the app signed you out. Sign in again in Settings → YouTube. If this happens about every 7 days, your Google Cloud consent screen is still in "Testing" — see Settings for the one-time fix.';

/** Google rejects a prompt holding several space-separated values on some accounts. */
export function promptIsSingleValue(params: { prompt?: string }): boolean {
  return !/\s/.test(params.prompt ?? '');
}

/** The reverse-DNS scheme an Android OAuth client redirects to. */
export function redirectSchemeFor(clientId: string): string {
  return clientId.trim().split('.').reverse().join('.');
}

export function redirectUriFor(clientId: string): string {
  return `${redirectSchemeFor(clientId)}:/oauthredirect`;
}

/** Whether the app registers the redirect scheme this client id needs. */
export function schemeIsRegistered(clientId: string, schemes: string | string[] | undefined): boolean {
  if (!clientId.trim()) return false;
  const list = Array.isArray(schemes) ? schemes : [schemes];
  return list
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .includes(redirectSchemeFor(clientId));
}

/** Whether a token error means the refresh token is gone for good. */
export function isRevokedGrant(e: any): boolean {
  if (!e) return false;
  if (e.code === 'invalid_grant' || e.error === 'invalid_grant') return true;
  return /invalid_grant|expired or revoked|authorization grant .* is invalid/i.test(String(e.message ?? e));
}
