# Gemini compliance report: The Mind Files topic bank v4

Built 13 Oct 2026 from the app export of 12 Oct (`topic-bank-status-2026-10-12.md`). File to import: `topic-bank-v4-gemini-compliant.md`. Rules: `GEMINI_AUDIT_REQUIREMENTS.md`.

`python compliance_check.py topic-bank-v4-gemini-compliant.md --original topic-bank-status-2026-10-12.md` prints:

```
checked 127 Shorts and 12 long-forms; listed 20 published and 35 skipped; 0 with issues; 194 topics; duplicate ids: none
published topics: 20 in original, unchanged in new file: 20; changed or missing: none
```

The same checker on the original export: 145 of 145 unused or in-progress topics fail at least one rule (most common: shots too short or too few and stills repeated, no POV caption, theory name in the first 10 s, no closing question, loop endings, blocking words in the visuals, long-form titles and descriptions).

## Totals

| | Count |
|---|---|
| Shorts rewritten | 115 (78 D-series incl. 1 new, 37 S-series) |
| Gemini virality batch (13 Oct), added word for word | 12 Shorts: D69 breadcrumbing, D72 double bind, D73 hoovering, D74 word salad, D75 moving the goalposts, D76 dark mirroring, D77 fawning, D126 tone policing, D78 plausible deniability, D79 isolation, D129 baiting, D130 strategic amnesia (D68, D70, D71 not imported: they repeat D171, D180, D166) |
| Shorts skipped now | 18 |
| Long-forms rewritten as single-idea stories | 12 (incl. new MF-L-08) |
| Long-forms skipped now | 2 |
| Published, unchanged | 20 (11 D-series, 7 S-series, MF-L-06, L-002) |
| Already skipped before, unchanged | 15 |
| Short shots | 6 to 9 per Short (about 5 to 6 s each), exactly 3 Veo clips, every still unique: 480 stills + 345 clips |
| Long-form scenes | 717 unique scenes across 12 long-forms (54 to 66 each): 621 stills + 96 Veo clips (8 per episode), none reused |
| Character looks | fixed written look for Alex, Maya, Meera, Kabir, Ritu, Dev, Nora, Ryan, injected in every prompt |

## Shorts

Hook bank = first line and frame-0 text taken from Gemini RUN 5's hook bank. Est. = estimated seconds at 2.0 words/s plus 0.4 s per pause.

| ID | Status | Title | Frame-0 text | Words | Est. | Gemini verdict before | Note |
|---|---|---|---|---|---|---|---|
| MF-S-D01 | unused | The One Word That Forces a Yes | ONE WORD GETS A YES | 53 | 29 s | rewrite |  |
| MF-S-D05 | unused | The Weird Middle Option Is a Trap | THE MIDDLE ONE IS BAIT | 53 | 29 s | keep |  |
| MF-S-D14 | in_progress | Why You Hate Photos of Yourself | THAT'S NOT YOUR FACE | 53 | 29 s | - |  |
| MF-S-D16 | unused | 3 Signs Someone's Smile Is Fake | 3 SIGNS OF A FAKE SMILE | 61 | 33 s | - |  |
| MF-S-D19 | in_progress | Why Their Silence Hurts You So Much | IGNORED ON PURPOSE | 53 | 29 s | - | hook bank |
| MF-S-D22 | unused | Why You Love the Wobbly Shelf You Built | YOU LOVE WHAT YOU BUILD | 55 | 30 s | keep |  |
| MF-S-D23 | unused | 3 Promises That Should Worry You | 3 PROMISES TO WATCH | 64 | 35 s | - |  |
| MF-S-D28 | unused | Why You Trust Good-Looking People | CONFIDENT IS NOT HONEST | 56 | 31 s | rewrite |  |
| MF-S-D30 | unused | Everyone Saw It. Nobody Moved. | EVERYONE SAW. NOBODY MOVED. | 52 | 29 s | - |  |
| MF-S-D31 | unused | 3 Tricks That Force You to Say Yes | 3 WAYS THEY LOCK YOUR YES | 66 | 36 s | rewrite |  |
| MF-S-D32 | unused | The Compliment That Quietly Gives You a Job | THE 'RESPONSIBLE ONE' TRAP | 53 | 29 s | keep |  |
| MF-S-D33 | unused | Want Them to Like You? Ask for a Favor | ASK A FAVOR, WIN A FRIEND | 49 | 27 s | keep |  |
| MF-S-D34 | unused | Same Words. Different Outfit. | SAME WORDS. DIFFERENT OUTFIT. | 52 | 29 s | keep |  |
| MF-S-D35 | in_progress | Why You Stay Just Because You've Invested Years | WHY YOU STAYED | 53 | 29 s | - | hook bank |
| MF-S-D36 | unused | Why Losing $50 Ruins Your Whole Day | LOSING HURTS DOUBLE | 54 | 29 s | keep |  |
| MF-S-D37 | unused | You're Not Searching for the Truth | YOU SEARCH FOR PROOF | 55 | 30 s | rewrite |  |
| MF-S-D38 | unused | Nobody Can See That You're Nervous | THEY CAN'T SEE YOUR NERVES | 49 | 27 s | keep |  |
| MF-S-D39 | unused | Why Planes Scare You More Than Cars | WHY PLANES SCARE YOU | 51 | 28 s | rewrite |  |
| MF-S-D40 | unused | Stop Saying "I Knew It All Along" | "I KNEW IT" IS A LIE | 53 | 29 s | rewrite |  |
| MF-S-D42 | unused | How Salespeople Make You Agree | NOD = AGREE | 53 | 29 s | rewrite |  |
| MF-S-D43 | unused | 3 Signs a Compliment Is Really a Request | COMPLIMENT, THEN FAVOR | 58 | 32 s | keep |  |
| MF-S-D44 | unused | Why Your Horoscope Feels Like It Knows You | IT DESCRIBES EVERYONE | 52 | 29 s | keep |  |
| MF-S-D45 | unused | Why Everything Takes Longer Than You Plan | WHY PLANS RUN LATE | 62 | 34 s | keep |  |
| MF-S-D46 | unused | Why Too Many Choices Freeze You | TOO MANY CHOICES | 54 | 30 s | keep |  |
| MF-S-D49 | unused | Why Opposites Don't Actually Attract | OPPOSITES DON'T ATTRACT | 52 | 29 s | rewrite |  |
| MF-S-D51 | unused | 3 Things Your Brain Does That Sound Fake | 3 FACTS THAT SOUND FAKE | 65 | 35 s | rewrite |  |
| MF-S-D52 | unused | 3 Psychology Facts About Love You Didn't Know | 3 FACTS ABOUT LOVE | 53 | 29 s | rewrite |  |
| MF-S-D53 | in_progress | 5 Sneaky Psychology Tricks Used on You Every Day | 5 TRICKS USED ON YOU | 58 | 32 s | keep |  |
| MF-S-D55 | unused | Why Trying Not to Think About Them Backfires | DON'T THINK OF THEM | 54 | 29 s | - |  |
| MF-S-D56 | unused | Why Follow-Up Questions Make People Like You | ONE MORE QUESTION | 55 | 30 s | - |  |
| MF-S-D57 | unused | Why Asking for Advice Makes You Look Smarter | ASK, DON'T TELL | 54 | 29 s | - |  |
| MF-S-D58 | unused | The First Thing They Learn About You Sticks | FIRST IMPRESSIONS STICK | 51 | 28 s | - |  |
| MF-S-D60 | unused | Why Happy Couples See Each Other a Little Kinder | LOVE SEES KINDER | 54 | 30 s | - |  |
| MF-S-D61 | unused | Why Being Left on Read Hurts So Much | LEFT ON READ | 54 | 30 s | - |  |
| MF-S-D62 | unused | Believing They Like You Makes Them Like You | ACT LIKE THEY LIKE YOU | 52 | 28 s | - |  |
| MF-S-D63 | unused | How They Change the Deal After You Say Yes | THE DEAL CHANGES | 53 | 29 s | - |  |
| MF-S-D65 | unused | Four Small Words That Make You Say Yes | EVEN A PENNY WILL HELP | 49 | 26 s | - |  |
| MF-S-D101 | unused | Why "Just One Small Favor" Is a Trap | SMALL YES. BIG TRAP. | 54 | 29 s | keep |  |
| MF-S-D102 | unused | You Said No, Then Yes. That Was Planned. | HUGE ASK. EASY YES. | 52 | 28 s | keep |  |
| MF-S-D103 | unused | The Hidden Price of a Free Sample | FREE WAS NEVER FREE | 48 | 26 s | keep |  |
| MF-S-D104 | unused | The First Price You See Is a Trap | FIRST PRICE = TRAP | 50 | 28 s | keep |  |
| MF-S-D105 | unused | Why "Only 3 Left" Makes You Panic | "ONLY 3 LEFT" = PRESSURE | 56 | 30 s | keep |  |
| MF-S-D106 | unused | Why You Secretly Follow the Crowd | YOU FOLLOW THE CROWD | 52 | 28 s | rewrite |  |
| MF-S-D110 | unused | Are They Copying You On Purpose? | THEY COPY YOU ON PURPOSE | 51 | 28 s | rewrite |  |
| MF-S-D117 | unused | Nobody Noticed Your Embarrassing Moment | NOBODY NOTICED | 50 | 27 s | keep |  |
| MF-S-D125 | in_progress | 3 Gaslighting Lines That Make You Doubt Yourself | 3 GASLIGHTING LINES | 51 | 29 s | keep | hook bank |
| MF-S-D128 | unused | Looking Away Doesn't Mean They're Lying | LOOKING AWAY ISN'T LYING | 54 | 30 s | keep |  |
| MF-S-D132 | in_progress | 3 Signs Someone Is Guilt-Tripping You | THE WEAPONIZED FAVOR | 58 | 31 s | - | hook bank |
| MF-S-D136 | unused | Why One Small Mistake Makes You More Likable | FLAWS MAKE YOU LIKABLE | 54 | 30 s | keep |  |
| MF-S-D54 | in_progress | They Held Your Eyes One Second Too Long | ONE SECOND TOO LONG | 56 | 31 s | - |  |
| MF-S-D59 | unused | Why You Date People You Sit Next To | YOU FELL FOR WHO WAS NEAR | 55 | 30 s | rewrite |  |
| MF-S-D147 | unused | You Don't Miss Them. You Miss the Edit. | YOU MISS THE EDIT | 54 | 29 s | keep | hook bank |
| MF-S-D149 | unused | Why Buying Things Never Makes You Happy | NEW STOPS FEELING NEW | 56 | 30 s | rewrite |  |
| MF-S-D67 | unused | One Grumpy Person Changes the Whole Room | MOODS ARE CONTAGIOUS | 53 | 29 s | keep |  |
| MF-S-D151 | unused | Why Beginners Always Act Like Experts | BEGINNERS FEEL LIKE EXPERTS | 50 | 27 s | rewrite |  |
| MF-S-D155 | unused | Group Projects Always Have a Ghost (Here's Why) | WHY GROUPS WORK LESS | 49 | 27 s | keep |  |
| MF-S-D156 | unused | Hear It Ten Times and It Starts to Sound True | REPEATED FEELS TRUE | 55 | 30 s | keep |  |
| MF-S-D157 | unused | How Words Change Your Choices | SAME FACTS, NEW WORDS | 54 | 29 s | rewrite |  |
| MF-S-D64 | unused | Told "Don't"? Now You Want To. | "DON'T" MAKES YOU WANT IT | 55 | 30 s | keep |  |
| MF-S-D160 | unused | Why You Never Admit You're Bad at Things | WINS MINE, LOSSES LUCK | 50 | 27 s | rewrite |  |
| MF-S-D161 | unused | Why You Think Everyone Agrees With You | NOT EVERYONE AGREES | 55 | 30 s | rewrite |  |
| MF-S-D162 | unused | You Judged Them in One-Tenth of a Second | DECIDED IN A BLINK | 53 | 29 s | keep |  |
| MF-S-D164 | unused | The Secret You Told a Stranger, Not a Friend | STRANGERS GET YOUR SECRETS | 54 | 29 s | keep |  |
| MF-S-D166 | unused | That Conversation Never Ended, and Your Brain Knows | IT NEVER ENDED | 54 | 29 s | keep |  |
| MF-S-D167 | unused | You Walked In and Forgot Why (Blame the Door) | DOORS ERASE THOUGHTS | 52 | 28 s | keep |  |
| MF-S-D168 | unused | "Maybe" Hurts More Than "No" | "MAYBE" DESTROYS YOU | 54 | 29 s | keep | hook bank |
| MF-S-D171 | unused | Why They Keep Comparing You to Others | THE THIRD PERSON TRAP | 53 | 29 s | keep | hook bank |
| MF-S-D172 | in_progress | Why It's So Hard to Leave Someone Who Hurts You | WHY LEAVING IS SO HARD | 53 | 29 s | keep | hook bank |
| MF-S-D173 | in_progress | Why a Late Reply Makes Your Chest Tighten | SILENCE FEELS LIKE DANGER | 51 | 28 s | keep | hook bank |
| MF-S-D174 | in_progress | Why They Pull Away Right When It Gets Close | CLOSE, THEN GONE | 53 | 29 s | keep | hook bank |
| MF-S-D176 | unused | Why They Shut Down When You Try to Talk | SILENCE AS A WEAPON | 53 | 29 s | keep | hook bank |
| MF-S-D177 | unused | Why One Short Text Can Ruin Your Whole Day | ONE TEXT RUINS EVERYTHING | 53 | 29 s | keep | hook bank |
| MF-S-D178 | unused | Why You Were the Grown-Up Since You Were Ten | THE LITTLE GROWN-UP | 52 | 29 s | - |  |
| MF-S-D179 | unused | Why You Can't Say No (Even When You Want To) | YOU SAY YES ANYWAY | 54 | 29 s | - | hook bank |
| MF-S-D180 | unused | How to Stop Someone Who Feeds on Your Reactions | BE A BORING ROCK | 45 | 25 s | - |  |
| MF-S-D181 | in_progress | That Compliment Was Meant to Make You Smaller | BACKHANDED COMPLIMENT | 53 | 30 s | - |  |
| MF-S-D182 | unused | Why a Breakup Hurts in Your Chest | WHY BREAKUPS HURT PHYSICALLY | 56 | 30 s | - |  |
| S-002 | unused | The Psychology of People Who Are Always Early | ALWAYS EARLY? | 52 | 28 s | - |  |
| S-003 | unused | Why Kind People Suddenly Go Cold | WHY KIND PEOPLE GO COLD | 56 | 30 s | - |  |
| S-004 | unused | Why Some People Hate Phone Calls | WHY CALLS FEEL SCARY | 54 | 29 s | - |  |
| S-005 | unused | Why Smart People Feel Stupid | SMART BUT FEEL STUPID? | 55 | 30 s | - |  |
| S-007 | unused | Why You Say Sorry for Everything | SORRY FOR EVERYTHING | 49 | 27 s | - |  |
| S-014 | unused | Why You Keep Opening the Fridge | NOT HUNGRY. BORED. | 50 | 27 s | - |  |
| S-017 | unused | Why You Win Arguments in the Shower | TOO-LATE COMEBACK | 49 | 27 s | - |  |
| S-019 | unused | Why You Say "I'm Fine" When You're Not | "I'M FINE" | 48 | 26 s | - |  |
| S-020 | unused | Why You Hate Hearing Your Own Voice | THAT'S NOT YOUR VOICE? | 55 | 30 s | - |  |
| S-021 | unused | Why You Laugh When Someone Falls | WHY YOU LAUGH FIRST | 47 | 26 s | - |  |
| S-023 | unused | Signs Someone Is Only Nice When They Need You | NICE ONLY WHEN THEY NEED YOU | 58 | 32 s | - |  |
| S-025 | unused | Why Your Crush Seems Perfect | YOUR CRUSH ISN'T PERFECT | 50 | 27 s | - |  |
| S-026 | unused | Why Parents Compare You to Other Kids | THE KID YOU'RE COMPARED TO | 52 | 28 s | - |  |
| S-027 | unused | Why Fans Won't Watch the Final Minutes | THE LUCKY SEAT | 50 | 27 s | - |  |
| S-030 | unused | Why First Meetings Tell You Almost Nothing | EVERYONE IS PERFORMING | 52 | 28 s | - |  |
| S-033 | unused | 3 Guilt Trips People Use on You | 3 GUILT TRIPS | 55 | 30 s | - |  |
| S-034 | unused | How to Read People: 3 Nervous Tells | 3 NERVOUS TELLS | 57 | 31 s | - |  |
| S-037 | unused | 3 Phrases That Make People Respect You | 3 PHRASES FOR RESPECT | 55 | 30 s | - |  |
| S-038 | unused | 4 Signs Someone Is Secretly Jealous of You | 4 SIGNS OF JEALOUSY | 63 | 34 s | - |  |
| S-039 | unused | 3 Signs of a Fake Apology | 3 SIGNS OF A FAKE APOLOGY | 61 | 33 s | - |  |
| S-040 | unused | Why You Only Work at the Last Minute | STARTED LAST NIGHT? | 49 | 27 s | - |  |
| S-041 | unused | 4 Signs You're Quietly Disrespected at Work | QUIETLY DISRESPECTED? | 60 | 33 s | - |  |
| S-042 | unused | Why Your Parents' Words Still Hurt at 30 | WHY THEIR WORDS STILL HURT | 52 | 28 s | - |  |
| S-043 | unused | 3 Things Emotionally Smart People Never Say | NEVER SAY THESE 3 | 53 | 29 s | - |  |
| S-044 | unused | 3 Signs You Were the Responsible Child | THE RESPONSIBLE CHILD | 50 | 27 s | - |  |
| S-045 | unused | 3 Psychology Tricks to Stop Overthinking | STOP OVERTHINKING | 51 | 28 s | - |  |
| S-046 | unused | Why Traffic Turns Calm People Angry | WHY TRAFFIC MAKES YOU ANGRY | 51 | 28 s | - |  |
| S-047 | unused | 4 Signs Someone Isn't Really Listening | THEY'RE NOT LISTENING | 53 | 29 s | - |  |
| S-048 | unused | Why Weddings Make You Feel Behind in Life | FEELING BEHIND? | 47 | 26 s | - |  |
| S-049 | unused | 3 Signs Someone Deeply Respects You | 3 SIGNS OF RESPECT | 49 | 27 s | - |  |
| S-050 | unused | Why Sunday Evenings Feel So Heavy | SUNDAY DREAD | 56 | 30 s | - |  |
| S-051 | unused | 3 More Signs Someone Secretly Likes You | 3 MORE SIGNS THEY LIKE YOU | 53 | 29 s | - |  |
| S-052 | unused | 4 Weird Habits That Are Actually Smart | YOUR WEIRD HABITS ARE SMART | 56 | 31 s | - |  |
| S-053 | unused | 4 Psychology Facts About How Others Judge You | HOW PEOPLE JUDGE YOU | 53 | 29 s | - |  |
| S-054 | unused | 3 Facts That Prove Your Kindness Matters More | YOUR KINDNESS MATTERS | 52 | 28 s | - |  |
| S-056 | unused | 4 Psychology Tricks for Reading Anyone | READ ANYONE | 65 | 35 s | - |  |
| S-057 | unused | 3 Dark Psychology Facts About Normal People | 3 DARK PSYCHOLOGY FACTS | 58 | 31 s | - |  |
| MF-S-D183 | unused | How Manipulators Test Your Boundaries | THE BOUNDARY TEST | 54 | 30 s | new topic |  |

## Shorts skipped

| ID | Reason |
|---|---|
| MF-S-D10 | Gemini verdict Drop (MF-053 endowment effect): low emotional stakes; RUN 5 drops the endowment effect. |
| MF-S-D41 | Gemini verdict Drop (MF-029 power posing): the hormone claim is debunked and debunking an old fad is low engagement. |
| MF-S-D66 | Gemini verdict Drop (MF-059 Pygmalion effect): too motivational, lacks edge; mixed evidence. |
| MF-S-D169 | RUN 5 topic change: drop the cocktail party effect (dry fact without utility). |
| MF-S-D170 | Gemini verdict Drop (MF-070 gambler's fallacy): overdone and dry; RUN 5 drops it. |
| S-008 | Duplicate of D61 (left on read) and D177 (one short reply); repeated topics look repeated in the feed. |
| S-009 | Interactive perception test: abstract, no emotional payoff (Gemini weak-entry pattern 3; RUN 5 drops fun facts without utility). |
| S-010 | Interactive perception test: abstract, no emotional payoff (Gemini weak-entry pattern 3; RUN 5 drops fun facts without utility). |
| S-011 | Interactive perception test: abstract, no emotional payoff (Gemini weak-entry pattern 3; RUN 5 drops fun facts without utility). |
| S-012 | Interactive perception test: abstract, no emotional payoff (Gemini weak-entry pattern 3; RUN 5 drops fun facts without utility). |
| S-013 | Interactive perception test: abstract, no emotional payoff (Gemini weak-entry pattern 3; RUN 5 drops fun facts without utility). |
| S-016 | Duplicate of D167 (doorway effect). |
| S-028 | Duplicate angle of D151 (overconfidence); also culture-specific framing. |
| S-029 | Off-niche pop-culture topic, not a viewer pain point; character visuals risk copyright. |
| S-032 | Overlaps D52 (love facts) and uses misattribution of arousal, which Gemini dropped (MF-040). |
| S-035 | Duplicate of D117 (spotlight effect) and D38 (illusion of transparency). |
| S-036 | Duplicate of D01 (because), D33 (ask a favor) and D57 (advice). |
| S-055 | Duplicate of D102 (door in the face), D32 (labels) and D157 (framing). |

## Long-forms

| ID | Title | Thumbnail text | Words | Est. runtime | Voice characters | Next video |
|---|---|---|---|---|---|---|
| MF-L-07 | Why You Can't Leave Someone Who Hurts You | BUT I MISS HIM | 1193 | 10:08 | 6,637 | MF-L-02 |
| MF-L-02 | Why You Always End Up Apologizing (Even When They're Wrong) | WAIT, I'M SORRY? | 1198 | 10:12 | 6,685 | MF-L-07 |
| MF-L-05 | Signs Someone Secretly Likes You (That You Keep Missing) | YOU MISSED IT | 1186 | 10:05 | 6,697 | MF-L-03 |
| MF-L-03 | Why You Feel Like Everyone Is Judging You | NOBODY SAW IT | 1208 | 10:16 | 6,861 | MF-L-08 |
| MF-L-04 | Why You Can't Tell When Someone Is Lying | THE EYES DON'T LIE? | 1198 | 10:13 | 6,850 | MF-L-01 |
| MF-L-01 | Why You Always Spend More Than You Planned | IT WAS PLANNED | 1202 | 10:15 | 6,751 | MF-L-08 |
| MF-L-08 | Why You Can't Quit Things That Aren't Working | ONE MORE MONTH | 1194 | 10:11 | 6,549 | MF-L-05 |
| L-001 | The Psychology of People Who Prefer Being Alone | NOT LONELY | 1176 | 10:01 | 6,745 | L-004 |
| L-004 | The Psychology of People Who Don't Post Online | NOTHING TO PROVE | 1190 | 10:08 | 6,725 | L-005 |
| L-005 | The Psychology of People Who Never Ask for Help | I'VE GOT IT | 1185 | 10:05 | 6,590 | L-006 |
| L-006 | Why You Overthink Everything (And How to Stop) | STILL REPLAYING IT | 1191 | 10:09 | 6,710 | L-008 |
| L-008 | The Psychology of People Who Stay Calm in Chaos | WHY IS SHE CALM? | 1181 | 10:05 | 6,549 | L-001 |

| ID | Reason skipped |
|---|---|
| L-003 | Near-duplicate of the published MF-L-06 'Why Kind People Are the Easiest to Manipulate' (posted 12 Oct); a second kind-people episode would look repeated. |
| L-007 | List format (Gemini RUN 7: one idea, not a list), culture-specific framing, and quotes widely misattributed to Chanakya. |

Suggested long-form order (after the published MF-L-06): MF-L-05, MF-L-03, MF-L-08, MF-L-01, MF-L-04, MF-L-07, MF-L-02 (manipulation topics last, to keep distance from MF-L-06), then L-001, L-004, L-005, L-006, L-008.

## Posting notes

- Keep at least 2 weeks between S-033 and D132 (both guilt), and between S-044 and D178 (both the responsible child).
- S-049 at least 3 days after S-041. S-050 goes out on a Sunday. S-051 is the sequel to S-031 (the best Short so far, 1,113 views in 18 h): pin a link on S-031 when it goes live.
- Shorts in progress (D14, D19, D35, D53, D54, D125, D132, D172, D173, D174, D181) have new scripts: re-voice and re-render them; do not publish the old renders.
