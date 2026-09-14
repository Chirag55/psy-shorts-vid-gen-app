/**
 * Expo config plugin for react-native-ffmpeg-kit.
 *
 * FFmpegKit was retired upstream in 2025 and its AAR artifacts were removed from
 * Maven Central, so the Gradle coordinate cannot be resolved remotely any more.
 * This plugin wires up what is needed to build against a locally vendored AAR:
 *
 *   1. A `flatDir` repository over `android/libs/`, so Gradle can see an
 *      `ffmpeg-kit-*.aar` dropped there (see scripts/fetch-ffmpeg-aar.sh).
 *   2. The `ffmpegKitVariant` / `ffmpegKitPackage` Gradle properties, which the
 *      library reads via `project.hasProperty(...)`. `full-gpl` is the only
 *      variant that ships libass, and libass is what burns the kinetic ASS
 *      subtitles — a smaller variant renders video with no captions at all.
 *   3. An ABI filter, because the full-gpl AAR carries one large .so per ABI.
 */
const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');

const VARIANT = 'full-gpl';
const VERSION = '6.0-2';

const FLATDIR_MARKER = 'mindfiles-flatdir';
const ABI_MARKER = 'mindfiles-abi-filter';

/**
 * The library resolves its variant through Gradle project properties, so these
 * belong in gradle.properties. An earlier version of this plugin appended them
 * to an `ext {}` block in build.gradle, which silently did nothing: the Expo
 * template has no such block, so the injection never matched.
 */
const withFFmpegProperties = (config) =>
  withGradleProperties(config, (cfg) => {
    const upsert = (key, value) => {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: 'property', key, value });
      }
    };

    upsert('ffmpegKitVariant', VARIANT);
    upsert('ffmpegKitPackage', VARIANT);
    upsert('ffmpegKitVersion', VERSION);

    return cfg;
  });

const withFFmpegFlatDir = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withFFmpegKit only supports a Groovy project build.gradle.');
    }
    if (cfg.modResults.contents.includes(FLATDIR_MARKER)) return cfg;

    cfg.modResults.contents += `

// ${FLATDIR_MARKER}: resolve the vendored FFmpegKit AAR from android/libs
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

const withFFmpegAbiFilter = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withFFmpegKit only supports a Groovy app build.gradle.');
    }
    if (cfg.modResults.contents.includes(ABI_MARKER)) return cfg;

    const updated = cfg.modResults.contents.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {
        // ${ABI_MARKER}: the full-gpl AAR ships one large .so per ABI; only ship
        // the two that real Android phones use.
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

module.exports = (config) => withFFmpegAbiFilter(withFFmpegFlatDir(withFFmpegProperties(config)));
