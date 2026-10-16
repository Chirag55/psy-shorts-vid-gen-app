/**
 * The app's Android identity, sent with Google API calls so a key restricted to
 * this app accepts them.
 */
export const ANDROID_PACKAGE = 'com.mindfiles.studio';
export const ANDROID_CERT_SHA1 = '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';
export const ANDROID_KEY_HEADERS = { 'X-Android-Package': ANDROID_PACKAGE, 'X-Android-Cert': ANDROID_CERT_SHA1 };

/** The SHA-1 as Google Cloud shows it, colon-separated. */
export function formattedSha1(): string {
  return ANDROID_CERT_SHA1.match(/.{2}/g)?.join(':') ?? ANDROID_CERT_SHA1;
}
