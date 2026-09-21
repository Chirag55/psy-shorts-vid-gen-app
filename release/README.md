# Installable build

`mindfiles-studio-v1.4.0-arm64.apk` — signed, ready to sideload.

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

## What changed in 1.4.0

- **Strategist round one.** Scripts must now name the specific tactic rather than a
  generic label, and frame it as something being done *to* the viewer. Topic
  ideation is weighted toward the rising tactic cluster. Underperforming angles
  are now an explicit avoid signal instead of neutral context.
- **New "Three tactics" short format** — an enumerated variant that fits three
  named tactics inside the same word budget.
- **Provider outages no longer kill a generation.** A Gemini 503 used to fail
  instantly with raw JSON; transient failures now retry with backoff and every
  error reads as a sentence.
- **YouTube sign-in moved into Settings**, next to the other credentials, with a
  button that shows the package name and SHA-1 for the Google Cloud OAuth client.

## What changed in 1.3.0 — channel parity

Compared against screenshots of a published Short:

- **Mascot cutout fixed.** Background removal was keying out every white pixel,
  which would have punched holes through a mostly-white mascot — face, belly and
  eyes. Replaced with the border flood fill the desktop studio uses, run once at
  import, which only clears background connected to the edge.
- **Anton is bundled** and used for captions, instead of whatever condensed face
  the device happened to ship.
- **Shorts show one word at a time**, mid-frame, at 76px — matching the channel
  rather than a phrase in a low band.

## What changed in 1.2.1

- **"Test ElevenLabs key"** in Settings runs a real request and reports the
  server's own message plus a description of the stored key — its length and
  format, never the key itself.
- **Masked and truncated keys are now named.** ElevenLabs reveals a key once, at
  creation; copying it from the dashboard afterwards yields a masked value that
  pastes cleanly and is then rejected with no clue why.

## What changed in 1.2.0

- **Voice credits are protected.** Synthesis is cached by a hash of text, voice
  and model, so identical input never bills twice. Audio is written to disk the
  instant it arrives, before anything that could fail. A batch authenticates once
  up front, so a rejected key spends nothing.
- **Fixed the Imagen 404.** Both image paths are supported now — Imagen via
  `:predict` and the far more widely available Gemini image models via
  `:generateContent` — and Settings lists what your key can actually call.
- **Pasted keys are sanitised** of whitespace, non-breaking spaces, zero-width
  characters and control codes, which are invisible in the input field and are a
  common cause of a "rejected" key that is actually fine.

## What changed in 1.1.0

- **Fixed Gemini 404s.** The model id was hardcoded and Google retired it.
  Settings now lists the models your key can actually call.
- **Fixed ElevenLabs keys being rejected.** A key scoped to text-to-speech was
  reported invalid, and — worse — a failed check refused to save it at all. Keys
  are now always saved; verification only warns.
- **Claude or Gemini** for script and topic generation, chosen in Settings.
- **YouTube API key support** — browse published uploads and channel stats with
  no sign-in.
- **Scripts informed by results** — your best and worst performing titles feed
  into generation when YouTube is connected.

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
| Version | 1.4.0 (versionCode 1) |
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
