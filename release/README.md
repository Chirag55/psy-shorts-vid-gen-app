# Installable build

`mindfiles-studio-v1.9.0-arm64.apk` — signed, ready to sideload. Same signing
key, so it installs over an earlier version and keeps projects, keys and the
YouTube link.

```bash
sha256sum -c SHA256SUMS
```

## What 1.8.0's report established

The diagnostics added in 1.8.0 worked, and they overturned the previous
diagnosis:

```
The Mind Files Studio 1.8.0 (build 8)
Android reports: Java/Kotlin crash
ok   8:40:14 pm  Loading the caption font (Anton)
ok   8:40:14 pm  Drawing 70 caption frames (short, 720x113)
```

Three facts, none of which were available before:

1. **`Java/Kotlin crash`, not `Native crash`.** This is not a segfault. It is an
   uncaught exception on some thread, which kills the process the same way but
   has a completely different cause. Every theory up to this point had been
   about native code.
2. **Caption rendering completed.** Both steps are `ok`, and both timestamps are
   in the same second — the frame deduplication added in 1.8.0 is working. The
   crash is *after* captions, not inside them.
3. **No unfinished step at all**, so the app died between two instrumented
   points.

Also ruled out by direct inspection: every bundled `.so` is 16 KB-aligned
(`p_align 0x4000`), so this is not the Android 15+ page-size problem; and FFmpeg
had already loaded and run successfully before captions, since `probeDuration`
executes first.

## What 1.9.0 adds

**The Java stack trace.** `ApplicationExitInfo` reports *that* a Java crash
happened but carries no trace for one — `traceInputStream` is populated for
ANRs and native tombstones only. So the app now installs its own
`Thread.setDefaultUncaughtExceptionHandler`, writes the exception type, message,
thread name and full stack trace to disk, and then delegates to the previous
handler so the process still terminates exactly as Android expects.

It is installed from `MainApplication.onCreate`, not from the module
constructor: under the New Architecture a legacy module is built lazily, on
first access, so anything crashing before the app first asked for crash
information would have gone uncaptured.

**Breadcrumbs through the gap.** The window the crash falls into is now
instrumented end to end:

- Probing the voiceover duration
- Probing the hero clips
- Loading the caption font / drawing caption frames (already present)
- Writing the `.ass` sidecar
- Building the mascot overlay filters
- Preparing the output file
- Encoding

Whatever happens next, the report will name the step *and* the line that threw.

## Build facts

| | |
|---|---|
| Package | `com.mindfiles.studio` |
| Version | 1.9.0 (versionCode 9) |
| ABI | arm64-v8a only |
| Signing SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
