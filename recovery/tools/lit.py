"""Pull JS string literals out of decompiled pseudo-code and re-emit them as JSON (valid TS)."""
import re, json, ast
def js_unquote(lit):
    q = lit[0]
    body = lit[1:-1]
    # JS escapes used by hermes-dec are Python-compatible except \' inside "..." and unicode \uXXXX (fine)
    return ast.literal_eval(q + body + q)
def find(src, prefix, nth=0):
    """Return the literal whose text starts with `prefix` (nth occurrence)."""
    pat = re.compile(r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")""")
    hits = []
    for m in pat.finditer(src):
        try:
            v = js_unquote(m.group(1))
        except Exception:
            continue
        if v.startswith(prefix):
            hits.append(v)
    if len(hits) <= nth: raise SystemExit("NOT FOUND: %r" % prefix)
    return hits[nth]
def J(s):
    return json.dumps(s, ensure_ascii=False)
