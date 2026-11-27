import re, sys, math, pathlib
D = pathlib.Path("/Users/safwan/Code/URY/frappe_desk_skill/skills/frappe-insights/solutions/ury_restaurant/dashboards")
RUNS_ONLY = ("DB14", "DB16")
CARD_ROWS = {1:[20],2:[10,10],3:[7,7,6],4:[5]*4,5:[4]*5}
def card_widths(n):
    if n in CARD_ROWS: return [CARD_ROWS[n]]
    if n==6: return [[5]*4,[10,10]]
    if n==7: return [[5]*4,[7,7,6]]
    if n==8: return [[5]*4,[5]*4]
    if n==9: return [[4]*5,[5]*4]
    rows=[]; left=n
    if n%4==1: rows.append([4]*5); left-=5
    while left>=4: rows.append([5]*4); left-=4
    if left: rows.append(CARD_ROWS[left])
    return rows
def clamp(v,a,b): return max(a,min(b,v))
def chart_defs(text):
    defs={}
    for m in re.finditer(r"^  - \{id: (\w+),(.*?)(?=\n  - \{id:|\n\s*\n|\n  #|\ndashboards:)", text, re.S|re.M):
        body=m.group(2); t=re.search(r"type: (\w+)",body); lim=re.search(r"limit: (\d+)",body)
        gran=bool(re.search(r"granularity: day",body))
        defs[m.group(1)]=(t.group(1) if t else "Bar", int(lim.group(1)) if lim else None, gran)
    return defs
def strip_html(s): return re.sub(r"<[^>]+>","",s)
def process(path):
    text=path.read_text(); defs=chart_defs(text)
    lines=text.split("\n")
    s=next(i for i,l in enumerate(lines) if re.match(r"^    items:\s*$",l))+1
    e=s; last=s
    while e<len(lines):
        if re.match(r"^      - \{(chart|text):",lines[e]): e+=1; last=e
        elif re.match(r"^\s*(#.*)?$",lines[e]): e+=1
        else: break
    e=last
    block=[l for l in lines[s:e] if re.match(r"^      - \{(chart|text):",l)]
    items=[]
    for l in block:
        m=re.search(r", x: (\d+), y: (\d+), w: (\d+), h: (\d+)\}(\s*#.*)?\s*$",l); x,y,w,h=map(int,m.groups()[:4]); cm=m.group(5) or ''
        if "chart:" in l[:16]:
            cid=re.match(r"^      - \{chart: (\w+)",l).group(1); t,lim,gran=defs.get(cid,("Bar",None,False))
            items.append(dict(k="chart",id=cid,t=t,lim=lim,gran=gran,x=x,y=y,w=w,h=h,cm=cm))
        else:
            body=re.match(r"^      - \{text: (.*), x: \d+, y: \d+, w: \d+, h: \d+\}(?:\s*#.*)?\s*$",l).group(1)
            items.append(dict(k="text",body=body,x=x,y=y,w=w,h=h,cm=cm))
    items.sort(key=lambda i:(i["y"],i["x"]))
    intro=[i for i in items if i["k"]=="text" and i["y"]==0]
    rest=[i for i in items if i not in intro]
    sections=[[]]
    for i in rest:
        if i["k"]=="text" and i["h"]==1 and i["w"]>=18: sections.append([i])
        else: sections[-1].append(i)
    out=[]; y=3
    for i in intro: out.append(dict(i,x=0,y=0,w=20,h=2))
    stem=path.name[:4]
    for sec in sections:
        if not sec: continue
        hdr=[i for i in sec if i["k"]=="text" and i["h"]==1 and i["w"]>=18]
        cards=[i for i in sec if i["k"]=="chart" and i["t"]=="Number"]
        tables=[i for i in sec if i["k"]=="chart" and i["t"]=="Table"]
        series=[i for i in sec if i["k"]=="chart" and i["t"] in ("Line","Bar","Area") ]
        others=[i for i in sec if i["k"]=="chart" and i["t"] not in ("Number","Table","Line","Bar","Area")]
        notes=[i for i in sec if i["k"]=="text" and i not in hdr]
        for i in hdr: out.append(dict(i,x=0,y=y,w=20,h=1)); y+=1
        # cards
        if stem in RUNS_ONLY:
            runs=[]; 
            for c in cards:
                if runs and runs[-1][0]["y"]==c["y"]: runs[-1].append(c)
                else: runs.append([c])
            groups=runs
        else: groups=[cards] if cards else []
        for g in groups:
            idx=0
            for row in card_widths(len(g)):
                x=0
                for w in row: out.append(dict(g[idx],x=x,y=y,w=w,h=3)); x+=w; idx+=1
                y+=3
        def hchart(i):
            t=i["t"]
            if t in ("Donut","Funnel"): return 11
            if t=="Row": return clamp(math.ceil((i["lim"] or 12)*0.6)+5,11,15)
            return 12
        maxch=0
        long_=[i for i in series if (i["lim"] or 0)>=60 or i["gran"]]
        short=[i for i in series if i not in long_]
        queue=[("solo",i) for i in long_]
        pool=short+others
        while pool:
            if len(pool)>=2: queue.append(("pair",pool.pop(0),pool.pop(0)))
            else: queue.append(("solo",pool.pop(0)))
        for q in queue:
            if q[0]=="solo": q[1].update(w=20)
            if q[0]=="solo":
                i=q[1]; h=hchart(i); maxch=max(maxch,h); out.append(dict(i,x=0,y=y,w=20,h=h)); y+=h
            else:
                a,b=q[1],q[2]; h=max(hchart(a),hchart(b)); maxch=max(maxch,h)
                out.append(dict(a,x=0,y=y,w=10,h=h)); out.append(dict(b,x=10,y=y,w=10,h=h)); y+=h
        # tables
        def htab(i): return clamp(math.ceil((i["lim"] or 15)*0.7)+4,14,22)
        k=0
        while k<len(tables):
            if k+1<len(tables):
                a,b=tables[k],tables[k+1]; h=clamp(max(htab(a),htab(b),maxch+2),14,22)
                out.append(dict(a,x=0,y=y,w=10,h=h)); out.append(dict(b,x=10,y=y,w=10,h=h)); y+=h; k+=2
            else:
                a=tables[k]; h=clamp(max(htab(a),maxch+2 if maxch else 0),14,22); out.append(dict(a,x=0,y=y,w=20,h=h)); y+=h; k+=1
        for n in notes:
            h=n["h"] if n["h"]>=5 else clamp(math.ceil(len(strip_html(n["body"]))/110),1,3)
            out.append(dict(n,x=0,y=y,w=20,h=h)); y+=h
    new=[]
    for i in out:
        if i["k"]=="chart": new.append(f"      - {{chart: {i['id']}, x: {i['x']}, y: {i['y']}, w: {i['w']}, h: {i['h']}}}{i.get('cm','')}")
        else: new.append(f"      - {{text: {i['body']}, x: {i['x']}, y: {i['y']}, w: {i['w']}, h: {i['h']}}}{i.get('cm','')}")
    assert len(new)==len(block), (path.name,len(new),len(block))
    lines[s:e]=new
    return "\n".join(lines), y
if __name__=="__main__":
    apply = "--apply" in sys.argv
    for p in sorted(D.glob("DB*.yaml")):
        if len(sys.argv)>1 and sys.argv[1] not in ("--apply",) and sys.argv[1] not in p.name: continue
        t,yend=process(p); print(p.name,"total rows",yend)
        if apply: p.write_text(t)
