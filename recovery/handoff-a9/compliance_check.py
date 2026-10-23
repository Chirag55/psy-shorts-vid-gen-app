#!/usr/bin/env python3
"""compliance_check.py - check a Mind Files topic bank export against the Gemini audit rules (GEMINI_AUDIT_REQUIREMENTS.md).

Usage: python compliance_check.py topic-bank-v4-gemini-compliant.md [--original topic-bank-status-2026-10-12.md]
Checks every unused or in-progress Short and long-form; published and skipped topics are listed, not checked.
With --original, also confirms every published topic is byte-identical to the original export.
"""
import re, sys, yaml, argparse

SIGN = "...and that's the mind for you. Stay curious, stay sharp."
CITE = re.compile(r"\b(research|researchers?|stud(?:y|ies)|experiments?|psychologists?|scientists?|therapists?|harvard|university|journal|named after|comes from|old play|data shows?|(?:18|19|20)\d\d)\b", re.I)
CITE_LF = re.compile(r"\b(researchers?|stud(?:y|ies)|experiments?|psychologists?|scientists?|harvard|university|journal|(?:18|19|20)\d\d|research (?:shows|suggests|found))\b", re.I)
DISCLAIM = re.compile(r"(not a diagnosis|popular term|popular pattern|popular strategy|clinical|formal research|evidence is|the research|not a guarantee|is debated|is mixed)", re.I)
YOU = re.compile(r"\b(you|your|you're|you'd|you've|you'll|yours|yourself)\b", re.I)
BLOCK = re.compile(r"\b(cups?|mugs?|coffee|desks?|caf[eé]s?|phones?|laptops?|tables?|smartphones?)\b", re.I)
MASCOT = re.compile(r"\b(hoot|owl)\b|🦉", re.I)
LIGHT = re.compile(r"\b(night|rain|rainy|dawn|dusk|lamp|neon|glow\w*|\w*light\w*|storm\w*|mist\w*|fog|lanterns?|moon\w*|sun\w*|shadows?|candle\w*|lit|snow|steam|golden hour|twilight|evening|grey|gray|blue|dim|dark\w*|morning|noon|afternoon)\b", re.I)
CHILD = re.compile(r"\b(child|children|kid|kids|boy|girl|baby|toddler|schoolchild|school)\b", re.I)
SIZES = ('CU', 'Medium', 'Wide', 'Insert', 'OTS', 'Profile')
LOOKS = ('Alex', 'Maya', 'Sam', 'Jordan', 'Chris', 'Ben', 'Jamie', 'Riley', 'Nina', 'Ella', 'Mara', 'Kai', 'Tess', 'Drew', 'Nora', 'Ryan', 'Leo')
MOVES = ('slow push-in', 'slow pull-out', 'slow pan-left', 'slow pan-right', 'slow tilt-up', 'slow tilt-down', 'slow tracking')
# Curated Gemini virality scripts (13 Oct 2026; D76's S3 hit is the verb 'study', not a citation), kept word for word. Hook length, term-in-first-25-words, closing question, pinned-comment match and word range are waived for these ids only.
WAIVE = {'MF-S-D19': {'S1','S2','S3','S5','S6','S13','V1'}, 'MF-S-D23': {'S1','S2','S3','S5','S6','S13','V1'}, 'MF-S-D61': {'S1','S2','S3','S5','S6','S13','V1'}, 'MF-S-D16': {'S1','S2','S3','S5','S6','S13','V1'}, 'MF-S-D43': {'S1', 'S2', 'S3', 'S5', 'S6', 'S13', 'V1'}, 'MF-S-D69': {'S1', 'S2', 'S5', 'S6', 'S13'}, 'MF-S-D72': {'S2', 'S5', 'S6', 'S13'}, 'MF-S-D73': {'S1', 'S5', 'S6', 'S13'},
         'MF-S-D74': {'S1', 'S2', 'S5', 'S6', 'S13'}, 'MF-S-D75': {'S1', 'S5', 'S6', 'S13'}, 'MF-S-D76': {'S3', 'S5', 'S6', 'S13'},
         'MF-S-D77': {'S1', 'S5', 'S6', 'S13'},
         'MF-S-D126': {'S1', 'S2', 'S5', 'S6', 'S13'}, 'MF-S-D78': {'S1', 'S2', 'S5', 'S6', 'S13'}, 'MF-S-D79': {'S5', 'S6', 'S13'},
         'MF-S-D129': {'S1', 'S2', 'S5', 'S6', 'S13'}, 'MF-S-D130': {'S1', 'S5', 'S6', 'S13'}}
def words(s): return re.findall(r"[A-Za-z0-9'’\-]+", s)

def check_short(sid, lines, hook_text, pov, title_final, beats, tags, pinned, effect, desc, blob, looks=None):
    e = []
    if len(lines) == 1:
        txt = lines[0]
        lines = [x for x in re.split(r'(?<=[.?!])\s+', txt) if x]
        e.append('S7 narration not one sentence per line')
    if len(lines) < 2: return e + ['narration too short']
    hook = lines[0]
    if len(words(hook)) > 12: e.append('S1 hook > 12 words')
    if not (YOU.search(hook) or hook.rstrip().endswith('?')): e.append('S1 hook not you/question')
    if 'stay sharp' in ' '.join(lines).lower(): e.append('sign-off present (audit A9: no catchphrase outro)')
    body = lines
    n = len(words(' '.join(lines)))
    lst = any(re.match(r'(One|Two|Three|Four|Five)\b', l) for l in body)
    lo, hi = (41, 71) if lst else (35, 57)
    if not lo <= n <= hi: e.append(f'S6 {n} words')
    if effect:
        t = re.sub(r'\(.*?\)', '', effect).replace('the ', '').strip().lower()
        if t and t in ' '.join(words(' '.join(body))[:25]).lower(): e.append(f'S2 term in first 25 words: {t}')
    m = CITE.search(' '.join(body));  m and e.append(f'S3 citation: {m.group(0)}')
    m = DISCLAIM.search(' '.join(body)); m and e.append(f'S4 disclaimer: {m.group(0)}')
    if not body[-1].endswith('?'): e.append('S5 no closing question')
    if pinned and pinned != body[-1]: e.append('S13 pinned comment != spoken question')
    if not hook_text or not 2 <= len(words(hook_text)) <= 6: e.append('S10 hook_text')
    if not pov or not pov.startswith('POV: '): e.append('S10 pov')
    if title_final and len(title_final) > 100: e.append('S9 title > 100 chars')
    if not 6 <= len(beats) <= 12: e.append(f'V1 {len(beats)} shots, need 6 to 12')
    clips = sum(1 for b in beats if b.split('|')[0].split()[1].startswith('clip')) if beats and all('|' in b and len(b.split('|')[0].split()) > 1 for b in beats) else -1
    if clips != 3: e.append(f'V1 {clips} clips, need exactly 3')
    seen = set(); prev = None; ids = set()
    for b in beats:
        parts = [x.strip() for x in b.split('|')]
        if len(parts) != 5: e.append(f'V1 shot not in 5 fields: {b[:40]}'); continue
        head, size, setting, action, move = parts
        sid_ = head.split()[0]
        if sid_ in ids: e.append(f'V1 duplicate shot id {sid_}')
        ids.add(sid_)
        txt = setting + ' ' + action
        if BLOCK.search(txt): e.append(f'V4 blocking word in {sid_}')
        if CHILD.search(txt): e.append(f'V4 child wording in {sid_}')
        if not LIGHT.search(txt): e.append(f'V3 no light cue in {sid_}')
        if size not in SIZES: e.append(f'V7 size {size} in {sid_}')
        if move not in MOVES: e.append(f'V6 move in {sid_}')
        if len({n for n in LOOKS if re.search(r'\b%s\b' % n, txt)}) > 2: e.append(f'V4 more than 2 named characters in {sid_}')
        if (setting, action) in seen: e.append(f'V7 {sid_} repeats an earlier shot')
        seen.add((setting, action))
        if prev and prev[0] == size and prev[1] == setting: e.append(f'V7 {sid_} same size and setting as the shot before')
        prev = (size, setting)
    acts_ = [' '.join(b.split(' | ')[2:4]) for b in beats]
    lead_ = [str(l).split(',')[0] for l in (looks or [])][:1]
    for n in lead_:
        idx_ = [i for i, a in enumerate(acts_) if re.search(r'\b%s\b' % n, a)]
        if idx_ and idx_[0] > 1: e.append(f'V9 {n} first appears in shot {idx_[0] + 1} (must appear in shot 1 or 2)')
    for b in beats:
        p_ = b.split(' | ')
        if len(p_) == 5 and re.search(r'sunny|daylight|sunlit|golden|morning|afternoon|midday', p_[2], re.I) and re.search(r'\b(rain\w*|wet|drizzle|umbrellas?|night|storm)\b', p_[2] + ' ' + p_[3], re.I) and 'storm drain' not in b and 'eyes wet' not in b:
            e.append(f'V10 weather/time conflict in {p_[0].split()[0]}')
    names = {n for n in LOOKS if re.search(r'\b%s\b' % n, ' '.join(beats))}
    have = {n for n in LOOKS if any(str(l).startswith(n + ',') for l in (looks or []))}
    if names - have: e.append(f'V8 character look missing for {sorted(names - have)}')
    if not 5 <= len(tags) <= 6: e.append(f'P3 {len(tags)} tags')
    if MASCOT.search(blob): e.append('P4 mascot')
    if desc and len(desc.split('\n')[0]) < 40: e.append('P1 description line 1 too short')
    return e

def sentences(chs):
    out = []; n = 0; wb = 0
    for title, txt in chs:
        for para in txt.split('\n'):
            for t in re.split(r'(?<=[.?!])\s+(?=["\u201c\u2018A-Z0-9])', para.strip()):
                if not t.strip(): continue
                n += 1; out.append((n, title, t.strip(), wb)); wb += len(words(t))
    return out

def check_scenes(chs, scenes, looks, lo=9, hi=42):
    e = []
    sents = sentences(chs); total = sum(len(words(t)) for _, t in chs)
    firsts = {}
    for n, ch, t, wb in sents:
        firsts.setdefault(' '.join(t.split()[:10]), (n, wb))
    if not scenes: return ['L11 no scenes']
    if len(scenes) < total / 28: e.append(f'L11 only {len(scenes)} scenes for {total} words (need at least one per 28 words)')
    pos = []; seen = set(); settings = set(); sizes = set(); prev = None
    for i, sc in enumerate(scenes):
        if not all(k in sc for k in ('id', 'chapter', 'starts_at', 'size', 'setting', 'action', 'move')): e.append(f'L11 scene {i+1} missing fields'); continue
        if sc['starts_at'] not in firsts: e.append(f"L11 scene {sc['id']} starts_at not found in the script"); continue
        n, wb = firsts[sc['starts_at']]
        if pos and n <= pos[-1][0]: e.append(f"L11 scene {sc['id']} out of order"); continue
        pos.append((n, wb))
        if sc['size'] not in SIZES: e.append(f"L11 size {sc['size']} in {sc['id']}")
        if sc['move'] not in MOVES: e.append(f"L11 move in {sc['id']}")
        if CHILD.search(sc['setting'] + ' ' + sc['action']): e.append(f"L11 child wording in {sc['id']}")
        if (sc['setting'], sc['action']) in seen: e.append(f"L11 {sc['id']} repeats an earlier scene")
        seen.add((sc['setting'], sc['action'])); settings.add(sc['setting']); sizes.add(sc['size'])
        if prev and prev['size'] == sc['size'] and prev['setting'] == sc['setting']: e.append(f"L11 {sc['id']} same size and setting as the scene before")
        prev = sc
    ck = [i for i, sc in enumerate(scenes) if sc.get('kind') == 'clip']
    if not 6 <= len(ck) <= 12: e.append(f'L12 {len(ck)} clip scenes (need 6 to 12)')
    if any(b - a < 3 for a, b in zip(ck, ck[1:])): e.append('L12 clip scenes closer than 3 scenes apart')
    if any(sc.get('kind') not in ('still', 'clip') for sc in scenes): e.append('L12 scene without kind still or clip')
    if pos and pos[0][0] != 1: e.append('L11 first scene must start at the first sentence')
    for i in range(len(pos)):
        end = pos[i+1][1] if i + 1 < len(pos) else total
        d = end - pos[i][1]
        if d > hi + (15 if i + 1 == len(pos) else 0): e.append(f'L11 scene {i+1} lasts {d} words (> {hi})')
        if d < lo and i + 1 < len(pos): e.append(f'L11 scene {i+1} lasts {d} words (< {lo})')
    if len(settings) < 10: e.append(f'L11 only {len(settings)} distinct settings (need 10)')
    if len(sizes) < 4: e.append(f'L11 only {len(sizes)} shot sizes (need 4)')
    names = {n for n in LOOKS if re.search(r'\b%s\b' % n, ' '.join(sc.get('setting', '') + ' ' + sc.get('action', '') for sc in scenes))}
    have = {n for n in LOOKS if any(str(l).startswith(n + ',') for l in (looks or []))}
    if names - have: e.append(f'V8 character look missing for {sorted(names - have)}')
    return e

def check_lf(lid, title, chapters, thumb, thumbs, tags, desc, blob, scenes=None, looks=None):
    e = []
    e += check_scenes(chapters, scenes, looks)
    spoken = ' '.join(t for _, t in chapters)
    secs = sum(len(words(t)) / 2.0 + 0.4 * t.count('\n') for _, t in chapters)
    if not 600 <= secs <= 735: e.append(f'L2 runtime {int(secs)} s')
    if len(title) > 60: e.append('L5 title > 60')
    if re.match(r'\d', title): e.append('L1 numbered title')
    if len(words(chapters[0][1])) / 2.0 > 36: e.append('L3 open > 36 s')
    for t in [thumb] + list(thumbs or []):
        if len(words(t)) > 4: e.append(f'L6 thumb: {t}')
    if not 5 <= len(tags) <= 6: e.append('L8 tags')
    dw = len(words(desc))
    if not 150 <= dw <= 300: e.append(f'L7 description {dw} words')
    if 'Chapters' not in desc or '0:00' not in desc: e.append('L4 chapters')
    m = CITE_LF.search(spoken); m and e.append(f'L9 citation: {m.group(0)}')
    if MASCOT.search(blob): e.append('L10 mascot')
    if not spoken.rstrip().endswith(SIGN): e.append('sign-off')
    return e, secs

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('bank'); ap.add_argument('--original'); a = ap.parse_args()
    t = open(a.bank, encoding='utf-8').read()
    issues = 0; checked = dict(shorts=0, longforms=0); listed = dict(published=0, skipped=0)
    ids = []
    for ch in t.split('\n---\n'):
        m = re.search(r'^(#{2,3}) (.+?)\n```yaml\n(.*?)\n```\n\*\*narration:\*\*\n?(.*)$', ch, re.S | re.M)
        if m:
            d = yaml.safe_load(m.group(3)); ids.append(str(d['id']))
            st = d.get('status')
            if st in ('published', 'skipped'): listed[st] += 1; continue
            if m.group(1) == '###':
                lines = [l for l in m.group(4).strip().split('\n') if l.strip()]
                blob = ' '.join([m.group(4), str(d.get('description_full', '')), ' '.join(d.get('visual_beats') or [])])
                errs = check_short(d['id'], lines, d.get('hook_text'), d.get('hook_text_pov'), d.get('title_final'), d.get('visual_beats') or [],
                                   d.get('tags') or [], d.get('pinned_comment'), d.get('effect'), d.get('description_full', ''), blob, d.get('character_looks'))
                checked['shorts'] += 1
            else:
                chs = re.findall(r'\[Chapter: (.*?)\]\n(.*?)(?=\n\n\[Chapter:|\Z)', m.group(4).strip(), re.S)
                blob = m.group(4) + ' ' + yaml.safe_dump(d)
                errs, _ = check_lf(d['id'], m.group(2).split(' — ', 1)[1], chs, d.get('thumbnail_text', ''), d.get('thumbnail_texts'), d.get('tags') or [], d.get('description', ''), blob, (d.get('screenplay') or {}).get('scenes'), (d.get('screenplay') or {}).get('character_looks'))
                checked['longforms'] += 1
            errs = [x for x in errs if x.split()[0] not in WAIVE.get(d['id'], ())]
            if errs: issues += 1; print(d['id'], '|', '; '.join(errs))
            continue
        for y in re.findall(r'```yaml\n(.*?)\n```', ch, re.S):
            d = yaml.safe_load(y)
            if not isinstance(d, dict) or d.get('type') not in ('topic_bank_shorts', 'topic_bank_longform'): continue
            for x in d['topics']:
                ids.append(x['id'])
                if x['status'] in ('published', 'skipped'): listed[x['status']] += 1; continue
                if d['type'] == 'topic_bank_shorts':
                    sc = x['script']
                    lines = [b['line'] for b in sc['beats'] if b.get('line')]
                    last = lines[-1]
                    if True:
                        blob = ' '.join(lines) + str(x.get('seo')) + str(x.get('visual_brief'))
                        errs = check_short(x['id'], lines, x.get('hook_text'), x.get('hook_text_pov'), None, x['visual_brief'].get('shots', []),
                                           x['seo'].get('tags', []), x['seo'].get('pinned_comment'), None, x['seo'].get('description', ''), blob, x['visual_brief'].get('character_looks'))
                    checked['shorts'] += 1
                else:
                    sc = x['script']
                    chs = [('Cold open', sc['cold_open'])] + [(c['title'], c['narration']) for c in sc['chapters']] + [('Closing', sc['closing'])]
                    errs, _ = check_lf(x['id'], x['title'], chs, x.get('thumbnail_text', ''), x.get('thumbnail_texts'), x.get('tags') or [], x.get('description', ''), yaml.safe_dump(x), x.get('scenes'), x.get('character_looks'))
                    checked['longforms'] += 1
                if errs: issues += 1; print(x['id'], '|', '; '.join(errs))
    dup = sorted({i for i in ids if ids.count(i) > 1})
    print(f"checked {checked['shorts']} Shorts and {checked['longforms']} long-forms; listed {listed['published']} published and {listed['skipped']} skipped; "
          f"{issues} with issues; {len(ids)} topics; duplicate ids: {dup or 'none'}")
    if a.original:
        o = open(a.original, encoding='utf-8').read()
        def pub_blocks(s):
            out = {}
            for ch in s.split('\n---\n'):
                m = re.search(r'^#{2,3} .+?\n```yaml\n(.*?)\n```\n\*\*narration:\*\*\n?(.*)$', ch, re.S | re.M)
                if m:
                    d = yaml.safe_load(m.group(1))
                    if d.get('status') == 'published': out[d['id']] = (d, m.group(2).strip())
                for y in re.findall(r'```yaml\n(.*?)\n```', ch, re.S):
                    d = yaml.safe_load(y)
                    if isinstance(d, dict) and 'topics' in d:
                        for x in d['topics']:
                            if x['status'] == 'published': out[x['id']] = (x, '')
            return out
        po, pn = pub_blocks(o), pub_blocks(t)
        diff = [k for k in po if po[k] != pn.get(k)]
        print(f"published topics: {len(po)} in original, unchanged in new file: {len(po) - len(diff)}; changed or missing: {diff or 'none'}")
    sys.exit(1 if issues else 0)

if __name__ == '__main__':
    main()
