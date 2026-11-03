# Builds a one-glyph font (U+20C1 SAUDI RIYAL SIGN) from the open-source Lucide "saudi-riyal" icon
# strokes (ISC licence), expanded to filled outlines (all contours same winding, nonzero fill).
import math, base64, io, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

W = 2.0   # stroke width in icon units (24x24 box)
K = 34.0  # font units per icon unit (UPM 1000)
def tx(x): return round((x - 1.0) * K + 40)
def ty(y): return round((21.7 - y) * K)

def arc(p0, rx, ry, rot, large, sweep, p1, n=10):
    # SVG endpoint arc -> centre param (rot = 0 only)
    x1, y1 = p0; x2, y2 = p1
    dx, dy = (x1-x2)/2, (y1-y2)/2
    lam = (dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)
    if lam > 1: rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    num = rx*rx*ry*ry - rx*rx*dy*dy - ry*ry*dx*dx
    den = rx*rx*dy*dy + ry*ry*dx*dx
    co = math.sqrt(max(0, num/den)) * (-1 if large == sweep else 1)
    cxp, cyp = co*rx*dy/ry, -co*ry*dx/rx
    cx, cy = cxp+(x1+x2)/2, cyp+(y1+y2)/2
    a1 = math.atan2((y1-cy)/ry, (x1-cx)/rx); a2 = math.atan2((y2-cy)/ry, (x2-cx)/rx)
    d = a2 - a1
    if sweep and d < 0: d += 2*math.pi
    if not sweep and d > 0: d -= 2*math.pi
    return [(cx+rx*math.cos(a1+d*i/n), cy+ry*math.sin(a1+d*i/n)) for i in range(n+1)]

strokes = [
    [(20,19.5),(14.5,20.7)],
    [(14.5,4),(14.5,15.22)] + arc((14.5,15.22),1,1,0,0,0,(15.742,16.19))[1:] + [(20,15.2)],
    [(2.978,19.351),(8.527,17.988)] + arc((8.527,17.988),2,2,0,0,0,(10,16),16)[1:] + [(10,2)],
    [(20,10),(4,13.5)],
]
polys = []
def cw(poly):  # in font coords (y up) clockwise = negative area
    a = sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
    return poly if a < 0 else poly[::-1]
h = W/2
for s in strokes:
    for a, b in zip(s, s[1:]):
        dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy)
        if L == 0: continue
        nx, ny = -dy/L*h, dx/L*h
        quad = [(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)]
        polys.append(cw([(tx(x),ty(y)) for x,y in quad]))
    for x, y in s:
        polys.append(cw([(tx(x+h*math.cos(t*math.pi/8)), ty(y+h*math.sin(t*math.pi/8))) for t in range(16)]))

def glyph(polys):
    pen = TTGlyphPen(None)
    for p in polys:
        pen.moveTo(p[0])
        for q in p[1:]: pen.lineTo(q)
        pen.closePath()
    return pen.glyph()

adv = round(20*K + 80)
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder([".notdef", "sar"])
fb.setupCharacterMap({0x20C1: "sar"})
empty = TTGlyphPen(None).glyph()
fb.setupGlyf({".notdef": empty, "sar": glyph(polys)})
fb.setupHorizontalMetrics({".notdef": (500, 0), "sar": (adv, 40)})
fb.setupHorizontalHeader(ascent=900, descent=-250)
fb.setupNameTable({"familyName": "URY SAR Sign", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-250, usWinAscent=900, usWinDescent=250)
fb.setupPost()
fb.font.flavor = "woff"
buf = io.BytesIO(); fb.save(buf)
sys.stdout.write(base64.b64encode(buf.getvalue()).decode())
