# ANIME_STYLE_AGENT_INSTRUCTIONS.md
**For:** The Mind Files (YouTube psychology channel). Every generated still and video clip must look like one anime series.
**Works with:** Google Flow Agent, Gemini / Nano Banana image generation, Veo, and Claude Code (save as `AGENTS.md` or reference it from `CLAUDE.md`).

## How to use this file
- **Flow Agent:** paste sections 1 to 8 as the first message of every new Flow project. If Flow offers project-level instructions, put them there too. Then upload the three cast reference sheets (section 4) as ingredients on **every** generation.
- **Claude Code / the Studio app:** treat this file as the source of truth. If the app's built-in style lock text differs from section 2, replace the app's string with section 2. The app appends cast identity blocks itself, so its prompts must not restate them.
- **Manual prompting:** start every prompt with the style lock (section 2). For a cast member, also paste their identity block (section 4).

---

## 1. Non-negotiables
1. **One style, everywhere.** Modern TV anime, described in section 2. Never switch to photoreal, 3D, comic-book, flat vector or chibi, even for a cutaway.
2. **No Professor Hoot.** The mascot owl is added later as an overlay. He never appears in any prompt, still or clip. No owls at all.
3. **No readable text.** No words, numbers, logos, brand names or subtitles inside images or clips. Signs, screens, papers and phones show blank shapes or abstract marks. The app draws all words as cards.
4. **Adult characters only.** The cast is in their late 20s, with adult proportions and clothes (see section 4). No school uniforms, no childlike features.
5. **No real people, studios, artists or franchises.** Never write "in the style of" a named studio, artist, show or character. Describe the look instead.
6. **Culturally neutral.** No named city or country, flags, festivals, landmarks or national dress. Money is shown as generic coins or bills with no readable marks.
7. **Defensive, non-graphic framing.** Manipulation and relationship scenes show pressure, doubt and withdrawal through posture, framing and objects. No violence, no sexual content, no self-harm imagery, no clinical or diagnostic imagery.
8. **No reserved or empty areas.** Never ask an image or clip model for empty, quiet, blank or low-detail areas, safe zones or space for text or the mascot. Every part of every frame is fully detailed artwork; the app darkens the background under text with a gradient, and the mascot and UI sit over normal artwork.

---

## 2. The style lock (paste at the start of every image and video prompt)

> Modern TV anime illustration, clean uniform ink line art, soft cel shading with gentle gradients, hand-painted background layers with soft depth of field, muted pastel palette anchored on dusty blue and warm cream with one warm accent color per scene, realistic adult proportions, expressive but grounded faces, cinematic lighting, high detail, sharp focus, no photorealism, no 3D render look

**Palette anchors (use as grading, not flat fills):** dusty blue `#90B3D1`, warm cream `#FBF5E7`, charcoal `#3F3F3F`, soft accent red `#E53935` (rare, for emphasis only).

**Line and shading:** thin, even outlines with slightly thicker outer contour; two-tone cel shadows; soft rim light on faces in tense scenes.

**Backgrounds:** painted, slightly softer than the characters so faces read first. Real-world-looking but generic places.

**Mood grading:**
| Mood | Grade |
|---|---|
| Warm, trusting | Warm cream and amber light |
| Pressure, doubt | Cool blue-grey night light with one warm lamp accent; never a green or teal cast |
| Flashback | Slightly desaturated, soft edge glow |
| Relief, "what to do" | Bright daylight, clean whites |

---

## 3. Prompt structure

### Still image (write in this order)
1. Style lock (section 2)
2. Cast identity block(s) for anyone visible (section 4)
3. **Shot:** framing (close-up, medium, wide, over-shoulder, overhead, macro insert)
4. **Action:** one clear action or pose, present tense
5. **Setting + light:** place, time of day, light source
6. **Composition note:** none. Do not describe empty space or where overlays go.

### Video clip (one action per clip)
1. **Camera move first:** slow push in, rack focus, whip pan, handheld drift, overhead, macro insert, over-shoulder. Pick one.
2. Style lock
3. Identity block(s)
4. **One action** that starts and finishes inside the clip (a hand reaching, a head turning, a door closing)
5. Setting + light
6. Silent: describe only what is seen. No speech, no lip-sync, no music, no on-screen text.

**Clip rules:** 4 to 8 seconds. One subject, one motion, no cuts inside the clip, no crowd action. Simple motion avoids warped faces and hands.

**Best consistency trick:** generate the still first, then use that still as the **first frame** of its clip. Add the character reference sheet as an ingredient. The clip then inherits the exact look.

---

## 4. Cast (international, adult, culturally neutral)

Reference sheets: for each character, generate one **turnaround sheet** (front, three-quarter, side, plain light-grey background, neutral expression) in the style lock, approve it once, and reuse it as an ingredient forever. Never regenerate a character from text alone after the sheet exists.

**Alex** (protagonist, 28): short, slightly messy dark-brown hair, warm medium skin tone, brown eyes, medium build. Navy hoodie over a plain white tee, grey trousers, white sneakers. Signature color: navy.

**Maya** (Alex's friend, 27): shoulder-length wavy black hair in a low ponytail, warm medium-brown skin tone, dark eyes, small round silver earrings. Mustard-yellow cardigan over a soft grey top, dark jeans. Signature color: mustard.

**Leo** (Alex's roommate, 29): swept-back light-brown hair, fair skin, hazel eyes, easy wide smile. Olive bomber jacket over a black tee, dark chinos. Signature color: olive.

**Supporting cast:** neutral names only (Sam, Nora, Ben, Lena, Theo, Mia, Ryan, Zoe, Max, Ella, Jonah, Ivy). Give each a distinct hair color and clothing color from outside the three signature colors, and keep them identical when they reappear.

**Identity stays constant, the shot does not.** A character's face, hair and clothes never change within an episode. Framing, camera move and action must differ in every shot.

---

## 5. Variety rules (stops "same character, new background")
1. **At most 40% of shots show Alex's face.** The rest: other characters, hands, objects, screens, symbolic cutaways.
2. **Every list item gets at least one cutaway** (an object, a phone screen without text, a symbolic image such as a tipping scale).
3. **Each list item has its own setting.** No two consecutive items share one.
4. **No repeated framing in any 3 consecutive shots.** Alternate wide, medium, close, overhead, macro.
5. **No reaction-face loops.** If two consecutive shots are the same face with the same expression, replace one with an object or a different angle.
6. **One still can cover up to 3 beats** with different zoom and pan directions. Do not generate a new image for every sentence.

**LF-03 settings:** (1) apartment kitchen, evening. (2) living-room sofa, lamp light. (3) rooftop café at dusk with string lights (flashback). (4) bedroom at night. (5) office desk, daytime. (6) café table with Maya nearby.

---

## 5B. Shorts variety kit (CR-82: makes 20 to 28 second Shorts look edited, not slideshow)
Use with `visual_beats` from bank v3.0. Each beat is `shot size | setting | subject and action | camera`; copy it into the scene sentence unchanged, then add the style lock and identity blocks.
1. **One colour accent per Short** (pick one: amber, magenta, cool blue, golden yellow, coral red; never green or teal). It appears as light or as one prop in every beat, so the Short feels designed.
2. **Each beat uses a different light:** window daylight, warm lamp, neon sign, dusk, cool screen glow. Never the same light twice in a row.
3. **Composition for vertical 9:16:** one clear subject per frame, foreground object overlapping the subject for depth, top 20% of the frame calm (hook text goes there), bottom-left corner clear (Hoot overlay).
4. **Cut every 2.5 seconds or less.** Each beat is shown twice: a wide or slow move first, then a punch-in on the key detail (renderer, CR-80J item 10). Do not generate extra images for this.
5. **Shot mix per Short (5 beats):** at least 1 close-up or macro, 1 wide, 1 insert or object, 1 POV; at most 2 shots with a face; never two neighbouring beats with the same shot size.
6. **Pattern interrupt at about 40% of the runtime:** the one beat that breaks the pattern (a split frame, a whip pan, a symbolic reveal). Mark it in the prompt as "pattern interrupt".
7. **Stills only move one way per beat:** push-in, pull-out, pan left, pan right, tilt up, tilt down. Never the same move on neighbouring beats.
8. **No stock reaction faces.** Show the cause (the object, the message, the gesture), not a face reacting to it.

## 6. Symbolic cutaways (still anime style, no text)
Tipping balance scale · slot-machine reels mid-spin with blank symbols · calendar with one date circled (no numbers visible) · phone on a nightstand showing a blank "seen" tick shape · wrapped gift box · closed box with a tick stamp · stack of paper beside a thin one · red button under a hovering hand.

---

## 7. Quality check before accepting any output
Reject and regenerate if **any** is true:
- Wrong style (photoreal, 3D, flat vector, chibi, comic halftone)
- Face, hair or clothes differ from the cast sheet
- Any readable text, logo or watermark appears
- An owl or Hoot appears
- Warped hands, extra fingers, melted faces or morphing objects (clips)
- A character looks like a teenager or a child
- The bottom-right area is busy
- The shot repeats the previous shot's framing

---

## 8. Fixing drift
- **Do not** add more adjectives. Re-run with the cast reference sheet as an ingredient and, for clips, the approved still as the first frame.
- Change **one thing at a time** (camera, action or setting), keep everything else.
- After two failed attempts on a clip, use the approved still with a slow zoom instead of spending a third attempt.

---

## 9. Output formats
| Use | Aspect | Notes |
|---|---|---|
| Long-form | 16:9 | Fill the whole frame with detail, no reserved areas |
| Shorts | 9:16 | Fill the whole frame with detail edge to edge, no reserved areas |
| Thumbnails | 16:9 | Handled by the app's thumbnail composer, not this file |

---

## 10. Copy-paste templates

**Still:**
```
[STYLE LOCK]. [IDENTITY BLOCK(S)]. [FRAMING] of [ONE ACTION], [SETTING] at [TIME OF DAY], [LIGHT SOURCE].
```

**Clip:**
```
[CAMERA MOVE]. [STYLE LOCK]. [IDENTITY BLOCK(S)]. [ONE ACTION that starts and ends inside the clip], [SETTING] at [TIME OF DAY], [LIGHT SOURCE]. Silent, single continuous shot, 6 seconds.
```

**Cutaway:**
```
[STYLE LOCK]. Close-up of [OBJECT] on [SURFACE], [LIGHT], blank unmarked surfaces, no people.
```

**Cast sheet:**
```
[STYLE LOCK]. Character turnaround sheet of [IDENTITY BLOCK]: front view, three-quarter view and side view, standing relaxed, neutral expression, plain light-grey background, even soft lighting, full body.
```

## 5C. Full-frame rule (CR-87E): why clips filled only 50 to 75% of the screen
Prompts must never describe empty, quiet, soft, blank or low-detail areas, safe zones, thirds, "subject in the middle", or "space for text": the models obey and leave bands or blur. End every image and clip prompt with exactly: "Full-frame vertical 9:16 artwork (1080x1920): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image, including the very top and the very bottom. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars." In Flow also set the aspect ratio to portrait 9:16 for images and videos before generating, and generate stills at a true 9:16 size. The app puts text over the artwork on a soft dark gradient, so legibility never needs empty space.


**Colour balance (CR-87H):** every prompt ends with "Natural neutral colour balance, no green or teal colour cast, no colour overlay, no heavy vignette." Do not ask for green or teal accents, green clothing as the main colour, or a tinted grade.

## 5D. Opening clip and long-form thumbnails (CR-88)
1. **The first clip of every Short (C1) must already be moving in its first frame.** Describe a visible movement or change (a hand slams, a screen flashes on, a head turns) and let the prompt's "already underway in the very first frame" sentence stay. Never write "slowly reveals", "fades in", "establishing shot" or "calm opening" for C1.
2. **Long-form thumbnail images** use `make_prompts.py --thumbs`: 16:9 landscape, a large close-up of one character's face and shoulders with a clear readable expression, ending with the 16:9 full-frame sentence. The headline text is added by the app, so the prompt never mentions text, empty areas or where the headline goes. No Hoot in the image.
3. Generate thumbnails at true 16:9 (Flow image aspect ratio set to landscape) and check them at 120 pixels wide.
