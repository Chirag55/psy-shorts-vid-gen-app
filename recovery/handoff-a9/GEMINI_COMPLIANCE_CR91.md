# GEMINI_COMPLIANCE_CR91.md
**CR-91: import the Gemini-compliant bank (v4) and change the app to match it.** Newest CR; it wins over CR-77 to CR-90 where they disagree. Date: 13 Oct 2026.

Read with: `GEMINI_AUDIT_REQUIREMENTS.md` (every audit rule and its source), `GEMINI_COMPLIANCE_REPORT.md` (per-topic results), `topic-bank-v4-gemini-compliant.md` (the bank), `compliance_check.py`, `make_prompts_v4.py`.

## 91A. What changed in the bank
The bank was rebuilt from the app's own export (`topic-bank-status-2026-10-12.md`, same layout, same IDs), not from bank v3.2.
- 115 Shorts rewritten (78 D-series including new **D183** with `bank_id: MF-083`, and 37 S-series). 18 more Shorts skipped, with `skip_reason`.
- 12 long-forms rewritten as single-idea stories of 10 to 12 minutes: MF-L-01 to MF-L-05, MF-L-07, new **MF-L-08**, and L-001, L-004, L-005, L-006, L-008. L-003 and L-007 skipped.
- **12 new Shorts from three Gemini virality batches (13 Oct), D126 tone policing (`MF-126`), D78 plausible deniability (`MF-127`, renumbered from D127 which already exists), D79 isolation (`MF-128`, renumbered from D128), D129 baiting (`MF-129`), D130 strategic amnesia (`MF-130`), plus: D69 breadcrumbing (`MF-102`), D72 the double bind (`MF-105`), D73 hoovering (`MF-106`), D74 word salad (`MF-107`), D75 moving the goalposts (`MF-108`), D76 dark mirroring (`MF-109`), D77 fawning (`MF-110`)**, scripts word for word, restructured to the app schema (`ending: LOOP`, 6 shots with 3 clips, `virality: high`). Their hook length, closing question and word count are waived in `compliance_check.py` (`WAIVE`) because the scripts are curated. D76 (dark mirroring) sits close to the published-pending chameleon effect Short and D77 (fawning) close to the people-pleasing Short: post them at least a week apart. The other three scripts in the first batch (D68 triangulation, D70 grey rock, D71 Zeigarnik) were not imported: they repeat existing topics D171, D180 and D166.
- 20 published topics are byte-for-byte unchanged (checked by `compliance_check.py --original`).
- 14 D-series Shorts that had no `bank_id` now have one (MF-084 to MF-097) so their shot IDs match the `MF\d{3}-[SC]\d` file-name pattern.

## 91B. Importer
1. Importing `topic-bank-v4-gemini-compliant.md` must report the rewritten topics as **updated**, not "nothing new". Match by `id`.
2. **Topics in progress must accept the update.** If the importer locks them, allow it for this import: replace the script and metadata, discard the old voice and render for those topics, and leave their status `in_progress`. Show the user which projects were reset (D14, D19, D35, D53, D54, D125, D132, D172, D173, D174, D181, MF-L-01 to MF-L-05, MF-L-07, L-006).
3. `status: skipped` with `skip_reason` is applied and never scheduled.
4. New fields to read (all optional, so older files still import):
   - D-series Shorts: `hook_text_pov`, `shots` (count), `clip_ids`, `still_ids`, `character_looks`, `est_seconds`, `compliance`, `skip_reason`.
   - S-series Shorts: `hook_text`, `hook_text_pov`, `visual_brief.shots`, `seo.title_alt`, `seo.hook_alt`.
   - MF-L long-forms: `scenes` (list of `id, chapter, starts_at, approx_start_s, size, setting, action, move`), `scene_count`, `characters` look block, `structure: single_idea_story`, `tags`, `description`, `care_line`, `related_shorts`.
   - L-series long-forms: `scenes`, `scene_count`, `structure`, `title_alts`, `thumbnail_text`, `thumbnail_texts`, `thumbnail_concepts`, `tags`, `description`, `next_video`.
5. **Narration of D-series Shorts is one sentence per line.** Speak the lines verbatim, in order, with a pause of at least 0.4 s at each line break (audit CR-4). Captions are built from the same lines in 5 to 7 word phrases. The S-series keeps its `script.beats`; the last beat holds the closing question only (no sign-off).
6. Run the `compliance_check.py` rules in the importer as the publish gate (port them), the same way `lint_bank_v3.py` was used.

## 91C. Shorts render (replaces CR-82C, CR-86D and CR-89B beat counts)
1. **6 to 9 shots per Short, about 5 to 6 s each**, read from `visual_beats` (D-series) or `visual_brief.shots` (S-series). Each line is `ID kind | size | setting | action | move`. Kinds: `still` or `clip*`. **Exactly 3 are clips** (`C1`, `C2`, `C3`, Veo, placed at about 40%, 70% and the end); every other shot is its own **unique still** (`S1`, `S2`, ...). Never reuse a still. Shot lengths come from the audio: split the narration evenly across the shots. Never cut faster than about 4 s.
2. Stills move with the slow camera move named in the beat (`slow push-in`, `slow pull-out`, `slow pan-left`/`right`, `slow tilt-up`/`down`, `slow tracking`). Nothing fast.
3. Frame 0 shows the static text banner (`hook_text`, or `hook_text_pov` when the test schedule says so) from the first frame for at least 3 s, over the S1 still.
4. Phrase captions (5 to 7 words) in the lower third; no word-by-word captions.
5. **No mascot anywhere**: no Hoot overlay, no end card mascot, no poses (replaces CR-86B). Optional setting: a small "@TheMindFiles" text watermark at about 40% opacity in a corner (audit A6).
6. Still **no colour grade, tint, vignette or darkening** (CR-87H stands, even though audit A7 suggests a dark grade). The mood comes from the light written into each prompt.
7. **No sign-off catchphrase** (audit A9): Shorts end on the closing question and cut abruptly, looping back to the first frame (`ending: LOOP`, `loops_into_hook: true`). Still no silent hold on the last frame.
8. Veo budget: 3 clips per Short (345 for the 115 rewritten Shorts). Stills are free, so there is no still cap for Shorts.
9. **Rotating cast**: Short characters rotate through Alex/Sam/Jordan/Chris/Ben and Maya/Jamie/Riley/Nina/Ella (each Short already carries its names and `character_looks`); do not hard-code Alex and Maya. Non-heavy topics use bright, varied light (V9).
10. **Character looks**: every prompt for a shot with a named character must include that character's line from `character_looks`, so hair, skin tone and clothes stay the same.

## 91D. Long-forms (replaces the list structure of CR-88E and CR-90)
1. All rewritten long-forms are single-idea stories. Speak the narration verbatim (MF-L: `[Chapter: ...]` blocks; L-series: `script.cold_open`, `script.chapters`, `script.closing`). Do not regenerate them.
2. **One unique still per scene.** Render one still at each scene's `starts_at` (sentence start in the script; `approx_start_s` is only an estimate, use the real audio time). Hold it until the next scene (about 9 to 42 words, usually 8 to 18 s) with the named `move`. 54 to 66 scenes per episode, never reuse a still. **Each long-form also has 8 Veo clips**: scenes with `kind: clip` (listed in `clip_ids`) are rendered as a Veo clip from `prompt_pack_v4/longform_clips.txt` instead of a still, spaced at least 3 scenes apart; the count is a per-long-form setting (default 8, checker allows 6 to 12). **Raise `max_stills` to at least `scene_count`** (replaces the CR-90 default of 40). Prompts are in `prompt_pack_v4/longform_stills.txt`, each with the character look lines.
3. Remove the old 5-minute cap for the L-series. Target is 10 to 12 minutes.
4. Chapters: one per `[Chapter: ...]` (MF-L) or per script chapter (L-series), with real start times from the audio, the first at 0:00. The `description` field already contains estimated times; replace them with the real ones.
5. Ignore `hoot_moments`, `hoot_hook_pose` and `reenactments` if any remain; all are empty or removed in the new bank. No "study" stat-card template: the new cards use `bullets`, `split_compare`, `count_up`, `icon_array`, `bar` and `protect` only.
6. Thumbnails: 16:9, a face with a clear emotion, at most 4 words (`thumbnail_text`), readable at 120 px wide, never repeating the title; prompts are in `prompt_pack_v4/thumbnail_prompts.txt`. Long-form casts are Mara, Kai, Tess, Drew, Nora and Ryan (renamed from Meera, Kabir, Ritu and Dev to stay culture-neutral); their look lines are in `character_looks`.
7. Tags: 5 to 6. Description: 150 to 300 words, as given.
8. **Do not** add bank v3.2 LF-01 to LF-06 as MF-L-08 to MF-L-12 (the earlier plan). Their ideas are now inside this bank (LF-01 became MF-L-01, LF-02 became MF-L-08, LF-03 became MF-L-07, LF-06 became MF-L-03); LF-04 and LF-05 are dropped as lists.

## 91E. Prompts
`make_prompts_v4.py topic-bank-v4-gemini-compliant.md --out prompt_pack_v4` writes 516 Short stills, 381 clips, 621 long-form scene stills (`longform_stills.txt`), 96 long-form scene clips (`longform_clips.txt`) and 24 thumbnail prompts, ID first on every line. `prompt_pack_days1-14/` and `prompt_pack_calm_days1-14/` (6 beats) are obsolete.

## 91F. Precedence (add to the master brief, section 0)
| Older text | Replaced by |
|---|---|
| CR-86B mascot as end card only | CR-91C: no mascot at all |
| CR-86D / CR-89B 4 to 6 beats; CR-83 six beats with 3 Veo clips | CR-91C: 6 to 9 shots, exactly 3 Veo clips, the rest unique stills |
| CR-79 / CR-90 `max_stills` 40, stills may repeat | CR-91D: one unique still per scene, `max_stills` >= `scene_count` |
| CR-88D Short length 36 to 66 words (lists 82) | CR-91: 35 to 57 words, lists 41 to 71, no sign-off; estimated 45 s or less |
| CR-88E / CR-90 long-form as a numbered list told as one story | CR-91D: single-idea story, 10 to 12 minutes |
| Bank v3.2 (`psychology-shorts-topic-bank-v2.md`) as the import file | `topic-bank-v4-gemini-compliant.md` |
| Narration rule "name the tactic in the first 3 sentences" | No theory name in the first 25 words (audit CR-7) |

## 91G. Acceptance
1. `python compliance_check.py topic-bank-v4-gemini-compliant.md --original topic-bank-status-2026-10-12.md` prints `0 with issues` and `changed or missing: none`.
2. Import preview: 127 Shorts and 12 long-forms updated or new, 18 + 2 newly skipped, 20 published unchanged, 0 rejected.
3. D173 renders as 6 to 9 shots with exactly 3 clips and no repeated still, frame-0 banner "SILENCE FEELS LIKE DANGER", phrase captions, no mascot, no overlay, and ends on "What does silence make you feel?" with no sign-off.
4. MF-L-05 builds a 10 to 11 minute script with 9 chapters, the first at 0:00, no Hoot, and 56 distinct scenes (48 stills, 8 clips; no repeats).
5. L-001 builds a script longer than 9 minutes (no 5-minute cap).

## 91H. Limits
- Nothing has been run inside the app. The importer behaviour for in-progress topics is unknown until Claude Code checks it.
- Scripts were checked by rule and read once, not voiced. Listen to the first voiced Short and long-form.
- The audits' advice was followed where they agree. Where they conflict, the choice is listed in `GEMINI_AUDIT_REQUIREMENTS.md` ("Not adopted, and why").

## 91E. Alignment and side characters (19 Oct 2026)
- Recurring unnamed side roles (the man, the manager, the partner, etc.) that appear in 2+ shots of a Short now have a fixed name and a look line in `character_looks` (script: `side.py`). Shots use the name, so every still and clip gets the same description.
- Prompt packs now take the look text from each Short's own `character_looks`, so the top-of-Short description and every prompt always match.
- `prompt_pack_v4/shorts_storyboard.txt` lists each Short's shots in true on-screen order with the narration spoken during each shot. `manifest.json` has an `order` field per shot. Assemble by this order, not by S/C id.
- V9 (first appearance in shot 1 or 2) applies to the lead character only.
