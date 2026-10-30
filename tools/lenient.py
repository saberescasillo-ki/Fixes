import json, re, sys
def strip(s):
    out=[];i=0;n=len(s);ins=False;comments=[]
    while i<n:
        c=s[i]
        if ins:
            out.append(c)
            if c=='\\': out.append(s[i+1]); i+=2; continue
            if c=='"': ins=False
            i+=1; continue
        if c=='"': ins=True; out.append(c); i+=1; continue
        if s.startswith('/*',i):
            j=s.index('*/',i+2); comments.append(s[i:j+2]); i=j+2; continue
        if s.startswith('//',i):
            j=s.find('\n',i); j=n if j<0 else j; comments.append(s[i:j]); i=j; continue
        out.append(c); i+=1
    t=''.join(out)
    t2=re.sub(r',(\s*[}\]])',r'\1',t)
    return t2, comments, t!=t2
if __name__=='__main__':
    for f in sys.argv[1:]:
        t,c,tc=strip(open(f,encoding='utf-8-sig').read())
        print(f, 'comments:',len(c), set(c) if len(c)<30 else c[:30], 'trailing commas:',tc)
        try: json.loads(t); print('  parses OK after cleanup')
        except Exception as e: print('  STILL BAD',e, repr(t[e.pos-150:e.pos+80]))
