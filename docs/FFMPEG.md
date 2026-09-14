# FFmpeg on the device

**You don't need to do anything for this.** It installs automatically with
`npm install`. This page explains why it's set up the way it is, and what to do
in the unlikely case it ever breaks.

## Background

[FFmpegKit](https://github.com/arthenica/ffmpeg-kit) was the standard way to run
FFmpeg from React Native. Its author retired the project in January 2025 and the
prebuilt artifacts were pulled from Maven Central that April. Every
`com.arthenica:ffmpeg-kit-*` coordinate now returns 404 — verified against Maven
Central, Maven Apache and JitPack.

There is a second, quieter problem with those old artifacts. Android 15 moved to
**16 KB memory pages**, and native libraries built for 4 KB pages fail to load on
devices using them. The withdrawn `6.0-2` builds are 4 KB. Even with a copy in
hand, they would crash on a current phone.

## What this app uses instead

`@wokcito/ffmpeg-kit-react-native`, which pins
`io.github.jamaismagic.ffmpeg:ffmpeg-kit-main-16kb:6.1.4` — a republished build
that is live on Maven Central and compiled for 16 KB pages. Gradle resolves it
like any normal dependency. Nothing to download by hand.

It ships x264, x265, dav1d, libvpx, lame, gnutls and Android MediaCodec, which
covers everything the render pipeline needs.

## Why captions are drawn as images

That build — and every other still-distributable Android FFmpeg build we could
find — is compiled **without libass, freetype and fontconfig**. You can confirm
this from the binary itself; its own configuration string has no
`--enable-libass`, and it reports "freetype is not available" at runtime.

That makes FFmpeg's `ass`, `subtitles` and `drawtext` filters all unavailable.
There is no Android FFmpeg distribution left that can render text.

So the app draws captions itself:

1. `src/core/captions.ts` turns word timings into a gapless sequence of caption
   frames — which words are on screen, which one is highlighted, and for how long.
2. `src/services/captionRenderer.ts` draws each frame with Skia into a
   transparent PNG band, using the real neon-yellow-on-white styling with a
   black outline.
3. The assembler feeds that sequence to FFmpeg through the concat demuxer and
   composites it with a single `overlay`.

This turned out better than the filter it replaced:

- The caption look is under direct control rather than constrained by ASS style
  fields.
- Only a band is rendered (1080×360 rather than 1080×1920), so it is less pixel
  work per frame.
- There is no font dependency to go missing on a particular device.

A `.ass` sidecar is still written next to every render. Nothing on the phone
reads it — it is there so a project started on mobile can be finished in the
desktop studio, which does have libass.

## If it ever breaks

If that republished artifact is withdrawn too, `@wokcito/ffmpeg-kit-react-native`
declares a `flatDir` repository over `android/libs/` in its own Gradle config.
Drop any `ffmpeg-kit-*.aar` there and Gradle resolves it locally — no Gradle
editing needed.

To build one from source:

```bash
git clone https://github.com/arthenica/ffmpeg-kit.git
cd ffmpeg-kit
./android.sh --enable-gpl --enable-x264
```

## What the config plugin does

`plugins/withFFmpegKit.js`, during `expo prebuild`:

| What | Where | Why |
| :--- | :--- | :--- |
| `abiFilters "arm64-v8a", "armeabi-v7a"` | `android/app/build.gradle` | FFmpeg ships a full native stack per ABI; two keeps the APK roughly half the size |
| `AsyncStorage_db_size_in_MB=64` | `android/gradle.properties` | Word-level alignment across a backlog of projects outgrows the 6 MB default |

It does not add a `flatDir` repository of its own — the FFmpeg package already
declares one, and duplicating it across `allprojects` made every module emit a
Gradle warning for no benefit.
