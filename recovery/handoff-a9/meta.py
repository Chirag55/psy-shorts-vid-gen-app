import re,sys
CLIN={'Triangulation','Stonewalling','Parentification','Negging','TraumaBond','AnxiousAttachment','AvoidantAttachment','RejectionSensitivity','Baiting','Hoovering','GreyRock','TraumaResponse','DoubleBind','Ostracism','Devaluation'}
PIL=('Body Language & Social','Manipulation & Defense')
def run(t):
    parts=re.split(r'(?=\n### D\d+ — )',t)
    out=[]
    for b in parts:
        m=re.match(r'\n### (D\d+) — ',b)
        if not m: out.append(b);continue
        st=re.search(r'^status: (\S+)',b,re.M)
        pil=re.search(r'^pillar: "?([^"\n]+)',b,re.M)
        if not st or st.group(1) not in('unused','in_progress'): out.append(b);continue
        def tf(mm):
            s=mm.group(0)
            tag=re.search(r'#(\w+)(["\']?)$',s)
            if tag and tag.group(1) in CLIN: s=s[:tag.start()]+'#DarkPsychology'+tag.group(2)
            return s
        b=re.sub(r'^title_final: .*$',tf,b,flags=re.M)
        if m.group(1)=='D171':
            b=re.sub(r'^title_final: .*$',"title_final: 'Why Manipulators Compare You To Others (Don''t Fall For This) #shorts #psychology #DarkPsychology'",b,flags=re.M)
        if pil and pil.group(1) in PIL:
            def df(mm):
                s=mm.group(0)
                if 'DarkPsychology' in s: return s
                return re.sub(r'(#TheMindFiles)(\\\\n|")',lambda x:x.group(0),s) if False else re.sub(r'(#shorts #psychology #\w+)',lambda x:x.group(1)+' #DarkPsychology #BodyLanguage',s,1)
            b=re.sub(r'^description_full: .*$',df,b,flags=re.M)
            b=re.sub(r'^(ig_hashtags: "[^"]*?)"$',lambda x:x.group(0) if 'DarkPsychology' in x.group(0) else x.group(1)+' #DarkPsychology"',b,flags=re.M)
        out.append(b)
    return ''.join(out)
if __name__=='__main__':
    p=sys.argv[1];t=open(p).read();open(p,'w').write(run(t))
