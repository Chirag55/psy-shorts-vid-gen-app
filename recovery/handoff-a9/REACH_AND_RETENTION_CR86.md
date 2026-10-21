# REACH_AND_RETENTION_CR86.md
**CR-86: apply Gemini's video-watching analysis (RUN 5, 10 Oct 2026).** Updates CR-84B and the pacing assumptions in CR-83. Read after CR-84.
Source: Gemini watched our Shorts and 20 competitor Shorts (counts below are Gemini's, from video, not verified by us). It could not see retention graphs. Its own words: the exact second we lose viewers is undetermined (84A fixes that).

## 0. Verdicts
| Gemini finding | Count / evidence | Decision |
|---|---|---|
| Static frame-0 text banner, held 3 s+ (16 of 20 winners); ours flashes words | high confidence, cheap | **Adopt now** (86A) |
| No mascot (20 of 20 winners) | niche is mostly text-only or creator-led, so partly confounded | **Adopt as default off, test** (86B) |
| Slower voice, about 2.0 to 2.2 words/s, pauses at list items (17 of 20) | Gemini estimated ours at 3.5 w/s; our app is designed at 2.4 w/s, so the gap is smaller than claimed | **Test** (86C) |
| Phrase captions, static blocks (19 of 20) | observed | **Test** in profile C (86D) |
| Few cuts: winners 0 to 1 cut per 10 to 15 s, shots 4.5 to 11 s (10 of 10 animated) | **Reverses our CR-83 assumption** ("competitors cut every 2 to 3 s"), which was never observed. It also conflicts with the "no monotony" brief | **Test, do not assume** (86D). Profile C becomes the first arm |
| Dark, moody first visual (19 of 20) | observed | **Adopt** for all emotional topics (86E) |
| Emotional, relationship, toxic-sign topics (17 of 20) | matches bank v3.1 | Already done |
| No studies or years; no theory name in the first 10 s | observed | Studies and years already removed. Theory name arrives in sentence 3 (about 7 to 9 s); keep and measure |
| Calm question or sign-off ending, no cliff loop | observed | Done (84D) |
| Add micro-expression topics | | **Rejected** (weak evidence; MF-028 covers the myths) |
| Hook bank (15 lines) | several equal our own bank lines | Not merged; "physically painful to leave" overclaims, and "three lines" hooks do not match our non-list scripts |

## 86A. Frame-0 static hook banner (high)
`hook_text` appears in the top third at frame 0, **static** (no pop, no flashing), 2 to 6 words, large readable sans-serif with soft shadow, held for the first 3.5 s minimum (longer if it fits), same on every Short in both profiles. Test: drop-off at seconds 1 to 3 in the retention graph (needs 84A).

## 86B. Mascot default off (high)
Setting `mascot: off | endcard | full`, default `endcard` (Hoot only in the last 2 s, bottom-left, away from faces). Replaces "first 3 s and last 2 s" in 84B. `full` stays for comparison.

## 86C. Voice pace (high)
Add `narration_pace` setting: `normal` (current) | `calm` (target 2.0 to 2.2 words/s via ElevenLabs speed setting where supported, else text pacing). Insert a 0.4 to 0.6 s pause only at list-item boundaries and before the sign-off; keep the CR-80J rule against other dead air. Log the measured words/s per render.

## 86D. Profiles redefined (high; replaces 84B definitions)
- **C (calm, Gemini-aligned):** shots of at least 4.5 s, each beat shown once. **Updated by CR-89B:** uses 4, 5 or 6 of the six beats by audio length (N = audio seconds / 4.5, rounded down, limited to 4 to 6), so most Shorts use 2 or 3 stills; the earlier rule (3 clips + 1 still, S2 and S3 as spares) is withdrawn. Phrase captions of 5 to 7 words, static, lower third. Calm pace, ambient music (84C), dark lighting in the prompt (86E; no post-production grade or overlay, see CR-87H), mascot `endcard`, ending question (84D).
- **P (punchy):** bank v3.1 as built (six beats, cut at most every 2.5 s, word captions) but with 86A banner and mascot `endcard`.
Both keep: banner, sign-off line, -14 LUFS, 1080x1920.
Plan: alternate C, P, C, P... starting with **C**, 5 Shorts each, different topics from the same queue. Compare "stayed to watch" at 72 h; a gap above 10 points is a signal. Both profiles use the same clips and stills, so cost is the same.

## 86E. Mood (medium)
Bank `mood` is already set (20 dark). Add a per-project override `mood: dark|warm`; profile C forces dark for every topic: rainy windows, night streets, late cafes, cool blue palette, one warm accent. `make_prompts.py --profile calm --mood dark` does this for the prompt pack.

## 86F. Measurement (high; unchanged from 84A)
Retention graph (viewed vs swiped away) per Short at 72 h. Until 84A ships, screenshot Studio's Engagement tab for each test Short.

## Order
86A and 86B first (render, small), 84A and 84D, then 86C, 86D with 84C and 84E/86E, then 84F.
