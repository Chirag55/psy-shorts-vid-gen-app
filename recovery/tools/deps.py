import re, json, glob
files = sorted(glob.glob('mods/m*.js'))
info = {}
prev_tail = None
for f in files:
    k = int(f[6:10])
    txt = open(f).read()
    if prev_tail:
        info[k] = prev_tail
    tail = txt[-3000:]
    m = re.findall(r"r\d+ = (\d+);\s*\n\s*r1[01] = (\[[\d, ]*\]|new Array\(\d+\)(?:;\s*\n\s*r1[01]\[\d+\] = \d+)*)", tail)
    prev_tail = None
    if m:
        mid, d = m[-1]
        if d.startswith('['):
            deps = json.loads(d)
        else:
            deps = [int(x) for x in re.findall(r"r1[01]\[\d+\] = (\d+)", d)]
        prev_tail = {'metro': int(mid), 'deps': deps}
json.dump(info, open('deps.json', 'w'))
print(len(info), info.get(985), info.get(984), info.get(1), info.get(2))
