"""Second pass over condensed hermes-dec output: inline single-use temporaries inside straight-line runs."""
import re, sys

SEG_END = re.compile(r"^\s*(case \d+:|.*continue _fun|return\b|throw\b|.*\{\s*(//.*)?$|\s*\};?\s*$|\s*\}\s*$)")
ASSIGN = re.compile(r"^(\s*)(r\d+) = (.*?);\s*$")

def tokens_of(line, reg):
    return len(re.findall(r'\b%s\b' % reg, line))

def simplify(text):
    lines = text.split('\n')
    changed = True
    passes = 0
    while changed and passes < 6:
        changed = False
        passes += 1
        out = list(lines)
        i = 0
        n = len(out)
        dead = set()
        while i < n:
            m = ASSIGN.match(out[i])
            if not m or i in dead:
                i += 1; continue
            reg, expr = m.group(2), m.group(3)
            if 'function' in expr or reg in re.findall(r'\br\d+\b', expr):
                i += 1; continue
            # find next mention within segment
            j = i + 1
            use = None
            while j < n:
                if j in dead: j += 1; continue
                l = out[j]
                c = tokens_of(l, reg)
                if c:
                    use = j
                    break
                if SEG_END.match(l):
                    break
                j += 1
            if use is None:
                i += 1; continue
            l = out[use]
            # the use must not itself be a plain reassignment of reg (that would make the store dead)
            mu = ASSIGN.match(l)
            if mu and mu.group(2) == reg and tokens_of(mu.group(3), reg) == 0:
                if '(' not in expr and 'new ' not in expr:
                    dead.add(i); changed = True
                i += 1; continue
            if tokens_of(l, reg) != 1:
                i += 1; continue
            # after the use, reg must be reassigned (without reading) before the segment ends
            k = use + 1
            killed = False
            if mu and mu.group(2) == reg:
                killed = True  # e.g. r2 = r2.trim()  -> the use also rewrites reg
            while not killed and k < n:
                if k in dead: k += 1; continue
                lk = out[k]
                mk = ASSIGN.match(lk)
                if mk and mk.group(2) == reg and tokens_of(mk.group(3), reg) == 0:
                    killed = True; break
                if tokens_of(lk, reg):
                    break
                if SEG_END.match(lk):
                    break
                k += 1
            if not killed:
                i += 1; continue
            # do not inline into the target of an assignment like reg[1] = ... or reg.x = ...
            if re.search(r'\b%s\s*(\[[^\]]*\]|\.[\w$]+)\s*=[^=]' % reg, l) and not (mu and mu.group(2) != reg and False):
                i += 1; continue
            rep = expr if re.match(r"^[\w$@.'\"\[\]/\\ ]+$", expr) and len(expr) < 80 else '(%s)' % expr
            out[use] = re.sub(r'\b%s\b' % reg, lambda _: rep, l, count=1)
            dead.add(i); changed = True
            i += 1
        lines = [l for k, l in enumerate(out) if k not in dead]
    text = '\n'.join(lines)
    text = re.sub(r"\(HermesInternal\.concat\)\(", "concat(", text)
    return text

if __name__ == '__main__':
    print(simplify(open(sys.argv[1]).read()))
