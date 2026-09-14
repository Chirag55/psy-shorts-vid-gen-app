/**
 * Privacy and safety hardening for the Android manifest.
 *
 * This app holds three things worth protecting: your Gemini and ElevenLabs API
 * keys, a YouTube OAuth refresh token that can publish to your channel, and
 * unreleased video projects. All of it is single-user and lives only on the
 * device, so the manifest is locked down to keep it there.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withPrivacyHardening(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    // Android auto-backup would copy app-private storage, including the
    // encrypted SecureStore preferences holding your API keys and YouTube
    // refresh token, to the user's Google Drive. Off. (expo-secure-store is
    // configured with configureAndroidBackup:false so it does not re-add rules
    // that only matter when backup is enabled.)
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = 'false';
    delete application.$['android:dataExtractionRules'];

    // Every endpoint this app talks to is HTTPS. Refusing cleartext outright
    // means a misconfigured URL fails loudly instead of sending an API key
    // over plain HTTP.
    application.$['android:usesCleartextTraffic'] = 'false';

    // android:debuggable is deliberately NOT set here. Gradle already sets it
    // per build type (false for release), and pinning it in the manifest fights
    // the merger on debug builds.

    return cfg;
  });
};
