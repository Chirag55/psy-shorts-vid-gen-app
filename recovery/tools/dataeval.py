"""Symbolically evaluate straight-line hermes-dec data code (object/array literal building) to Python values."""
import re, ast, json, sys

class Unk:
    def __init__(self, src): self.src = src
    def __repr__(self): return 'UNK(%s)' % self.src

def lit(expr):
    e = expr.strip()
    while e.startswith('(') and e.endswith(')') and balanced(e[1:-1]):
        e = e[1:-1].strip()
    m = re.match(r'^new Array\((\d+)\)$', e)
    if m: return [None] * int(m.group(1))
    py = re.sub(r"\b(null|undefined)\b(?=(?:[^'\"]|'[^']*'|\"[^\"]*\")*$)", 'None', e)
    py = re.sub(r"\btrue\b(?=(?:[^'\"]|'[^']*'|\"[^\"]*\")*$)", 'True', py)
    py = re.sub(r"\bfalse\b(?=(?:[^'\"]|'[^']*'|\"[^\"]*\")*$)", 'False', py)
    try:
        return ast.literal_eval(py)
    except Exception:
        return Unk(e)

def balanced(s):
    d = 0; q = None; i = 0
    while i < len(s):
        c = s[i]
        if q:
            if c == '\\': i += 1
            elif c == q: q = None
        elif c in '\'"': q = c
        elif c in '([{': d += 1
        elif c in ')]}':
            d -= 1
            if d < 0: return False
        i += 1
    return d == 0

def run(lines):
    env, slots = {}, {}
    for raw in lines:
        l = raw.strip().rstrip(';')
        m = re.match(r'^var (_closure0_slot\d+|[\w$]+@\d+) = (.*)$', l)
        if m:
            v = m.group(2).strip()
            slots[m.group(1)] = env.get(v, lit(v)) if re.match(r'^r\d+$', v) else lit(v)
            continue
        m = re.match(r'^(r\d+)\[(\d+)\] = (.*)$', l)
        if m:
            tgt = env.get(m.group(1)); idx = int(m.group(2)); v = m.group(3).strip()
            val = env.get(v, None) if re.match(r'^r\d+$', v) else lit(v)
            if isinstance(tgt, dict):
                keys = list(tgt.keys())
                if idx < len(keys): tgt[keys[idx]] = val
            elif isinstance(tgt, list):
                while len(tgt) <= idx: tgt.append(None)
                tgt[idx] = val
            continue
        m = re.match(r"^(r\d+)\['([^']+)'\] = (.*)$", l)
        if m:
            tgt = env.get(m.group(1)); v = m.group(3).strip()
            val = env.get(v, None) if re.match(r'^r\d+$', v) else lit(v)
            if isinstance(tgt, dict): tgt[m.group(2)] = val
            continue
        m = re.match(r'^(r\d+) = (.*)$', l)
        if m:
            v = m.group(2).strip()
            env[m.group(1)] = env.get(v) if re.match(r'^r\d+$', v) else lit(v)
    return slots

def exports_of(text):
    m = re.search(r'^EXPORTS: (.*)$', text, re.M)
    out = {}
    if m and m.group(1).strip():
        for part in m.group(1).split(', '):
            k, v = part.split('=', 1)
            out[k] = v
    return out

def to_ts(v, ind=0):
    sp = '  ' * ind
    if isinstance(v, Unk): return '/* TODO: %s */ undefined' % v.src
    if isinstance(v, dict):
        if not v: return '{}'
        items = []
        for k, x in v.items():
            key = k if re.match(r'^[A-Za-z_$][\w$]*$', k) else json.dumps(k)
            items.append('%s  %s: %s' % (sp, key, to_ts(x, ind + 1)))
        one = '{ ' + ', '.join(i.strip() for i in items) + ' }'
        return one if len(one) + len(sp) < 110 and '\n' not in one else '{\n' + ',\n'.join(items) + ',\n' + sp + '}'
    if isinstance(v, list):
        parts = [to_ts(x, ind + 1) for x in v]
        one = '[' + ', '.join(parts) + ']'
        return one if len(one) + len(sp) < 110 and '\n' not in one else '[\n' + ',\n'.join(sp + '  ' + p for p in parts) + ',\n' + sp + ']'
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, str): return json.dumps(v, ensure_ascii=False)
    if isinstance(v, int) and v > 2**31: return str(v - 2**32)
    return json.dumps(v)

if __name__ == '__main__':
    text = open(sys.argv[1]).read()
    slots = run(text.split('\n'))
    ex = exports_of(text)
    for name, slot in ex.items():
        print('export const %s = %s;\n' % (name, to_ts(slots.get(slot, Unk('missing ' + slot)))))
