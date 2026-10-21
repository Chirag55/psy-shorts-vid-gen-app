# BANK_V3_REDO_CR83.md
**CR-83: Topic bank v3.1 redo (supersedes the bank parts of CR-82).** Built against app v4.7.0.
File: `psychology-shorts-topic-bank-v2.md` (name kept so the importer finds it). Contents: 82 Shorts (MF-001 to MF-082) and 6 long-form plans (LF-01 to LF-06; packaging, runtime and thumbnail fields updated by CR-88).

## 1. Why the redo
Your complaint: monotonous, boring, citations, not relatable, weak hooks, incomplete hashtags. Fixes, by cause:

| Problem | Evidence (YouTube public data, 8 Oct 2026) | Rule in bank v3.1 |
|---|---|---|
| Same camera move every beat | (unverified assumption; Gemini's watched sample of animated winners shows 0 to 1 cuts per 10 to 15 s, see CR-86) | 6 beats per Short, 3 Veo clips + 3 stills, no camera move repeated inside a Short, neighbouring beats never share a shot size, at least 4 settings |
| Flat openings | Titles and openings that start in a viewer moment outperform concept names | `hook` first sentence at most 12 words, starts with the viewer's moment ("That awkward conversation went better than you think.") |
| Citations kill retention | Top Shorts never say years, authors, "study" | Narration has no years, authors, "researchers", "study", "experiment", "psychologist". Credibility goes to `source_line` in the description |
| Hashtags | Titles with hashtags: median 269 vs 35 views | Title ends `#shorts #psychology #Tactic` (at most 100 chars); description ends with 5 hashtags; 8 to 12 tags; 5 IG hashtags |
| Repetitive "Why..." titles | | 9 of 68 titles start with "Why" |
| Too long | | 46 to 66 words (numbered lists up to 82) |
| Stills hard to import | | Beat ID is the first token of every prompt (`MF044-S1 | ...`) so downloaded file names carry it |

## 2. Importer changes
New or changed fields per Short: `yt_title_final` (use this as the upload title), `yt_title_alt`, `hook_alt`, `hook_text`, `source_line`, `visual_beats` (six beats), `clip_ids`, `still_ids`, `yt_hashtags`, `yt_description` (literal `\n` means a line break), `yt_tags`, `yt_pinned_comment`, `ig_keywords`, `ig_line1`, `ig_hashtags`, `ig_first_comment`, `priority`, `status`.
- Import all 81. Queue priority A (Days 1 to 14) then B (Days 15 to 30). Priority C is on hold (do not schedule). `status: published` (MF-024, MF-038) is never scheduled; their metadata is there for backfill.
- Posting queue is in the bank header. Days 1 to 14: see the bank header (v3.1 order).
- Narration is used verbatim. It ends with "...and that's the mind for you. Stay curious, stay sharp."
- Reject on import any unpublished Short that fails `lint_bank_v3.py`. Expected result: 70 in file, 68 unpublished checked, 0 issues.

## 3. Beats, planner and stills bundle
Beat format: `MFxxx-C1 clip | size | setting | action | move // MFxxx-S1 still // MFxxx-C2 clip* // MFxxx-S2 still // MFxxx-S3 still // MFxxx-C3 clip`. `clip*` is the pattern interrupt (about 40% into the video).
- Still moves: push-in, pull-out, pan-left, pan-right, tilt-up, tilt-down. Clip moves: orbit, handheld, whip-pan, dolly-back, rack-focus, tracking.
- Planner: each beat is shown for at most 2.5 s (a beat may be shown twice with its still's move reversed to keep the cut rhythm). Veo credits: 3 clips per Short only.
- Bundle mapping (extends CR-81C): parse `MF\d{3}-[SC]\d` from the file name first, then match prompt text, then order. Always show the confirmation grid before applying.
- Stills for a whole batch: `stills_master_prompt.txt` (one line per still, ID first). Clips: `clips_prompts.txt`. `manifest.json` lists order, id, type, shot, move.
- `make_prompts.py` generates these outside the app. A ready pack for Days 1 to 14 is in `prompt_pack_days1-14/` (42 stills, 42 lines of clip prompts for 14 Shorts).

## 4. Blocking lint (publish gate)
Run `lint_bank_v3.py` in CI and in the importer. It checks sign-off, banned citation words, word count, hook length, tactic named in first 3 sentences, six beats with the right types, unique moves, neighbour sizes, setting count, culture terms, ID lists, title/description/tags/hashtags/IG lengths and presence, "coming soon", pinned comment is a question.

## 5. Acceptance tests
1. `python lint_bank_v3.py psychology-shorts-topic-bank-v2.md` prints `82 Shorts in file, 80 unpublished checked, 0 with issues, 0 duplicate ids` (v3.2; the lint also checks long-form plans).
2. Importer: 82 Shorts, 6 plans, 0 rejected; MF-024 and MF-038 not queued.
3. Any imported Short shows six beats in the planner with distinct moves.
4. Stills import: files named `MF044-S1_*.png` map automatically; the grid shows all 3 stills and 3 clips per Short.
5. Upload title equals `yt_title_final`; description ends with 5 hashtags.

## 6. What you do yourself
1. Paste `prompt_pack_days1-14/stills_master_prompt.txt` and `clips_prompts.txt` into Flow (keep the ID at the start of each line).
2. Run `watch_competitors.py` (needs a Gemini API key) to actually watch competitor Shorts; it is untested against the live API.
3. Backfill metadata on MF-024, MF-038 and the older thin-description Shorts: `BeiUGnUcrFA`, `DvrPAYFJZZQ`, `ioYf6yHkU2w`, `_L9qnhdLQZ0`, `9Wn8EkGtyyQ`.
4. After 5 new Shorts, compare "stayed to watch" with your current 39.6%.

## 7. Honest limits
- Nobody has watched competitor video content; evidence is titles, durations and views only.
- The lint checks mechanics, not appeal. Judge Shorts at 72 hours and 7 days.
- Claims for the new topics (MF-044 to MF-070) were written from general knowledge of the literature. Spot-check the evidence tags before publishing; mixed or debunked topics carry hedged wording.
- Nothing has been run inside the app.

## 8. Update v3.1 (CR-85, Gemini audits)
Bank is now 81 Shorts (79 unpublished). Added MF-071 to MF-081: triangulation, trauma bonding, anxious and avoidant attachment, idealize-devalue cycle, stonewalling, rejection sensitivity, parentification, people-pleasing, grey rock, negging. New narrations name the tactic in sentence 3 (after the emotional beat) and put any "popular term, not a diagnosis" line last. Queue reordered (Gemini's top picks first); MF-040/053/059/070 held; `audit` field (Gemini scores, verdict) added to audited Shorts. Importer: treat `audit` as optional text. Expected lint: `81 Shorts in file, 79 unpublished checked, 0 with issues, 0 duplicate ids`.

## 9. Update v3.2 (CR-88, Gemini RUN 7)
Bank is now 82 Shorts (80 unpublished). New: MF-082 (heartbreak). New fields: `hook_text_pov`, `queue_day`, `test_profile`, `test_hook` on the 30 queued Shorts. C1 openers rewritten to open on movement (lint-enforced). Long-form plans gained `Target runtime`, `Publish title`, `Thumb text`, `Thumb text alternative`, `Thumb art`, `Tags`. Importer: read the new fields (all optional); see ALGORITHM_REVIEW_CR88.md.
