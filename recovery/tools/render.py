"""Render a TS template: {F('prefix')} → JSON literal found in the pseudo source; {{ }} → { }."""
import sys, re; sys.path.insert(0, '/tmp/apk/gen')
from lit import find, J
tpl_path, src_path, out_path = sys.argv[1:4]
src = open(src_path).read()
tpl = open(tpl_path).read()
def F(p, n=0): return J(find(src, p.replace('\\n', '\n'), n))
out, i = [], 0
while i < len(tpl):
    if tpl.startswith('{F(', i):
        depth, j = 0, i + 1
        # find matching ')}' accounting for parentheses
        k = i + 2
        depth = 0
        while True:
            c = tpl[k]
            if c == '(': depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0: break
            elif c in '\'"':
                q = c; k += 1
                while tpl[k] != q:
                    if tpl[k] == '\\': k += 1
                    k += 1
            k += 1
        expr = tpl[i + 1:k + 1]
        out.append(eval(expr, {'F': F, 'chr': chr}))
        i = k + 2  # skip ')}'
    elif tpl.startswith('{{', i): out.append('{'); i += 2
    elif tpl.startswith('}}', i): out.append('}'); i += 2
    else: out.append(tpl[i]); i += 1
text = ''.join(out)
# the template was written as a python f-string: undo python escapes of backslashes
text = text.encode('latin-1', 'backslashreplace').decode('unicode_escape') if False else text.replace('\\\\', '\\')
open(out_path, 'w').write(text)
