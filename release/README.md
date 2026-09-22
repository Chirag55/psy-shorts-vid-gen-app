# Installable build

`mindfiles-studio-v1.7.0-arm64.apk` — signed, ready to sideload.

## Install it

1. Open this file's page on your phone and tap **Download**.
2. Tap the downloaded file.
3. Android will ask permission to install from this source — allow it.
4. Open **The Mind Files Studio**, go to **Settings**, and paste your Gemini or
   Claude key and your ElevenLabs key.

The signing key has not changed, so this installs over an earlier version and
keeps your projects, keys and YouTube link. Verify the download if you want to:

```bash
sha256sum -c SHA256SUMS
```

## What changed in 1.7.0 — the crash during assemble

1.6.0 fixed one native crash and left a second one standing. The breadcrumb
trail added in 1.6.0 named it: the app was dying inside *"Drawing 70 caption
frames"*.

Each caption frame allocated its own Skia offscreen surface. On Android
`Surface.MakeOffscreen` is GPU-backed: it allocates a real backend texture
through a thread-local `GrDirectContext` and wraps it in a release callback that
calls `deleteBackendTexture`. Both the allocation and the eventual deletion need
the EGL context current on the calling thread, and the deletion is deferred into
Skia's command stream rather than happening immediately.

Rendering a short therefore created and dropped seventy GPU textures in a loop
that also yielded to the event loop, leaving a queue of pending texture
deletions racing the UI thread for the shared EGL display. Losing that race
kills the process from native code — no JavaScript exception, nothing an error
boundary can catch. Because it is a race, it was intermittent: the same chapter
rendered fine once and took the app down the next time.

Nothing drawn offscreen here is ever shown on screen; it goes straight to a PNG.
So none of it needs the GPU. `Surface.Make` is the CPU raster equivalent — plain
memory, no EGL, no driver, no deferred destruction — and it is no slower in
practice, because the GPU path has to read every pixel back across the bus
anyway.

- The caption renderer now allocates **one** surface for the whole sequence and
  clears it between frames. Snapshots are disposed before the next clear, so
  Skia's copy-on-write never has to duplicate the buffer.
- Mascot import had a second, independent version of the same bug: the downscale
  path disposed the surface while the snapshot borrowing its texture was still
  about to be read. Pixels are now read while the surface is alive, from a CPU
  surface.
- Surface allocation is centralised, sizes are validated before any native call,
  and a test fails the build if `MakeOffscreen` is reintroduced anywhere.

## Also in 1.7.0

- **The crash reporter was reporting crashes that never happened.** Completions
  were matched to trail entries by array index, but the trail is capped, so
  writing a new entry shifted the older ones — the completion then landed on the
  wrong entry, or none. Entries carry an id now. A step that throws a normal
  error is also closed, since a thrown error proves the process survived.
- **Finer crash location.** Caption rendering records its position every twelve
  frames, so any future crash names the iteration, not just the step.
- **A dry run.** `npm run dryrun` executes the real renderer against real Skia
  (CanvasKit) in Node: font decode, text layout, 70 short frames, six repeated
  runs, 499 long-form frames, the mascot flood fill and the downscale path —
  checking that the mascot's eyes survive and the border background is cleared.
  This runs before a build now, rather than the phone being the first thing to
  execute the drawing code.

## Build facts

| | |
|---|---|
| Package | `com.mindfiles.studio` |
| Version | 1.7.0 (versionCode 7) |
| ABI | arm64-v8a only |
| Signing SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |

The SHA-1 is what the Google Cloud OAuth client is registered against; it is
unchanged, so the YouTube link keeps working.
