import re,sys,yaml,collections
sys.path.insert(0,'.')
import cast
CAST=cast.CAST
M=['Ryan','Kai','Drew','Leo','Chris','Jordan','Ben','Sam','Alex']
F=['Nora','Mara','Tess','Maya','Jamie','Riley','Nina','Ella']
MS={'man','salesman','uncle','father','brother','boy','guy'}
FS={'woman','mother','aunt','sister','girl'}
ROLES=sorted(MS|FS|{'stranger','partner','manager','coworker','colleague','salesperson','guard','doctor','cousin','boss','waiter','officer','customer','clerk','neighbor','friend','teacher','person'})
DET=r'(?:the|a|an|her|his|their|my|your|another)'
def run(t):
    parts=re.split(r'(?=\n### D\d+ — )',t); out=[]
    for b in parts:
        m=re.match(r'\n### (D\d+) — ',b)
        if not m: out.append(b);continue
        y=re.search(r'```yaml\n(.*?)```',b,re.S); d=yaml.safe_load(y.group(1))
        if d.get('status') in('published','skipped') or not d.get('visual_beats'): out.append(b);continue
        looks=d.get('character_looks') or []
        leads=[l.split(',')[0] for l in looks]
        vb=[str(s) for s in d['visual_beats']]
        cnt=collections.Counter()
        for s in vb:
            for r in ROLES:
                if re.search(DET+r'\s+(?:[\w-]+\s+)?'+r+r"\b",s.lower()) : cnt[r]+=1
        cnt={r:c for r,c in cnt.items() if c>=2}
        if not cnt or not leads or len(leads)>1: out.append(b);continue
        role=max(cnt,key=lambda r:(cnt[r],r))
        lines=' '.join(s.lower() for s in vb if re.search(r'\b'+role+r'\b',s.lower()))
        if role in MS: g='M'
        elif role in FS: g='F'
        else:
            he=len(re.findall(r'\b(he|his|him)\b',lines)); she=len(re.findall(r'\b(she|her|hers)\b',lines))
            lg='M' if leads[0] in M or leads[0] in('Alex','Sam') else 'F'
            g=('M' if he>she else 'F') if he!=she else ('F' if lg=='M' else 'M')
        pool=[n for n in (M if g=='M' else F) if n not in leads and not re.search(r'\b'+n+r'\b',' '.join(vb))]
        k=int(m.group(1)[1:]); name=pool[(k*3)%len(pool)]
        first=[True]
        def rep(mm):
            s=name
            if first[0] and role not in('man','woman','stranger','person','guy','girl','boy') and not b[mm.end():mm.end()+0]=='' :
                pass
            first[0]=False
            return s
        pat=re.compile(r'\b'+DET+r'\s+(?:[\w-]+\s+)?'+role+r'\b',re.I)
        # replace only inside visual_beats list lines
        def fix_section(sec):
            return '\n'.join(pat.sub(rep,l) if l.lstrip().startswith(('- ','"')) or l.startswith('- ') else l for l in sec.split('\n'))
        mm=re.search(r'(?m)^visual_beats:\n((?:- .*\n)+)',b)
        if not mm: out.append(b);continue
        sec=fix_section(mm.group(1).rstrip('\n'))+'\n'
        b=b[:mm.start(1)]+sec+b[mm.end(1):]
        # add look
        ml=re.search(r'(?m)^(character_looks:\n(?:- .*\n)+)',b)
        b=b[:ml.end(1)]+'- "%s"\n'%CAST[name]+b[ml.end(1):]
        out.append(b)
    return ''.join(out)
if __name__=='__main__':
    p=sys.argv[1];o=run(open(p).read());open(p,'w').write(o)
