const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Installs a small native module that reads Android's record of why previous
 * processes of this app ended.
 *
 * The android/ directory is generated, so the Kotlin sources live under
 * plugins/ and are copied in during prebuild. Without that they would be lost
 * the next time the project is regenerated.
 */
const SOURCES = ['CrashInfoModule.kt', 'CrashInfoPackage.kt'];
const PACKAGE_DIR = path.join('app', 'src', 'main', 'java', 'com', 'mindfiles', 'studio');

function copySources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const from = path.join(cfg.modRequest.projectRoot, 'plugins', 'crashinfo');
      const to = path.join(cfg.modRequest.platformProjectRoot, PACKAGE_DIR);
      fs.mkdirSync(to, { recursive: true });
      for (const name of SOURCES) {
        fs.copyFileSync(path.join(from, name), path.join(to, name));
      }
      return cfg;
    },
  ]);
}

function registerPackage(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes('CrashInfoPackage()')) return cfg;

    const anchor = 'PackageList(this).packages.apply {';
    if (!contents.includes(anchor)) {
      throw new Error('withCrashInfo: could not find the package list in MainApplication.kt');
    }
    contents = contents.replace(anchor, `${anchor}\n          add(CrashInfoPackage())`);
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withCrashInfo(config) {
  return registerPackage(copySources(config));
};
