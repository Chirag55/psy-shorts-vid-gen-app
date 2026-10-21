# SHORTS_TRACTION_FIX_CR80.md
**App:** The Mind Files Studio (v4.7.0). Follows CR-77 (flagship long-form), CR-78 (cast), CR-79 (stills).
**Data:** YouTube public data for the channel, pulled 6 Oct 2026 (26 Shorts + 1 long-form), plus competitor Shorts searches. No YouTube Analytics data was available (vidIQ: 0 credits until 21 Oct; the connected Supermetrics source is public data only). Retention, viewed-vs-swiped, captions, visuals and audio were **not** analysed.

---

## 1. What the data says

### A. Views improved about 9x on 27 Sep. The cause is titles and topics.
| Period | Shorts | Median views |
|---|---|---|
| 13 to 26 Sep | 14 | **34** |
| 27 Sep to 4 Oct | 8 | **~310** |

### B. Best vs worst
| Title | Views |
|---|---|
| 3 Signs Someone Secretly Likes You | 1,143 |
| Why Your Friends Never Text First | 693 |
| Why You Blindly Copy Strangers | 615 |
| Your Brain Remembers Pain Wrong | 514 |
| Falling Fast? It Might Be a Tactic | 351 |
| Why Quiet People Notice Everything | 270 |
| 4 Rare Signs You're Emotionally Mature | 266 |
| *Named-effect titles:* Anchoring 13 · Scarcity 18 · Pratfall Effect 20 · Reciprocity 36 · Foot-in-the-Door 123 | 13 to 123 |
| *Body-language myth titles:* Crossed Arms 22 · Micro-Expression 24 · Eye Contact 32 | 22 to 32 |

**Pattern:** relationship, social-life and identity situations ("Why Your Friends…", "Signs Someone…", "Why Quiet People…") beat titles that lead with a concept name or a science label.

### C. Caveats (do not over-read)
- Small numbers, no retention data, and topic is mixed up with date and channel growth.
- Competitor demand backs the pattern: "signs someone likes you" Shorts reach 1.2M to 7.5M views; "why they never text first" reaches 0.5M to 1.7M (best cases).

### D. The last two Shorts (5 and 6 Oct) are 14 and 16 views, under one day old
Too early to judge. They do have a thinner package than the winners:

| | Winners (20 Sep to 2 Oct) | 5 and 6 Oct uploads |
|---|---|---|
| Description | Keyword sentence, a question to the viewer, subscribe line, long-form link, 3 to 4 hashtags | Title repeated, then **"Full file: coming soon"**, a source line, a generic subscribe line |
| Tags | 8 to 13 long-tail phrases ("signs your crush likes you", "how to know if someone likes you") | 5: pillar name ("Manipulation & Defense"), the title as a tag, "dark psychology", "psychology facts", "the mind files" |
| Title style | Plain situation | "(Prestige vs Dominance) #shorts #psychology" (bracketed jargon; the hashtags are fine) |

**Counter-evidence:** "Falling Fast?" (4 Oct) used the thin template and still got 351. So fix the template because it is free, but do not expect it to be the main cause.

### E. Engagement is very low
0 to 1 comment per Short, even at 1,143 views. Description questions are not visible in the Shorts feed.

### F. The funnel link is weak
Many descriptions point to "7 Brain Glitches You Experience Every Day": 3:54 long, 56 views, and a topic mismatch for relationship Shorts.

---

## 2. Changes

### CR-80A. Title lint (Shorts)
1. Titles lead with the **viewer's situation or a number**, never a concept name. Concept names go after a "|" at the end ("Why You Never Text First | Liking Gap").
2. Amber if the first 3 words are a named effect (Anchoring, Scarcity, Reciprocity, Pratfall, Foot-in-the-Door, Sunk Cost, and so on) or a science label.
3. No parenthetical jargon.
4. **Hashtags in the title: keep them.** Title = `yt_title` + ` #shorts` + up to 2 topical hashtags (3 total, no more). Your hashtagged Shorts had a median of 269 views vs 35 for unhashtagged ones (confounded with topic and hook text, so a test, not proof). About 3 in 4 of the Shorts in a competitor search for "signs someone likes you" also carry `#shorts #psychologyfacts` in the title. Validate hashtags against a typo list (the 5 Oct title had `#favts`). If the title would exceed 100 characters, drop hashtags before shortening the title.
5. Keep 70 characters or fewer.

### CR-80B. Hook default
For every bank entry with a `hook_alt` written as a viewer situation ("If a free sample made you feel you owed them…"), **use `hook_alt` as the default** and keep the concept-led hook as the alternate. Applies at minimum to MF-003, MF-004, MF-005 and any other entry whose narration opens on a concept name.

### CR-80C. Description template (Shorts), restore and improve
```
Line 1: One plain sentence with the main keyword and the viewer situation.
Line 2: The "so what" in one sentence.
(blank)
Question for the viewer (match the Short).
(blank)
Professor Hoot decodes one mind trick a day. Subscribe so you're never the one being played.
Full breakdown: <long-form title> <url>      <- omit this line entirely until the long-form is public
(blank)
Source: <evidence>
(blank)
#psychology #<topic> #shorts
```
- **Never publish "coming soon"** or any placeholder. If the long-form is not live, leave the link line out. The existing auto-update (CR-48) adds it later.
- **Link the matching long-form** (relationship Shorts to LF-03). Do not default to "7 Brain Glitches".

### CR-80D. Tags
- 8 to 12 tags: 5+ long-tail phrases people search ("signs someone likes you", "why friends never text first"), the concept, "psychology facts", "the mind files".
- **Never** include pillar names or the video title as a tag.
- Do not expect tags to be the lever. In your data, Shorts with 13 tags had a median of 37 views, 9 to 12 tags 123, and 8 or fewer 269 (one Short with no tags got 269). Keep tags specific rather than numerous.

### CR-80E. Engagement
1. Add a one-sentence spoken question before the sign-off on at least half of Shorts ("Which of these have you noticed?"). Keep total length within 25 to 45 s.
2. After publishing, show a task card: **pin a comment** with the question (the API cannot pin), then **reply to every comment in the first hour**.

### CR-80F. Topic mix for the next 10 Shorts
- Favor relationship, friendship, identity and emotional topics (like the winners).
- Keep the manipulation/defense Shorts (LF-03 feeders), but title them as situations: "Why You Always End Up Apologizing", not "DARVO".
- Park pure named-bias and body-language-science Shorts until retention data shows why they underperform.

### CR-80G. Do not do
- Do not delete, re-upload or heavily edit Shorts to chase views (resets signals, and deleted views stop counting).
- Judge each Short at **72 hours** and **7 days**, not 12 hours.

---

## 3. Studio check (5 minutes, closes the data gap)

In YouTube Studio, open Analytics, then Content, then Shorts. For the last 8 Shorts, write down:
- **Viewed vs swiped away** (%)
- **Average view duration** and **average % viewed**
- **Subscribers gained**

Rules of thumb (not official benchmarks):

| What you see | What it means | Fix |
|---|---|---|
| Viewed below about 60% | First seconds fail | Rework the first frame and first sentence |
| Viewed fine, average % viewed low | Middle drags or the Short is too long | Shorten, add a visual change every 3 to 4 s |
| Both fine, views still low | Small seed audience, topic or title | Change title or topic, not the video |
| Most views from Shorts feed, few subscribers | Viewers like it but do not know the channel | Pin a comment, add a subscribe line in the description |

Send me those numbers (or screenshots of two winners and two flops) and I will diagnose scenes, captions, voiceover and pacing for real.

---

## 4. Studio data (screenshots, last 28 days, chart ends 5 Oct)

| Metric | Value | Reading |
|---|---|---|
| Views | 4.7K | |
| Engaged views | 1.8K | About 38% of views |
| Stayed to watch / swiped away | **39.6% / 60.4%** | Main bottleneck: most viewers leave in the first seconds |
| Subscribers | +26 | About 0.55% of views, so viewers who stay do subscribe |
| Where views come from | Shorts feed 87.6% | Normal for Shorts. Each Short is judged on its own seed audience |

**Chart caution:** the last 1 to 2 days on Studio charts are partial. The drop to zero at the right edge is mostly data lag, not a collapse.

**Reality check:** 1.8K engaged views per 28 days is about 64 a day. The Shorts route to monetization needs about 111,000 a day (10M in 90 days), roughly 1,700 times more. Watch hours from long-form remain the realistic route.

### CR-80H. First 3 seconds (Shorts renderer)
1. **Hook text from frame 0**, large enough to read at feed size (about 90 px on a 1080x1920 canvas), high contrast with an outline, placed between 12% and 40% of the frame height (clear of the platform UI).
2. **Narration starts at 0.0 to 0.3 s.** Trim leading silence from every voiceover file.
3. **First shot starts mid-action**, not an establishing frame, with a visible change (zoom, cut or motion) inside 1.5 s.
4. **No logo, wave or branding in the first 3 s.** Hoot waves only at the sign-off.
5. **First spoken sentence is 12 words or fewer** and leads with the viewer's situation or the question.
6. **Render check before publish:** export frame 0 and frame 30 (1 s) as stills in the project so the hook text can be eyeballed.

### CR-80I. Hook A/B log
- Store a `hook_variant` (A = default, B = alternate) on each published Short.
- The user enters "stayed to watch %" per Short at 72 h (Studio shows it; the API does not).
- The app shows the weekly median per variant. A variant is only called better after 5 or more Shorts each. Never auto-apply.

### Next data to collect
For three Shorts (best: "3 Signs…", middle: "Falling Fast?", worst: one of the older low ones), open the Short in Studio, then Analytics, then Engagement. Screenshot **Audience retention** and **Stayed to watch**. The retention curve shows exactly where viewers leave.

---

## 5. Video analysis (3 Shorts, frame by frame, measured with FFmpeg)

| | 3 Signs (1,143 views) | Falling Fast (351) | Why You Want People Who Ignore You (71) |
|---|---|---|---|
| Hook text at top from frame 0 | **Yes**: "3 SIGNS SOMEONE SECRETLY LIKES YOU" | **Yes**: "TOO GOOD, TOO FAST" | **No** |
| Strongest line | At the start | At the start | "EVER CHASED SOMEONE WHO NEVER CHASED BACK?" appears only in the **last 2 s** |
| Cuts | every 2.2 to 2.4 s | every 2.7 s | every 2.5 to 2.9 s |
| Dead-air pauses (0.3 s or longer) | 13, about 35% of runtime | 10, about 28% | 10, about 25% |
| Loudness | -24.4 LUFS | -24.4 LUFS | -24.9 LUFS |
| Resolution / bitrate | 720x1280, 1.3 Mbps | 720x1280, 1.2 Mbps | 720x1280, 1.1 Mbps |
| Background music | None | None | None |
| Captions | Word by word, yellow keyword | Same | Same |
| Hoot | Small, bottom-left | Large, bottom-right, overlaps faces in split panels | Small, bottom-left |
| Ending | Mid-sentence loop plus on-screen question | Mid-sentence loop | Mid-sentence loop plus question |

**What lines up with performance:** only the on-screen hook text. The weakest Short has none, and its best line is saved for the end. The Short was published 26 Sep, the day before the jump in views, so the hook text overlay may be what changed on 27 Sep (not confirmed).

**What is the same in all three (so a likely drag on every Short):**
- Voice is very quiet (about -24.5 LUFS; typical Shorts and YouTube target is about -14).
- Real silence between sentences (about -74 dB), so there is no music bed and 25 to 35% dead air.
- 720p at about 1.2 Mbps.
- A small Gemini/Veo sparkle watermark is visible bottom-right on several clips.

**Not analysed:** I cannot hear the voice, so tone and delivery are unchecked. Only loudness and gaps were measured. Three videos show a pattern, not proof.

### CR-80J. Render fixes
1. **Hook text is mandatory.** Block render if `hook_text` is empty. Render it from frame 0 on every Short, and keep the existing 3 to 6 word rule.
2. **Move the strongest line to the start.** If a Short has a closing question that works as a hook, use it as the hook text and keep a shorter CTA at the end.
3. **Loudness:** add `loudnorm=I=-14:TP=-1.5:LRA=7` to the audio chain of every render (two-pass if the app already does two-pass; single-pass is acceptable). YouTube lowers loud audio but, as far as I know, does not raise quiet audio, so quiet files stay quiet.
4. **Pauses:** cap silence between sentences at 0.35 s (trim in the voiceover step or with `silenceremove`). Target Short length 22 to 35 s.
5. **Music bed (test):** add a royalty-free instrumental under the voice at about -28 LUFS, ducked while speech is playing. Use only music with clear licensing (YouTube Audio Library or a licence you hold).
6. **Resolution:** render 1080x1920 at about 8 Mbps (H.264, 30 fps). If the phone cannot sustain it, use 1080x1920 at 6 Mbps minimum.
7. **Hoot placement:** fixed bottom-left, about 10 to 12% of frame width, never over a face or a split-screen panel. Do not enlarge him for a single Short.
8. **Veo watermark:** crop the bottom-right 6% of the Veo clips and scale up before overlays, or leave the final composition 6% clear there.
9. **Motion in the first second:** every Short's first shot includes a push-in or character movement from frame 0.
10. **Punch-in at each cut (test):** a subtle 1.0x to 1.12x zoom on each shot so there is a micro-reset every 2 to 3 seconds. (Suggested by the Studio assistant; cuts are already every 2.2 to 2.9 s, so this adds motion inside shots.)

### Acceptance
- A rendered Short has hook text visible in the exported frame 0 still.
- Measured loudness between -15 and -13 LUFS integrated.
- No silence gap longer than 0.45 s.
- Output 1080x1920.
- Hoot does not overlap any face region.
