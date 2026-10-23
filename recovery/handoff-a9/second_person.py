import re,sys
M={
'D01':[("Ask to cut in, and people say no.","Ask to cut in, and they say no.")],
'D05':[("Small: three dollars. Medium: seven. Large: seven fifty.","You see small, three dollars. Medium, seven. Large, seven fifty."),("Next to the medium, the large feels like a steal.","Next to the medium, the large feels like a steal to you.")],
'D22':[("The shelf wobbles. A friend says so.","Your shelf wobbles. A friend says so.")],
'D28':[("Sharp suit, easy smile, total confidence.","You saw a sharp suit, an easy smile, total confidence.")],
'D30':[("Everyone sees someone fall.","You and everyone else see someone fall."),("And everyone waits for someone else to move.","And they all wait for someone else to move.")],
'D33':[("It sounds backwards.","You'd think that sounds backwards.")],
'D34':[("A stranger in a uniform says move, and people move.","A stranger in a uniform says move, and you move.")],
'D36':[("Finding fifty never felt that good.","Finding fifty never felt that good to you."),("Losses often hit about twice as hard as equal gains.","Losses often hit you about twice as hard as equal gains.")],
'D39':[("But the drive to the airport was the riskier part.","But your drive to the airport was the riskier part.")],
'D40':[("Suddenly every sign looks obvious.","Suddenly every sign looks obvious to you.")],
'D45':[("Three reasons plans run late.","Here are three reasons your plans run late.")],
'D49':[("It feels like fire.","It feels like fire to you."),("But the couples who last often share something deeper.","But couples who last often share something deeper than you'd expect.")],
'D51':[("Almost nobody did.","Almost nobody around you did.")],
'D52':[("Feeling alike can matter more than being alike.","Feeling alike can matter more to you than being alike.")],
'D56':[("Interested people ask the next one.","Interested people ask you the next one.")],
'D58':[("Hear lazy first, and every slow day proves it.","Hear lazy first, and every slow day proves it to you.")],
'D60':[("Happy couples often do.","Happy couples often do, and they rarely notice.")],
'D65':[("Those four words make any amount okay, so refusing feels harder.","Those four words make any amount okay to you, so refusing feels harder.")],
'D102':[("That wasn't luck. It was planned.","That wasn't luck. They planned it."),("After a no, the second request feels like meeting halfway.","After your no, the second request feels like meeting halfway.")],
'D104':[("Then eight hundred feels like a gift.","Then eight hundred feels like a gift to you.")],
'D105':[("When something looks rare, it suddenly looks valuable.","When something looks rare, it suddenly looks valuable to you."),("Even if it's identical to the one beside it.","Even when it's identical to the one beside it, you still reach for it.")],
'D106':[("A few people stop and look up at nothing.","A few people stop and look up at nothing near you."),("Within seconds, strangers stop and look up too.","Within seconds, strangers around you stop and look up too.")],
'D128':[("Three famous tells that don't work.","Here are three famous tells you can't trust."),("One: looking away.","One: they look away.")],
'D59':[("Same bus. Same lift. Same late shift.","Your same bus. Your same lift. Your same late shift.")],
'D147':[("Memory keeps the highlights and quietly cuts the fights.","Your memory keeps the highlights and quietly cuts the fights.")],
'D67':[("Moods spread between people like a cold.","Moods spread between you and them like a cold.")],
'D155':[("Everyone else quietly eased off.","They all quietly eased off."),("When effort is shared and nobody measures it, people coast.","When effort is shared and nobody measures it, they coast.")],
'D157':[("Same facts. Different words.","Same facts. Different words, and you chose differently.")],
'D160':[("Every win is skill. Every loss is luck.","Your every win is skill. Your every loss is luck.")],
'D162':[("Faces get judged in a fraction of a second.","You judge faces in a fraction of a second.")],
'D167':[("Blame the door.","Blame the door, not you."),("Passing through a doorway seems to file the last room's thoughts away.","Passing through a doorway seems to file your last room's thoughts away.")],
'D171':[("An ex. A coworker. A friend who's always better.","An ex. A coworker. A friend who's always better than you.")],
'D176':[("No words. No eye contact. Nothing.","No words from them. No eye contact. Nothing.")],
'D177':[("Ok. Just ok.","Ok. Just ok, they wrote.")],
'D179':[("Saying yes buys a moment of approval.","Saying yes buys you a moment of approval.")],
'D180':[("Short answers. Calm voice. No big feelings.","Short answers. Calm voice. Give them no big feelings.")],
'D182':[("Losing someone close can set off a stress response.","Losing someone close can set off a stress response in you.")],
}
def main():
    p=sys.argv[1];t=open(p).read();n=0
    parts=re.split(r'(?=\n### D\d+ — )',t);out=[]
    for b in parts:
        m=re.match(r'\n### (D\d+) — ',b)
        if m and m.group(1) in M:
            head,nar=b.split('**narration:**',1)
            for old,new in M[m.group(1)]:
                ls=nar.split('\n')
                assert old in ls,(m.group(1),old)
                ls[ls.index(old)]=new;n+=1;nar='\n'.join(ls)
            b=head+'**narration:**'+nar
        out.append(b)
    open(p,'w').write(''.join(out));print(n)
if __name__=='__main__': main()
