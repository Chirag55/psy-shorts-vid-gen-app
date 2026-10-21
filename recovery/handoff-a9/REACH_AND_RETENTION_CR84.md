> **Updated by CR-86:** profile definitions (84B), mascot rule and pacing are replaced by CR-86. Read CR-86 after this file.

# REACH_AND_RETENTION_CR84.md
**CR-84: measure retention, test two Short styles, apply Gemini's channel review.** App: The Mind Files Studio (Claude Code: check against your current build; the brief supplied with this CR describes v2.9.0).
Inputs: Studio brief (v2.9.0 text), Gemini's channel review (PDF), PsychToons "Popular" screenshot, bank v3.0 (CR-83).

## 0. What the inputs say, and how I weigh them
| Finding | Source | Status |
|---|---|---|
| Word-by-word centre captions raise cognitive load; use phrase captions in the lower third | Gemini review (one model's opinion, reviewed older listicle Shorts) | **Test it** (84B), not proven |
| Forced cliffhanger "loop" endings feel manipulative; end on a calm question | Gemini | **Adopt** (84D), cheap and low-risk |
| Visuals should be moody and atmospheric for serious topics; slower, lingering scenes | Gemini | **Test it** (84B). Conflicts with CR-83 (cut every 2.5 s). One of the two is wrong for this niche, so measure |
| Add ambient music, calmer voice | Gemini | **Test it** (84B) |
| App cannot see retention, swipe-away, impressions, CTR | App brief | **Fix first** (84A). Without it every style change is a guess |
| PsychToons' top videos are long-form 10 to 19 min, 8 to 25 lakh views, "Psychology of X" titles, one bold 2 to 4 word thumbnail line on a plain background | Screenshot | Confirms long-form is the reach engine (CR-77). Your deep dives are 3 to 5 min; flagship LF-03 should aim 8 to 12 min |
| Channel at 30 to 40 views per Short (Gemini quoted 150 to 250 from an older sample) | You / Gemini | Distribution test is failing at the swipe-away stage |

## 84A. YouTube Analytics (priority high; this is open CR-5)
What: add the YouTube Analytics API (extra scope `yt-analytics.readonly`). Per upload, fetch at 72 h and 7 d: views, "viewed vs swiped away" %, average view duration and average percentage viewed, impressions and impressions CTR if available, traffic source for Shorts feed, likes, comments, subscribers gained. Store on the project. Show in Library as one row per Short with a coloured "stayed to watch" cell.
Why: all later tests need a number that moves with quality, not raw views.
Accept: a published Short shows its 72 h row; refresh does not double-count; if the API returns nothing, the row says "no data yet" rather than 0.

## 84B. Two style profiles, A/B by day (priority high)
Add `style_profile` per project (stored with every result row): 
- **P (punchy)** = bank v3.0 as built: word captions, cut at most every 2.5 s, Hoot corner all video.
- **C (calm cinematic)**: each beat shown once (about 4 s per shot, slow push/pan only on stills, slow clip moves), captions as phrases of 5 to 7 words in the lower third (clean font, soft shadow), ambient music bed (84C), moody lighting (84E), Hoot only first 3 s and last 2 s.
Both profiles keep: hook text on frame 0 (the only difference that matched performance in the three-video check), narration text, loudness -14 LUFS, 1080x1920.
Plan: alternate P and C on consecutive days for 5 Shorts each (10 total, different topics from the same queue). Compare at 72 h on "stayed to watch", then average percentage viewed. Keep the winner as the default; do not mix variables after that.
Honest limit: 5 per arm at 30 to 40 views is noisy. Treat a gap above 10 points in "stayed to watch" as a signal; below that, repeat.
Accept: the Planner shows a P/C selector, the render differs as described, the Library groups results by profile.

## 84C. Music bed (priority medium)
Setting `music: off | ambient`. Bundle 3 royalty-free ambient loops (files supplied by Chirag, not downloaded by the app), looped to length, ducked to about -24 dB under the voice, 1 s fade in and out. Default on in profile C, off in P.

## 84D. Ending (priority high, cheap)
Remove any cliffhanger or mid-sentence loop ending. Keep the sign-off line in narration, then show the bank's `yt_pinned_comment` question as end-card text for the last 2 s, and hold 0.5 s of silence-free ambient tail before the loop. Add per-project `ending_mode: signoff_question` (default).

## 84E. Mood for dark topics (priority medium)
Bank v3.1 already has a `mood` field per Short (done; the importer must read it): `warm` or `dark` (dark for manipulation, love bombing, gaslighting, self-sabotage, loneliness topics). Prompt generator: dark uses rainy night streets, late-night cafe, solitary figure at a window, cool blue palette with one warm accent; warm uses current light list. Applies to stills and clips. `make_prompts.py` takes the mood from the bank.

## 84F. Experiment log (priority medium)
Each project stores: `style_profile`, `hook_text`, `hook_type`, `caption_mode`, `music`, `ending_mode`, `publish_time`. Library shows these beside the 84A numbers so a pattern can be read without opening each Short. Feedback summary sent to the script writer adds "stayed to watch" and best/worst hook types once 8+ Shorts have data (replace the 4-video / 2-day rule for Shorts: use 72 h, 8 videos).

## 84G. Scheduling (priority low)
Add publish time (`publishAt`, default 19:00 Asia/Kolkata) and a one-per-day cadence view. No evidence yet that time matters; log `publish_time` and look for a pattern after 20 Shorts.

## 84H. Long-form length (priority medium) [SUPERSEDED by CR-88E and CR-88G: runtime, thumbnail and title rules changed]
Raise deep-dive target from 3 to 5 min to 8 to 12 min for flagship episodes (LF-03 first). Thumbnail template: one bold 2 to 4 word line on a plain light background plus one simple character, not the current badge + headline + Hoot layout. Titles: "Psychology of <topic>: <payoff>".

## Order
84A and 84D first (ship together), then 84B with 84C and 84E, then 84F, then 84H and 84G.

## Do not change
Narration text (verbatim), evidence tags, cast rotation, Asia/Kolkata time zone, published videos.

## 84I. Script generator rules (for app-written scripts; the bank is already written this way)
Update the CR-82B generator prompt: (1) open on an emotional viewer moment; (2) name the tactic in sentence 3, after the emotional beat, never as the second sentence; (3) no mid-script disclaimers: a "popular term, not a diagnosis" line goes last, before the sign-off; (4) no cliffhanger loop ending; (5) prefer relationship, family and everyday-pain angles over abstract or mathematical biases. Keep the priority tactics list, but add triangulation-style relationship topics; make the priority list update from 84A results.
