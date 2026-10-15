import type { CastMember } from './cast';

/** The first cast, kept so projects made with these ids still resolve. Names already neutral. */
export const LEGACY_CAST: Record<string, CastMember> = {
  meera_v1: { id: 'meera_v1', name: 'Sam', role: 'the protagonist, 29, works at a marketing agency', look: 'a 29-year-old woman with shoulder-length black hair, small silver hoop earrings and expressive eyebrows', wardrobe: 'a mustard top and denim (casual), or a white shirt and navy trousers (office)', outfits: ['a mustard top and denim', 'a white shirt and navy trousers'] },
  arjun_v1: { id: 'arjun_v1', name: 'Ben', role: "Sam's colleague, 31", look: 'a 31-year-old man with short wavy hair, light stubble and rectangular glasses', wardrobe: 'an olive shirt with rolled sleeves', outfits: ['an olive shirt with rolled sleeves', 'a grey hoodie over a white tee'] },
  kabir_v1: { id: 'kabir_v1', name: 'Theo', role: "Sam's ex, 32 (flashbacks, slightly desaturated)", look: 'a 32-year-old man with a neat undercut and a smartwatch, charming on the surface', wardrobe: 'a charcoal polo', outfits: ['a charcoal polo', 'a black jacket over a white tee'] },
  ritu_v1: { id: 'ritu_v1', name: 'Lena', role: "Sam's best friend, 28", look: 'a 28-year-old woman with curly hair in a high bun and round glasses, supportive and funny', wardrobe: 'a bright green top', outfits: ['a bright green top', 'a yellow top and light jeans'] },
  desai_v1: { id: 'desai_v1', name: 'Mr. Hale', role: "Sam's manager, 50", look: 'a 50-year-old man with grey-streaked hair and half-rim glasses, polished and persuasive', wardrobe: 'a blue blazer', outfits: ['a blue blazer', 'a grey suit and open collar'] },
  dev_v1: { id: 'dev_v1', name: 'Max', role: "Ben's new housemate, 30 (warm at first, then quietly controlling; CR-77 flagship)", look: 'a 30-year-old man with a trimmed beard, an easy grin and a thin gold chain, warm on the surface', wardrobe: 'a rust-coloured henley', outfits: ['a rust-coloured henley', 'a black tee under an open check shirt'] },
  mum_v1: { id: 'mum_v1', name: "Sam's mother", role: "Sam's mother, 55", look: 'a 55-year-old woman with a short grey bob and reading glasses on a chain, loving, occasionally guilt-tripping', wardrobe: 'a cotton cardigan', outfits: ['a cotton cardigan', 'a printed dress'] },
};
