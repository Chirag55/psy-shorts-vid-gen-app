# RENDER_REVIEW_CR87.md
**CR-87: fixes from reviewing a real render** ("3 Gaslighting Lines That Make You Doubt Yourself", MF-025, rendered 10 Oct 2026 22:30 IST). Sources: our own checks of the .mp4 and Gemini's review (score 7.5 of 10, "up from 3 of 10"). Mascot comments ignored (see CR-86B).

## What is already right (do not change)
Measured on the file: 1080x1920, 30 fps, video 8.2 Mbps, loudness -13.6 LUFS (peak -1.3 dBFS), no silence over 0.4 s, 29.9 s. Frame-0 banner "3 GASLIGHTING LINES" static, numbered banners per item, end card with the question, no mid-sentence loop cut, consistent moody character and rain/lamp atmosphere. So CR-80J, 80H, 86A and 84D are working. Cut rate is about one cut per 2.5 s (profile P).

## Defects found
| # | Defect | Evidence | Who found it |
|---|---|---|---|
| 1 | **Veo sparkle watermark visible bottom-right on every clip shot** | frames at about 5 s, 10 s and 21 s, lower right corner | us (Gemini missed it) |
| 2 | One-word flashing captions in the centre, over the character's body; yellow on words of 7+ letters | whole video | both |
| 3 | Origin trivia ("after an old play where a husband dims the lights...") at 4 to 8 s stalls the hook | narration | Gemini; source was bank MF-025, now fixed |
| 4 | Mascot appears at the end (ignored by request) | 28 s | Gemini |

## 87A. Remove the Veo watermark (high)
Applies to clip shots only (stills have none). Options in order: (1) if the Flow plan offers a no-watermark download, use it; (2) in render, scale each clip 1.07x and crop so the bottom-right 7% by 7% is outside the frame; (3) otherwise cover with a soft blur patch of the local background. Accept: extract frames at 5 s, 10 s and 21 s; the bottom-right 160x160 px has no star shape (visual check plus a template match against a saved crop of the sparkle).

## 87B. Caption engine (high; completes CR-86D)
Default for every profile: phrases of 5 to 7 words, max 2 lines, sans-serif with soft shadow, placed in the lower third above the platform UI (about 62 to 78% of frame height), never over the face. Highlight one key word per phrase at most. The banner stays top third. Keep word-by-word as a setting for profile P. Accept: no caption box centre between 35 and 60% of frame height.

## 87C. Script gate (high)
Block render and show a fix card if the narration contains: a year, "researchers", "study", "psychologist", "coined", "named after", "after an old", "originally", "original authors". Same patterns as `lint_bank_v3.py` (updated: it now also flags a year in `yt_title_alt` and `hook_text`).

## 87D. Duration follows audio (medium)
Planner scales shot lengths to the voice length. The revised MF-025 narration is shorter (about 20 s); do not pad to 29 s. Accept: video length within 0.5 s of voice length plus end card.

## Bank changes made with this CR
- MF-025: new hook and narration (no trivia, "It's called gaslighting." in sentence 2); title_alt had "1938", now "Why You Doubt Your Memory | Gaslighting Lines".
- MF-029 (on hold): removed "one of the original authors says she no longer believes it".
- `lint_bank_v3.py`: new banned phrases; year check on title_alt and hook_text. Result at the time: 81 Shorts, 79 unpublished checked, 0 issues (now 82 and 80 after CR-88).

## Re-render this Short
Re-import the bank, regenerate the voice from the new MF-025 narration (about 300 characters of ElevenLabs), keep the existing clips and stills, re-render. Do not publish the old render.

## 87E. Clips that fill only about 60% of the screen (blank top 30%)
Cause: our clip and still prompts told the model to leave a "calm empty area in the top fifth". Fixed in `make_prompts.py` (full-bleed wording, no watermark in negatives) and `ANIME_STYLE_AGENT_INSTRUCTIONS.md` section 5C; both prompt packs regenerated. App changes: (1) wherever the app builds its own clip or still prompts, remove any "empty area/space for text" phrase and use the section 5C sentence; (2) render must **scale-to-fill (cover) and centre-crop** every clip and still to 1080x1920, never fit; (3) on import, warn if a clip is not 9:16 (aspect check only; the pixel-based "nearly uniform top or bottom" check was WITHDRAWN by CR-89A because it flagged normal art); (4) a soft dark gradient behind the hook banner and captions replaces "empty space". Accept: extract frames from a render; the top 25% shows scene detail on every shot. In Flow, set portrait 9:16 before generating.

---
# Second render reviewed: MF-072 "Why It's So Hard to Leave Someone Who Hurts You" (10 Oct 2026, 25.9 s)
Measured: 1080x1920, 8.1 Mbps, -13.6 LUFS, peak -1.3 dBFS. Four pauses of 0.41 to 0.54 s (at 2.7, 9.6, 17.1, 23.2 s), consistent with CR-86C. Phrase captions in the lower third are now live and Gemini scored the Short 8.5 of 10 (previous 7.5).

## What the "venetian-blind glitch" really is (87E root cause, confirmed from frames)
It is **not an encoder error.** Clips are shown at about 75% of the frame height and the rest is filled with a blurred, darkened copy of the clip (the top 25% of the frame measures blurred on a 1080x1920 frame at 8 s). The seams between the sharp clip and the blurred fill, plus the dark gradient overlay (8-bit banding), show up as horizontal strips, worst at cuts and cross-fades (about 14 to 17 s and 21 to 22 s, where Gemini saw them). This is the same fault as "clips fill only 60% of the screen". Fix = 87E: scale-to-fill and centre-crop, no blurred-fill, regenerate clips in portrait 9:16 with the new full-bleed prompts. Also apply dithering to the gradient overlay.
**Still present:** the Veo sparkle watermark, bottom-right on clip shots (87A).

## 87F. Caption size (medium)
Caption text measures about 47 px tall on a 1920 px frame (2.4%) and 64% of the frame width. Increase by about 30 to 40% (font roughly 56 to 64 px), keep two lines max, widen to 80% of frame width, outline plus soft shadow. Accept: caption cap height at least 3.2% of frame height.

## 87G. Disclaimer placement (bank change, done)
Gemini: the line "It's a popular term, not a diagnosis." after the advice deflates the climax. Fix without dropping the hedge: fold it into the naming sentence ("That's often called trauma bonding, a popular term, not a diagnosis.") so the Short ends on the advice. Applied to MF-072, MF-075, MF-078. MF-080 keeps its safety line (reach out if unsafe) at the end. Mascot comments ignored (CR-86B).

## 87E update (second pass): why clips still did not fill the screen, and the fix kit
Measured on the MF-072 render: the sharp part of each clip covers between about 53% and 75% of the frame height depending on the shot, the rest is blurred fill. Different clips have different shapes, so the source files are not all true 9:16 (likely a mix of Flow aspect settings and 3:4 or 1:1 stills used as first frames), and the app fits instead of fills. Prompt wording was only one cause. Fixes delivered: (1) prompts rebuilt with full-bleed wording (both packs, `make_prompts.py`, and a framing rule written into the bank header; the lint now fails if blank-space wording or the rule's absence is found); (2) `FLOW_SETTINGS_README.txt` in each pack (portrait 9:16 for videos and images, stills first at true 9:16); (3) `fix_framing.py` to check and repair downloaded files without regenerating (scale-to-fill and centre-crop for wrong-aspect files only; the band-detection and auto-cut parts were WITHDRAWN by CR-89A); (4) app change: import calls the same check, warns per file, and render always fills and crops. Accept: a render's top and bottom 15% show scene detail on every shot.


## 87E correction (third pass)
The wording we shipped in pass 2 ('subject placed in the middle third, soft low-contrast background detail in the top and bottom thirds') **caused** the problem it was meant to fix: it told the model to make the top and bottom soft. Also, `ANIME_STYLE_AGENT_INSTRUCTIONS.md` itself told the app to keep the bottom 15% 'quiet' and to add 'Empty space in the bottom right'. All reserved-area, thirds and empty-space wording is removed from the style file, `make_prompts.py` and the bank, and replaced by one full-frame sentence (bank header, section 'Framing rule'). The lint now fails on any thirds, soft-background or empty-area wording. App (Claude Code): grep the app's own prompt builder and brand bible for 'empty', 'quiet', 'space', 'third', 'safe', 'calm' and remove them; append the full-frame sentence to every clip and still prompt.

## 87H. Remove the app's dark overlay (CONFIRMED by Chirag: source clips and stills are clean; the app adds the overlay)
Priority: first fix in this CR, ship with 87E. Measured on the MF-072 render: average frame colour is green-teal (e.g. RGB 50,69,71 at 25 s) and the blurred fill is a darkened copy of the clip.
Do: find every layer in the render chain that darkens, tints, grades or vignettes video (FFmpeg filters such as colorbalance, eq=brightness, curves, vignette, colorchannelmixer, a semi-transparent black or green fill, the darkened blurred background) and remove it. Add no replacement. Keep only: hook banner, captions, end card, Hoot (per CR-86B). Do not apply Gemini's "dark colour grade or vignette" advice.
Accept: ffmpeg `signalstats` on a source clip vs the same moment in the render: mean Y within 3% and mean U/V within 3 units. A Short rendered from a clean clip looks identical in colour to the clip.
Note: the make_prompts.py neutral-colour sentence is harmless but optional, since the generated assets are fine.
