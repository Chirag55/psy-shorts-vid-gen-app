import re, sys, os, json
src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
pat = re.compile(r'^    r\d+ = function\(a0, a1, a2, a3, a4, a5, a6\)')
idx, cur, buf = [], None, []
def flush():
    if cur is not None:
        open(os.path.join(outdir, 'm%04d.js' % cur), 'w').write(''.join(buf))
        idx.append({'id': cur, 'lines': len(buf)})
for line in open(src):
    if pat.match(line):
        flush(); cur = 0 if cur is None else cur + 1; buf = []
    if cur is not None: buf.append(line)
flush()
json.dump(idx, open(os.path.join(outdir, 'index.json'), 'w'))
