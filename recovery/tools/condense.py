"""Make hermes-dec module output shorter to read: exports collapsed, method calls re-joined, closure slots named."""
import re, sys

def condense(text):
    lines = text.split('\n')
    # 1. export getters: defineProperty(exports, 'NAME', {get(){return slot}})
    out = []
    i = 0
    exports = []
    while i < len(lines):
        l = lines[i]
        if re.match(r"\s*r\d+ = \{'enumerable': true, 'get': null\};", l) and i + 6 < len(lines):
            blk = lines[i:i + 9]
            j = '\n'.join(blk)
            m = re.search(r"r0 = (_closure\d+_slot\d+|[\w$]+);\s*\n\s*return r0;[\s\S]*?r\d+ = '([^']+)';\s*\n\s*r\d+ = r\d+\.bind\(r\d+\)\(r\d+, r\d+, r\d+\);", j)
            if m:
                exports.append((m.group(2), m.group(1)))
                # drop the defineProperty fetch line before, if any
                if out and re.search(r"= r\d+\.defineProperty;", out[-1]):
                    out.pop()
                if out and re.search(r"r\d+ = r\d+\.Object;", out[-1]):
                    out.pop()
                end = i + j[:m.end()].count('\n') + 1
                i = end
                continue
        out.append(l)
        i += 1
    lines = out
    # 2. name closure slots after the function stored in them
    names = {}
    for k, l in enumerate(lines):
        m = re.match(r"\s*var (_closure\d+_slot\d+) = (r\d+);", l)
        if m:
            for back in range(k - 1, max(-1, k - 400), -1):
                mm = re.match(r"\s*%s = function\(.*Original name: ([\w$?]+)" % m.group(2), lines[back])
                if mm:
                    nm = mm.group(1).lstrip('?')
                    if m.group(1) not in names:
                        names[m.group(1)] = nm
                    break
                if re.match(r"\s*%s = " % m.group(2), lines[back]):
                    break
    text = '\n'.join(lines)
    for slot, nm in sorted(names.items(), key=lambda x: -len(x[0])):
        text = re.sub(r'\b%s\b' % slot, '%s@%s' % (nm, slot.split('_slot')[1]), text)
    # 3. rX = rY.prop; ... rZ = rX.bind(rY)(args)  ->  rZ = rY.prop(args)
    lines = text.split('\n')
    last = {}
    out = []
    for l in lines:
        m = re.match(r"(\s*)(r\d+) = (r\d+|global)\.([\w$]+);\s*$", l)
        mb = re.search(r"\b(r\d+)\.bind\((r\d+|global)\)\(", l)
        if mb and mb.group(1) in last and last[mb.group(1)][0] == mb.group(2):
            obj, prop, idx = last[mb.group(1)][0], last[mb.group(1)][1], last[mb.group(1)][2]
            l = l[:mb.start()] + '%s.%s(' % (obj, prop) + l[mb.end():]
            if idx == len(out) - 1:
                out.pop()
        if m:
            last[m.group(2)] = (m.group(3), m.group(4), len(out))
        else:
            mm = re.match(r"\s*(r\d+) = ", l)
            if mm and mm.group(1) in last:
                del last[mm.group(1)]
        out.append(l)
    text = '\n'.join(out)
    text = re.sub(r"global\.", "", text)
    head = 'EXPORTS: ' + ', '.join('%s=%s' % (n, names.get(s, s)) for n, s in exports) + '\n'
    return head + text

if __name__ == '__main__':
    print(condense(open(sys.argv[1]).read()))
