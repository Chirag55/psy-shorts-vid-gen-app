import { z } from 'zod';

/**
 * Runtime schemas for generated scripts.
 *
 * These do double duty: they are handed to Claude as the structured-output
 * format, and they validate what comes back from *either* provider. Gemini's
 * own response schema constrains generation but does not guarantee the payload
 * matches once parsed, so validating both paths through one definition is what
 * keeps a malformed generation from reaching the storyboard as undefined fields.
 */

export const ShortBeatSchema = z.object({
  kind: z.enum(['hook', 'mechanism', 'reframe']),
  text: z.string().min(1),
  clipPrompt: z.string().min(1),
});

export const ShortScriptSchema = z.object({
  title: z.string().min(1),
  hookLine: z.string().min(1),
  characterDescription: z.string().min(1),
  archetype: z.string().min(1),
  beats: z.array(ShortBeatSchema).min(1),
  hashtags: z.array(z.string()),
});

export const ChapterSchema = z.object({
  title: z.string().min(1),
  miniHook: z.string().min(1),
  mechanism: z.string().min(1),
  microReframe: z.string().min(1),
  narration: z.string().min(1),
  heroA: z.string().min(1),
  heroB: z.string().min(1),
  stillPrompt: z.string().min(1),
});

export const LongScriptSchema = z.object({
  title: z.string().min(1),
  coldOpen: z.string().min(1),
  characterDescription: z.string().min(1),
  archetype: z.string().min(1),
  closingSynthesis: z.string().min(1),
  chapters: z.array(ChapterSchema).min(1),
  tags: z.array(z.string()),
});

export const TopicIdeasSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string().min(1),
      category: z.string().min(1),
      angle: z.string().min(1),
    })
  ).min(1),
});

export type RawShortScript = z.infer<typeof ShortScriptSchema>;
export type RawLongScript = z.infer<typeof LongScriptSchema>;
export type RawTopicIdeas = z.infer<typeof TopicIdeasSchema>;

/** Turns a Zod failure into something worth showing on screen. */
export function describeValidationError(error: z.ZodError): string {
  const issues = error.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
  const extra = error.issues.length > 4 ? ` (+${error.issues.length - 4} more)` : '';
  return `The model returned a script that does not match the expected shape — ${issues.join('; ')}${extra}`;
}
