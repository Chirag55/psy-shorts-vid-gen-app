/**
 * Gemini structured-output schemas (OpenAPI subset). Generation runs with
 * response_mime_type "application/json" and these as response_schema.
 */

export const SHORTFORM_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "The first of titleOptions." },
    titleOptions: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Exactly 3 titles, best first: 3-7 words, max 50 characters, second person, behaviour not tactic name.",
    },
    tactic: { type: "STRING", description: "Standard name of the tactic the Short is about." },
    sourceLine: {
      type: "STRING",
      description: "Who found it, when, and the one-line finding, e.g. \"Based on Freedman & Fraser, 1966. Evidence: strong.\" Never spoken.",
    },
    hookText: {
      type: "STRING",
      description: "The hook's promise in 2 to 6 words, shown on screen as a static banner from frame 0.",
    },
    hookTextPov: {
      type: "STRING",
      description: "Caption-first banner: \"POV:\" plus the viewer's moment, 9 words or fewer, no year.",
    },
    loopBridge: {
      type: "STRING",
      description: "The exact final 3-6 words of the last beat (the sign-off), copied verbatim.",
    },
    stimulusCard: {
      type: "OBJECT",
      description: "Test format only: the stimulus laid out for the app to draw.",
      properties: {
        background: { type: "STRING", description: "Hex colour, e.g. #101418." },
        frame: { type: "STRING", enum: ["none", "triangle", "box"] },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              text: { type: "STRING" },
              color: { type: "STRING", description: "Hex colour." },
              size: { type: "STRING", enum: ["s", "m", "l", "xl"] },
              x: { type: "NUMBER", description: "Centre, 0 (left) to 1 (right)." },
              y: { type: "NUMBER", description: "Centre, 0 (top) to 1 (bottom)." },
            },
            required: ["text", "color", "size", "x", "y"],
          },
        },
      },
      required: ["background", "frame", "items"],
    },
    hookLine: { type: "STRING", description: "The single most arresting line, reused for thumbnails." },
    characterDescription: { type: "STRING", description: "Face, hair and wardrobe as one reusable phrase. Never the setting." },
    archetype: { type: "STRING", description: "Two-to-four word character archetype label." },
    beats: {
      type: "ARRAY",
      description: "Beats in order. Standard and list: hook, mechanism, reframe. Rapid list: hook, three mechanism beats (one per sign), reframe.",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["hook", "mechanism", "reframe"] },
          text: { type: "STRING", description: "The spoken line for this beat." },
          cardText: {
            type: "STRING",
            description: "Rapid list signs only: the number and the sign in at most 5 words.",
          },
          shots: {
            type: "ARRAY",
            description: "The shots this beat is cut from. Hook and reframe take one each; mechanism takes at least two.",
            items: {
              type: "OBJECT",
              properties: {
                source: {
                  type: "STRING",
                  enum: ["clip", "still"],
                  description: "clip = generated video, which is expensive and budgeted. still = a single image the app pushes in on. Cutaways must always be still.",
                },
                setting: { type: "STRING", description: "Where the shot happens. Vary this across the Short." },
                subject: {
                  type: "STRING",
                  description: "What is on screen: the character, or an object for a cutaway.",
                },
                action: { type: "STRING", description: "What changes on screen. A verb of motion, never a pose." },
                durationSec: { type: "NUMBER", description: "Screen time in seconds. Never more than 3." },
                isCutaway: { type: "BOOLEAN", description: "True when the character is not in frame at all." },
                clipPrompt: { type: "STRING", description: "Veo prompt ending with the mandatory style lock." },
              },
              required: ["source", "setting", "subject", "action", "durationSec", "isCutaway", "clipPrompt"],
            },
          },
        },
        required: ["kind", "text", "shots"],
      },
    },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "title",
    "titleOptions",
    "tactic",
    "hookText",
    "loopBridge",
    "hookLine",
    "characterDescription",
    "archetype",
    "beats",
    "hashtags",
  ],
};

export const LONGFORM_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "YouTube title, max 60 characters." },
    coldOpen: { type: "STRING", description: "12-16 word visceral opening." },
    characterDescription: { type: "STRING", description: "Face, hair and wardrobe as one reusable phrase. Never the setting." },
    archetype: { type: "STRING" },
    closingSynthesis: { type: "STRING", description: "25-35 words, ending with Hoot's catchphrase." },
    chapters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Chapter title for the YouTube timestamp list." },
          miniHook: { type: "STRING" },
          mechanism: { type: "STRING" },
          microReframe: { type: "STRING" },
          narration: { type: "STRING", description: "The three parts joined as one spoken paragraph." },
          heroA: { type: "STRING", description: "Veo prompt, hook action. Ends with style lock." },
          heroB: {
            type: "STRING",
            description: "Veo prompt, mechanism escalation. Opens with the continuity phrase, ends with style lock.",
          },
          stillPrompt: {
            type: "STRING",
            description: "Imagen prompt for the connective metaphor still. No people. Ends with style lock.",
          },
        },
        required: ["title", "miniHook", "mechanism", "microReframe", "narration", "heroA", "heroB", "stillPrompt"],
      },
    },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    tactics: { type: "ARRAY", items: { type: "STRING" }, description: "Every named tactic covered, in order." },
  },
  required: [
    "title",
    "coldOpen",
    "characterDescription",
    "archetype",
    "closingSynthesis",
    "chapters",
    "tags",
    "tactics",
  ],
};

export const TOPIC_IDEAS_SCHEMA = {
  type: "OBJECT",
  properties: {
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          topic: { type: "STRING" },
          category: { type: "STRING" },
          angle: { type: "STRING", description: "One line on why this stops the scroll." },
        },
        required: ["topic", "category", "angle"],
      },
    },
  },
  required: ["topics"],
};

export const TITLE_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    ok: { type: "BOOLEAN", description: "True when the title is grammatical and reads naturally." },
    corrected: { type: "STRING", description: "The title with only the grammar fixed; identical when ok." },
    issue: { type: "STRING", description: "One short sentence naming the problem; empty when ok." },
  },
  required: ["ok", "corrected", "issue"],
};

export const FILL_BLANKS_SCHEMA = {
  type: "OBJECT",
  properties: {
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING", description: "The row key, exactly as given." },
          setting: { type: "STRING", description: "A place, 2 to 5 words; empty if the row did not need one." },
          cutaway: {
            type: "STRING",
            description: "One concrete object, 2 to 6 words; empty if the row did not need one.",
          },
        },
        required: ["key", "setting", "cutaway"],
      },
    },
  },
  required: ["rows"],
};

export const RELEVANCE_LABELS_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "The title id, t1…tN." },
          label: { type: "STRING", enum: ["EXPLAINER", "CLIP", "SKIT", "OFFTOPIC", "MOTIVATION", "LONGFORM_CLIP"] },
          confidence: { type: "NUMBER", description: "0 to 1." },
        },
        required: ["id", "label", "confidence"],
      },
    },
  },
  required: ["items"],
};

