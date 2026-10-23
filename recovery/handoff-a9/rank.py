import re,sys,yaml
def run(t):
    parts=re.split(r'(?=\n### D\d+ — )',t);items=[]
    for i,b in enumerate(parts):
        m=re.match(r'\n### (D\d+) — (.*)',b)
        if not m: continue
        y=re.search(r'```yaml\n(.*?)```',b,re.S); d=yaml.safe_load(y.group(1))
        if d.get('status') not in('unused','in_progress'): continue
        if d.get('viral_batch'): items.append((i,m.group(1),m.group(2),d,(1,int(d['queue']),0),'Gemini upload plan #%d'%int(d['queue'])));continue
        au=d.get('audit') or ''
        a=re.search(r'hook (\d+)/10, title (\d+)/10',au)
        did=m.group(1)
        START=['D126','D78','D79','D129','D130']
        if did in START: tier,key,gs=2,START.index(did),'Gemini start-now list #%d'%(START.index(did)+1)
        elif 'virality batch' in au: tier,key,gs=3,int(did[1:]),'Gemini virality batch'
        elif a:
            sc=int(a.group(1))+int(a.group(2)); v=re.search(r'verdict (\w+)',au).group(1)
            tier,key,gs=4,(-sc+{'keep':0,'rewrite':100,'drop':200}.get(v,100)),'hook %s + title %s, %s'%(a.group(1),a.group(2),v)
        else: tier,key,gs=5,int(did[1:]),'not scored by Gemini'
        items.append((i,did,m.group(2),d,(tier,key,int(did[1:])),gs))
    items.sort(key=lambda x:x[4])
    rows=[]
    for r,(i,did,title,d,s,tag) in enumerate(items,1):
        b=parts[i]
        b=re.sub(r'^(queue|virality_rank|virality_score|gemini_score): .*\n','',b,flags=re.M)
        score=tag
        add=f'queue: {r}\nvirality_rank: {r}\ngemini_score: {score}\n'
        b=re.sub(r'^(priority: .*\n)',lambda x:x.group(1)+add,b,count=1,flags=re.M)
        parts[i]=b
        rows.append((r,did,title,score,d.get('status'),d.get('pillar'),d.get('virality'),'A9' if d.get('viral_batch') else ''))
    return ''.join(parts),rows
if __name__=='__main__':
    p=sys.argv[1];o,rows=run(open(p).read());open(p,'w').write(o)
    L=['# START HERE: virality ranking of every pending Short (22 Oct 2026)','','Order of upload. Ranks 1-5 are the Viral Batch A9 (Gemini rewrites); the rest follow Gemini only: (1) the Gemini 5-upload plan, (2) the Gemini start-now list, (3) the other Gemini virality-batch scripts in the order delivered, (4) Gemini-audited Shorts by hook + title score (verdict keep before rewrite before drop), (5) Shorts Gemini has not scored yet. No score of mine is used. `queue`, `virality_rank` and `gemini_score` in the bank carry this.','','| Rank | ID | Topic | Gemini basis | Status | Pillar |','|---|---|---|---|---|---|']
    for r,did,t,s,st,pl,v,tag in rows: L.append(f"| {r} | {did} | {t}{' **(A9)**' if tag else ''} | {s} | {st} | {pl} |")
    open('/mnt/user-data/outputs/START_HERE_RANKING.md','w').write('\n'.join(L)+'\n')
    print(len(rows)); print('\n'.join(L[6:30]))
