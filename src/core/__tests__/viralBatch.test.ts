import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCue,
  parseSubtitles,
  parseUploadOrder,
  parseVoiceSettings,
  viralFirst,
  viralOf,
  viralOverlays,
  viralProblems,
  viralThumbnailPrompt,
  withA9Hashtags,
} from '../viralBatch';
import { rotationProblems } from '../rotation';
import { checkShots } from '../compliance';

const beats = [
  'MF031-C1 clip* | Medium | a sunlit corridor in warm afternoon light | Leo hands Nora a stack of files | slow push-in',
  'MF031-S1 still | CU | a sunlit corridor, cold blue window shadow | Nora looks down at the folders | slow pan-right',
  "MF031-S2 still | OTS | an office in bright morning light | over Nora's shoulder, Leo smiles | slow tilt-up",
  'MF031-C2 clip* | Insert | a workspace in sharp afternoon sunlight | a red folder slides onto a notepad | slow push-in',
  "MF031-S3 still | CU | an office in bright window light | Leo pats Nora's shoulder | slow pan-left",
  'MF031-S4 still | Medium | an office in soft daylight | Nora hesitates over the folder | slow push-in',
  'MF031-S5 still | Wide | a busy office kitchen in cool daylight | Leo walks past Nora | slow pull-out',
  'MF031-S6 still | Medium | a workspace in warm golden light | Leo leans in, warm light on his face | slow pan-right',
  'MF031-C3 clip* | CU | an office in bright daylight | Nora slides the files back to Leo | slow tracking',
  'MF031-S7 still | Wide | a sunlit elevator lobby | Leo watches Nora walk past | slow push-in',
];

const entry = {
  id: 'MF-S-D43',
  viral_batch: 'A9',
  upload_order: '1 of 5',
  queue: 1,
  voice_settings: 'ElevenLabs: stability 45, clarity 80, style exaggeration 25, speed 1.12 (urgent)',
  subtitles: parseSubtitles([
    '0:00-0:02.0 | POV: The compliment was a trap',
    "0:02.0-0:24.0 | Because that's how they just...",
  ]).cues,
  bottom_overlay: 'When did a compliment cost you? Comment below',
  thumb_text: 'FAKE PRAISE TRAP',
  thumb_visual: 'Leo smiling while handing Nora a stack of work.',
  pinned_comment: 'When did a compliment cost you?',
  character_looks: ['Nora, 31: auburn bob, cream turtleneck.', 'Leo, 29: light-brown hair, olive bomber jacket.'],
  visual_beats: beats,
  title_final: 'How Manipulators Use Compliments to Trap You #shorts #psychology #DarkPsychology',
  description_full: 'Three red flags.\n\n#shorts #psychology #DarkPsychology',
  format: 'LIST',
  pillar: 'Manipulation & Defense',
};

describe('viral batch fields', () => {
  it('reads subtitle cues', () => {
    assert.deepEqual(parseCue('0:02.0-0:04.5 | 3 signs praise is a MANIPULATION TRAP'), {
      start: 2,
      end: 4.5,
      text: '3 signs praise is a MANIPULATION TRAP',
    });
    assert.equal(parseCue('0:04 | no end'), null);
    assert.equal(parseSubtitles(['nonsense']).bad.length, 1);
  });

  it('reads the voice settings as 0 to 1 values', () => {
    assert.deepEqual(parseVoiceSettings(entry.voice_settings), {
      stability: 0.45,
      similarity: 0.8,
      style: 0.25,
      speed: 1.12,
    });
    assert.equal(parseVoiceSettings('warm and calm'), undefined);
  });

  it('reads the upload order and the badge position', () => {
    assert.deepEqual(parseUploadOrder('3 of 5'), { position: 3, size: 5 });
    const v = viralOf(entry)!;
    assert.equal(v.position, 1);
    assert.equal(v.size, 5);
    assert.equal(viralOf({ id: 'x' }), undefined);
  });

  it('passes a complete viral Short and flags a broken one', () => {
    assert.deepEqual(viralProblems(entry), []);
    const broken = viralProblems({ ...entry, thumb_text: 'FAR TOO MANY WORDS', title_final: 'Title #shorts' });
    assert.ok(broken.some((p) => p.includes('3 words')));
    assert.ok(broken.some((p) => p.includes('title must end')));
  });
});

describe('viral batch rendering', () => {
  it('scales the subtitles to the voice and adds the bottom overlay at the end', () => {
    const v = viralOf(entry)!;
    const out = viralOverlays(v, 26.4);
    assert.equal(out.length, 3);
    assert.ok(Math.abs(out[0].end - 2.2) < 1e-9);
    assert.equal(out[1].end, 26.4);
    assert.deepEqual([out[2].start, out[2].end, out[2].bottom], [23.9, 26.4, true]);
  });

  it('builds the thumbnail prompt with the named looks', () => {
    const p = viralThumbnailPrompt(viralOf(entry)!);
    assert.ok(p.includes('Leo, 29'));
    assert.ok(p.includes('Nora, 31'));
    assert.ok(p.includes('handing Nora a stack of work.'));
    assert.ok(p.includes('9:16'));
  });
});

describe('viral batch metadata and order', () => {
  it('ends titles and descriptions with exactly the three hashtags', () => {
    assert.equal(withA9Hashtags('A title #shorts #mind'), 'A title #shorts #psychology #DarkPsychology');
    assert.equal(
      withA9Hashtags('Body.\n\n#shorts #psychology\n\nLink: https://y'),
      'Body.\n\nLink: https://y\n\n#shorts #psychology #DarkPsychology',
    );
  });

  it('puts the batch first in queue order', () => {
    const list = [{ id: 'a' }, { ...entry, id: 'v2', queue: 2 }, { id: 'b' }, { ...entry, id: 'v1', queue: 1 }];
    assert.deepEqual(
      viralFirst(list).map((e) => e.id),
      ['v1', 'v2', 'a', 'b'],
    );
  });

  it('never moves a viral Short for a rotation rule', () => {
    const placed = [
      { id: 'x', format: 'LIST', pillar: 'Manipulation & Defense', day: '2026-10-22' },
      { id: 'y', format: 'LIST', pillar: 'Manipulation & Defense', day: '2026-10-23' },
    ];
    assert.deepEqual(rotationProblems(entry, '2026-10-24', placed), []);
    assert.ok(rotationProblems({ ...entry, viral_batch: undefined }, '2026-10-24', placed).length > 0);
  });

  it('checks V9 on the lead only', () => {
    const late = [...beats];
    late[0] = beats[0].replace('Leo hands Nora a stack of files', 'Nora holds a stack of files');
    late[2] = beats[2].replace("over Nora's shoulder, Leo smiles", 'a corridor in shadow');
    const v9 = checkShots(late, entry.character_looks).filter((p) => p.startsWith('V9'));
    assert.deepEqual(v9, []);
  });
});
