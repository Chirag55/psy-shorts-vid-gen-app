import { LEGACY_CAST } from './castLegacy';

export interface CastMember {
  id: string;
  name: string;
  role: string;
  /** Appearance only: hair, eyes, build, accessories. Never skin tone or ethnicity. */
  look: string;
  wardrobe: string;
  outfits: string[];
}

/** Names the writer may use for one-off extras. */
export const NEUTRAL_NAMES = ['Sam', 'Nora', 'Ben', 'Lena', 'Theo', 'Mia', 'Ryan', 'Zoe', 'Max', 'Ella', 'Jonah', 'Ivy'];

const CURRENT: Record<string, CastMember> = {
  alex_v1: { id: 'alex_v1', name: 'Alex', role: 'the protagonist, 28, works at a marketing agency; kind, a little too eager to keep the peace', look: 'a 28-year-old man with short, slightly messy dark-brown hair, brown eyes and a medium build', wardrobe: 'a navy hoodie over a plain white tee, grey trousers and white sneakers (signature color: navy)', outfits: ['a navy hoodie over a plain white tee, grey trousers and white sneakers', 'a navy shirt with the sleeves rolled and grey trousers'] },
  maya_v1: { id: 'maya_v1', name: 'Maya', role: "Alex's friend, 27; calm, observant, notices patterns", look: 'a 27-year-old woman with shoulder-length wavy black hair, often in a low ponytail, dark eyes and small round silver earrings', wardrobe: 'a mustard-yellow cardigan over a soft grey top and dark jeans (signature color: mustard)', outfits: ['a mustard-yellow cardigan over a soft grey top and dark jeans', 'a mustard-yellow cardigan over a white shirt and navy trousers'] },
  leo_v1: { id: 'leo_v1', name: 'Leo', role: "Alex's roommate, 29; charming at first, then not (CR-77 flagship)", look: 'a 29-year-old man with swept-back light-brown hair, hazel eyes and an easy wide smile', wardrobe: 'an olive bomber jacket over a black tee and dark chinos (signature color: olive)', outfits: ['an olive bomber jacket over a black tee and dark chinos', 'an olive bomber jacket over a grey henley and dark chinos'] },
  ryan_v1: { id: 'ryan_v1', name: 'Ryan', role: "Maya's ex, 32 (flashbacks, slightly desaturated)", look: 'a 32-year-old man with a neat undercut and a smartwatch, charming on the surface', wardrobe: 'a charcoal polo', outfits: ['a charcoal polo', 'a black jacket over a white tee'] },
  nora_v1: { id: 'nora_v1', name: 'Nora', role: "Maya's best friend, 28", look: 'a 28-year-old woman with curly hair in a high bun and round glasses, supportive and funny', wardrobe: 'a bright green sweater', outfits: ['a bright green sweater', 'a yellow top and light jeans'] },
  brooks_v1: { id: 'brooks_v1', name: 'Mr. Brooks', role: "Maya's manager, 50", look: 'a 50-year-old man with grey-streaked hair and half-rim glasses, polished and persuasive', wardrobe: 'a blue blazer', outfits: ['a blue blazer', 'a grey suit and open collar'] },
  mom_v1: { id: 'mom_v1', name: "Maya's mom", role: "Maya's mom, 55", look: 'a 55-year-old woman with a short grey bob and reading glasses on a chain, loving, occasionally guilt-tripping', wardrobe: 'a cream cardigan over a printed blouse', outfits: ['a cream cardigan over a printed blouse', 'a floral shirt dress'] },
};

/** Every id that can appear in a saved project: legacy ids still resolve. */
export const CAST: Record<string, CastMember> = { ...LEGACY_CAST, ...CURRENT };
export const CURRENT_CAST_IDS = Object.keys(CURRENT);
export const CAST_STYLE =
  'anime style, warm soft lighting, adult characters, everyday settings (offices, apartments, cafés, commuter trains, family homes), no logos or brand names in frame';
