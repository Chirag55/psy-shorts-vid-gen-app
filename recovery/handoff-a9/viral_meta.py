import re,sys
q=lambda s:'"'+s.replace('\\','\\\\').replace('"','\\"')+'"'
VOICE="ElevenLabs: stability 45, clarity 80, style exaggeration 25, speed 1.12 (urgent, grounded, no dead air)"
V={
'D43':dict(o=1,tt='FAKE PRAISE TRAP',tv="Split contrast: Leo smiling warmly while handing Ella a massive stack of work, Ella's eyes wide in realization.",bo='When did a compliment cost you? Comment below',
 sub=["0:00-0:02.0 | POV: The compliment was a trap","0:02.0-0:04.5 | 3 signs praise is a MANIPULATION TRAP","0:04.5-0:08.5 | 1. THE AMBUSH: It lands right before a huge favor","0:08.5-0:14.0 | 2. IDENTITY BAIT: Saying \"no\" makes you feel guilty","0:14.0-0:19.0 | 3. FAKE INTIMACY: They only notice you when they need you","0:19.0-0:22.5 | When praise + a favor arrive together: PAUSE.","0:22.5-0:24.0 | Because that's how they just..."]),
'D19':dict(o=2,tt='WEAPONIZED SILENCE',tv="Close-up of Ella pleading while Ben stares coldly away from her on the sofa.",bo='Ever been punished with silence? Comment below',
 sub=["0:00-0:02.5 | POV: They went silent to punish you","0:02.5-0:05.0 | You speak. They act like you don't exist.","0:05.0-0:07.5 | This is WEAPONIZED OSTRACISM.","0:07.5-0:11.5 | Your brain reads silence like PHYSICAL PAIN.","0:11.5-0:16.5 | They use it so you'll BEG for their attention.","0:16.5-0:21.5 | Say once: \"I'm here when you're ready to talk.\"","0:21.5-0:24.0 | ...and walk away, because that's why—"]),
'D23':dict(o=3,tt='3 FAKE PROMISES',tv="Ben sweeping his arm toward the city skyline while Riley looks at a blank calendar.",bo='Which promise have you heard most? 1, 2, or 3?',
 sub=["0:00-0:02.5 | POV: They promise everything, with no date","0:02.5-0:05.0 | This is FUTURE FAKING (3 Red Flags)","0:05.0-0:09.5 | 1. THE SOMEDAY TRIP: Big romance, zero dates","0:09.5-0:14.5 | 2. THE MOVING FINISH LINE: \"Once work slows down...\"","0:14.5-0:19.0 | 3. THE FIGHT ERASER: \"I'll make it up to you\"","0:19.0-0:24.0 | Ask for a date—otherwise..."]),
'D61':dict(o=4,tt='SEEN. NO REPLY.',tv="Split visual: Ella staring at a blue Read receipt while Ryan smirks and flips his screen face-down on a sunlit terrace.",bo='How long before a late reply gets to you?',
 sub=["0:00-0:02.5 | POV: Seen. No reply.","0:02.5-0:06.5 | Your brain reads silence like a SURVIVAL THREAT.","0:06.5-0:11.5 | They leave you on \"Seen\" to make you DOUBLE-TEXT.","0:11.5-0:15.5 | That second text hands them ALL the power.","0:15.5-0:21.0 | Put the phone down. Match their silence.","0:21.0-0:24.0 | Never double-text, because..."]),
'D16':dict(o=5,tt='FAKE SMILE TELLS',tv="Extreme close-up of Ella's face split down the middle: wide smile at the mouth, dead flat cold eyes above.",bo='Whose smile have you started to doubt?',
 sub=["0:00-0:02.5 | POV: Their smile doesn't reach their eyes","0:02.5-0:04.5 | 3 signs a smile is a MASK","0:04.5-0:09.0 | 1. DEAD EYES: Mouth stretches, eyes stay frozen","0:09.0-0:14.0 | 2. LIGHT-SWITCH DROP: Vanishes the second they turn","0:14.0-0:19.0 | 3. LOPSIDED SMIRK: One side lifts (hidden contempt)","0:19.0-0:24.0 | Watch their eyes when they turn away, because..."]),
}
def run(t):
    parts=re.split(r'(?=\n### D\d+ — )',t);out=[]
    for b in parts:
        m=re.match(r'\n### (D\d+) — ',b)
        if not m: out.append(b);continue
        st=re.search(r'^status: (\S+)',b,re.M)
        if not st or st.group(1) not in('unused','in_progress'): out.append(b);continue
        d=m.group(1)
        b=re.sub(r'^(title_final: .*?)#shorts #psychology #\w+(["\']?)$',lambda x:x.group(1)+'#shorts #psychology #DarkPsychology'+x.group(2),b,flags=re.M)
        b=re.sub(r'^(description_full: ".*?)(\\\\n)?(#\w+ ?)+"$',lambda x:x.group(1).rstrip()+'#shorts #psychology #DarkPsychology"' if x.group(2) is None else x.group(0),b,flags=re.M) if False else b
        def df(x):
            s=x.group(0); i=s.rfind('\\\\n\\\\n#')
            return (s[:i]+'\\\\n\\\\n#shorts #psychology #DarkPsychology"') if i>0 else s
        b=re.sub(r'^description_full: .*$',df,b,flags=re.M)
        if d in V:
            v=V[d]
            b=re.sub(r'^queue: .*\n','',b,flags=re.M)
            ins=[f'queue: {v["o"]}','viral_batch: A9','upload_order: %d of 5'%v['o'],f'voice_settings: {q(VOICE)}','subtitles:']+['- '+q(s) for s in v['sub']]+[f'bottom_overlay: {q(v["bo"])}',f'thumb_text: {q(v["tt"])}',f'thumb_visual: {q(v["tv"])}']
            b=re.sub(r'^(priority: .*\n)',lambda x:x.group(1)+'\n'.join(ins)+'\n',b,count=1,flags=re.M)
        else:
            b=re.sub(r'^queue: (\d+)$',lambda x:'queue: %d'%(int(x.group(1))+5),b,flags=re.M)
        out.append(b)
    return ''.join(out)
if __name__=='__main__':
    p=sys.argv[1];o=run(open(p).read());open(p,'w').write(o)
