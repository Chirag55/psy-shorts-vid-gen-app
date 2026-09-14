/**
 * Android build tuning for FFmpeg and local storage.
 *
 * The FFmpeg dependency itself needs no help: @wokcito/ffmpeg-kit-react-native
 * pins `io.github.jamaismagic.ffmpeg:ffmpeg-kit-main-16kb`, a republished build
 * that is still live on Maven Central and compiled for 16 KB memory pages —
 * which Android 15 and newer require. The original `com.arthenica` artifacts
 * were withdrawn in 2025 and, being 4 KB-page builds, would fail to load on
 * current devices even if they were still downloadable.
 *
 * What this plugin does add:
 *   1. An arm64-v8a-only build. This is a correctness fix before it is a size
 *      one: the published FFmpeg AAR contains libffmpegkit.so for arm64-v8a and
 *      x86 only. On armeabi-v7a it ships the _neon codec libraries but not the
 *      JNI entry point, so a 32-bit ARM device would install the app and then
 *      crash the moment anything touched FFmpeg. Restricting to arm64-v8a — what
 *      every Android phone since roughly 2017 uses — removes that broken target
 *      and cuts the APK from ~225 MB to ~110 MB, since x86 is emulator-only.
 *   2. A larger AsyncStorage database, because word-level alignment data for a
 *      backlog of projects outgrows the stingy 6 MB default.
 *
 * It deliberately does NOT add a flatDir repository for overriding the AAR:
 * @wokcito/ffmpeg-kit-react-native already declares one over android/libs in
 * its own repositories block, and declaring it again across allprojects made
 * every module emit a "Using flatDir should be avoided" warning for no gain.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const ABI_MARKER = 'mindfiles-abi-filter';
const ABI = 'arm64-v8a';

const withStorageProperties = (config) =>
  withGradleProperties(config, (cfg) => {
    const upsert = (key, value) => {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };

    upsert('AsyncStorage_db_size_in_MB', '64');

    // React Native's Gradle plugin drives ABI selection from this property, and
    // it overrides a plain ndk.abiFilters block — setting only abiFilters
    // silently still produced x86 and armeabi-v7a output.
    upsert('reactNativeArchitectures', ABI);

    return cfg;
  });

const withAbiFilter = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withFFmpegKit only supports a Groovy app build.gradle.');
    }
    if (cfg.modResults.contents.includes(ABI_MARKER)) return cfg;

    const updated = cfg.modResults.contents.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {
        // ${ABI_MARKER}: belt and braces alongside reactNativeArchitectures —
        // the published FFmpeg AAR has no libffmpegkit.so for armeabi-v7a, so
        // packaging that ABI would ship a guaranteed crash.
        ndk {
            abiFilters "${ABI}"
        }`
    );

    if (updated === cfg.modResults.contents) {
      throw new Error('withFFmpegKit could not find a defaultConfig block in app/build.gradle.');
    }

    cfg.modResults.contents = updated;
    return cfg;
  });

module.exports = (config) => withAbiFilter(withStorageProperties(config));
