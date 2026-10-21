# VIRAL BATCH A9 — read this first (22 Oct 2026)

Five Shorts rewritten from Gemini's virality audit. They are the **first five uploads**, ahead of everything else in the bank. In the bank each has `viral_batch: A9`, `upload_order: N of 5` and `queue: N`; every other pending Short's `queue` was moved up by 5.

| Upload | Topic | Title | Characters |
|---|---|---|---|
| 1 | D43 (MF-031) | How Manipulators Use Compliments to Trap You | Ella, Leo |
| 2 | D19 (MF-086) | Why Manipulators Use Silence to Punish You | Ella, Ben |
| 3 | D23 (MF-087) | 3 Fake Promises Manipulators Use to Keep You Hooked | Riley, Ben |
| 4 | D61 (MF-094) | Why Manipulators Leave You on Read on Purpose | Ella, Ryan |
| 5 | D16 (MF-085) | 3 Signs Someone's Smile Is Hiding Malice | Ella, Nina |

Lock the channel to the Dark Psychology / Manipulation Defense cluster for these 5 consecutive uploads. Do not insert mild topics (D05, D22 and similar) between them.

## What the app must do for every viral_batch Short
1. **Order and priority:** sort the queue by `queue` ascending; show a visible "VIRAL A9 #N" badge. Never auto-reschedule them behind other topics.
2. **Fixed pacing:** 10 shots, about 2.4 s each, 24 s total, exactly 3 clips. Assemble in the order of `shorts_storyboard.txt` (not S then C ids).
3. **Voice:** apply `voice_settings` (ElevenLabs stability 45, clarity 80, style 25, speed 1.12). The narration is word for word; the first line starts mid-sentence on purpose and the last line cuts off on a conjunction. Do not add a sign-off or a closing question. Cut hard on the final syllable so the audio loops into 0:00.
4. **Burned-in subtitles:** render the `subtitles` list in the center-third, using the timings given.
5. **Bottom overlay:** show `bottom_overlay` in small text for the final 2.5 s. This carries the question that is no longer spoken. The same question is the `pinned_comment`; post it within 30 seconds of publishing.
6. **Thumbnail:** use `shorts_thumbnail_prompts.txt` (one per Short) and draw `thumb_text` top-center (max 3 words, bold white, black stroke, high contrast).
7. **Metadata:** title and description end with `#shorts #psychology #DarkPsychology` (exactly 3 hashtags).

## Rules for all future scripts (Audit A9, see GEMINI_AUDIT_REQUIREMENTS.md)
22–25 s and 10 shots; no spoken closing question (question goes to pinned comment and bottom overlay); loop-bridge ending on an incomplete conjunction; two named characters in a physical confrontation, no floating props; frame every topic as how a manipulator uses it against the viewer; titles and descriptions end with the 3 hashtags. Existing 6–9 shot Shorts are not retrofitted, but all pending Shorts now carry the 3-hashtag ending.

## Scope note
`viral_meta.py` (run after the build) applies the hashtag lock to all pending Shorts and adds the fields above to the five.
