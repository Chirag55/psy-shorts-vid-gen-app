/** Research (competitor outlier) settings: quota costs, filters, ranking weights and keyword profiles. */

export interface ResearchProfile {
  id: string;
  name: string;
  targetChannel: string;
  ownChannelId: string;
  seedKeywords: string[];
  nicheTerms: string[];
  voiceNotes: string;
}

export type ResearchFilters = typeof DEFAULT_FILTERS;

export const QUOTA_COST = { search: 100, videos: 1, channels: 1, playlistItems: 1, commentThreads: 1 };

export const DEFAULT_DAILY_CAP = 8000;

export const DEFAULT_FILTERS = {
  windowDays: 30,
  minViews: 20000,
  maxSubs: 100000,
  minSubRatio: 20,
  minBreakout: 4,
  maxDurationSec: 60,
  minDurationSec: 12,
};

export const FILTERS_VERSION = 3;

export const SHORTS_MAX_SEC = 180;

export const RANK_WEIGHTS = { withoutBreakout: { subRatio: 0.6, vph: 0.4 }, withBreakout: { breakout: 0.5, subRatio: 0.3, vph: 0.2 } };

export const SUB_FLOOR = 1000;

export const MEDIAN_FLOOR = 100;

export const SIZE_WEIGHT = { reference: 10000, min: 0.6, max: 1 };

export const CONSISTENTLY_BIG = { medianViews: 200000, minBreakout: 3 };

export const OUTLIER_RATE_CAP = { maxRate: 0.15, ratioStep: 10, maxRatio: 500, minScanned: 40 };

export const DIVERSITY = { perChannel: 2, duplicateSimilarity: 0.85 };

export const KEYWORD_LABELS = { strong: 0.15, keep: 0.05, rephraseJunkRate: 0.6 };

export const KEYWORD_LOW_RESULTS = 50;

export const LOOP_RANK_FACTOR = 0.5;

export const NON_ENGLISH_MAX_SHARE = 0.3;

export const LAYER2 = {
  batchSize: 60,
  minConfidence: 0.6,
  labels: ["EXPLAINER", "CLIP", "SKIT", "OFFTOPIC", "MOTIVATION", "LONGFORM_CLIP"],
  keep: "EXPLAINER",
  promptVersion: 1,
  cacheDays: 30,
  cacheMax: 5000,
};

export const BREAKOUT = { recentShorts: 30, maxChannels: 150, cacheDays: 3 };

export const FLAGS = { spikeMaxAgeHours: 12, spikeMinVph: 2000, bigChannelSubs: 1000000 };

export const NEGATIVE_TERMS: Record<string, string[]> = {
  "Format/fandom": [
    "ranking",
    "edit",
    "edits",
    "editmoments",
    "moments",
    "compilation",
    "scene",
    "clip",
    "episode",
    "season",
    "movie",
    "film",
    "tv",
    "tvshow",
    "series",
    "trailer",
    "4k",
    "fanedit",
    "amv",
  ],
  "Comedy/skit": [
    "funny",
    "comedy",
    "skit",
    "prank",
    "pov",
    "memes",
    "meme",
    "couplecomedy",
    "couplevideos",
    "sister",
    "sisters",
    "sistergoals",
    "relatable",
    "uno",
  ],
  Paranormal: ["ghosts", "haunted", "bhoot", "paranormal", "scary", "horror"],
  "Off-topic": [
    "shopping",
    "lifehacks",
    "outfit",
    "makeup",
    "recipe",
    "gaming",
    "minecraft",
    "roblox",
    "asmr",
    "woodworking",
  ],
};

export const NEGATIVE_PHRASES: Record<string, string[]> = {
  Clickbait: ["blow your mind", "mind blowing", "mindblowing"],
  Motivation: ["sigma rules", "achieve everything"],
};

export const NICHE_COTERMS: Record<string, string[]> = { mind: ["psychology", "trick", "tricks", "read", "reads", "reading", "brain", "people"] };

export const EPISODE_PATTERN = /\bs\d+\s?e\d+\b/i;

export const GHOST_CONTEXT = ["ghosts", "haunted", "bhoot", "paranormal", "scare", "scary", "spirit", "horror"];

export const DEFAULT_ENTITY_BLOCKLIST = [
  "patrick jane",
  "mentalist",
  "sherlock",
  "malcolm in the middle",
  "ghost whisperer",
  "lie to me",
  "the office",
  "breaking bad",
  "suits",
];

export const DEFAULT_PODCAST_TERMS = ["podcast", "chase hughes"];

export const RETENTION_DAYS = 30;

export const V132_NICHE_TERMS = [
  "neuroscience",
  "thinking",
  "overthinking",
  "anxiety",
  "habit",
  "stoic",
  "respect",
  "jealous",
  "apology",
  "workplace",
  "love",
  "ghost",
  "emotional",
  "people pleas",
  "likes you",
];

export const KEYWORD_MIGRATION_V132: { profileId: string; drop: string[]; rename: Record<string, string>; add: string[] } = {
  profileId: "mindfiles",
  drop: [
    "manipulation tactics",
    "cognitive bias",
    "narcissist signs",
    "attachment style",
    "nonverbal cues",
    "body language secrets",
  ],
  rename: {
    "why people ghost": "why people ghost you",
    "reverse psychology": "reverse psychology trick",
    "smart psychology": "smart psychology tricks",
  },
  add: [
    "psychology facts about love",
    "psychology facts about you",
    "signs someone is jealous",
    "emotional intelligence",
    "overthinking psychology",
    "office politics psychology",
    "people pleasing",
  ],
};

export const KEYWORDS_VERSION = 2;

export const DEFAULT_PROFILES: ResearchProfile[] = [
  {
    id: "mindfiles",
    name: "The Mind Files",
    targetChannel: "The Mind Files",
    ownChannelId: "UC06BsxMEA5_ECHEA09GpRHg",
    seedKeywords: [
      "psychology facts",
      "dark psychology",
      "psychology tricks",
      "how to read people",
      "persuasion psychology",
      "smart psychology tricks",
      "mind tricks",
      "reverse psychology trick",
      "subtle signs someone likes you",
      "why people ghost you",
      "how to make someone respect you",
      "psychology facts about love",
      "psychology facts about you",
      "signs someone is jealous",
      "emotional intelligence",
      "overthinking psychology",
      "office politics psychology",
      "people pleasing",
    ],
    nicheTerms: [
      "psychology",
      "mind",
      "brain",
      "behavior",
      "behaviour",
      "body language",
      "manipul",
      "persuad",
      "persuasion",
      "bias",
      "narciss",
      "attachment",
      "subconscious",
      "dark psychology",
      "gaslight",
      "influence",
      "read people",
      "neuroscience",
      "thinking",
      "overthinking",
      "anxiety",
      "habit",
      "stoic",
      "respect",
      "jealous",
      "apology",
      "workplace",
      "love",
      "ghost",
      "emotional",
      "people pleas",
      "likes you",
    ],
    voiceNotes: "Professor Hoot: calm, warm, slightly amused; hooks name a specific tactic; mechanisms happen to the viewer.",
  },
  {
    id: "wealthpsyche",
    name: "WealthPsyche",
    targetChannel: "WealthPsyche",
    ownChannelId: "",
    seedKeywords: [
      "money psychology",
      "behavioral economics",
      "why you overspend",
      "loss aversion",
      "sunk cost fallacy",
      "mental accounting",
      "impulse buying psychology",
      "financial habits",
      "rich mindset",
      "saving money psychology",
      "anchoring effect prices",
      "scarcity mindset",
      "lifestyle inflation",
    ],
    nicheTerms: [
      "money",
      "spend",
      "save",
      "saving",
      "rich",
      "wealth",
      "budget",
      "price",
      "cost",
      "invest",
      "financial",
      "rupee",
      "debt",
      "income",
      "bias",
    ],
    voiceNotes: "Calm, clear money psychology; name the specific bias; frame it as happening to the viewer.",
  },
];

