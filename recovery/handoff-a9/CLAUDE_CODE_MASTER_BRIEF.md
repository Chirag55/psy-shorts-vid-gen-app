> **READ FIRST: `VIRAL_BATCH_A9.md`. Five Shorts (D43, D19, D23, D61, D16) are the first five uploads and the app must queue, badge and render them as described there (queue 1-5, subtitles, bottom overlay, voice settings, thumbnails).**

# CLAUDE_CODE_MASTER_BRIEF.md
**App:** The Mind Files Studio (Android, single user, no server). The brief supplied with these CRs describes v2.9.0 (build 24); earlier CRs assumed v4.7.0. **Check every item against your current build before changing code**; the app's own numbering is authoritative.
**This brief covers:** CR-77 to CR-91. **Start with CR-91 (`GEMINI_COMPLIANCE_CR91.md`): it replaces the bank to import and several render rules.** Ignore older planning files that reuse these numbers.

## 0. Precedence: where a later CR replaces earlier text
Later CRs win. Known replacements (an older CR file still contains the old text):
| Older text | Replaced by |
|---|---|
| CR-80J / earlier brief: Hoot overlay bottom-left for the whole Short | CR-86B: `mascot` default `endcard` (last 2 s only) |
| CR-82C / CR-83: cut at least every 2.5 s, word-by-word captions | Profile **punchy** only. Profile **calm** (CR-86D): shots of 6 s or more, phrase captions. CR-87B: phrase captions are the default, word-by-word is a setting for punchy |
| CR-82E / CR-82F: loop ending default | CR-84D: no loop; end-card question |
| CR-84B: Hoot in first 3 s; "dark grade" | CR-86B; CR-87H: **no** grade, tint, vignette, darkening or overlay in the render. "Dark" mood is lighting in the image prompt only |
| CR-84H: deep dive 8 to 12 min, plain-background thumbnail | CR-88E (runtime and structure) and CR-88G (thumbnail) |
| CR-77C: flagship 8:00 to 9:30; CR-60 title up to 70 characters | CR-88: flagship 10:00 to 11:30; title 60 characters or fewer |
| App deep dive: 450 to 700 words, 3 to 5 min, badge + blurred-frame thumbnail | CR-88E, CR-88G |
| App Short generator: 55 to 70 words, cap 72 | CR-88D: 36 to 66 words (lists 82), estimated 45 s or less |
| Style file: "keep bottom 15% quiet", empty areas, thirds | Removed (CR-87E). Prompts never describe empty, soft or reserved areas |
| CR-87E(3) and the `--auto` crop of `fix_framing.py`: detect and cut blurred or uniform top/bottom bands | **Withdrawn (CR-89A).** The app never analyses pixels to crop; aspect-ratio geometry only |
| CR-86D calm profile: 3 clips + 1 still | CR-89B: 4 to 6 beats by audio length, so 2 or 3 stills |
| CR-77 / bank v2.5 "item copy assembly" (vignette + linked Short narration minus its hook) | CR-90: vignette + the plan's own item body, where-else line and defence line, spoken verbatim |
| CR-79 / CR-89C still caps (10 to 15, then 30) | CR-91D: one unique still or clip per scene (8 Veo clips per long-form); `max_stills` >= `scene_count` (54 to 66 per episode) |
| Bank counts 70, 81 Shorts; 68, 79 unpublished | **82 Shorts, 80 unpublished** (v3.2) |
| CR-86B mascot as end card only | **CR-91C: no mascot at all** |
| CR-86D / CR-89B 4 to 6 beats; CR-83 six beats with 3 Veo clips | **CR-91C: 6 to 9 shots per Short, exactly 3 Veo clips, the rest unique stills** |
| CR-88D Short length 36 to 66 words (lists 82) | CR-91: 35 to 57 words, lists 41 to 71, no sign-off (audit A9) |
| CR-88E / CR-90 long-form as a numbered list told as one story; LF-01 to LF-06 to be added as MF-L-08 to MF-L-12 | **CR-91D: single-idea stories of 10 to 12 minutes, already in the v4 bank; do not add LF-01 to LF-06** |
| Bank v3.2 `psychology-shorts-topic-bank-v2.md` as the import file; `prompt_pack_days1-14/` | **`topic-bank-v4-gemini-compliant.md`; `prompt_pack_v4/`** |

---

## 1. Files to give Claude Code (one zip: `claude-code-handoff.zip`)

| # | File | What it is |
|---|---|---|
| 1 | `CLAUDE_CODE_MASTER_BRIEF.md` | This file: precedence, order of work, acceptance tests |
| 1a | `GEMINI_COMPLIANCE_CR91.md` | **CR-91 (newest):** import the v4 bank, 6 to 9 shot Shorts with 3 clips, per-scene long-form stills, fixed character looks, no mascot, single-idea long-forms |
| 1b | `topic-bank-v4-gemini-compliant.md` | **The bank to import** (app export layout, same IDs) |
| 1c | `GEMINI_AUDIT_REQUIREMENTS.md`, `GEMINI_COMPLIANCE_REPORT.md` | Every audit rule with its source; per-topic results |
| 1d | `compliance_check.py`, `make_prompts_v4.py`, `prompt_pack_v4/` | Publish-gate checker; shot, scene and thumbnail Flow prompts |
| 1e | `topic-bank-status-2026-10-12.md` | The app export the v4 bank was built from (for `--original`) |
| 2 | `psychology-shorts-topic-bank-v2.md` | **Bank v3.2**: 82 Shorts, 6 long-form plans, new fields, rewritten first clips, queue and test schedule (re-import) |
| 3 | `ALGORITHM_REVIEW_CR88.md` | **CR-88** (newest): monetization path, first-second rule, POV hooks, long-form format, thumbnail template, voice budget |
| 4 | `RENDER_REVIEW_CR87.md` | CR-87: watermark, captions, script gate, full-frame fix, **87H remove the app's dark overlay (do first)** |
| 5 | `REACH_AND_RETENTION_CR86.md` | CR-86: static banner, mascot endcard, calm pace, calm-vs-punchy profiles |
| 6 | `REACH_AND_RETENTION_CR84.md` | CR-84: Analytics (retention), ending, music, mood, experiment log (84H superseded) |
| 7 | `BANK_V3_REDO_CR83.md` | CR-83: schema, importer, beats, bundle mapping |
| 8 | `ENGAGEMENT_REWRITE_CR82.md` | CR-82: generator, lint, planner uses `visual_beats` |
| 9 | `PLANNER_AND_STILLS_MAP_CR81.md` | CR-81: planner, numbered stills mapping |
| 10 | `SHORTS_TRACTION_FIX_CR80.md` | CR-80A to 80J: titles, hooks, descriptions, tags, render |
| 11 | `FLAGSHIP_LONGFORM_CR77.md` | CR-77: LF-03 flagship (banner at top lists what CR-88 changed) |
| 12 | `CAST_NEUTRAL_CR78.md` | CR-78: neutral cast, culture-word lint |
| 13 | `ANIME_STYLE_AGENT_INSTRUCTIONS.md` | Style lock, cast, variety, full-frame rule, opening clip and thumbnail rules (5D) |
| 14 | `lint_bank_v3.py` | Reference lint (Shorts and long-form plans); port the rules into the importer as the publish gate |
| 15 | `make_prompts.py` | Stills, clips and thumbnail prompts from the bank (`--thumbs` for long-form thumbnails) |
| 16 | `fix_framing.py` | Frame-fill check and repair for clips and stills (`--size 1920x1080` for thumbnails); port into the importer |
| 16a | `LONGFORM_SCRIPTS_CR90.md` | **CR-90** (newest): the six long-form episodes fully written; exact speaking order; importer, chapters, description, 16:9 visuals, voice guard |
| 16c | `assemble_longform.py`, `longform_scripts/` | Builds and checks each episode's spoken script, chapters and description; the six ready scripts it produced |
| 16b | `FRAMING_AND_CALM_CR89.md` | **CR-89** (newest): no pixel-based cropping anywhere in the app; calm profile uses all stills |
| 17 | `prompt_pack_days1-14/`, `prompt_pack_calm_days1-14/`, `thumbnail_pack/` | Ready prompt packs with Flow instructions (generated from the bank; regenerate with `make_prompts.py`) |
| 18 | `watch_competitors.py`, `competitor_seed_ids.txt` | Optional: Gemini-API script that watches competitor Shorts (untested against the live API) |

**Do not give Claude Code:** `mindfiles-topic-bank-v2.md` (old D01 to D30 bank), `MINDFILES_BRIEF_v2.md`, `MINDFILES_LONGFORM_PLAYBOOK.md`, `MF-L-01_REMAKE.md`, `PSYCHTOONS_TEARDOWN.md`, the skill pack, the Hoot asset zips, the Gemini prompt/audit files. Superseded or not for the app.

## 2. What you do yourself (not Claude Code)
1. **Gemini API key** (aistudio.google.com) in the app's Settings, then **Load image models**, pick a *Gemini* image model (not Imagen).
2. **Flow:** set images and videos to portrait 9:16 (thumbnails: landscape 16:9). Regenerate the C1 clips in `prompt_pack_days1-14/CHANGED_C1_CLIPS.txt`. Stills and C2/C3 clips from the current pack stay valid. Old renders of MF-025 and MF-072 are test files; do not publish them.
3. **Backfill 3 published Shorts** after CR-80C/D ship: `BeiUGnUcrFA`, `DvrPAYFJZZQ`, `ioYf6yHkU2w` (remove "coming soon", add real tags).
4. **Tell me** if any Short beyond MF-024 and MF-038 is already published.
5. **Decide the voice budget** (CR-88F): ElevenLabs allows 10,000 characters a month (the app stops at 9,000). The 30 queued Shorts alone need 11,162 characters, and LF-03 needs 7,628. Either move to a plan with about 20,000 characters a month, or post about 20 Shorts a month with the sign-off as an end card and a long-form every second month.
6. **Studio:** screenshot the Engagement tab ("viewed vs swiped away") for the best, median and worst recent Short until CR-84A ships; confirm the Partner Programme thresholds in Studio's Earn tab; after 5 new Shorts compare "stayed to watch" with your 39.6%.

## 3. Paste this into Claude Code

```
Read these files in this order: CLAUDE_CODE_MASTER_BRIEF.md (section 0 says which later CR
replaces older text), RENDER_REVIEW_CR87.md, ALGORITHM_REVIEW_CR88.md, FRAMING_AND_CALM_CR89.md, LONGFORM_SCRIPTS_CR90.md,
REACH_AND_RETENTION_CR86.md,
REACH_AND_RETENTION_CR84.md, BANK_V3_REDO_CR83.md, ENGAGEMENT_REWRITE_CR82.md,
PLANNER_AND_STILLS_MAP_CR81.md, SHORTS_TRACTION_FIX_CR80.md, FLAGSHIP_LONGFORM_CR77.md,
CAST_NEUTRAL_CR78.md, ANIME_STYLE_AGENT_INSTRUCTIONS.md.
Then re-import psychology-shorts-topic-bank-v2.md (v3.2) and run
python lint_bank_v3.py psychology-shorts-topic-bank-v2.md (expect 82 Shorts, 80 unpublished, 0 issues)
and python assemble_longform.py psychology-shorts-topic-bank-v2.md --check (expect all plans OK).

Implement in the order in section 4 of the master brief, one CR at a time, on a branch.
Check each item against the current build first; the app brief describes v2.9.0 and may be out of date.
After each CR: run its acceptance checks, report the result, then continue.
Do not change: narration text (used verbatim), evidence tags, the Shorts cast rotation,
the Asia/Kolkata scheduling time zone, or any already-published video.
Never add any colour grade, tint, vignette, darkening or overlay to renders, and never put
empty-area, quiet-area or thirds wording into an image or clip prompt.
Finish with: list of changed files, the acceptance results, and anything you could not do.
```

## 4. Implementation order

| Step | CR | What | Why here |
|---|---|---|---|
| 1 | **CR-87H** | Remove the app's dark overlay / tint / vignette / darkening layer (confirmed present) | Affects every render; one fix |
| 2 | **CR-89A, CR-87E, 87A** | Remove any pixel-based band detection/auto-crop; scale-to-fill by aspect ratio only (a true 9:16 clip is never cropped); crop the Veo watermark | Good clips were being cut |
| 3 | **CR-80J + 80H** | Hook text from frame 0, -14 LUFS, pause cap, 1080x1920 | Biggest expected effect on swipe-away |
| 4 | **CR-86A + 86B + 87B + 87F** | Static frame-0 banner, mascot `endcard`, phrase captions (lower third, larger) | Small render changes |
| 5 | **Importer for bank v3.2** | New fields (CR-83 section 2, CR-88C: `hook_text_pov`, `queue_day`, `test_profile`, `test_hook`, long-form fields); skip `status: published`; hold priority C; older files still import | Needed to load the bank |
| 6 | **CR-84A + 84D + 88A** | Analytics API (retention, returning viewers), end-card question, Partner Programme progress row | Every later test is measured with it |
| 7 | **CR-80A to 80E, 80I** | Title lint, description template, tags rule, pinned-comment card, hook log | Packaging and measuring |
| 8 | **CR-87C, 82A, 82B, 88D** | Script gate, importer lint, generator rules (88D replaces the old Short format) | Keeps new scripts on spec |
| 9 | **CR-88B, 88C** | C1 motion check in importer, banner reads `test_hook`, log `hook_style` | Uses the new bank fields |
| 10 | **CR-86C, 86D (as changed by CR-89B), 86E + CR-84C, 84F, 84I** | Calm pace, calm-vs-punchy profiles (calm uses 4 to 6 beats, so 2 or 3 stills), music, mood (prompt lighting only), experiment log | After step 6 |
| 11 | **CR-82C, 82D, CR-83 planner** | Planner uses `visual_beats`; punchy cuts at most every 2.5 s, calm shots 6 s or more | Biggest visual change |
| 12 | **CR-78, CR-77, CR-79** | Cast rename, long-form planner, stills reuse | Prerequisite for long-form |
| 13 | **CR-81A, 81C, 81B** | Planner never empty, numbered stills export/import grid, long-form sheet | |
| 14 | **CR-90, CR-88E, 88F, 88G, 88H** | Import the written long-form plans and speak them verbatim (CR-90), long-form format v2, voice budget guard, thumbnail v2, metadata caps, 16:9 full-frame prompts | Do before producing LF-03 |
| 15 | **CR-87D, 87G, 82E, 82F** | Duration follows audio, disclaimer placement, sign-off as end card, log format | Last |

## 5. CR-79: stills batch (from earlier chat, now written down)
1. **Cards never go to image generation.** Number, study, bullets, question, recap and care-line cards are drawn by the app.
2. **Reuse stills only when the story needs it.** (CR-89C: stills made in Flow are free, so the old cap of about 10 to 15 stills per long-form was a time cap, not a cost cap.) Superseded by CR-91D: render one unique still per `scenes` entry; `max_stills` must be at least `scene_count`; never reuse a still.
3. **Batch queue** for the stills that remain:
   - runs in the background and resumes after interruption
   - paces requests to stay under rate limits, retries once on failure
   - shows an estimated cost before starting ("14 stills = about $0.55")
4. **Fallback:** if the key has no image model, export all prompts as one text file with numbered filenames matching import order.
5. **Prompts:** use the style lock in `ANIME_STYLE_AGENT_INSTRUCTIONS.md` section 2. The app appends cast identity blocks; prompts never restate identity.

## 6. What the bank already fixes (no code) vs what needs code

| Problem found | In bank v3.2? | Needs Claude Code? |
|---|---|---|
| First sentences too long; concept-led hooks; citations in narration | **Yes** | No (lint in importer) |
| First clip opens on a held pose | **Yes**, 52 openers rewritten, lint-enforced | Importer check (CR-88B) |
| Caption-first (POV) hook variants and the 2 by 2 test schedule | **Yes**, 30 queued Shorts | Banner must read `test_hook`; log it (CR-88C) |
| Long-form plans: runtime, title, thumbnail text and art, tags | **Yes** | Format v2, thumbnail template, voice guard (CR-88E to G) |
| Long-form scripts: arcs, vignettes, item bodies, recaps, resolutions, descriptions, chapters | **Yes**, all six written and checked (CR-90) | Import and speak verbatim; chapters from real audio (CR-90C) |
| Clips not filling the screen; wrong prompt wording | **Yes** (prompts, style file) | Scale-to-fill and no blurred fill (CR-87E) |
| Dark/green overlay | Not a bank issue | **Yes** (CR-87H) |
| Hook text on frame 0, quiet audio, dead air, 720p, watermark, mascot | No | **Yes** (CR-80J, 86A/B, 87A) |
| "Coming soon" description, thin tags | No | **Yes** (CR-80C/D) |
| Already-published Shorts | N/A | Backfill the 3 listed in section 2 |

## 7. Acceptance tests (Claude Code must run and report)

**Bank and importer**
- `python lint_bank_v3.py psychology-shorts-topic-bank-v2.md` prints `82 Shorts in file, 80 unpublished checked, 0 with issues, 0 duplicate ids`.
- Importer: 82 Shorts and 6 plans, 0 rejected; MF-024 and MF-038 marked published and not queued; the new fields are read; an older bank file still imports.

**Render (any one new Short)**
- `ffprobe`: 1080x1920, video bitrate at least 6 Mbps.
- `ffmpeg -i out.mp4 -af ebur128=peak=true -f null -`: integrated loudness between -15 and -13 LUFS.
- `ffmpeg -i out.mp4 -af silencedetect=noise=-35dB:d=0.45 -f null -`: no silence gap (except the deliberate 0.4 to 0.6 s pauses of CR-86C in the calm profile).
- Frame 0 shows the banner text (the log shows the string drawn and whether it was `hook_text` or `hook_text_pov`).
- **Colour (CR-87H):** `signalstats` on a source clip and the same moment in the render: mean brightness within 3% and mean U/V within 3 units.
- **Fill (CR-87E, CR-89A):** a 1080x1920 (or any exact 9:16) source clip is rendered with 0% cropped: compare a rendered frame with the source frame scaled to 1080x1920 (SSIM at least 0.98 on the area outside captions, banner and watermark crop). Test with a clip that has a smooth sky or dark wall in its top 30%; nothing may be cut.
- **Calm profile (CR-89B):** a 27 s Short uses 6 beats (3 stills), a 22 s Short 4 beats; every shot is 4.5 s or longer.
- **Mascot (CR-86B):** Hoot only in the last 2 s by default, bottom-left, not over a face.
- **Captions (CR-87B/F):** phrase captions of 5 to 7 words, no caption box centre between 35 and 60% of frame height.
- **Profiles:** calm shots are 4.5 s or longer; punchy cuts at most every 2.5 s.

**Packaging**
- No description contains "coming soon". Tags 8 to 12 for Shorts (5 to 6 for long-form), none equal to the title or a category name. Title ends with `#shorts` plus up to 2 topical hashtags, 100 characters or fewer. A pinned-comment card appears after publish.

**Long-form (CR-88)**
- Acceptance items 1 to 8 in `ALGORITHM_REVIEW_CR88.md` section 88I and items 1 to 5 in `LONGFORM_SCRIPTS_CR90.md` section 90E (the app's LF-03 script equals `longform_scripts/LF-03_script.md` word for word), plus the lists in `FLAGSHIP_LONGFORM_CR77.md` section 8 and `CAST_NEUTRAL_CR78.md` section 3.

**Planner and stills (CR-81, CR-79)**
- 30-day plan from the bank: counts add up to 30, no blank day, no published or skipped topic scheduled. Stills export has contiguous `S001..S0NN` with a matching manifest; import maps by ID in the file name through the confirmation grid. LF-03 plan respects the `max_stills` setting (default 40).

## 8. Limits to keep in mind
- Competitor evidence is titles, durations and views plus Gemini's own viewing (counts unverified). Lint checks mechanics, not appeal.
- Nothing here has been run inside the app. The loudness, pause, music, caption, profile and POV changes are **tests**; the only difference that matched performance in the early three-video check was on-screen hook text. Measure with the CR-80I / CR-84F log.
- Judge a Short at **72 hours** and **7 days**, not 12 hours. At 30 to 40 views per Short, single results are noise.
- Virality is not guaranteed.
