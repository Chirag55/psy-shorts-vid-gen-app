# Gemini audit requirements: every rule, its source, and how the bank meets it
Compiled 12 to 13 Oct 2026 from the 7 Gemini PDFs shared 10 to 12 Oct (the "Now check this short" PDF was shared twice; both copies are identical).

| Code | PDF (shared) |
|---|---|
| A1 | "My channel is The Mind Files" (10 Oct): channel teardown |
| A2 | "Untitled" 10-page (10 Oct): audit of MF-001 to MF-070 |
| A3 | "Untitled" 3-page (10 Oct): audit of MF-071 to MF-077, missing topics |
| A4 | "RUN 5 synthesis: gap table of us vs winners" (10 Oct): gap table, hook bank, pacing, CR-1 to CR-7, topic changes |
| A5 | "Will this work?" (10 Oct): review of the gaslighting Short |
| A6 | "Now check this short" (10 Oct): review of the trauma-bonding Short |
| A7 | "Do 1 thing: scout all my competitor channels" (11 Oct): RUN 6, competitors and monetization |
| A8 | "Do a comprehensive study of YouTube algorithm" (12 Oct): RUN 7, 2026 algorithm |

Decisions you made on 12 Oct where the audits pull in different directions: (revised 13 Oct) each Short has 6 to 9 shots of about 5 to 6 s: exactly 3 Veo clips, the rest unique stills, never a repeated still; each long-form has one unique still or clip per scene (54 to 66 scenes, 8 of them Veo clips), no reuse; long-form becomes a single-idea deep dive of 10 to 15 minutes; topics in progress are rewritten too; the older S- and L-series are rewritten to comply.

## Shorts: script
| # | Rule | Source | Bank field and check |
|---|---|---|---|
| S1 | First sentence is a direct "you" pain point, a question, or a claim about the viewer. No lecture. At most 12 words. | A4 gap table "First spoken sentence"; A8 "The Hook" | `hook` = first sentence; must contain you/your or end in "?" |
| S2 | No theory name, "research", year or study in the first 10 seconds. The term may be said once, late (in the last 40% of the words), or not at all. | A4 CR-7; A2, A3 "jargon drop" pattern 1; A4 reason 3 | checker: term and citation words absent from the first 25 words; term only after 60% of the words |
| S3 | No citations, years, "researchers", "studies", "experiment", "psychologists", university names, origin trivia ("named after an old play"). | A4 CR-7; A5 violation 3; A7 "research shows" lectures | checker: banned-word list on the whole narration |
| S4 | No disclaimer sentence in the narration ("a popular term, not a diagnosis", "research is limited"). Hedges go in the description; the narration uses plain hedges ("often", "can"). | A6 issue 2; A3 retention-risk column | checker: disclaimer list |
| S5 | End on a reflective question that invites a comment (superseded by S14: no sign-off after it, abrupt cut looping to frame 0). | A1 §1; A4 CR-5; A8 "Eliminate forced loops" | `ending: SIGNOFF`; the last line before the sign-off ends in "?" |
| S6 | Length 22 to 45 s: about 25 to 35 s for single-idea Shorts, up to 45 s for three-item lists. At 2.0 words/s with pauses: 35 to 57 words (single), up to 71 (list), no sign-off. | A4 §4; A8 "22-45 second rule" | checker: word count by format |
| S7 | Calm pace, about 2.0 words/s, with pauses of more than 0.4 s between items. Short sentences, one per line, so the voice tool pauses. | A4 CR-4; A7 "insert extra periods or line breaks" | narration written one sentence per line; numbered items are separate sentences |
| S8 | Topics are emotional pain points (relationships, social, workplace, romantic), not dry or mathematical framings. | A2 pattern 3; A4 topic row; A7 §IV.1 | topics reframed; dry ones dropped (S11) |
| S9 | No academic or literal title. Use a curiosity gap ("N Signs…", "Why you…"). Use Gemini's "Better title" where one is given. | A4 title row; A2 column 3 | `title_final`, `title_alt` |
| S10 | Static frame-0 text anchor naming the stakes (2 to 5 words), plus a caption-first "POV:" version. | A4 CR-2 and hook bank; A8 "Caption-First Hooks"; A5 "frame-0 hook anchor" | `hook_text`, `hook_text_pov` on every Short; Gemini's hook-bank text used verbatim where given |
| S11 | Drop: MF-029, MF-040, MF-053, MF-059, MF-070 (A2 verdict Drop); MF-069 (A4 drops the cocktail-party effect); interactive perception tests. Rewrite every "Rewrite" verdict with Gemini's fix. | A2, A4 §6 | `status: skipped` with `skip_reason` |
| S12 | Add the missing topics: silent treatment, push-pull, how narcissists test boundaries, love-bombing red flag, body-language attraction cues (pupils, feet), lying cues (myth-busting), eldest-daughter/oldest-child role, heartbreak. | A3 missing topics; A4 hook 13; A7 §I and §IV.1 | new Shorts; existing ones (trauma bond, attachment, grey rock, negging, parentification, people-pleasing, DARVO) kept |
| S13 | Every Short closes with a comment question. | A1 §1; A5 "ending with the on-screen question" | `pinned_comment` equals the question spoken last |
| S14 | No catchphrase outro: the sign-off "...and that's the mind for you. Stay curious, stay sharp." is deleted; the Short ends on the closing question and cuts abruptly, looping back to the first frame (`ending: LOOP`). | A9 "Eliminate the Shorts Outro Penalty" | checker: sign-off absent; word range 35 to 57 (lists 41 to 71) |
| S15 | No listicle setup in the opener ("Three things..."): open on the first fact. | A9 "Sharpen the Remaining Listicle Hooks" (D51, D52) | hook rewritten |

## Shorts: visuals
| # | Rule | Source | Bank field and check |
|---|---|---|---|
| V1 | 6 to 9 shots of about 5 to 6 s, no 2 to 3 s cuts: exactly 3 Veo clips (pattern interrupts, at about 40%, 70% and the end) and the other shots unique stills. Never a static Short. | A4 CR-6, §4; A8 "visual pattern interrupt"; your decisions of 12 and 13 Oct | `shots` 6 to 9 lines in `visual_beats` / `visual_brief.shots`; `clip_ids` 3, `still_ids` the rest; IDs unique |
| V2 | Shot 1 is a single moody still on a very slow push-in that already shows the moment (mid-action, frozen). | A4 §4 "first 3 seconds"; A8 "start mid-action" | beat 1 type still, move `slow push-in` |
| V3 | Moody, cinematic, atmospheric anime: rain, night, windows, one solitary figure, symbolic objects (shadows, rain on glass, an open door). Mood matches the topic. | A1 §3; A3 pattern 2; A4 "first visual"; A7 §II.3 | each beat names a light or weather cue; no bright showroom-type scenes for dark topics |
| V4 | Avoid low-stakes repetitive blocking (cups on tables, people looking at phones, people at desks or in cafés) and complex multi-character interactions. | A2 pattern 2; A3 pattern 2 | checker: banned blocking words; at most 2 characters per beat |
| V5 | Apply the per-topic visual fix from the audit tables. | A2, A3 column 6 | written into the beats |
| V6 | Slow camera moves only: slow push-in, slow pull-out, slow pan. | A1 §2 "slow panning"; A4 §4 Ken Burns | checker: move list |
| V7 | No two shots alike: adjacent shots differ in size (CU, Medium, Wide, Insert, OTS, Profile) or setting; no repeated shot. | your feedback 13 Oct ("too static") | checker: adjacent size+setting, duplicate shots |
| V9 | Visual variety: non-heavy topics are brightened (morning, afternoon, midday, golden-hour light, outdoor and well-lit settings); only Manipulation & Defense and dark-mood topics keep night and rain. | A9 "Fix Visual Monotony" | shot light cues; night and rain share dropped from about 70% of shots |
| V10 | Cast rotates: Alex and Maya are mapped to a rotating pool (Alex, Sam, Jordan, Chris, Ben / Maya, Jamie, Riley, Nina, Ella; culture-neutral names and looks), each with a fixed written look, so no Short pair repeats on every video. | your feedback 13 Oct | `character_looks`; checker LOOKS |
| V11 | Continuity: every named character appears in shot 1 or 2 (never first in the last third), and a shot's weather and time of day never contradict its light cue (no rain or umbrellas in a sunny shot). | your feedback 13 Oct (a character appeared from nowhere in shot 5) | checker V9, V10 |
| V8 | Every named character has a fixed written look (hair, skin tone, clothes, one distinguishing item) repeated in every prompt, so faces and clothes stay the same. | your feedback 13 Oct ("names neutral, not appearances") | `character_looks` on every Short; `characters` look block per long-form; checker |

## Shorts: packaging and metadata
| # | Rule | Source | Field |
|---|---|---|---|
| P1 | Description line 1 states the stakes and the benefit in plain words. | A8 metadata | `description_full` |
| P2 | Hedges and sources live in the description, not the narration. | A6 issue 2; A4 CR-7 | `source_line` |
| P3 | Tags carry little weight: 5 to 6. | A8 metadata | `tags` |
| P4 | No mascot anywhere (no Hoot or owl in descriptions, thumbnails or poses). | A1 §2; A4 CR-3; A5 violation 2; A6 issue 3; A7 §IV.3 | checker: "hoot", "owl", "🦉" absent |

## Long-form
| # | Rule | Source | Field |
|---|---|---|---|
| L1 | One compelling idea told as a story arc, not a list. Built from the strongest single fact of a listicle. | A8 "Storytelling & Structure", action 3; your decision | title has no item count; one character story from start to end |
| L2 | 10 to 15 minutes. Target 10 to 12 minutes, about 1,170 to 1,450 spoken words at 2.0 words/s with pauses, so one episode (6,400 to 6,900 voice characters) fits the 9,000-character monthly voice limit. | A8 "Video Length" | checker: estimated runtime 10:00 to 12:15 |
| L3 | No animated intro. In the first 30 s: confirm the viewer is in the right place, give value, say what is coming. | A8 "First 30 Seconds" | checker: cold open plus promise at most 36 s (72 words), with an "if you've ever ... this one is for you" line |
| L4 | Chapters in the description. | A8 | `[Chapter: …]` markers and the description chapter list |
| L5 | Title at most 60 characters, main keyword or hook first. | A8 "Titles" | `title_alts` and heading |
| L6 | Thumbnail: at most 3 to 4 words, high contrast, a face with clear emotion, readable at 120 px wide, does not repeat the title. | A8 "Thumbnails" | `thumbnail_text(s)`, `thumbnail_concepts` |
| L7 | Description 150 to 300 words; the first two lines hold the main keyword and the benefit. | A8 "Description" | `description` |
| L8 | Tags: 5 to 6. | A8 | `tags` |
| L9 | No research lecture in the narration (no years, named researchers, "studies show"); sources in the description. | A4 CR-7; A7 §IV.1 | checker |
| L10 | No mascot (no `hoot_hook_pose`, no `hoot_moments`, no Hoot in thumbnails). | A4 CR-3; A7 §IV.3 | checker |
| L12 | 6 to 12 Veo clip scenes per long-form (default 8), at least 3 scenes apart. | your feedback 13 Oct (clips must stay) | `scenes[].kind`, `clip_ids`; checker |
| L11 | Scene density: one unique scene still per about 28 words (gaps 9 to 42 words), at least 10 settings and 4 shot sizes, no repeated scene, each scene tied to a sentence of the script (`starts_at`), first scene at sentence 1. | your feedback 13 Oct ("reused stills serve nobody") | `scenes`, `scene_count`; checker |

## Not adopted, and why
| Audit point | Source | Why not |
|---|---|---|
| Apply a dark colour grade or vignette to every clip | A7 §II.3, §IV.3 | You reported the app's dark overlay as a defect (CR-87H). Moodiness comes from the light and weather written into each prompt instead. |
| Hold the last sign for 1.5 s of silence to inflate retention | A7 §IV.4 | A8 (the newer audit) says not to trick viewers into rewatching. |
| Text-only Shorts with no voice | A7 §I | Your channel is voiced; the audits that reviewed your actual Shorts (A5, A6) scored the voiced format 7.5 to 8.5. |
| Stickman workflow | A8 action 2 | Changes the whole art style; not a bank change. Your call later. |
| Low-opacity "@TheMindFiles" text watermark | A6 issue 3 | App render setting, not bank content (in the Claude Code note). |
| Phrase captions, banding glitch, frame-0 banner rendering, voice speed | A4 CR-1, CR-2, CR-4; A6 issue 1 | App work; already in CR-86 and CR-87; the bank supplies the text. |

## Where it is checked
`compliance_check.py` (checks the bank file) and `make_prompts_v4.py` (writes the shot, scene and thumbnail Flow prompts). Results: `GEMINI_COMPLIANCE_REPORT.md`. App changes: `GEMINI_COMPLIANCE_CR91.md`.

## A9. 2026 Viral Escape Rules (Gemini, 22 Oct 2026) — apply to NEW scripts
1. Target 22–25 s and 10 shots (about 2.4 s per beat). Existing 6–9 shot Shorts are not retrofitted; D43, D19, D23, D61, D16 are already rewritten.
2. No spoken closing question. The question lives in `pinned_comment` and a small bottom text overlay.
3. Loop bridge: the last spoken clause ends on an incomplete conjunction ("because", "otherwise", "that's why") that completes with the first words of the hook.
4. No floating bubbles, glowing shapes or unnamed figures. Two named characters from `character_looks` in a physical confrontation.
5. Frame Cognitive Bias and Persuasion topics around how a manipulator, toxic boss or partner uses them.
6. Title and description end with #shorts #psychology #DarkPsychology.
Checker: these curated scripts are waived on S1, S2, S3, S5, S6, S13 and V1 (shot count). Blocked props (phone, laptop, desk, coffee, table) are replaced with neutral ones in shot lines.
