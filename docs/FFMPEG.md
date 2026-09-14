# FFmpeg on the device

This app renders video entirely on your phone. That means it needs an FFmpeg
binary compiled for Android, exposed to JavaScript. There is one complication
worth understanding before you build.

## The situation

[FFmpegKit](https://github.com/arthenica/ffmpeg-kit) was the standard way to run
FFmpeg from React Native. Its author retired the project in January 2025 and the
prebuilt artifacts were pulled from Maven Central in April 2025. As of this
writing, `com.arthenica:ffmpeg-kit-full-gpl:6.0-2` returns 404 from Maven
Central, Maven Apache, and JitPack.

The JavaScript binding still works — this app uses the actively maintained
[`react-native-ffmpeg-kit`](https://www.npmjs.com/package/react-native-ffmpeg-kit)
fork, which reads a locally vendored AAR from `android/libs/` before falling
back to the (now dead) Maven coordinate.

So: **you supply the AAR once, and the build works from then on.**

## Which variant you need

`full-gpl`. Not `https`, not `min`, not `full`.

The variant matters because of one library: **libass**. The kinetic word-level
subtitles are ASS format, burned in by FFmpeg's `ass` filter, which requires
libass. Only `full` and `full-gpl` bundle it, and `full-gpl` additionally
carries x264, which the H.264 encode path uses.

Pick a smaller variant and the renders come out silent-captioned — video and
audio fine, no text.

> Licensing note: the `-gpl` variants link GPL-licensed components, so the
> resulting APK is effectively GPL. That is fine for a personal build you install
> on your own device. It would matter if you distributed the APK.

## Getting the AAR

Two honest options. There is no official download link to give you any more.

### Option 1 — a mirror you trust

Copies of `ffmpeg-kit-full-gpl-6.0-2.aar` exist in Gradle caches, forks, and
third-party mirrors. If you have ever built an app against FFmpegKit on this
machine, check your own Gradle cache first — this is the safest source, because
it is a file you already used:

```bash
find ~/.gradle/caches -name 'ffmpeg-kit-full-gpl*.aar' 2>/dev/null
```

Then install it:

```bash
./scripts/install-ffmpeg-aar.sh ~/.gradle/caches/.../ffmpeg-kit-full-gpl-6.0-2.aar
```

The script verifies the file is a real AAR containing `classes.jar` and
`libffmpegkit.so`, and warns if libass is absent. It deliberately does not
download from a hardcoded mirror: this binary ships inside your APK, and
fetching it from a URL picked by someone else is a supply-chain risk you should
choose knowingly rather than inherit from a script.

### Option 2 — build it from source

The upstream build scripts still work and produce exactly the artifact you need:

```bash
git clone https://github.com/arthenica/ffmpeg-kit.git
cd ffmpeg-kit
./android.sh --enable-gpl --enable-x264 --enable-libass --enable-freetype --enable-fribidi
```

Requires the Android NDK and takes a while. The output lands in
`prebuilt/bundle-android-aar/ffmpeg-kit/ffmpeg-kit.aar`. Rename it to
`ffmpeg-kit-full-gpl-6.0-2.aar` and install it with the script above.

## How the build finds it

`plugins/withFFmpegKit.js` is an Expo config plugin that does three things
during `expo prebuild`:

| What | Where it lands | Why |
| :--- | :--- | :--- |
| `flatDir` repository over `android/libs` | `android/build.gradle` | Lets Gradle resolve a bare `.aar` file as a dependency |
| `ffmpegKitVariant` / `ffmpegKitPackage` / `ffmpegKitVersion` | `android/gradle.properties` | The library reads these via `project.hasProperty(...)` |
| `abiFilters "arm64-v8a", "armeabi-v7a"` | `android/app/build.gradle` | full-gpl ships a large `.so` per ABI; two keeps the APK sane |

These are Gradle *properties*, not `ext {}` entries — the Expo SDK 57 template
has no `ext` block, so an `ext` injection would silently do nothing.

## Verifying it worked

After `npm run prebuild`:

```bash
ls android/libs/                          # your AAR
grep ffmpegKit android/gradle.properties  # three properties
grep -c mindfiles-flatdir android/build.gradle
```

At runtime, the Assembly screen streams FFmpeg's own log output. If the library
failed to link you will see the failure there rather than a silent no-op.
