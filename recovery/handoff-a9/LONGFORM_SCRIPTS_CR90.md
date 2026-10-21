# LONGFORM_SCRIPTS_CR90.md
**CR-90: the six long-form episodes are fully written in the bank, and the app speaks them verbatim.** Read after CR-89. Date: 12 Oct 2026.

## 90A. What is now in the bank (no code needed to write them)
Every plan LF-01 to LF-06 has, in this order:
| Field or table | Used for |
|---|---|
| `Story arc (CR-88)` | One continuous story through the list |
| `Word budget (CR-90)`, `Target runtime` | Planner check (warn outside) |
| `Publish title`, `Title alternatives (Test & Compare)` (2 each), `Thumb text`, `Thumb text alternative`, `Thumb art`, `Tags (5 to 6)` | Packaging (CR-88G/H) |
| `Hook (first 15 s)` | Cold open, spoken first (LF-03 also keeps `Hook alt (A/B)`) |
| `Promise (by 30 s)` | Spoken second |
| Table `# / Short / Tactic / Vignette seed` | The vignette, now 4 to 8 sentences with dialogue, spoken after the number card |
| Table `# / Setting / Cutaway object / Chapter label` (visual plan, now on every plan) | Shots and chapter labels |
| Table `# / Item body / Where else you'll see it / Defence line` (item script, new) | Spoken after the vignette, in that order |
| `Pattern interrupt (after item N)`, `Recap line`, `Resolution`, `Care line` (LF-03), `Comment question`, `Next-episode teaser` | Spoken segments |
| `Suggested description line 1`, `Description body`, `Opening chapter label`, `Closing chapter label` | Description and chapters |

**Why the linked Short's narration is no longer pasted into the long-form:** the old rule (CR-77 "item copy assembly") removed each Short's first sentence, but the second sentence often depends on it ("Because you'd already watched half.", "Different outfit.", "Right?"), and MF-024's narration names its originator, which breaks the no-citation rule. Each item now has its own body written for the long-form.

## 90B. Exact speaking order (the app must follow this)
Cold open (Hook) > Promise > for each item: "Number one." + vignette + item body + where-else line + defence line; after the item named in `Pattern interrupt (after item N)`, the interrupt > Recap > Resolution > Care line (if present) > Comment question > Next-episode teaser > catchphrase ("Stay curious, keep your eyes wide, and remember: once you see the pattern, you hold the power.").
`assemble_longform.py` implements this order and is the reference. Run:
`python assemble_longform.py psychology-shorts-topic-bank-v2.md --out longform_scripts`
It writes `longform_scripts/LF-0N_script.md` (the spoken script with section labels, word count, estimated runtime, voice characters, and the full description with estimated chapter times and sources).

| Plan | Spoken words | Est. runtime at 2.1 words/s | Voice characters | Description words |
|---|---|---|---|---|
| LF-01 | 1,222 | 9:41 | 6,773 | 257 |
| LF-02 | 1,053 | 8:21 | 5,811 | 251 |
| LF-03 (flagship) | 1,348 | 10:41 | 7,628 | 272 |
| LF-04 | 1,073 | 8:30 | 6,020 | 227 |
| LF-05 | 960 | 7:37 | 5,536 | 205 |
| LF-06 | 951 | 7:32 | 5,356 | 245 |

## 90C. App changes (Claude Code)
1. **Importer:** read the new fields and the 4-column item script table; read the visual plan table on every plan (not just LF-03). All new fields optional, so older files still import.
2. **Script builder:** when a plan has an item script table, build the script exactly as 90B, verbatim, with no LLM rewrite. Use the generator (CR-88E rules) only for plans without it. Show on-screen bullets while an item body lists "One: ... Two: ... Three: ...".
3. **Chapters:** opening label at 0:00, each item's visual-plan `Chapter label` at the start of its number card, closing label at the recap, from real audio times.
4. **Description:** line 1, description body, chapters, "Sources and evidence" (each item's linked Short `evidence`), care line if present, then `#psychology #<FirstTagInCamelCase> #TheMindFiles`. Same as the assembler output.
5. **Visuals:** long-form is 16:9. Every long-form image or clip prompt ends with the 16:9 full-frame sentence (`FRAME16` in `make_prompts.py`), never the 9:16 one, and never mentions empty, soft or reserved areas. About one shot every 9 s (6 to 12 s each): roughly 70 shots for a 10-minute episode, for example 2 clips per item plus 35 to 40 stills, each still used at most twice with a different move. `max_stills` default 40 (raises CR-89C).
6. **Voice budget guard (CR-88F):** show the character count before generating (numbers above) and block when it exceeds the remaining allowance.

## 90D. Voice budget, measured
The 30 queued Shorts need 11,162 characters (about 9,400 with the sign-off as an end card); LF-03 needs 7,628. The current 10,000-character allowance (app stops at 9,000) cannot cover daily Shorts, even without long-form. See CR-88F for the options; this is Chirag's decision.

## 90E. Acceptance
1. `python assemble_longform.py psychology-shorts-topic-bank-v2.md --check` prints `all plans OK`.
2. `python lint_bank_v3.py psychology-shorts-topic-bank-v2.md` prints `82 Shorts in file, 80 unpublished checked, 0 with issues, 0 duplicate ids` (the lint now also runs the long-form checks: word budget, description length, chapters, table rows, banned citation words and culture terms in spoken text).
3. The app's built LF-03 script text equals `longform_scripts/LF-03_script.md` (section labels excluded), word for word.
4. LF-03 chapters: 8 entries, first at 0:00, each at least 10 s.
5. A long-form still prompt from the app ends with the 16:9 full-frame sentence.

## 90F. Honest limits
- The scripts were checked for budget, banned words and internal consistency, and read through once, but not voiced. Listen to the first voiced version and fix anything that sounds unnatural.
- Psychology claims follow the evidence tags of the linked Shorts; mixed or limited topics keep hedged wording ("often called", "a popular term, not a diagnosis", "it varies").
- Runtimes are estimates at 2.1 words per second; the calm voice pace setting (CR-86C) changes them.
