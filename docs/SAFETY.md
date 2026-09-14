# Safety, privacy and stability

What this app does with your data, and what was done to keep it from crashing or
leaking. Written for a single-user, sideloaded build.

## Privacy

### Where your data lives

| Data | Stored | Leaves the device? |
| :--- | :--- | :--- |
| Gemini / ElevenLabs API keys | Android keystore (`expo-secure-store`) | Only as an auth header to that vendor |
| YouTube OAuth refresh token | Android keystore | Only to Google's token endpoint |
| Scripts, prompts, projects | App-private storage | No |
| Clips, audio, renders, thumbnails | App-private storage | Only what you explicitly publish or save |

App-private storage means `/data/data/com.mindfiles.studio/`, which no other app
on the phone can read.

### Every network destination

The app talks to exactly six hosts, all vendor APIs, all HTTPS:

```
generativelanguage.googleapis.com   Gemini scripts, topics, Imagen stills
api.elevenlabs.io                   narration and word alignment
accounts.google.com                 OAuth sign-in
oauth2.googleapis.com               OAuth token exchange and refresh
www.googleapis.com                  YouTube upload
www.youtube.com                     opening a published video
```

There is **no analytics, no crash reporting and no telemetry**. Nothing is sent
anywhere else — you can verify this by grepping the source for `https://`.

### Hardening applied

- **`android:allowBackup="false"`** — Android auto-backup would otherwise copy
  app-private storage, *including the encrypted preferences holding your API
  keys and YouTube refresh token*, into the account's Google Drive. This is the
  single most important setting on this page.
- **`android:usesCleartextTraffic="false"`** — a misconfigured URL fails loudly
  instead of putting an API key on the wire in plaintext.
- **Permissions trimmed** to `INTERNET` plus the scoped Android 13+ media
  permissions the picker and gallery export actually need.
  `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `CAMERA`, `RECORD_AUDIO`
  and `ACCESS_MEDIA_LOCATION` are explicitly blocked — the app never uses them,
  and `ACCESS_MEDIA_LOCATION` in particular would expose GPS coordinates
  embedded in your photos.
- **No client secret in the APK.** YouTube uses the OAuth installed-app flow
  with PKCE, which issues no secret. There is no high-privilege credential in
  the build for anyone to extract.
- **Keys are never placed in URLs** — always in request headers, so they cannot
  end up in a proxy or server log.
- **Crash traces stay on the device.** The error screen prints the trace for you
  and reports it nowhere.

### One honest note

`SYSTEM_ALERT_WINDOW` (draw over other apps) appears in the manifest. It comes
from React Native's own debug tooling — the red error overlay — not from this
app's code. It is declared but never requested, so it is never granted. It was
left in because blocking it breaks the development error overlay, which is worth
more than removing a permission that is never exercised.

## Crash and stability work

Each of these was a real defect found and fixed, not a hypothetical:

| Risk | Fix |
| :--- | :--- |
| **ANR from log flooding.** FFmpeg emits thousands of log lines per minute; one React state update per line would freeze the UI. | Lines are buffered and flushed to the UI every 300 ms, and the buffer is capped at 400 entries so a runaway session cannot grow memory without bound. |
| **ANR from caption rendering.** A long chapter is a couple of hundred Skia draws; doing them in one run blocks the JS thread past Android's ANR threshold. | The renderer yields to the event loop every 12 frames and reports progress. |
| **Use-after-release crash.** A queued `play()` fired against an audio player that had already been torn down by navigation. | Timers are cleared on unmount and gated on a mount flag. |
| **Double-billing on a double tap.** Two taps in one render tick both read stale `false` from state, firing two paid generation or synthesis calls — or publishing two YouTube videos. | Guards are `useRef`, set synchronously, on generation, synthesis and upload. |
| **Quota guard defeated by "Synthesise all".** The batch loop ran without re-rendering, so every track checked the character count from *before* the first one and the batch could sail past the ceiling. | Usage is read live from the store on each track. |
| **Renders leaking state into unmounted screens.** A render outlives its screen if you navigate away. | Every post-await state write is gated on a mount flag; renders are cancellable via `AbortController`. |
| **Black tail on a short clip set.** The speed correction is clamped to stay watchable, so visuals could end before narration. | A last-frame hold covers the shortfall; `-t` trims it when unused. |
| **Any render error blanking the app.** | A top-level error boundary shows the trace and a recovery button, and states plainly that your files are untouched. |
| **Mascot strobing.** On a very short chapter the head and tail overlays nearly touched, flashing Hoot on and off. | A minimum uncovered gap is now required before the second overlay is emitted. |
| **Silent storage exhaustion.** Word-level alignment across many projects can outgrow AsyncStorage's 6 MB default and fail quietly. | Raised to 64 MB. |
| **Crash on Android 15+.** The withdrawn FFmpeg builds use 4 KB memory pages and cannot load on 16 KB-page devices. | The app uses a 16 KB-page build. See `docs/FFMPEG.md`. |

## Memory

- Caption frames are written to disk as they are drawn; Skia surfaces are
  disposed in a `finally` block, so a failure part-way cannot strand them.
- Only a caption band is rasterised, not the full canvas.
- FFmpeg log history is capped at 200 lines in the UI and 400 in the buffer.
- Renders stream through FFmpeg — video is never held in JS memory.
- Draft mode (720p, `veryfast`) is the default. Phones throttle hard under a
  sustained 1080p encode; this is a thermal guard, not just a speed one.

## What is still worth knowing

- **Long renders are genuinely heavy.** A four-minute deep dive at full
  resolution is a long H.264 encode. Expect the phone to get warm and the
  battery to drop. Use draft mode unless you are producing a final.
- **Renders you save to the gallery become visible to other apps** and to photo
  backup. That is what saving to a gallery means; the in-app copy stays private.
- **Deleting a project deletes its files.** Long-pressing a project in the
  Studio list is not recoverable.
