# FRAMING_AND_CALM_CR89.md
**CR-89: stop cropping good clips, and use all the stills in the calm profile.** Read after CR-88. Date: 12 Oct 2026. Two reports from Chirag, both traced to rules I wrote.

## 89A. The app must never crop based on what is in the picture (supersedes the detection parts of CR-87E)
**Report:** clips whose top and bottom 30% had no soft or blurred filler were still "detected" by the app and cropped.
**Cause (mine):** CR-87E(3) and `fix_framing.py` flagged a "blurred or blank band" when a strip of the image had low horizontal sharpness, and `--auto` cut it (up to 40% from each side). I measured it on 24 frames from the two real renders (MF-025, MF-072): **20 of 24 were flagged; I looked at 8 of the flagged frames and every one is full-bleed detailed art.** Smooth dark walls, ceilings, night skies and soft backgrounds are normal in this anime style and look "blurred" to a sharpness test. Sharpness cannot tell soft art from a blurred fill. The check is withdrawn.
**Fix for the app (Claude Code):**
1. Find and delete every place that crops, trims or letterbox-detects from pixel statistics (sharpness, edge energy, uniformity, blur, "nearly uniform top or bottom"). This includes anything ported from the old `detect_bands` or `fix_framing.py --auto`.
2. Rendering decides by **aspect ratio from the file's metadata only**: exact 1080x1920 source: no scaling filter and no crop; same aspect (for example 720x1280): plain scale to 1080x1920; any other aspect: scale-to-cover plus centre crop, with an import warning that shows the source size and the percentage cropped.
3. Never fit with a blurred or darkened fill (CR-87E, CR-87H).
4. The import check reports aspect and size only.
5. Optional: a manual per-clip crop control, default 0%, changed only by the user.
**Acceptance:**
- Make a 1080x1920 test clip whose top 40% is a smooth gradient (night sky) and whose bottom is detailed. The rendered frame, compared with the source frame, must match outside the banner, captions and the watermark crop (SSIM 0.98 or higher), and the log must say "crop 0%".
- A 720x1280 version: scaled, crop 0%. A 1:1 version: cover crop with a visible warning.
- `grep` the code for the removed functions: no hits.
**In this package:** `fix_framing.py` is now geometry-only (`check` reports size and aspect, `fix` rescales wrong-aspect files, leaves right-aspect files untouched, no `--auto`). Tested: a 1080x1920 file with a smooth sky is copied byte-identical (images and videos); a 1:1 file is cover-cropped.
**Still open:** the original "clip fills only part of the screen" in the MF-072 render (clips at 53 to 75% height with blurred fill) came from the app's fit mode on that render. If it still happens with true 9:16 sources, it is the app, and 89A item 2 is the fix.

## 89B. Calm profile uses all the stills (replaces the "3 clips + 1 still" rule in CR-86D)
**Report:** a Short was using only one still. Stills are free in Flow, so why limit it?
**Answer:** there was no cost reason. I limited the calm profile to beats C1, S1, C2*, C3 so each shot would be about 6 s (Gemini's finding that winners use few, long shots; its counts are unverified). That was my timing rule, not a cost rule, and it threw away two good stills.
**New rule (calm profile):** use 4, 5 or 6 of the six beats, chosen from the audio length:
N = audio seconds divided by 4.5, rounded down, limited to 4 to 6.
| N | Beats used (in this order) | Typical audio |
|---|---|---|
| 4 | C1, S1, C2*, C3 | up to about 22 s |
| 5 | C1, S1, C2*, S2, C3 | about 23 to 26 s |
| 6 | C1, S1, C2*, S2, S3, C3 | about 27 s and longer |
Each beat is shown once for audio seconds divided by N (4.5 s or longer; most of this bank's Shorts run 22 to 37 s, so most use 5 or 6 beats and 2 or 3 stills). Stills keep one slow move; clips are trimmed to the shot length. Punchy stays at 2.5 s or less per shot.
**Prompts:** `make_prompts.py --profile calm` now generates all six beats (42 stills and 42 clips for 14 Shorts); the only difference from the punchy pack is dark lighting. Regenerate the calm pack if you already made it; stills made for the punchy pack work for calm too (same IDs).
**Acceptance:** a 27 s calm Short has 6 shots (3 stills); a 22 s Short has 4 shots; no shot is shorter than 4.5 s; the log shows N and the shot length.

## 89C. Stills in long-form (CR-79)
CR-79 capped long-form at about 10 to 15 stills. Stills made in Flow are free, so that was a time cap, not a cost cap. Add a `max_stills` setting per long-form, default 40 (raised from 30 by CR-90: a 10-minute episode needs about 70 shots). Reuse of one still across up to 3 beats stays allowed when a plan has fewer images.
