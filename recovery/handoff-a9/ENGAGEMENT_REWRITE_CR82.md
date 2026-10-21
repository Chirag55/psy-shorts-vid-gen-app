> **Updated by CR-83:** six beats (3 clips + 3 stills), bank v3.0 (70 Shorts), lint is `lint_bank_v3.py`. See BANK_V3_REDO_CR83.md where this file differs.

# ENGAGEMENT_REWRITE_CR82.md
**App:** The Mind Files Studio (built against v4.7.0). **CR number:** CR-82 (follows CR-81; the app's own numbering wins).
**Goal:** Shorts that are catchy, relatable, citation-free in the voice, and visually varied. Done in the **bank** (v3.0, no code needed) and in the **app** (this CR).

---

## 1. What was done vs what needs code

| Problem you raised | Fixed in bank v3.0 / style file now | Needs Claude Code |
|---|---|---|
| Boring, study-recap narration with citations | **Yes**: 41 Shorts rewritten, no study names, years or "researchers" | Lint + generator rules (82A, 82B) |
| Not relatable | **Yes**: every Short opens on a viewer moment | Generator rules (82B) |
| Not catchy (hooks, titles) | **Yes**: hook, hook_alt, hook_text and yt_title rewritten | Title lint already in CR-80A |
| Monotonous stills and clips | **Yes**: 6 `visual_beats` per Short + style file section 5B | Planner must use them (82D) |
| Credibility lost when citations leave the voice | **Yes**: new `source_line` field | Put it in the description (82C) |
| Dead tail from the sign-off, flat pacing | No | 82E |
| No way to see what competitors' videos look like | Script written (section 6) | You run it |

Not rewritten: **MF-024 and MF-038** (already published), long-form plans LF-01 to LF-06 (LF-03 is covered by CR-77).

---

## 2. Evidence: 150 competitor Shorts (YouTube public data, 8 Oct 2026)

Three searches ("psychology facts #shorts", "dark psychology tricks shorts", "signs he likes you psychology shorts"), 49 results each. **Titles, durations, views, likes only. Nobody has watched the pictures** (see section 6).

| Finding | Number |
|---|---|
| "Psychology facts" Shorts with 1M+ views | 18 |
| ...of which 25 seconds or shorter | **13 of 18** (typical length 9 to 23 s) |
| "Signs he likes you" Shorts with 1M+ views | mostly **25 to 40 s**, a few 10 to 14 s |
| Biggest results overall | a **face-led creator** (OnlyJayus, 35 to 47 s, 2.4M to 45M views) |
| Shorts uploaded in 2026 reaching 1M+ | **none** in these three pulls (best: 632K, 415K, 386K) |
| Typical 2026 clone of "5 signs he likes you" | 5K to 40K views |

Patterns in the winners' **titles and openings** (visible without watching):
1. Open sentences addressed to the viewer or a scenario: "when a guy is in love with you...", "If a person makes direct eye contact with you...", "If a boy really likes you he will...".
2. Relationship and crush content dominates; "dark psychology" is crowded and mostly small.
3. No jargon in the title. Concept names (anchoring, reciprocity) never appear in the mega-viral ones.
4. Emoji or a feeling word ("secretly", "hidden", "never forget").

What this means for us (inference, not proof): our old Shorts were 35 to 45 s concept lectures with study names, while the winners are shorter, scenario-first and name-free. The "stayed to watch 39.6%" number from your Studio is consistent with that, but only your own A/B data (CR-80I) will confirm it.

**Saturation warning:** the exact templates "5 signs he secretly likes you" and "5 dark psychology tricks" are cloned hundreds of times in 2026 and rarely break 40K. Differentiate by **specific scene** ("forty messages by lunch, forever by Friday"), not by topic.

---

## 3. The new Short format (bank v3.0)

Order of the spoken text (46 to 66 words, about 20 to 28 s; numbered and compilation Shorts up to about 75):
1. **Viewer moment or open claim**, 12 words or fewer, no jargon.
2. **Name it** ("That's the foot-in-the-door technique.") by sentence 2 or 3.
3. **One plain reason it works.** No study, year, author or "researchers".
4. **One thing to do or watch for.**
5. Sign-off line (unchanged for now; see 82E).

**Before and after, MF-001**

Old (v2.4): "That tiny yes you gave was a setup. It's called the foot-in-the-door technique. In 1966, researchers asked homeowners to put a big, clumsy sign on their lawn. Only about one in six agreed..." (87 words, a study recap)

New (v3.0): "You said yes to a tiny favor. Now you're helping someone move. That's the foot-in-the-door technique. Once you've agreed to something small, your mind wants to stay the kind of person who says yes. So the next ask can be bigger. When a tiny favor shows up, ask: what is this a step toward?" (54 words)

Credibility is kept in the new `source_line` field ("Based on Freedman & Fraser, 1966. Evidence: strong.").

---

## 4. Changes for Claude Code

### 82A. Importer and lint (bank v3.0)
1. Import new fields `source_line` and `visual_beats` (schema 2.5). Keep v2.2 to v2.4 files importable (fields optional).
2. **Citation lint (red) on Short narration:** reject or flag `\b(19|20)\d\d\b`, `researchers?`, `\bstud(y|ies)\b`, `experiments?`, `psychologists?`, `et al`, `journal`, `professor`. Allowed: "research is mixed", "backed by research" (hedges), and a famous historical anecdote without a year (for example Ben Franklin).
3. **Length lint:** standard Shorts 46 to 66 words; numbered or compilation up to 82 words (amber above, red above 90).
4. **Hook lint:** first sentence of `hook`, `hook_alt` and narration 12 words or fewer; the narration starts with the `hook` sentence; `hook_text` 2 to 6 words.
5. **Beats lint:** exactly 6 beats (3 clips + 3 stills); at least 3 different settings; no neighbouring beats with the same shot size; no text in the culture list (CR-78).
6. All of the above is already satisfied by the 41 rewritten entries; the lint script used is in the hand-off (see `lint_bank_v3.py`).

### 82B. Script generator (topics the app writes itself)
Replace the Shorts script prompt with the format in section 3. Hard rules in the prompt:
- "Open with a moment the viewer has lived. Do not open with a definition, a name, a year or a study."
- "Never mention researchers, studies, experiments, universities, journals, years or author names. State the effect as plain fact; hedge only if the topic's `evidence` is mixed or debunked."
- "46 to 66 words before the sign-off. Second person. Sentences of 12 words or fewer."
- "Name the tactic by the second or third sentence."
- Also generate `source_line` (author, year, one-line finding) and 6 `visual_beats` in the format `shot size | setting | subject and action | camera`.

### 82C. Description and pinned comment
Add `source_line` to the YouTube description as a line near the bottom: "Source: ...". Keep it out of the voice. (Builds on CR-80C; still no "coming soon".)

### 82D. Shot planner uses `visual_beats`
1. If a topic has `visual_beats`, the planner uses them as the 5 scene sentences (verbatim), then adds the style lock and identity blocks. It only invents beats when the field is empty.
2. Each beat is shown **twice** (wide or slow move, then punch-in on the key detail), so there is a cut at least every 2.5 s (CR-80J item 10). No extra images.
3. Quotas per Short: at most 2 shots with a face; at least 1 POV, 1 insert; never the same still motion on neighbouring beats (push-in, pull-out, pan, tilt).
4. Mark the beat nearest 40% of the runtime as the **pattern interrupt**: whip pan or split frame.
5. Reuse the CR-77 diversity lint (Jaccard 0.55) across a Short's beats.
6. Clips (Veo): the 3 clips go to beats 1, the pattern interrupt, and the last beat; the other beats are stills.
7. Prompts follow `ANIME_STYLE_AGENT_INSTRUCTIONS.md` section 5B (colour accent per Short, different light per beat, calm top 20% for hook text, clear bottom-left for Hoot).

### 82E. Pacing and sound
1. Shorts target 20 to 28 s. Show a warning above 32 s.
2. **Sign-off:** add a setting "Spoken sign-off on Shorts: off / on". When off, the app renders the sign-off as end-card text (1.5 s) instead of voicing it, and the narration validator accepts both forms. (Saves about 4 s of the weakest part.)
3. Sound design: a short whoosh at each cut and a quiet music bed (CR-80J). Rule: no silence over 0.45 s.
4. **Loop ending:** the last spoken sentence should echo the first (the existing "loop ending" option should default on).

### 82F. Measurement
Log `schema_version` and `format = scene-first` on each Short. After **5 Shorts** in the new format, compare "stayed to watch" with 39.6% (old). Judge at 72 hours and 7 days (CR-80I).

### Acceptance
- Importing bank v3.0: 43 Shorts, 0 rejected; 41 have `visual_beats` with 5 beats; lint reports 0 red on narration.
- A generated Short script for a new topic passes the citation, length and hook lints on the first try in 4 of 5 runs.
- A rendered Short has a cut at least every 2.5 s (measure with scene detection), at most 2 face shots, and a visible pattern interrupt.
- The description contains the `source_line`; the voice track contains none of the banned words (check the transcript).

---

## 5. Bank v3.0 summary of changes
41 Shorts: hook, hook_alt, hook_text, yt_title, narration rewritten; `source_line` and `visual_beats` added; `evidence`, `ig_*`, `yt_title_alt`, `yt_hashtags`, `yt_pinned_comment` unchanged. Lint: 41 checked, 0 issues; narration 46 to 73 words. Citation terms (years, researchers, study, psychologist...) appeared in narration on **31 of 43** Shorts in v2.4; in v2.5 only the two published ones (MF-024, MF-038) still contain them.

---

## 6. How to actually watch competitor Shorts (what I could and could not do)

**Could not, from the cloud workspace:** YouTube is blocked for the shell, vidIQ has 0 credits until 21 Oct 2026, and there is no tool that plays video. So section 2 is based on titles, lengths and view counts only.

Options, best first:
1. **Gemini API on a public YouTube URL** (Google's "Video understanding" docs: public videos only; the free tier allows up to 8 hours of YouTube video per day). Run `watch_competitors.py` with `competitor_seed_ids.txt` (37 Shorts, including two of yours). It returns, per video: hook type, spoken and on-screen hook, cuts per 10 s, shot types, captions style, music and sound effects, whether it cites a study, relatability score, loop ending, and what is weak. Not run by me (no key or YouTube access here); the summary step is tested on mock data.
2. **vidIQ `watch_shortform_content`**: 10 credits per Short, after the reset on 21 Oct (150 credits = about 15 Shorts).
3. **Claude Code skills on GitHub** that wrap Gemini video understanding or YouTube transcripts exist in public skill registries; I only saw their listings, not their code, so review before installing. Transcript-only skills give words, not visuals.

After running (1), paste `results/summary.csv` (or the printed summary) into this chat and I will update the format, `visual_beats` rules and the lint thresholds with real cut rates and shot types.
