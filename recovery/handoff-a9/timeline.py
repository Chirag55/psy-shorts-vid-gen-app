import re,sys,yaml
from second_person import M as CHANGED
STOP=set("the a an and or but to of in on at for with from by is are was were be been it its this that these those you your yours they them their he she his her we our i me my not no so as if then than just still even also very can could would will do does did have has had into about over after before when what which who how why one two three".split())
A9MAP={'D43':[(0,0,0,None),(1,0,1,None),(2,0,3,None),(3,0,3,None),(4,0,5,None),(5,0,5,None),(6,0,6,None),(7,0,7,None),(8,0,8,None),(9,0,9,None)],
'D19':[(0,0,0,None),(1,0,1,None),(2,0,2,None),(3,0,3,None),(3,3,4,None),(4,0,4,None),(5,0,5,None),(6,0,6,9),(6,10,6,11),(6,12,6,14)],
'D23':[(0,0,0,None),(1,0,1,None),(2,0,3,None),(3,0,3,None),(4,0,6,None),(5,0,6,None),(7,0,8,None),(9,0,9,5),(9,6,9,10),(9,11,9,11)],
'D61':[(0,0,0,4),(0,5,0,None),(1,0,2,None),(3,0,3,None),(4,0,4,None),(4,4,5,0),(5,0,5,2),(5,3,5,5),(5,6,5,9),(5,10,5,10)],
'D16':[(0,0,0,None),(1,0,1,None),(2,0,3,None),(4,0,5,None),(5,0,5,None),(6,0,6,None),(7,0,7,None),(8,0,8,3),(8,4,8,9),(8,10,8,11)]}
def fmt(x): return ('%.1f'%x)
def build(nar,est,N,emph=(),starts=None):
    toks=[]  # (word, sent_idx, ends_punct)
    for si,s in enumerate(nar):
        ws=s.split()
        for wi,w in enumerate(ws): toks.append([w,si,bool(re.search(r'[.,?!:;—…]$',w)) or wi==len(ws)-1,wi==len(ws)-1])
    nat=0.5*len(toks)+0.4*len(nar); sc=est/nat
    t=0;times=[]
    for w,si,pu,last in toks:
        s0=t;t+=0.5*sc;times.append((s0,t))
        if last: t+=0.4*sc
    T=est
    # subtitle blocks
    segs=[];cur=[]
    for i,(w,si,pu,last) in enumerate(toks):
        cur.append(i)
        if pu: segs.append(cur);cur=[]
    if cur: segs.append(cur)
    blocks=[]
    for sg in segs:
        n=len(sg)
        if n<=5: parts=[sg]
        else:
            k=-(-n//5); sz=-(-n//k); parts=[sg[j:j+sz] for j in range(0,n,sz)]
            if len(parts[-1])==1 and len(parts)>1: parts[-2]+=parts.pop()
        for p in parts: blocks.append(p)
    cands=[p[-1] for p in blocks[:-1]]
    cut_t=lambda i:times[i][1]+(0.2*sc if toks[i][3] else 0)
    cuts=[];prev=0.0
    if starts:
        base=[0]
        for si in range(len(nar)): base.append(base[-1]+len(nar[si].split()))
        def wi(l,w): return base[l]+(w if w is not None else len(nar[l].split())-1)
        lo=[times[wi(la,wa)][0] for la,wa,lb,wb in starts]
        hi0=[times[wi(lb,wb)][1] for la,wa,lb,wb in starts]
        lo0=lo
        step=0.05; grid=[round(i*step,2) for i in range(int(T/step)+1)]
        ideal=T/N; INF=1e18
        for slack in (0,0.4,0.8,1.2,1.8,2.5,4):
          lo=[max(0,x-slack) for x in lo0]; hi=[x+slack for x in hi0]
          best=[{} for _ in range(N)]
          best[0]={0.0:(0.0,None)}
          for k in range(1,N):
              for t in grid:
                  if t<lo[k]-1e-9 or t>hi[k]+1e-9 or t>T-1.2*(N-k): continue
                  bc=None
                  for pt,(c,_) in best[k-1].items():
                      if t-pt<1.2: continue
                      cc=c+(t-pt-ideal)**2
                      if bc is None or cc<bc[0]: bc=(cc,pt)
                  if bc: best[k][t]=bc
          endk=None
          for t,(c,_) in best[N-1].items():
            cc=c+(T-t-ideal)**2
            if endk is None or cc<endk[0]: endk=(cc,t)
          if endk is not None: break
        if endk is None: raise SystemExit('no feasible timing')
        st=[0.0]*N; t=endk[1]
        for k in range(N-1,0,-1):
            st[k]=t; t=best[k][t][1]
        shots_fixed=[(st[k],st[k+1] if k+1<N else T) for k in range(N)]
    HOOK=2.3
    for k in range(1,N if not starts else 1):
        ideal=HOOK+(k-1)*(T-HOOK)/max(1,N-1) if k>1 else HOOK
        if k==1:
            opts=[i for i in range(len(toks)-1) if 2.0<=cut_t(i)<=2.5]
            if not opts: opts=[i for i in range(len(toks)-1) if cut_t(i)>1.5]
        else:
            opts=[i for i in cands if cut_t(i)>prev+1.2 and cut_t(i)<T-1.2*(N-k)]
            if not opts: opts=[i for i in range(len(toks)-1) if cut_t(i)>prev+1.0]
        i=min(opts,key=lambda i:abs(cut_t(i)-ideal)); cuts.append(i); prev=cut_t(i)
    shots=[];s=0.0
    for i in cuts:
        ct=cut_t(i)
        shots.append((s,ct));s=ct
    shots.append((s,T))
    if starts: shots=shots_fixed
    out=[]
    for bi,p in enumerate(blocks):
        a=times[p[0]][0]; b=times[p[-1]][1]
        nxt=times[blocks[bi+1][0]][0] if bi+1<len(blocks) else T
        b=min(nxt,b+0.15) if bi+1<len(blocks) else min(T,b+0.2)
        words=[toks[i][0] for i in p]
        cl=[re.sub(r"[^\w']","",w).lower() for w in words]
        hi=None
        for j,c in enumerate(cl):
            if c in emph: hi=j;break
        if hi is None:
            cand=[(len(c),-j) for j,c in enumerate(cl) if c not in STOP and len(c)>=4]
            if cand: hi=-max(cand)[1]
        if hi is not None:
            w=words[hi]; m=re.match(r"^(\W*)(.*?)(\W*)$",w); words[hi]=m.group(1)+m.group(2).upper()+m.group(3)
        out.append((a,b,' '.join(words)))
    return shots,out
def run(t):
    parts=re.split(r'(?=\n### D\d+ — )',t);res=[]
    for b in parts:
        m=re.match(r'\n### (D\d+) — ',b)
        if not m: res.append(b);continue
        y=re.search(r'```yaml\n(.*?)```',b,re.S); d=yaml.safe_load(y.group(1))
        if d.get('status') not in('unused','in_progress'): res.append(b);continue
        nar=[x for x in b.split('**narration:**')[1].split('\n---')[0].strip().split('\n') if x.strip()]
        beats=d['visual_beats'];N=len(beats)
        if m.group(1) in CHANGED and not d.get('viral_batch'):
            w=sum(len(x.split()) for x in nar); est=round(w/2.0+0.4*len(nar))
            b=re.sub(r'^est_seconds: \d+','est_seconds: %d'%est,b,flags=re.M)
        else: est=int(d['est_seconds'])
        emph=set()
        for s in d.get('subtitles') or []:
            for w in re.findall(r"\b[A-Z][A-Z'\-]{3,}\b",s.split('|',1)[-1]): emph.add(w.lower())
        shots,blocks=build(nar,est,N,emph,A9MAP.get(m.group(1)) if d.get('viral_batch') else None)
        ids=[str(x).split(' ')[0].lstrip('"') for x in beats]
        b=re.sub(r'^(shot_times|subtitles):\n(?:- .*\n)+','',b,flags=re.M)
        b=re.sub(r'^subtitles: .*\n','',b,flags=re.M)
        add='shot_times:\n'+''.join('- "%s %s-%s"\n'%(i,fmt(s),fmt(e)) for i,(s,e) in zip(ids,shots))+'subtitles:\n'+''.join('- "%s-%s | %s"\n'%(fmt(a),fmt(z),tx.replace('"','\\"')) for a,z,tx in blocks)
        b=re.sub(r'^(est_seconds: .*\n)',lambda x:x.group(1)+add,b,count=1,flags=re.M)
        res.append(b)
    return ''.join(res)
if __name__=='__main__':
    p=sys.argv[1];o=run(open(p).read());open(p,'w').write(o)
