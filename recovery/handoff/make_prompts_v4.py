#!/usr/bin/env python3
"""make_prompts_v4.py - Flow prompts for the Gemini-compliant bank (6 to 9 shots per Short, exactly 3 Veo clips, the rest stills; one still per long-form scene).

Usage: python make_prompts_v4.py topic-bank-v4-gemini-compliant.md --out prompt_pack_v4 [--ids MF-S-D173,S-051]
Writes stills_master_prompt.txt (Shorts, 9:16), clips_prompts.txt (3 per Short), longform_stills.txt (16:9, one per scene), thumbnail_prompts.txt (2 per long-form, 16:9), manifest.json.
The beat ID is the first token of every line so downloaded file names map back automatically.
"""
import argparse, json, os, re, yaml

STYLE = ("Modern TV anime illustration, clean uniform ink line art, soft cel shading with gentle gradients, hand-painted background layers "
         "with soft depth of field, muted pastel palette anchored on dusty blue and warm cream with one warm accent color per scene, realistic adult "
         "proportions, expressive but grounded faces, cinematic lighting, high detail, sharp focus, no photorealism, no 3D render look.")
MOOD = "Moody, atmospheric, cinematic mood that matches the emotion of the moment; the light comes from the scene itself (rain, night, lamps, dawn)."
CAST = {
 'Alex': 'Alex, 28: short slightly messy dark-brown hair, warm medium skin tone, brown eyes, medium build, navy hoodie over a plain white tee, grey trousers, white sneakers.',
 'Maya': 'Maya, 27: shoulder-length wavy black hair in a low ponytail, warm medium-brown skin tone, dark eyes, small round silver earrings, mustard-yellow cardigan over a soft grey top, dark jeans.',
 'Sam': 'Sam, 26: lean, messy light-brown hair, fair skin with a few freckles, grey-blue eyes, burgundy hoodie, black jeans, canvas sneakers.',
 'Nora': 'Nora, 31: fair skin with light freckles, auburn chin-length bob with side-swept bangs, green-brown eyes, cream turtleneck, camel wool coat.',
 'Ryan': 'Ryan, 29: short sandy-blond hair, light stubble, fair skin, a slightly sunburnt nose, red-and-brown plaid shirt, tan chinos.',
 'Jordan': 'Jordan, 30: medium build, short dark-brown hair with a side parting, tan skin tone, light stubble, olive-green jacket over a white tee, dark jeans.',
 'Chris': 'Chris, 33: stocky, closely cropped dark hair, deep-brown skin tone, thick-framed glasses, mustard sweater over a collared shirt, khaki trousers.',
 'Ben': 'Ben, 28: tall, wavy dark hair to the ears, light-olive skin tone, short stubble, teal bomber jacket over a grey tee, black trousers.',
 'Jamie': 'Jamie, 29: long black hair in a side braid, medium-brown skin tone, teal blouse over white trousers, small silver studs.',
 'Riley': 'Riley, 25: short black bob with a fringe, light-brown skin tone, round tortoiseshell glasses, mint-green sweater, blue jeans.',
 'Nina': 'Nina, 31: long wavy dark-brown hair, olive skin tone, hazel eyes, a deep red coat over a black top, grey scarf.',
 'Ella': 'Ella, 27: shoulder-length auburn hair with a centre parting, fair skin, lavender blouse, beige trousers, small gold studs.',
 'Mara': 'Mara, 30: long straight dark hair to the middle of her back, medium-brown skin tone, large dark eyes, deep plum cardigan over a cream blouse, black trousers.',
 'Kai': 'Kai, 32: tall, broad shoulders, short neat dark hair, trimmed stubble, light-brown skin tone, charcoal shirt with the sleeves rolled to the elbow, a dark watch.',
 'Tess': 'Tess, 29: curly dark hair in a high bun, thin round gold-framed glasses, warm tan skin tone, rust-orange sweater over a white tee, dark jeans.',
 'Drew': 'Drew, 34: tall and lean, short dark hair with grey at the temples, dark skin tone, rimless glasses, navy blazer over a light-blue shirt, no tie.',
 'Leo': 'Leo, 31: medium build, short curly dark-blond hair, light-tan skin tone, clean-shaven, forest-green sweater over a white shirt, dark jeans.',
}
SIZE = {'cu': 'close-up', 'wide': 'wide establishing shot', 'medium': 'medium shot', 'insert': 'insert shot of an object or detail', 'ots': 'over-the-shoulder shot', 'profile': 'side-profile close-up'}
MOVE = {'slow push-in': 'very slow push-in', 'slow pull-out': 'very slow pull-out', 'slow pan-left': 'slow pan to the left', 'slow pan-right': 'slow pan to the right',
        'slow tilt-up': 'slow tilt upward', 'slow tilt-down': 'slow tilt downward', 'slow tracking': 'slow, smooth tracking shot'}
NEG = ("No readable text, no letters or numbers, no logos, no owls, no mascot, adult characters only, no black bars, no blank space, no watermark. "
       "Natural neutral colour balance, no green or teal colour cast, no colour overlay, no heavy vignette.")
FRAME = ("Full-frame vertical 9:16 artwork (1080x1920): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge "
         "to the right edge, with rich detail in every part of the image, including the very top and the very bottom. No blur, no empty space, no flat or blank areas, "
         "no bands, no borders, no letterboxing, no black bars.")
FRAME16 = ("Full-frame horizontal 16:9 artwork (1920x1080): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge "
           "to the right edge, with rich detail in every part of the image. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars.")
FROZEN = "The moment is caught mid-action, as if paused at its most dramatic instant."
CLIP = ("One continuous shot of up to 8 seconds with clear, natural movement in the subject (not a frozen picture), no cuts. At most two characters; keep faces, hair and clothes exactly as described for the whole clip.")

def ident(text):
    return ' '.join(CAST[c] for c in CAST if re.search(r'\b%s\b' % c, text))

def parse(path):
    t = open(path, encoding='utf-8').read()
    shorts, lfs = [], []
    for ch in t.split('\n---\n'):
        m = re.search(r'^(#{2,3}) (.+?)\n```yaml\n(.*?)\n```', ch, re.S | re.M)
        if m:
            d = yaml.safe_load(m.group(3))
            if d.get('status') in ('published', 'skipped'): continue
            if m.group(1) == '###': shorts.append((d['id'], d.get('visual_beats') or []))
            else: lfs.append((d['id'], d))
            continue
        for y in re.findall(r'```yaml\n(.*?)\n```', ch, re.S):
            d = yaml.safe_load(y)
            if not isinstance(d, dict) or 'topics' not in d: continue
            for x in d['topics']:
                if x['status'] in ('published', 'skipped'): continue
                if d['type'] == 'topic_bank_shorts': shorts.append((x['id'], x['visual_brief'].get('shots', [])))
                else: lfs.append((x['id'], x))
    return shorts, lfs

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('bank'); ap.add_argument('--out', default='prompt_pack_v4'); ap.add_argument('--ids')
    a = ap.parse_args()
    shorts, lfs = parse(a.bank)
    if a.ids:
        want = set(x.strip() for x in a.ids.split(','))
        shorts = [s for s in shorts if s[0] in want]; lfs = [l for l in lfs if l[0] in want]
    os.makedirs(a.out, exist_ok=True)
    stills, clips, manifest = [], [], []
    for sid, beats in shorts:
        first_setting = beats[0].split('|')[2].strip() if beats else ''
        for b in beats:
            bid_kind, size, setting, action, move = [x.strip() for x in b.split('|')]
            if re.match(r'(the )?same\b', setting, re.I) and first_setting and '(' not in setting:
                setting = f"{setting} ({first_setting})"
            bid, kind = bid_kind.split(' ', 1)
            who = ident(action)
            shot = SIZE.get(size.lower(), size)
            if kind.startswith('still'):
                frozen = FROZEN if bid.endswith('S1') else ''
                stills.append(f"{bid} | {STYLE} {who + ' ' if who else ''}{shot.capitalize()}, {setting}: {action}. {frozen} {MOOD} {FRAME} {NEG}".replace('  ', ' '))
            else:
                clips.append(f"{bid} | {STYLE} {who + ' ' if who else ''}{shot.capitalize()}, {setting}: {action}. Camera: {MOVE.get(move, move)}. {CLIP} {MOOD} {FRAME} {NEG}")
            manifest.append(dict(topic=sid, id=bid, type='clip' if kind.startswith('clip') else 'still', shot=size, move=move))
    lf_stills, lf_clips = [], []
    for lid, d in lfs:
        scenes = (d.get('screenplay') or {}).get('scenes') or d.get('scenes') or []
        for sc in scenes:
            who = ident(sc['action'] + ' ' + sc['setting'])
            shot = SIZE.get(sc['size'].lower(), sc['size'])
            if sc.get('kind') == 'clip':
                lf_clips.append(f"{sc['id']} | {STYLE} {who + ' ' if who else ''}{shot.capitalize()}, {sc['setting']}: {sc['action']}. Camera: {MOVE.get(sc['move'], sc['move'])}. {CLIP} {MOOD} {FRAME16} {NEG}".replace('  ', ' '))
            else:
                lf_stills.append(f"{sc['id']} | {STYLE} {who + ' ' if who else ''}{shot.capitalize()}, {sc['setting']}: {sc['action']}. {MOOD} {FRAME16} {NEG}".replace('  ', ' '))
            manifest.append(dict(topic=lid, id=sc['id'], type='longform_clip' if sc.get('kind') == 'clip' else 'longform_still', shot=sc['size'], move=sc['move'], starts_at=sc['starts_at']))
    thumbs = []
    for lid, d in lfs:
        for k, (concept, light) in enumerate(zip(d.get('thumbnail_concepts', [])[:2], ['warm lamp light', 'cool evening light']), 1):
            thumbs.append(f"{lid.replace('-', '')}-T{k} | {STYLE} {ident(concept) + ' ' if ident(concept) else ''}Large close-up of the face and shoulders, the expression is clear and readable at a glance, at 120 pixels wide: {concept}. Lighting: {light}, adapted to the setting. One strong focal point, nothing else competing. {FRAME16} {NEG}")
    for name, lines in [('stills_master_prompt.txt', stills), ('clips_prompts.txt', clips), ('longform_stills.txt', lf_stills), ('longform_clips.txt', lf_clips), ('thumbnail_prompts.txt', thumbs)]:
        open(os.path.join(a.out, name), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
    print(f"{len(shorts)} Shorts: {len(stills)} stills, {len(clips)} clips; {len(lfs)} long-forms: {len(lf_stills)} scene stills + {len(lf_clips)} scene clips; {len(thumbs)} thumbnail prompts -> {a.out}")

if __name__ == '__main__':
    main()
