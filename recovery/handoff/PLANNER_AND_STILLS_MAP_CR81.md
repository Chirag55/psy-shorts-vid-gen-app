# PLANNER_AND_STILLS_MAP_CR81.md
**App:** The Mind Files Studio. Written against the v4.7.0 bundle strings and the v2.9.0 brief (older). **Claude Code must read the current planner and stills-import code first and confirm each "Where" below before editing.**
**CR number:** CR-81 (CR-77 to CR-80 are in the same hand-off). The app's own numbering wins if 81 is taken.
**Three parts:** 81A planner never leaves a day empty. 81B long-form fill-in sheet. 81C one numbered master still prompt and automatic image mapping.

---

## 81A. Planner skips days (Topic Bank, "plan the queue")

### What I could verify (bundle strings in v4.7.0)
- "Topics that keep every rotation rule come first; the rest say what they'd break."
- "These topics can't be ordered without breaking a rotation rule. Swap one for another format or pillar, or re-plan." / "No order keeps every rule"
- "No plannable Short is left to take its day. Restore it any time: long-press it under Skipped."
- "Shorts go public at the primary slot, or the fallback if not ready in time; never after the latest time; never two Shorts within the gap." / "One long-form a week."
- "Nothing is scheduled yet; plan the queue in the Topic Bank to see the month."

I cannot see the planner code, so the cause below is a **likely** one, not confirmed.

### Likely causes (check in this order)
1. Hard rotation rules (format, pillar, cast, no two alike in a row) are treated as must-keep. When no topic fits a day, the day is dropped instead of filled with the least-bad topic.
2. The one-long-form-a-week rule reserves a day, but no long-form is ready, so the day stays empty.
3. Topics with `status: published`, "Skipped", or missing upload metadata are excluded, leaving too few candidates for the month.
4. The bank has few topics in some pillars, so the rotation runs out of that pillar before the month ends.
5. Days that already hold a project or an unfinished project are counted as "taken" but show nothing.

### Change
1. **Every day in the plan window gets exactly one of:** a Short, a long-form, or a visible reason. Never a silent gap.
2. **Soft fallback.** Pass 1 keeps every rotation rule. If a day cannot be filled, pass 2 relaxes rules in this order: pillar repeat, format repeat, cast repeat, then the minimum spacing. Never relax: published/skipped status, narration, the 2-per-day gap, the latest posting time.
3. A day filled in pass 2 shows an amber chip: "Breaks: pillar repeat (Manipulation twice in a row)". One tap swaps it for another topic.
4. If no topic is left at all, the day shows "Bank empty: refill (8 ideas)" with the refill button, not a blank.
5. A reserved long-form day with no ready long-form shows "Long-form due: pick LF-xx" and falls back to a Short after 24 hours unless pinned.
6. **Plan summary line** at the top: "30 days: 26 clean, 3 relaxed, 1 empty (bank empty)". Counts must add up to the window length.
7. **Debug view** (Settings, off by default): per day, list the topics rejected and the rule that rejected each. This is how to confirm the real cause.

### Acceptance
- Plan 30 days from the v2.4 bank (43 Shorts, 2 published): the summary adds up to 30 and no day is blank.
- Remove all but 5 topics: days 6 to 30 each show "Bank empty", not blank.
- Pass 2 never schedules a published or skipped topic.
- Debug view lists a rejection reason for every unfilled or relaxed day.

---

## 81B. Long-form fill-in sheet ("structure that is easy to fill")

### What
A single sheet per long-form, filled mostly by the app from the bank's visual plan, so the user only completes blanks. One row per chapter beat.

| Field | Filled by | User action |
|---|---|---|
| `Beat #` and chapter title | App, from bank | none |
| `Narration lines` (word count, seconds) | App, from script | none |
| `Setting` (one of 2 to 3 allowed) | App, from bank `visual_plan` | change by dropdown |
| `Cutaway object` | App, from bank | change by dropdown |
| `Cast on screen` (Alex, Maya, Leo, none) | App, from bank | change by dropdown |
| `Visual type` (still, Flow clip, drawn card) | App rule: cards drawn, up to 3 beats per still, max 6 clips | change by dropdown |
| `Still #` / `Clip #` | App, auto-numbered | none |
| `Status` (empty, prompt copied, imported) | App | none |

Rules:
1. Blank cells are highlighted red and counted: "9 blanks left". The sheet is complete at 0.
2. Nothing in the sheet asks the user to write a prompt. Prompts are generated from the row (81C).
3. Rows reuse CR-77's diversity lint (no two adjacent rows with the same setting and cutaway) and show the amber chip inline.
4. A "Fill blanks for me" button asks the model once to propose values for all blanks, shown as a diff to accept or reject.
5. Sheet exports to and imports from one text file, so it can be edited outside the app.

### Acceptance
- LF-03 opens with all 38 beats pre-filled from the bank, at most 15 stills and 6 clips, blanks = 0 or a short list.
- Changing a setting regenerates only that row's prompt.

---

## 81C. One numbered master still prompt, automatic image mapping

### Master prompt (export)
Button on the long-form Visuals step: **"Copy master stills prompt"** and **"Save as .txt"**.

Format, one still per line, no blank lines inside a block:

```
S001 | <locked style prefix> <scene sentence> <cast identity block if cast shown> <shot grammar>
S002 | ...
```

Rules:
1. Number is **three digits, zero padded**, sequential in story order: `S001` to `S0NN`. Not renumbered after export unless the user re-exports (then the app marks the old mapping stale).
2. Style prefix from `ANIME_STYLE_AGENT_INSTRUCTIONS.md` section 2 on every line. Cast identity blocks appended by the app (CR-77/78). No readable text, no Hoot, per the instructions file.
3. The number appears **first** in each line so a batch-queue extension that names files by prompt text or index carries it through.
4. Two files exported together:
   - `stills_master_prompt.txt`: the lines above, one per line (for Flow queue extensions and pasting).
   - `stills_manifest.json`: `[{"id":"S001","beat":3,"seconds":4.2,"cast":["alex"],"hash":"<sha1 of prompt text>"}]`.
5. Header comment at the top of the paste text, one line, ignored by Flow: "Generate one image per numbered line. Keep the number order."
6. Cost line before export: "N stills. Flow images use no clip credits." (Gemini API option still shows "about $0.039 each".)

### Import the whole downloaded project
Button: **"Import Flow download"**. Accepts a `.zip`, a folder, or multi-select of images.

Matching, in this order, per file. The first rule that gives a single unique answer wins:

1. **Number in file name**: `S001`, `S_001`, `scene-001`, `Scene_01`, `001_` at the start. Parse the first 1 to 4 digit number. Zero-pad and map to `S###`.
2. **Prompt text in file name**: queue extensions name files with a slug of the prompt (for example `scene-001_img01_<prompt words>.png`). Fuzzy match the slug to the manifest prompts (normalized words, Jaccard at least 0.6). Unique best wins.
3. **File name order**: sort natural by name; if the count equals the manifest count, map in order.
4. **File modified time order**, same count condition.
5. Otherwise the file is **unmatched**.

Rules:
- **Never silent.** After matching, always show a confirmation grid: thumbnail, matched ID, method used (number / text / order), and a confidence chip. Rules 3 and 4 show amber.
- Duplicates (two images for one ID, because Flow gives several variants): show all variants for that ID, auto-pick the first, one tap to switch.
- Missing IDs: listed as "Missing: S014, S027". A missing still is covered by the one before it (existing app behavior), and "Generate missing" copies a prompt file with only those lines.
- Extra or unmatched files: shown at the bottom, drag onto a slot or discard.
- Drag-to-reorder any thumbnail onto another slot to fix a wrong match.
- Image size check: warn if short side is below 1080 px.
- The existing "matched in the order you tap them" import stays as a fallback for single stills and Shorts.
- Mapping is saved on the project, so re-importing the same download does not duplicate.

### Test I could not run (assumption)
Flow's own "Download all" may give generic names (no number, no prompt text). In that case rules 3 or 4 apply and **order may differ from prompt order** if the user regenerated or re-sorted images in Flow. That is why the confirmation grid is mandatory. Recommended user setup, no code: use a Flow download extension that names files by prompt index or selection order (Flow Download Speed: Scene_01 style; AutoFlow / Batch Gen: scene-001 style). Both are covered by rule 1.

### Acceptance
- Export for LF-03: a `.txt` with one line per still, IDs `S001` to `S0NN` contiguous, each line starts with the style prefix after the ID, and a manifest with the same count.
- Import tests with synthetic files:
  - `Scene_01.png` to `Scene_12.png` map to `S001` to `S012`, method "number".
  - `scene-003_img02_<prompt words>.png` maps to `S003`, method "number".
  - Generic `image (1).png`, `image (2).png` with equal count map by order, shown amber.
  - 14 files for 12 IDs: 2 extras shown unmatched, nothing auto-assigned wrongly.
  - Two files for `S005`: both shown, first picked.
  - Re-import the same zip: zero duplicates.
- The confirmation grid cannot be skipped; "Apply" is disabled until the user taps it once, even if everything is green.
- No prompt line contains readable text instructions, Hoot, or a city or country (CR-78 lint).

---

## Implementation order inside CR-81
1. 81A (small, fixes the empty days and adds the debug view).
2. 81C export (numbered prompts and manifest).
3. 81C import and confirmation grid.
4. 81B sheet (builds on the export).

## Do not change
Narration text, evidence tags, scheduling time zone (Asia/Kolkata), published projects, CR-79 rules (cards never go to image generation, up to 3 beats per still).
