> **Updated by CR-88 (read ALGORITHM_REVIEW_CR88.md):** flagship runtime is now 10:00 to 11:30 (section C below said 8:00 to 9:30), titles are 60 characters or fewer (CR-60 said 70), the thumbnail template is replaced (88G), LF-03 opens on a mid-scene cold open, and its thumbnail text is WHY YOU APOLOGIZE. The episode is now fully written in the bank, and the old "item copy assembly" is replaced by CR-90 (`LONGFORM_SCRIPTS_CR90.md`). Everything else here still applies.

# FLAGSHIP_LONGFORM_CR77.md
**App:** The Mind Files Studio (Android, single user, no server)
**Built against:** v4.7.0 (versionCode 53). Strings in its JS bundle reference CRs up to CR-76, so this is **CR-77**.
**Input file:** `psychology-shorts-topic-bank-v2.md`, now schema **2.3** (43 Shorts, 6 long-form plans; LF-03 flagged flagship)
**Goal:** produce **one** long-form with the best chance of breaking out: **LF-03, "6 Manipulation Tactics Someone Is Secretly Using on You"** (title re-checked in vidIQ, section 1A). Also fix the planner behavior that made the last long-form look repetitive.

> **CR numbering:** the app's own numbering is authoritative. Older planning docs written outside the app (MINDFILES_LONGFORM_PLAYBOOK.md, CR-58 to CR-67) reuse numbers the app has since assigned to other work. Treat those as ideas, not CR numbers. Their content that still matters is folded in here.

---

## 1. Why LF-03 (evidence)

Sources:
- YouTube public data pulled through Supermetrics on 1 Oct 2026 (competitor channel uploads and search results)
- `OUTLIER_REPORT_ACTIONS_BRIEF.md` (765 Shorts scanned, 2026-10-03)
- `COMPETITOR_FORMAT_BRIEF.md`

A fresh Psych2Go pull was attempted for this CR but not approved in-session, so Psych2Go figures come from the format brief.

| Signal | What the data shows | LF-03 fit |
|---|---|---|
| **Format** | Psych2Go's biggest videos are numbered "Signs" titles addressed to "you", and evergreen search titles keep earning | Numbered + "you" title, with a "Signs" variant in Test & Compare |
| **Search demand** | Manipulation long-forms: "Every Manipulation Tactic in 16 Minutes" 3.75M; "Every Manipulation Technique & How To Combat It Explained" 2.8M | Same demand, our defensive framing |
| **Keyword families** | "dark psychology" and "psychology tricks" each hit 28% in the outlier report; "harder to manipulate" got 629K from a 48K-sub channel | LF-03 sits in that family, and its outro (MF-037) is the "harder to manipulate" topic |
| **Identity pull** | "Psychology of People Who Go Quiet When They're Hurt" reached 2.37M on a cartoon channel | The hook ("you always end up apologizing") is an identity line |
| **Weaker alternatives** | Persuasion "used on you" long-forms top out around 0.44-0.47M for faceless list channels; cognitive-bias lists made in 2024-25 got 37-46K | LF-01 and LF-05/06 are weaker first bets |

**Honest ceiling:** nobody can guarantee a viral video. A new channel's typical first long-form gets hundreds to low thousands of views. This CR maximizes the odds on one upload and makes the result measurable.

### 1A. vidIQ check (5 Oct 2026, 20 credits used; balance now 0, 150 renew on 21 Oct)

**Keywords (US research):**

| Phrase | Monthly searches | Trend vs 30-day baseline | Competition |
|---|---|---|---|
| manipulation tactics | ≈77,354 | **+46%** | 48.5 |
| psychological manipulation | ≈35,337 | +16% | **38** (low) |
| signs of manipulation | ≈13,085 | – | 40.5 |
| signs someone is manipulating you | ≈4,164 | – | 40.8 |
| gaslighting | ≈77,354 | −29% | 56.5 |

**Question searches:**
- "how to spot the 6 darkest manipulation tactics" ≈7,129/month: exactly six items.
- "why you always fall for the same manipulation" ≈5,398/month, competition 16: matches our apologizing hook.

**Outliers, last 6 months (long-form):**
- **Plain listicles in this exact format are weak right now:**
  - "6 Manipulation Tactics That Leave You Questioning Yourself": 4.2K views on an 85.6K-sub channel
  - "The Dark Psychology of 'Quiet Manipulation'" (same tactics as ours): 3.2K views
- **Breakouts frame the viewer as the hero or the target:**
  - "5 Signs You're Impossible to Manipulate (Psychology Explains Why)": 61.7K views on a 4.7K-sub channel, breakout 136×
  - "Stop Being Nice To People Who Do These 5 Things": 44.9K on 489 subs
  - "When Someone Wants You Out of Their Life, These 2 Signs Appear": 130K on 36.8K subs
  - Mel Robbins, "4 Hidden Signs You're Dealing With a Toxic Person": 1.35M

**Thumbnails:** an illustrated character plus "N signs" text is common in the niche, not unique. Similar-looking thumbnails on small channels reached 48K-119K views when the title had an identity hook ("Than You Think", "Backed By Psychology", "Brutal").

**What changed because of this check:**
1. **Default title** is now "6 Manipulation Tactics Someone Is Secretly Using on You". It leads with the rising 77K keyword and uses "secretly" (a proven word in recent breakouts). It drops "quietly", which collides with the weak "quiet manipulation" video.
2. **Test & Compare alternatives** carry the identity framing that wins right now:
   - "Why You Always End Up Apologizing (6 Dark Manipulation Tactics)", matching the low-competition question search
   - "6 Signs Someone Is Secretly Manipulating You (Psychology Explains)", the Psych2Go pattern plus the winners' parenthetical
3. **Thumb text:** 6 DARK TACTICS (alternatives: WHY YOU APOLOGIZE / 6 SIGNS).
4. **Next long-form after LF-03:** expand MF-037 into "Signs You're Impossible to Manipulate". It's the empowerment angle with the strongest breakout in this pull.

---

## 2. What went wrong with the last long-form render

The complaint was "the same stock reaction on every clip, only the background changing". These are the instructions currently in the v4.7.0 planner (read from the app bundle) that produce exactly that:

1. **Continuity rule.** "Clips after the first must open with 'Continuation of previous clip: The exact same character [restate face, hair and wardrobe]...'". Every clip starts by re-describing the same person, so the model makes a near-identical character shot each time.
2. **No cutaways in clips.** "Spend them on shots where the character moves and carries the performance, never on a cutaway." Objects, screens and props, which are what makes items look different, are pushed out of the video clips.
3. **Narrow settings.** "Use 2-3 settings, named identically each time." This suits a 40-second Short. Applied to an 8-minute episode with six items, it guarantees repetition.
4. **Two style instructions.** The planner says "footage is anime", while a flat-editorial style lock (written for the MF-L-01 remake) is also in the app. Mixed instructions give inconsistent looks.
5. **Same-shaped items.** Every item is vignette → explanation → defense. That's fine for the script, but the visuals have to break the pattern deliberately.

---

## 3. Changes (CR-77)

### A. Long-form planner rules (Shorts unchanged)
1. **Identity by reference, not restatement.** Replace the continuity-phrase rule for long-form. The app appends the cast identity block (from the cast lock) itself. Prompts describe **the action, framing and setting only**.
2. **Cutaway quota.** Every item gets at least one cutaway: an object, screen or symbolic image from the bank's `Cutaway object` column. It can be a still or a clip.
3. **Per-item settings.** Each item uses its own setting from the bank's visual plan. No two consecutive items share a setting. The 2-3-settings rule applies to Shorts only.
4. **Protagonist share.** At most 40% of an episode's shots show Alex's face. The rest are other cast members, hands, objects, cards and Hoot reactions.
5. **Diversity lint, before any credits are spent.**
   - **Similarity:** any two visual prompts with a word-overlap (Jaccard) score of 0.55 or more get regenerated.
   - **Framing:** a camera move or framing can't repeat within any 3 consecutive shots.
   - **Report:** the lint lists the offending pairs so they can be fixed.
6. **Shot grammar per item (in order):**
   1. Number card
   2. Vignette performance (clip or still)
   3. Cutaway
   4. Study card (named source)
   5. Three on-screen bullets (numbered-list Shorts only)
   6. "Protect yourself" defense card, with a Hoot pose change

### B. One style per long-form
Long-form uses the channel's existing anime cast style lock, so Shorts and long-form match. Retire the flat-editorial lock for long-form. Keep it only if a future episode is explicitly "symbolic stills".

### C. Runtime for flagship episodes
For episodes with `flagship: yes`, the CR-61 runtime check becomes **8:00-9:30** (warn outside). Flagship vignettes are 4-5 sentences with one line of dialogue (bank v2.3). Non-flagship episodes keep 5:00-8:30.

### D. Importer (patch to CR-63)
Accept these optional LF fields:
- `Flagship`
- `Hook alt`
- `Title alternatives`
- `Thumb text`
- `Thumb text alternatives`
- `Pattern interrupt`
- `Recap line`
- `Care line`
- `Comment question`
- `Next-episode teaser`

Also accept the second table, **Visual plan** (`# | Setting | Cutaway object | Chapter label`).

Rules:
- Validate that the visual plan has one row per item.
- The chapter labels feed the CR-61 auto-chapters.
- v2.2 files still import; the missing fields default to empty.

### E. Credits
LF-03 obeys the existing long-form credit cap. Section 4 spends about 120 Flow credits on **6 Veo clips**; everything else is Gemini-app stills and free cards. Keep the existing pipeline order: stills → zero-Veo preview → Veo clips.

---

## 4. LF-03 shot list

- **Style:** channel anime cast lock (appended by the app).
- **Hoot:** never in prompts; overlay only.
- **Shot types:** V = Veo clip, S = Gemini-app still, C = app card (free).

| # | Segment | Type | Visual |
|---|---|---|---|
| 1 | Hook | V | Café table: Alex mid-apology, hands open, Leo turned away with arms folded; slow push-in |
| 2 | Hook | V | Macro insert: Alex's thumb typing "sorry" on his phone, then pausing |
| 3 | Hook | C | "6 SIGNS" count card |
| 4 | Item 1 | C | Number card 1 |
| 5 | Item 1 | S | Shared kitchen, evening: Leo leaning on the counter, listing favors on his fingers; over-shoulder from Alex |
| 6 | Item 1 | S | Cutaway: electricity bill with a sticky note on the counter |
| 7 | Item 1 | C | Study card: guilt appeals and compliance (O'Keefe, 2000) |
| 8 | Item 1 | C | 3 bullets (from MF-032) + "Protect yourself" card |
| 9 | Item 2 | C | Number card 2 |
| 10 | Item 2 | S | Sofa, lamp light: Leo laughing it off, Alex frozen mid-sentence; wide two-shot |
| 11 | Item 2 | S | Cutaway: phone chat history scrolling (unreadable), notebook with dates beside it |
| 12 | Item 2 | C | 3 bullets (from MF-025) + "Protect yourself" card |
| 13 | Item 3 | C | Number card 3 |
| 14 | Item 3 | V | Rooftop café at dusk, string lights: Leo arrives grinning with a wrapped gift; whip pan to Alex's surprised smile |
| 15 | Item 3 | S | Cutaway: calendar with day 4 circled, gift box beside it |
| 16 | Item 3 | C | 3 bullets (from MF-023) + "Protect yourself" card |
| 17 | Interrupt | C | "Which of these has happened to you so far? Comment the number." (Hoot pointing) |
| 18 | Item 4 | C | Number card 4 |
| 19 | Item 4 | V | Overhead: phone on a nightstand lights up with "Seen", no reply; Alex turns over in bed |
| 20 | Item 4 | S | Leo laughing with other roommates in the hallway while Alex stands apart; low angle |
| 21 | Item 4 | C | Study card: Cyberball ostracism experiment (Williams et al., 2000) |
| 22 | Item 4 | C | "Protect yourself" card |
| 23 | Item 5 | C | Number card 5 |
| 24 | Item 5 | S | Office desk, daytime: Alex glancing at his phone between emails; rack focus phone → face |
| 25 | Item 5 | S | Cutaway (symbolic): slot-machine reels mid-spin, no text |
| 26 | Item 5 | C | Study card: variable-ratio reinforcement (Skinner) |
| 27 | Item 5 | C | "Protect yourself" card |
| 28 | Item 6 | C | Number card 6 |
| 29 | Item 6 | V | Café table: Leo's posture flips from defensive to wounded as he turns away; Alex reaches out; Maya watching in soft focus; rack focus |
| 30 | Item 6 | S | Cutaway (symbolic): a balance scale tipping the other way |
| 31 | Item 6 | C | Study card: DARVO (Freyd) + D / A / RVO letters card |
| 32 | Item 6 | C | "Protect yourself" card |
| 33 | Recap | C | Six-line checklist card (recap line) |
| 34 | Outro (MF-037) | S | Maya and Alex on a park bench, Maya counting three fingers; medium shot |
| 35 | Outro (MF-037) | C | 3 skills bullets: name it / delay / practice |
| 36 | Outro | V | Alex closes his laptop, stands and walks out into daylight with Maya; handheld drift |
| 37 | Care | C | Care line card (spoken too) |
| 38 | End | C | End card: LF-04 teaser + subscribe |

**Totals:**
- 6 Veo clips (≈120 credits)
- 10 stills
- 22 cards

There are 7 distinct settings, an object cutaway in every item (item 4's is the phone clip), and Alex's face appears in about a quarter of shots.

**Hoot poses (manifest v2.0.0):**

| Moment | Pose |
|---|---|
| Hook | worried |
| Number cards | glance |
| Study cards | pointing |
| Item 6 reveal | shocked |
| Interrupt | pointing |
| Recap | idea |
| Care line | idle |
| Sign-off | wave |

---

## 5. Packaging

| Field | Value |
|---|---|
| Title (default) | 6 Manipulation Tactics Someone Is Secretly Using on You |
| Title alternatives | Why You Always End Up Apologizing (6 Dark Manipulation Tactics) / 6 Signs Someone Is Secretly Manipulating You (Psychology Explains) |
| Thumb text | 6 DARK TACTICS (alternatives: WHY YOU APOLOGIZE / 6 SIGNS) |
| Tags (lead) | manipulation tactics, psychological manipulation, signs of manipulation, how to spot manipulation, toxic relationships |
| Thumbnail image | Alex mid-apology, Leo turned away, Hoot worried on the panel edge (the app's 16:9 card template) |
| Chapters | From the visual plan's chapter labels, first at 0:00 |
| Description | Line 1 from the bank, chapters, sources (each item's `evidence`), care line, links block |
| Pinned comment | Comment question from the bank |

All titles pass CR-60 (count = items, ≤70 characters, "you", keyword). Run CR-62 against the competitor cache before publishing; if a title hits amber, use the next alternative.

---

## 6. Launch sequence

1. **Publish the feeder Shorts first,** in the bank's v2.3 first-10 order. By post 7, five of LF-03's six item Shorts are live.
2. **Community poll** 3 days before: "Which is hardest to spot: guilt trips, silent treatment or hot and cold?"
3. **Publish LF-03** at least 48 hours after MF-025 (CR-63 rule), in the long-form slot.
4. **Test & Compare:** 3 thumbnails + 3 titles.
5. **Instagram:** a 30-45 s cliffhanger Reel from item 3, "full story on YouTube" (CR-51).
6. **Turn on auto-dubbing** in Studio and upload the narration as captions (existing caption-track step).

---

## 7. Measure (no guessing)

| When | Check | Action if weak |
|---|---|---|
| 48 h | Click rate vs channel median | Swap thumbnail and title via Test & Compare |
| 48 h | Viewers still watching at 0:30 | Next episode: rework the hook, not the items |
| 7 days | Average % viewed and the drop-off point | If viewers leave at a specific item, move that tactic later or cut it next time |
| 7 days | Comments quoting a number | Add the most-quoted item as a Short sequel |

Record results as a proposed lesson (CR-57). Never apply it automatically.

---

## 8. Acceptance

- v2.3 imports: 43 topics, 6 plans, 0 rejected, 0 needs_fix. LF-03's visual plan has 6 rows, and the `lf_item` values match the new order.
- LF-03's generated shot plan passes the diversity lint: no prompt pair at 0.55 or above, no repeated framing within 3 shots, protagonist at 40% or less, a cutaway in every item, no two consecutive items sharing a setting.
- No long-form prompt contains "Continuation of previous clip" or the flat-editorial style lock.
- Runtime between 8:00 and 9:30. Chapters, sources and the care line (spoken and in the description) are present.
- Flow spend for LF-03 is at most the long-form cap. The zero-Veo preview was rendered before any Veo request.
