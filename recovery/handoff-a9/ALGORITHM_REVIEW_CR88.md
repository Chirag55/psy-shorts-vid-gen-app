# ALGORITHM_REVIEW_CR88.md
**CR-88: apply Gemini RUN 7 (YouTube 2026 algorithm, monetization, Shorts and long-form).** Read after CR-87. Date: 12 Oct 2026.
Source: one Gemini answer (text only, no video watched). Its numbers are claims, not measurements; each is marked below.

## 0. Every point in the Gemini answer, and what we did
| # | Gemini says | Check | Decision | Where |
|---|---|---|---|---|
| 1 | Monetization: 1,000 subscribers plus 4,000 public long-form hours (12 months) OR 10M Shorts views (90 days). Early tier: 500 subscribers, 3,000 hours or 3M Shorts views | Matches YouTube's published Partner Programme rules as far as I know. **Chirag: confirm in Studio, Earn tab** | Plan around the hours path | 88A |
| 2 | Shorts run separately from long-form; swipe-away is the gatekeeper, then completion, then replays | Same ranking as our CR-84/86 | Already built | CR-84A measures it |
| 3 | Best length 22 to 45 s (curiosity 22 to 30, explainers 35 to 45); "a 20 s Short at 85% completion beats a 50 s Short at 40%" | Claim, plausible | Measured our scripts: 43 to 73 words, about 22 to 37 s at the calm pace, all inside the range. **No narration change** | 88B |
| 4 | First second: visual pattern interrupt plus curiosity gap, start mid-action | Claim, consistent with CR-86 | Bank: all 52 static C1 openers rewritten; lint blocks new ones; clip prompts say "already underway in the first frame". App: lint + generator rule | 88B |
| 5 | Caption-first hooks ("POV: ...") | Claim | Bank: `hook_text_pov` on all 30 queued Shorts; balanced 2 by 2 test with calm/punchy | 88C |
| 6 | Large, high-contrast captions | Matches CR-87F | Already specified | CR-87F |
| 7 | Drop forced loops | Matches CR-84D | Already specified | CR-84D |
| 8 | Drop academic framing | Done in bank v3.0 to v3.2 | Nothing new | bank |
| 9 | Long-form: 10 to 15 min sweet spot, narrative arc, no animated intro, first 30 s confirms topic and states what is coming | Claim; consistent with PsychToons' 10 to 19 min winners | Flagship 10:00 to 11:30, others 7:30 to 10:00, one story per episode, cold open | 88E, bank LF plans |
| 10 | Thumbnails: readable at 120 px, 3 to 4 words, emotional face, do not repeat the title | Claim, consistent with common practice | New template, new thumbnail prompts, new bank fields | 88G |
| 11 | Titles under 60 characters, hook first | | Deep-dive title cap 70 to 60; all six plan titles are 60 or fewer | 88H |
| 12 | Description first two lines matter, 150 to 300 words, chapters | | Spec added | 88E |
| 13 | Tags carry little weight, use 5 to 6 | | Long-form 5 to 6. **Shorts keep 8 to 12** (bank lint) because they cost nothing; do not spend time on them | 88H |
| 14 | "Stop optimizing metadata at the expense of the hook" | | Process note: hook and first clip come first | 88B |
| 15 | "Stickman workflow" | Different art style; would confound the calm/punchy test | **Not adopted** | |
| 16 | Turn one listicle into a 10-minute narrative | Already how LF-03 is built (Alex and Leo story) | Made explicit: story arc, cold open | 88E |
| 17 | "10-minute video with 2,000 views equals 100,000 views of a 12 s Short" | Arithmetic is right (about 333 watch hours each). **But only long-form hours count toward the 4,000-hour route** | Used in 88A with that caveat | 88A |

## 88A. Plan the channel around the watch-hours path
- 10M Shorts views in 90 days is out of reach at 30 to 40 views per Short, and Shorts watch time does not count toward the 4,000 hours. Shorts are the subscriber funnel; long-form is what gets monetization.
- Arithmetic to show in the app: 4,000 hours = 24,000 views of a 10-minute video watched to the end, or about 48,000 views at 50% average viewed, 60,000 at 40%.
- App: Library row "Partner Programme progress" with subscribers, public long-form watch hours (12 months), Shorts views (90 days), each against its threshold. Data: Data API channel statistics for subscribers; YouTube Analytics API for watch minutes and views by content type (verify the content-type dimension is available to the app's scope; if not, show only what is available and link to Studio's Earn tab, which is the authority). Label it "estimate".
- Add the **returning viewers** figure to the 84A pull.

## 88B. Shorts: the first second
Bank (done): every unpublished Short's C1 opens on visible movement; the lint checks it with a motion-word list (a heuristic, not a guarantee; read the first second of each clip yourself).
Clip prompts (done): every C1 prompt now says the action is "already underway in the very first frame... no establishing hold".
**Regenerate the C1 clips listed in `prompt_pack_days1-14/CHANGED_C1_CLIPS.txt`.** C2, C3 and all stills are unchanged.
App (Claude Code):
1. Importer: run the same C1 motion check as `lint_bank_v3.py` (warn amber if it fails).
2. Planner: C1 is the first shot in both profiles, starting at its first frame (no fade-in, no trimmed lead-in).
3. Script generator (app-written scripts): see 88D.

## 88C. Caption-first hooks and the test schedule
- Bank fields (done, on the 30 queued Shorts): `hook_text_pov` ("POV: ..." 3 to 9 words), `test_profile` (`calm`|`punchy`), `test_hook` (`label`|`pov`), `queue_day`.
- App: import the fields (all optional text). The frame-0 banner (CR-86A) shows `hook_text` when `test_hook` is `label` and `hook_text_pov` when it is `pov`. Same static banner, same duration. The default when the fields are absent is `hook_text`.
- Log `test_profile` and `test_hook` in the CR-84F experiment row for every Short (add a `hook_style` column).
- Schedule (in the bank header): odd days calm, even days punchy; banner label, label, POV, POV, repeating. Each of the four combinations gets 7 or 8 Shorts in 30 days.
- Reading the result at 72 h on "stayed to watch": compare profile calm vs punchy (15 vs 15) and label vs POV (15 vs 15) separately; a gap above 10 points is a signal, below that repeat. At 30 to 40 views per Short this will be noisy; do not read single Shorts.

## 88D. Script generator rules (app-written scripts; the bank is already written this way)
Replace the generator's current Short format (55 to 70 words, hard cap 72) with:
1. First sentence 12 words or fewer, starting in the viewer's moment.
2. Name the tactic by sentence 3 for emotional topics, by sentence 2 otherwise. Fold any "popular term, not a diagnosis" hedge into the naming sentence.
3. No years, author names, "researchers", "study", "experiment", "psychologist", or origin trivia.
4. 36 to 66 words (numbered lists up to 82). Hard gate: estimated duration words / 2.1 + 2 s must be 45 s or less.
5. End with the sign-off line; no loop ending.
6. Return `hook_text` (2 to 6 words) and `hook_text_pov` ("POV:" plus a viewer moment, 9 words or fewer, no year).
7. Return six `visual_beats` where the first clip (C1) describes visible movement or change.
Keep the CR-82B rules not listed here.

## 88E. Long-form format v2 (replaces the 450 to 700 word deep dive and CR-84H)
Applies to the LF-01 to LF-06 plans in the bank. The numbered items stay, but each episode is one continuous story (the same characters and situation continue from item to item).
| Segment | Length | Rule |
|---|---|---|
| Cold open | 10 to 20 s | Mid-scene moment, no greeting, no title card, no animated intro |
| Promise | 10 to 15 s | Confirms the viewer is in the right place and says what they get. Cold open plus promise end by 30 s |
| Each item | 75 to 95 s flagship, 60 to 80 s others | Number card, story vignette, mechanism in plain words (a named study is optional, never the opener), one-line defence |
| Pattern interrupt | after the middle item | Direct question |
| Recap | 25 to 35 s | One-line checklist |
| Resolution | 20 to 30 s | How the story ends; the care line for relationship topics |
| Outro | about 10 s | Comment question, next teaser, catchphrase |
- **Word budget** at about 2.1 words per second: flagship 1,260 to 1,450 words (10:00 to 11:30); 6-item 1,000 to 1,260; 5-item 950 to 1,130; 8-item 1,070 to 1,260. Runtimes are in each plan's `Target runtime`; the planner warns outside them (replaces the CR-77C 8:00 to 9:30 rule).
- **Description:** 150 to 300 words. Line 1 = the plan's `Suggested description line 1` (main keyword plus the viewer benefit), line 2 = the hook, then chapters, sources (each item's `evidence`), care line where relevant, 3 hashtags.
- **Chapters:** generated from the actual audio times of each segment. First chapter at 0:00, at least 3, each at least 10 s.
- **Tags:** 5 to 6 per plan (in the bank). **Title:** `Publish title` from the plan, 60 characters or fewer.
- **LF-03 flagship:** hook is now the mid-scene cold open ("Alex only wanted to talk about one unpaid bill..."); the earlier hook is kept as `Hook alt (A/B)`. Story arc is written into the plan.

## 88F. Voice budget (decision for Chirag before producing LF-03)
From the app brief: ElevenLabs allows 10,000 characters per month and the app stops at 9,000. Measured on the bank (CR-90 update): **the 30 queued Shorts alone need 11,162 characters** (about 9,400 if the sign-off is shown as an end card instead of voiced, CR-82E), and **LF-03 as written needs 7,628**; the other long-forms need 5,356 to 6,773. So the 30-day plan does not fit the current allowance even without long-form, and a month with daily Shorts plus one long-form needs roughly 17,000 to 19,000 characters. Options:
1. Move to an ElevenLabs plan with at least about 20,000 characters a month (check current plans and prices yourself). This is the only option that keeps daily Shorts and a monthly long-form.
2. Stay on the current allowance: show the sign-off as an end card (saves about 1,700 characters a month), post about 20 Shorts a month instead of 30, and produce a long-form only every second month, starting with a shorter one (LF-05 or LF-06, about 5,400 characters).
3. Split production across two months (not recommended; the Shorts test would stall).
App: show an estimated character count and the remaining monthly allowance before any voice generation, and block with an explanation when a script would exceed it.

## 88G. Long-form thumbnail v2 (replaces the badge, blurred-frame and big-Hoot template)
- 1280x720. Full-bleed sharp image (no blur, no darkening, no tint), one large character face with a clear emotion, the plan's `Thumb text` (2 to 4 words) in a bold sans-serif with a thick outline and shadow. No pill badge, no Hoot, no second line that repeats the title.
- Image source: a generated 16:9 still from `thumbnail_pack/thumbnail_prompts.txt` (two variants per plan: `LF03-T1`, `LF03-T2`), or the best sampled video frame if no generated image is attached.
- App: show a live 120 px wide preview next to the editor and warn if the headline is not legible there. Test & Compare: use the two variants, and the plan's `Thumb text alternative`.
- Generate at true 16:9 in Flow and check with `python fix_framing.py check <folder> --size 1920x1080`.

## 88H. Metadata caps
- Deep-dive title maximum: 60 characters (was 70). Shorts title rule unchanged (bank lint).
- Long-form tags: 5 to 6. Shorts tags: 8 to 12 (unchanged).

## 88I. Acceptance tests
1. `python lint_bank_v3.py psychology-shorts-topic-bank-v2.md` prints `82 Shorts in file, 80 unpublished checked, 0 with issues, 0 duplicate ids`. It fails if a C1 opener has no movement word, a queued Short lacks a valid `hook_text_pov`, the test schedule is wrong, or a long-form plan has a title over 60 characters, a thumbnail text that repeats the title, or the wrong tag count.
2. Importer reads `hook_text_pov`, `queue_day`, `test_profile`, `test_hook` and the long-form fields without error; older files without them still import.
3. A Short with `test_hook: pov` shows the POV text in the static frame-0 banner; the CR-84F row shows the hook style.
4. Generator output for a new Short passes rules 1 to 7 of 88D.
5. A long-form plan produces a script inside its word budget, a description of 150 to 300 words, chapters starting at 0:00, 5 to 6 tags, and a title of 60 characters or fewer.
6. Thumbnail editor shows the 120 px preview; the rendered thumbnail has no blur, darkening or badge.
7. Library shows the Partner Programme progress row, labelled estimate.
8. Voice generation shows the character estimate and blocks a script that exceeds the remaining allowance.

## 88J. Not adopted, and honest limits
- Stickman workflow: not adopted.
- Gemini's numbers (22 to 45 s sweet spot, 85% vs 40% completion) are unverified; our own 72 h "stayed to watch" data decides.
- Virality is not guaranteed by any of this. The tests exist to find out which changes move the number.
