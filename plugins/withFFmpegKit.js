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
 *   1. An ABI filter — the FFmpeg AAR carries a full native stack per ABI, and
 *      shipping only the two ABIs real phones use roughly halves the APK.
 *   2. A flatDir repository over android/libs, so a hand-built AAR can be
 *      dropped in to override the published one without editing Gradle.
 *   3. A larger AsyncStorage database, because word-level alignment data for a
 *      backlog of projects outgrows the stingy 6 MB default.
 */
const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');

const FLATDIR_MARKER = 'mindfiles-flatdir';
const ABI_MARKER = 'mindfiles-abi-filter';

const withStorageProperties = (config) =>
  withGradleProperties(config, (cfg) => {
    const upsert = (key, value) => {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };

    upsert('AsyncStorage_db_size_in_MB', '64');
    return cfg;
  });

const withLocalAarOverride = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withFFmpegKit only supports a Groovy project build.gradle.');
    }
    if (cfg.modResults.contents.includes(FLATDIR_MARKER)) return cfg;

    cfg.modResults.contents += `

// ${FLATDIR_MARKER}: optional override — an ffmpeg-kit-*.aar dropped into
// android/libs is picked up in place of the published dependency.
allprojects {
    repositories {
        flatDir {
            dirs "$rootDir/libs"
        }
    }
}
`;
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
        // ${ABI_MARKER}: FFmpeg ships a full native stack per ABI; only the two
        // that real Android phones use are worth packaging.
        ndk {
            abiFilters "arm64-v8a", "armeabi-v7a"
        }`
    );

    if (updated === cfg.modResults.contents) {
      throw new Error('withFFmpegKit could not find a defaultConfig block in app/build.gradle.');
    }

    cfg.modResults.contents = updated;
    return cfg;
  });

module.exports = (config) => withAbiFilter(withLocalAarOverride(withStorageProperties(config)));
