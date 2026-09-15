# Installable build

`mindfiles-studio-v1.0.1-arm64.apk` — signed, ready to sideload.

## Install it

1. Open this file's page on your phone and tap **Download**.
2. Tap the downloaded file.
3. Android will ask permission to install from this source — allow it.
4. Open **The Mind Files Studio**, go to **Settings**, and paste your Gemini and
   ElevenLabs API keys.

Verify the download if you want to:

```bash
sha256sum -c SHA256SUMS
```

## What changed in 1.0.1

- **Fixed the app failing to launch.** No native module is loaded while the JS
  bundle is being evaluated any more; FFmpeg and Skia are required only when a
  render starts.
- **Startup errors are now visible.** If anything fails during startup, the app
  shows the message and stack instead of closing silently.
- **New Library tab** listing everything published to the channel, read back
  through the YouTube Data API.

Installing over 1.0.0 keeps your projects and keys — same signing key, same
package name.

## About this build

| | |
| :--- | :--- |
| Version | 1.0.1 (versionCode 1) |
| Package | `com.mindfiles.studio` |
| Architecture | `arm64-v8a` only — see below |
| Min Android | 7.0 (API 24) |
| Size | 67 MB |
| Signing | Android debug keystore — see `../docs/SAFETY.md` |

**arm64-v8a only** is deliberate. The FFmpeg library ships its JNI entry point
for arm64 and x86 only; an `armeabi-v7a` build would install on a 32-bit phone
and then crash on the first render. Every Android phone from roughly 2017
onward is arm64. Details in `../docs/FFMPEG.md`.

Native libraries are stored uncompressed, which is why the APK is larger than
the download would otherwise be. That is the modern Android default: it makes
the app start faster and use less space once installed.

## Don't want the binary in git?

It is here because a 68 MB file is too large to send through chat, and this was
the only way to get you a link you can open on the phone. To drop it:

```bash
git rm -r release && git commit -m "Remove prebuilt APK"
```

That removes it going forward. The blob stays in history unless you rewrite it
with `git filter-repo`. Rebuilding is always available instead:

```bash
npm install && npm run prebuild && npm run android
```
