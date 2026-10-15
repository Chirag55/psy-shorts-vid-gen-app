import { z } from 'zod';

/**
 * Runtime schemas for generated scripts. They are handed to Claude as the
 * structured-output format and validate what comes back from either provider.
 */

export const ShortShotSchema = z.object({
  source: z.enum(['clip', 'still']),
  setting: z.string().min(1),
  subject: z.string().min(1),
  action: z.string().min(1),
  durationSec: z.number(),
  isCutaway: z.boolean(),
  clipPrompt: z.string().min(1),
  beat: z.number().optional(),
  punch: z.boolean().optional(),
  interrupt: z.boolean().optional(),
  move: z.enum(['zoom_in', 'pan_right', 'zoom_out', 'pan_left', 'tilt_up', 'tilt_down']).optional(),
  beatId: z.string().optional(),
  beatType: z.enum(['clip', 'still', 'clip*']).optional(),
  promptFinal: z.boolean().optional(),
  reuse: z.number().optional(),
  startSec: z.number().optional(),
});

export const ShortBeatSchema = z.object({
  kind: z.enum(['hook', 'mechanism', 'reframe']),
  text: z.string().min(1),
  shots: z.array(ShortShotSchema).min(1),
  cardText: z.string().optional(),
});

export const StimulusCardSchema = z.object({
  background: z.string(),
  frame: z.enum(['none', 'triangle', 'box']),
  items: z.array(
    z.object({
      text: z.string(),
      color: z.string(),
      size: z.enum(['s', 'm', 'l', 'xl']),
      x: z.number(),
      y: z.number(),
    }),
  ),
});

export const ShortScriptSchema = z.object({
  title: z.string().min(1),
  hookLine: z.string().min(1),
  characterDescription: z.string().min(1),
  archetype: z.string().min(1),
  beats: z.array(ShortBeatSchema).min(1),
  hashtags: z.array(z.string()),
  tactic: z.string().min(1),
  sourceLine: z.string().optional(),
  hookText: z.string().min(1),
  hookTextPov: z.string().optional(),
  loopBridge: z.string().min(1),
  titleOptions: z.array(z.string().min(1)).min(1),
  stimulusCard: StimulusCardSchema.optional(),
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
  tactics: z.array(z.string()),
});

export const TopicIdeasSchema = z.object({
  topics: z
    .array(
      z.object({
        topic: z.string().min(1),
        category: z.string().min(1),
        angle: z.string().min(1),
      }),
    )
    .min(1),
});

export const TitleCheckSchema = z.object({ ok: z.boolean(), corrected: z.string(), issue: z.string() });

/** Fill-in rows for a shot list: per shot key, its setting and cutaway. */
export const FillBlanksSchema = z.object({
  rows: z.array(z.object({ key: z.string(), setting: z.string(), cutaway: z.string() })),
});

export const RelevanceLabelsSchema = z.object({
  items: z.array(z.object({ id: z.string(), label: z.string(), confidence: z.number() })),
});

export type RawShortScript = z.infer<typeof ShortScriptSchema>;
export type RawLongScript = z.infer<typeof LongScriptSchema>;
export type RawTopicIdeas = z.infer<typeof TopicIdeasSchema>;
export type RawStimulusCard = z.infer<typeof StimulusCardSchema>;

/** Turns a Zod failure into something worth showing on screen. */
export function describeValidationError(error: z.ZodError): string {
  const issues = error.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
  const extra = error.issues.length > 4 ? ` (+${error.issues.length - 4} more)` : '';
  return `The model returned a script that does not match the expected shape — ${issues.join('; ')}${extra}`;
}
