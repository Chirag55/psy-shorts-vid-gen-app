/**
 * Gemini structured-output schemas (OpenAPI subset).
 *
 * Generation runs with response_mime_type "application/json" and these schemas
 * as response_schema, which is what makes the result parseable without any
 * markdown-fence stripping or repair heuristics.
 */

export const SHORTFORM_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Punchy video title, max 60 characters.' },
    hookLine: { type: 'STRING', description: 'The single most arresting line, reused for thumbnails.' },
    characterDescription: { type: 'STRING', description: 'Hair, wardrobe and setting as one reusable phrase.' },
    archetype: { type: 'STRING', description: 'Two-to-four word character archetype label.' },
    beats: {
      type: 'ARRAY',
      description: 'Exactly three beats in order: hook, mechanism, reframe.',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['hook', 'mechanism', 'reframe'] },
          text: { type: 'STRING', description: 'The spoken line for this beat.' },
          clipPrompt: { type: 'STRING', description: 'Veo prompt ending with the mandatory style lock.' },
        },
        required: ['kind', 'text', 'clipPrompt'],
      },
    },
    hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'hookLine', 'characterDescription', 'archetype', 'beats', 'hashtags'],
} as const;

export const LONGFORM_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'YouTube title, max 70 characters.' },
    coldOpen: { type: 'STRING', description: '12-16 word visceral opening.' },
    characterDescription: { type: 'STRING' },
    archetype: { type: 'STRING' },
    closingSynthesis: { type: 'STRING', description: "25-35 words, ending with Hoot's catchphrase." },
    chapters: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Chapter title for the YouTube timestamp list.' },
          miniHook: { type: 'STRING' },
          mechanism: { type: 'STRING' },
          microReframe: { type: 'STRING' },
          narration: { type: 'STRING', description: 'The three parts joined as one spoken paragraph.' },
          heroA: { type: 'STRING', description: 'Veo prompt, hook action. Ends with style lock.' },
          heroB: { type: 'STRING', description: 'Veo prompt, mechanism escalation. Opens with the continuity phrase, ends with style lock.' },
          stillPrompt: { type: 'STRING', description: 'Imagen prompt for the connective metaphor still. No people. Ends with style lock.' },
        },
        required: ['title', 'miniHook', 'mechanism', 'microReframe', 'narration', 'heroA', 'heroB', 'stillPrompt'],
      },
    },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'coldOpen', 'characterDescription', 'archetype', 'closingSynthesis', 'chapters', 'tags'],
} as const;

export const TOPIC_IDEAS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          category: { type: 'STRING' },
          angle: { type: 'STRING', description: 'One line on why this stops the scroll.' },
        },
        required: ['topic', 'category', 'angle'],
      },
    },
  },
  required: ['topics'],
} as const;
