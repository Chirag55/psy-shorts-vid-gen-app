# The Mind Files Studio — Mobile

A single-user Android companion for **The Mind Files** video pipeline. It runs
the whole production loop on the phone: write the script, hand prompts to Google
Flow, voice the narration, render the video with FFmpeg, compose the thumbnail,
and publish to YouTube.

There is no backend. Nothing is uploaded anywhere except to the APIs that do the
work (Gemini, ElevenLabs, YouTube). Scripts, clips, audio and renders live in
the app's private storage on this device.

---

## What it does

| Screen | What you do there |
| :--- | :--- |
| **Studio Hub** | Live ElevenLabs quota, project list, entry points for a new short or deep dive |
| **Topic Bank** | Gemini-suggested topics, deduped against what you already have |
| **Generate** | Structured-output script generation — Gemini or Claude — with the word-count guardrails enforced |
| **Storyboard** | Per-beat and per-chapter Veo prompts, one-tap copy to Flow, clip import, Imagen stills |
| **Voice** | Voice picker, pre-flight quota guard, synthesis with word-level alignment, playback |
| **Assembly** | On-device FFmpeg render with live log, per-chapter sync, burned captions, mascot overlay |
| **Thumbnail** | Candidate frames sampled from the render, two-line headline composer, export at full canvas size |
| **Publish** | Google OAuth, resumable upload, auto-filled chapter timestamps, privacy selector |
| **Library** | Everything the channel has published, read back from the YouTube Data API — Shorts/All filter, views, likes, comments, privacy state, tap to open |

### What it faithfully reproduces from the desktop spec

- **`STYLE_LOCK`** appended to every Veo and Imagen prompt, idempotently, and
  flagged in the UI if ever missing.
- **Character-to-word alignment** — ElevenLabs returns per-character timestamps;
  these are folded into word boundaries before any subtitle is built.
- **Kinetic captions** — word-level neon-yellow highlight on the 1080×1920
  Shorts canvas, phrase-level chunks with a scrub-bar-safe margin on 1920×1080.
- **Ken Burns connective stills** — the four pan/zoom filters, with
  `Duration_Still = max(Audio − (HeroA + HeroB), 2.0)`.
- **Per-chapter independent assembly** — every chapter is synced, captioned and
  trimmed against its own audio *before* concatenation, so drift cannot compound
  across a four-minute runtime.
- **Professor Hoot state machine** — keyword sentiment picks the expression,
  and he is kept off screen during the mechanism so he never competes with the
  explanation.
- **Cost guardrails** — hard word caps, and a pre-flight character check that
  blocks a synthesis *before* the request goes out rather than after.

### What differs from the desktop studio, and why

- **Veo clips are imported, not generated.** Google Flow has no public API; the
  desktop studio drives it with Playwright browser automation, which has no
  mobile equivalent. The phone's job is to hand you a correct, style-locked
  prompt in one tap and take the finished MP4 back from your camera roll.
  Imagen stills *are* generated in-app, because Imagen has a REST API.
- **Mascot transparency uses FFmpeg's `colorkey`** rather than the desktop
  flood-fill. It does the same job in one filter with softer edges, so your
  source JPGs work as-is with no pre-processing.
- **Renders default to 720p draft quality.** Phones throttle hard under a long
  encode. Turn it off in Assembly for a full-resolution render.
- **Captions are drawn with Skia and composited, not burned by FFmpeg's `ass`
  filter.** Every Android FFmpeg build still distributable today is compiled
  without libass, freetype and fontconfig, so no text filter is available at
  all. Drawing them directly turned out to give better control anyway, and a
  `.ass` sidecar is still written for the desktop studio to consume.
  [`docs/FFMPEG.md`](docs/FFMPEG.md) has the detail.

---

## Getting it on your phone

### 1. Build and install

```bash
npm install
npm run prebuild
npm run android      # phone connected by USB, developer mode on
```

That's it. FFmpeg resolves as a normal Gradle dependency — there is no binary to
source by hand. (There used to be; `docs/FFMPEG.md` explains what changed and why.)

The app cannot run in Expo Go, because FFmpeg and Skia are native modules. It
needs a real build.

**For an APK you can reinstall without a computer:**

```bash
npx eas login
npx eas build --profile preview --platform android
```

EAS builds in the cloud and gives you a download link. The `preview` profile is
already configured to emit an installable APK.

### 2. Add your keys

Open **Settings** in the app:

- **Gemini and/or Anthropic API key** — either can write scripts and topics; Gemini
  also generates the Imagen stills
- **ElevenLabs API key** — narration and word alignment
- **YouTube API key + channel ID** (optional) — browse published uploads with no sign-in
- **Professor Hoot expressions** — import `base`, `surprised`, `thinking` and
  `knowing` from your desktop assets

Keys are checked against the live API before they are saved, and stored in the
Android keystore. See [`docs/SAFETY.md`](docs/SAFETY.md) for exactly where your
data goes.

### 3. YouTube publishing (optional, do it later)

Everything except publishing works without this.

In Google Cloud Console, create an OAuth client of type **Android** with package
name `com.mindfiles.studio`, enable the YouTube Data API v3, add the
`youtube.upload` and `youtube` scopes to the consent screen, and add your own
account as a test user. Paste the client ID on the Publish screen.

Android OAuth clients issue no client secret, so nothing sensitive ends up
inside the APK.

## Project layout

```
src/
├── core/                 Pure logic — no I/O, fully unit tested
│   ├── alignment.ts      Character timestamps → word boundaries
│   ├── captions.ts       Word timings → gapless caption frame timeline
│   ├── ass.ts            .ass sidecar generation for the desktop studio
│   ├── kenburns.ts       Pan/zoom filters, still duration, tempo math
│   ├── mascot.ts         Hoot emotion state machine and overlay windows
│   ├── guardrails.ts     Word caps, cadence math, quota pre-flight
│   ├── prompts.ts        Brand bible compiled into Gemini instructions
│   ├── schemas.ts        Structured-output response schemas
│   └── styleLock.ts      STYLE_LOCK enforcement and continuity phrasing
├── services/             Everything with side effects
│   ├── scriptProvider.ts One interface over both generation providers
│   ├── gemini.ts         Gemini generation and live model discovery
│   ├── anthropic.ts      Claude generation via structured outputs
│   ├── performance.ts    Channel results → generation context
│   ├── elevenlabs.ts     Synthesis with timestamps, quota
│   ├── imagen.ts         Connective still generation
│   ├── ffmpeg.ts         Typed FFmpegKit wrapper, probing, batched log capture
│   ├── captionRenderer.ts Skia caption frames → transparent PNG sequence
│   ├── assembler.ts      Short and long-form assembly pipelines
│   ├── youtube.ts        OAuth PKCE, resumable upload, channel and uploads listing
│   ├── workspace.ts      On-device mirror of the desktop outputs/ tree
│   └── keys.ts           Secure credential storage
├── screens/              One file per screen
├── components/           Shared UI primitives
└── store/                Zustand + AsyncStorage persistence
```

`src/core/` is deliberately free of React Native imports, which is what lets the
ported algorithms be tested directly:

```bash
npm test          # 120 tests over the ported math, captions, library parsing and ranking
npm run typecheck
```

---

## Workspace layout on the device

Mirrors the desktop studio's `outputs/` tree, under the app's private directory:

```
outputs/
├── audio/{slug}/         chapter MP3s + word-alignment JSON
├── clips/{slug}/         imported Veo clips
├── stills/{slug}/        generated connective stills
├── subs/{slug}/          generated .ass subtitle files
├── segments/{slug}/      per-chapter rendered MP4s
├── final/{slug}/         assembled video
└── thumbnails/{slug}/    candidate frames + exported thumbnail
```

Long-pressing a project in the Studio list deletes both the project and its
files. Settings shows the total workspace size.

---

## Safety

[`docs/SAFETY.md`](docs/SAFETY.md) documents every network destination, where
credentials live, the manifest hardening applied, and the specific crash, ANR
and double-billing defects that were found and fixed. Short version: six vendor
hosts, no telemetry, keys in the Android keystore, and device backup disabled so
they cannot be copied to Google Drive.

## Known constraints

- **Android only.** The iOS path would need an Apple developer account and a
  different FFmpeg story.
- **Long renders are slow and warm the phone.** A four-minute deep dive at full
  resolution is a heavy H.264 encode. Draft mode exists for this reason.
- **YouTube custom thumbnails need a verified channel.** If yours is not
  verified the video still publishes; only the thumbnail is skipped, and the app
  reports that distinctly rather than failing the upload.
