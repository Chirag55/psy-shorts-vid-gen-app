import type { ShotOverrides } from '@/core/shotListPlan';

/** Hand fixes to shot-list placement and cards, per long-form id. */
export const SHOT_OVERRIDES: Record<string, ShotOverrides> = {
  'MF-L-01': {
    anchors: { 50: 'Socrates is said', 51: 'So tell me', 52: 'And if these surprised you' },
    cards: {
      13: { labels: ['No reason', 'Real reason', '"Because I have to make copies"'] },
      19: { labels: ['No gift', 'Got the Coke'] },
      23: { captions: ['Zoo trip, asked cold', 'Zoo trip, after the huge ask'] },
      27: { labels: ['Big sign, asked cold', 'Big sign, after the tiny one'] },
      32: {
        pairs: [
          { from: '10', to: '25%', caption: 'Wheel stopped on 10: guess' },
          { from: '65', to: '45%', caption: 'Wheel stopped on 65: guess' },
        ],
      },
      35: { labels: ['Web only', 'Print only', 'Print + web'] },
      36: { captions: ['Chose the combo, with the decoy', 'Chose the combo, without it'] },
      41: { labels: ['Standard card', '"Most guests"', '"Guests in this room"'] },
    },
    beats: { 35: ['Nobody wants print only'] },
  },
};
