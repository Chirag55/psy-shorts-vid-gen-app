# Installable build

`mindfiles-studio-v1.8.0-arm64.apk` — signed, ready to sideload.

The signing key has not changed, so this installs over an earlier version and
keeps your projects, keys and YouTube link.

```bash
sha256sum -c SHA256SUMS
```

## What 1.8.0 is for

1.7.0 removed the GPU surface that was crashing caption rendering. A crash was
then reported again — but the report could not say which build produced it,
because the app never recorded its own version. That ambiguity is the first
thing fixed here, and it should never have existed.

**The crash notice now reports the build it is describing**, alongside two new
sources of truth:

- **Android's own exit record.** Since API 30 the system keeps the real reason
  each process ended — native crash, out-of-memory kill, ANR, signal — with the
  memory in use at the time and, where available, the tombstone trace. From
  inside the app a segfault and a low-memory kill are indistinguishable, and
  they need opposite fixes; this tells them apart. A small native module reads
  `ActivityManager.getHistoricalProcessExitReasons`.
- **The full step trail.** The old notice filtered to completed steps, hiding
  the unfinished ones — the only entries that matter when diagnosing a death.
- **A "Copy details" button**, so the whole report can be pasted somewhere
  useful rather than retyped from a screenshot.

Caption rendering also records its position **every frame** now, not every
twelve, so the notice names the exact frame.

## Real changes, not just instrumentation

- **Identical caption frames are drawn once.** Single-word captions repeat
  constantly — "a", "you", "the" — and a repeated word is the same picture. The
  concat list now points repeats at the existing file. On a representative
  short this took the number of native draw-and-encode calls from 70 to 9, and
  the render from 469ms to 88ms. Less work in the layer that has been failing.
- **Non-finite text measurements can no longer reach a draw call.** A font
  missing a glyph could measure `NaN`, which propagated into the draw
  coordinates; Skia given `NaN` coordinates is undefined behaviour, not a
  no-op. Measurements are now validated and coordinates rounded.
- **`measureText` is wrapped**, so a throw from the font layer becomes a
  fallback width rather than an unhandled error mid-render.

## Honest status

Two native crash causes have been found and removed by reading react-native-skia's
Android sources: the per-frame GPU surface (1.7.0) and a use-after-free in the
mascot downscale path (1.7.0). `dispose()` and `Data.fromBytes` were also audited
and are safe — `dispose` is atomically guarded and drops a refcount, and
`fromBytes` copies via `SkData::MakeWithCopy`, so neither can be the cause.

If a crash still happens on this build, the notice will name the build, the
frame, and Android's own verdict on how the process died. That is enough to fix
it directly rather than by hypothesis.

## Dry run

`npm run dryrun` executes the real renderer against real Skia (CanvasKit) in
Node before any build: font decode, layout, 70 short frames, six repeat runs,
499 long-form frames, the mascot flood fill and the downscale path. It checks
the concat list resolves, durations cover the chapter, frames contain real
pixels, the mascot's eyes survive and the border background is cleared.

It cannot reproduce Android's GPU threading — CanvasKit is CPU-backed — so it
proves the drawing logic, not the absence of a driver-level crash.

## Build facts

| | |
|---|---|
| Package | `com.mindfiles.studio` |
| Version | 1.8.0 (versionCode 8) |
| ABI | arm64-v8a only |
| Signing SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
