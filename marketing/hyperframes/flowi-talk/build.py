"""FLOWI talking-head edit: graphics generator.

python3 build.py <work dir>     (work dir holds words.json from align.py)
Writes back.html (graphics that sit BEHIND the speaker), front.html (captions, cards, full-screen beats),
and into the work dir zoom.json (punch-ins for the compositor) and sfx.json (sound-effect cues).
Every graphic is keyed to the word it is spoken on, so a re-cut keeps everything in sync.
Styles: marketing/style/PIXEL-REEL-SPEC.md (pixel words behind the head, white squares, line burst, logo card),
COLLAGE-STYLE.md (serif caps, red hand-drawn marks, stamp), STORY-STYLE.md (italic serif, counted numbers, one colour accent).
"""
import json, os, re, sys
from PIL import ImageFont

D = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
WD = json.load(open(f'{D}/words.json'))
words, SPEECH = WD['words'], WD['dur']
TAIL = 3.0
END = round(SPEECH + TAIL, 3)
DARK, VIOLET, RED, GREEN, CREAM, NAVY = '#07090f', '#7c5cff', '#ff3b3b', '#b6ff3c', '#f3ead8', '#071726'
FONTS = {'px': 'PressStart2P.ttf', 'ab': 'Abril.ttf', 'in': 'InterDisplay-Black.otf'}
_fc = {}


def font(k, size=200):
    if (k, size) not in _fc: _fc[(k, size)] = ImageFont.truetype(f'{HERE}/assets/fonts/{FONTS[k]}', size)
    return _fc[(k, size)]


def tw(k, text, size): return font(k).getlength(text) * size / 200


def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower().replace("o'", 'o').replace("g'", 'g'))


_cur = [-1]


def cue(q, back=False):
    """Next word (in spoken order) that starts with q. Moves the cursor unless back=True."""
    k = norm(q)
    for w in words[_cur[0] + 1:]:
        if norm(w['w']).startswith(k):
            if not back: _cur[0] = w['i']
            return w
    raise SystemExit(f'cue not found after word {_cur[0]}: {q}')


def nxt(w, n=1): return words[min(len(words) - 1, w['i'] + n)]


class Layer:
    def __init__(self): self.html, self.js, self.k = [], [], 0

    def nid(self, p='e'):
        self.k += 1
        return f'{p}{self.k}'

    def clip(self, t0, t1, inner, z=10, style=''):
        i = self.nid('c')
        self.html.append(f'<div id="{i}" class="clip" data-start="{t0:.3f}" data-duration="{max(0.07, t1 - t0):.3f}" style="z-index:{z};{style}">{inner}</div>')
        return i

    def ft(self, sel, frm, to, at, dur, ease='power3.out'):
        to = dict(to, duration=dur, ease=ease, immediateRender=False)
        self.js.append(f'tl.set({json.dumps(sel)},{json.dumps(frm)},0);tl.fromTo({json.dumps(sel)},{json.dumps(frm)},{json.dumps(to)},{at:.3f});')

    def to(self, sel, to, at, dur, ease='power2.in'):
        self.js.append(f'tl.to({json.dumps(sel)},{json.dumps(dict(to, duration=dur, ease=ease))},{at:.3f});')

    def raw(self, s): self.js.append(s)


B, F = Layer(), Layer()
SFX, WHITE = [], []          # sound cues; windows where the screen is white (captions turn dark)


def sfx(t, kind, gain=1.0): SFX.append({'t': round(t, 3), 'k': kind, 'g': gain})


# ---------- behind the speaker ----------
def pix(t0, t1, text, y=175, maxw=930, maxs=240, first=False, color='#fff', blip=True, layer=None, cx=540):
    """One big pixel word with four white squares closing in on its corners."""
    L = layer or B
    size = min(maxs, maxw / tw('px', text, 100) * 100)
    f = font('px')
    x0, y0, x1, y1 = f.getbbox(text)
    asc, desc = f.getmetrics()
    k = size / 200
    gw, gtop, gbot = (x1 - x0) * k, ((200 - (asc + desc)) / 2 + y0) * k, ((200 - (asc + desc)) / 2 + y1) * k
    left = cx - gw / 2
    i = L.nid('p')
    s, g, off = 20, 16, 70
    corners = [(-g - s, gtop - g - s, -off, -off), (gw + g, gtop - g - s, off, -off), (-g - s, gbot + g, -off, off), (gw + g, gbot + g, off, off)]
    sq = ''.join(f'<i class="sq" id="{i}q{n}" style="left:{cx:.1f}px;top:{cy:.1f}px;width:{s}px;height:{s}px"></i>' for n, (cx, cy, _, _) in enumerate(corners))
    L.clip(t0, t1, f'<div class="pxw" style="left:{left:.1f}px;top:{y}px;width:{gw:.1f}px;height:{size:.1f}px"><span id="{i}" class="px" style="font-size:{size:.1f}px;color:{color};left:{-x0 * k:.1f}px">{text}</span>{sq}</div>', z=5)
    frm = {'opacity': 0, 'scale': 1.1, 'filter': 'blur(16px)' if first else 'blur(0px)'}
    L.ft(f'#{i}', frm, {'opacity': 1, 'scale': 1, 'filter': 'blur(0px)'}, t0, 0.38 if first else 0.12, 'power3.out')
    for n, (_, _, dx, dy) in enumerate(corners):
        L.ft(f'#{i}q{n}', {'x': dx, 'y': dy, 'opacity': 0}, {'x': 0, 'y': 0, 'opacity': 1}, t0 + 0.02, 0.2, 'power4.out')
    if blip: sfx(t0, 'blip')
    return i


def bigserif(t0, t1, html, y=150, size=300, color=CREAM):
    i = B.nid('s')
    B.clip(t0, t1, f'<div class="ctr" style="top:{y}px;justify-content:flex-end;padding-right:60px"><span id="{i}" class="ab glow" style="font-size:{size}px;color:{color}">{html}</span></div>', z=5)
    B.ft(f'#{i}', {'opacity': 0, 'scale': 1.25}, {'opacity': 1, 'scale': 1}, t0, 0.22)
    return i


# ---------- in front ----------
def chip(t0, t1, text, y=900, kind='', size=46, icon=True):
    i = F.nid('h')
    ic = '<i class="sq" style="position:relative;width:.42em;height:.42em;flex:none"></i>' if icon else ''
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><div id="{i}" class="chip {kind}" style="font-size:{size}px">{ic}<span>{text}</span></div></div>', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'y': 34, 'scale': .92}, {'opacity': 1, 'y': 0, 'scale': 1}, t0, 0.2)
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'tick', .7)
    return i


def serif(t0, t1, text, y=860, size=104, under=True, color=CREAM):
    i = F.nid('s')
    u = f'<svg class="hand" viewBox="0 0 600 40" style="width:74%;height:40px;margin-top:-6px"><path id="{i}u" pathLength="1" d="M8 22 C120 6 240 34 330 18 S520 10 592 24" /></svg>' if under else ''
    F.clip(t0, t1, f'<div class="ctr col" style="top:{y}px"><span id="{i}" class="ab glow" style="font-size:{size}px;color:{color}">{text}</span>{u}</div>', z=13)
    F.ft(f'#{i}', {'opacity': 0, 'y': 26, 'letterSpacing': '.12em'}, {'opacity': 1, 'y': 0, 'letterSpacing': '.01em'}, t0, 0.3)
    if under: F.ft(f'#{i}u', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0 + 0.18, 0.3, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    return i


def stamp(t0, t1, text, y=930, rot=-7, size=84):
    i = F.nid('t')
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><div id="{i}" class="stamp ab" style="font-size:{size}px">{text}</div></div>', z=16)
    F.ft(f'#{i}', {'opacity': 0, 'scale': 2.2, 'rotation': rot - 10}, {'opacity': 1, 'scale': 1, 'rotation': rot}, t0, 0.14, 'power4.in')
    sfx(t0 + 0.13, 'slam')
    return i


def italic(t0, t1, text, y=820, size=58, layer=None):
    L = layer or F
    i = L.nid('i')
    L.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><span id="{i}" class="it" style="font-size:{size}px">{text}</span></div>', z=12)
    L.ft(f'#{i}', {'opacity': 0, 'y': 14}, {'opacity': 1, 'y': 0}, t0, 0.25)
    return i


def section(t0, num, title, side='left', hold=0.82):
    """Near-black beat: violet glow from one side, a cursor square, the number streaks in, the title sits small under it."""
    i = F.nid('x')
    gx = '-10%' if side == 'left' else '110%'
    F.clip(t0, t0 + hold, f'''<div class="full dark"><div class="vglow" style="background:radial-gradient(60% 45% at {gx} 46%,{VIOLET}cc,transparent 70%)"></div>
<i class="sq" id="{i}c" style="left:118px;top:742px;width:38px;height:38px"></i>
<div class="ctr" style="top:640px"><span id="{i}n" class="px" style="position:relative;font-size:300px">{num}</span></div>
<div class="ctr" style="top:960px"><span id="{i}t" class="thin" style="font-size:44px">{title}</span></div></div>''', z=40)
    F.ft(f'#{i}n', {'x': 900, 'scaleX': 2.6, 'opacity': 0, 'filter': 'blur(14px)'}, {'x': 0, 'scaleX': 1, 'opacity': 1, 'filter': 'blur(0px)'}, t0 + 0.04, 0.2, 'power4.out')
    F.ft(f'#{i}t', {'opacity': 0, 'y': 12}, {'opacity': 1, 'y': 0}, t0 + 0.22, 0.16)
    F.ft(f'#{i}c', {'opacity': 1, 'x': 0, 'y': 0}, {'x': 403, 'y': 296}, t0 + 0.26, 0.24, 'power3.inOut')
    sfx(t0, 'whoosh')
    sfx(t0 + 0.06, 'blip')
    # the number stays behind the speaker for a moment after the cut back
    pix(t0 + hold, t0 + hold + 1.5, num, y=210, maxs=175, blip=False, cx=850)


def logo(t0, t1, top='', line='', final=False):
    """Scatter squares, line burst, light panel, logo on white (PIXEL-REEL-SPEC beats 4-6)."""
    i = F.nid('g')
    import math
    scat = [(150, 420, 30), (820, 560, 54), (300, 1180, 22), (760, 1250, 40), (560, 300, 16)]
    sq = ''.join(f'<i class="sq" id="{i}s{n}" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px"></i>' for n, (x, y, s) in enumerate(scat))
    N, cx, cy = 12, 540, 860
    rays = ''
    for n in range(N):
        a = 2 * math.pi * n / N + 0.26
        Lr = 300 + (n * 97) % 190
        rays += f'<div class="ray" id="{i}r{n}" style="left:{cx}px;top:{cy}px;width:{Lr}px;transform:rotate({math.degrees(a):.1f}deg)"></div>'
        rays += f'<i class="sq" id="{i}e{n}" style="left:{cx - 9}px;top:{cy - 9}px;width:18px;height:18px"></i>'
    extra = ''
    if final:
        extra = f'<div class="ctr" style="top:1010px"><div id="{i}f" class="chip white" style="font-size:54px"><i class="sq" style="position:relative;width:.42em;height:.42em;background:{NAVY}"></i><span>7 KUN BEPUL</span></div></div><div class="ctr" style="top:1130px"><span id="{i}k" class="thin" style="font-size:42px;color:{NAVY};letter-spacing:.06em">flowi.uz &nbsp;·&nbsp; @Flowisupport_bot</span></div>'
    topw = f'<div class="ctr" style="top:300px"><span id="{i}w" class="px" style="position:relative;font-size:{min(120, 900 / tw("px", top or "X", 100) * 100):.0f}px">{top}</span></div>' if top else ''
    F.clip(t0, t1, f'''<div class="full dark"><div class="vglow" style="background:radial-gradient(55% 40% at 50% 46%,{VIOLET}66,transparent 70%)"></div>{sq}{topw}
<i class="sq" id="{i}m" style="left:{cx - 22}px;top:{cy - 22}px;width:44px;height:44px"></i>{rays}
<div id="{i}p" class="full" style="background:#fff"></div>
<div class="ctr" style="top:{700 if line else 760}px;flex-direction:column;align-items:center"><span id="{i}l" class="thin" style="font-size:46px;color:{NAVY};letter-spacing:.04em;margin-bottom:54px">{line}</span><img id="{i}o" src="assets/flowi-navy.svg" style="width:640px"></div>{extra}</div>''', z=45)
    for n in range(len(scat)):
        F.ft(f'#{i}s{n}', {'scale': 0}, {'scale': 1}, t0 + 0.03 * n, 0.12, 'power4.out')
        F.to(f'#{i}s{n}', {'scale': 0}, t0 + 0.3, 0.08)
    tb = t0 + 0.34
    F.ft(f'#{i}m', {'scale': 0}, {'scale': 1}, tb - 0.06, 0.1, 'power4.out')
    if top: F.ft(f'#{i}w', {'opacity': 0, 'scale': 1.1}, {'opacity': 1, 'scale': 1}, tb - 0.04, 0.1)
    for n in range(N):
        a = 2 * math.pi * n / N + 0.26
        Lr = 300 + (n * 97) % 190
        F.ft(f'#{i}r{n}', {'scaleX': 0}, {'scaleX': 1}, tb, 0.26, 'power4.out')
        F.ft(f'#{i}e{n}', {'x': 0, 'y': 0, 'opacity': 0}, {'x': round(math.cos(a) * Lr, 1), 'y': round(math.sin(a) * Lr, 1), 'opacity': 1}, tb, 0.26, 'power4.out')
    tp = tb + 0.42
    F.ft(f'#{i}p', {'scaleX': 0, 'scaleY': 0}, {'scaleX': 1, 'scaleY': 1}, tp, 0.24, 'power3.inOut')
    F.ft(f'#{i}o', {'opacity': 0, 'scale': 1.7, 'filter': 'blur(22px)'}, {'opacity': 1, 'scale': 1, 'filter': 'blur(0px)'}, tp + 0.08, 0.26, 'power3.out')
    F.ft(f'#{i}l', {'opacity': 0}, {'opacity': 1}, tp + 0.42, 0.25)
    if final:
        F.ft(f'#{i}f', {'opacity': 0, 'y': 30}, {'opacity': 1, 'y': 0}, tp + 0.7, 0.25)
        F.ft(f'#{i}k', {'opacity': 0}, {'opacity': 1}, tp + 0.95, 0.3)
    WHITE.append((tp + 0.1, t1))
    sfx(t0, 'whoosh')
    sfx(tb - 0.28, 'sweep')
    sfx(tp + 0.1, 'hit')


def transfer(ta, tb, tgo, t1, y=880):
    """7-STOL -> 10-KABINA: a square carries the bill across."""
    i = F.nid('r')
    F.clip(ta, t1, f'''<div class="abs" style="left:80px;top:{y}px;width:920px;height:190px">
<div id="{i}a" class="box px" style="left:0">7-STOL</div>
<div id="{i}l" class="dash" style="left:372px;top:92px;width:176px"></div>
<i class="sq" id="{i}s" style="left:372px;top:80px;width:28px;height:28px"></i>
<div id="{i}b" class="box px" style="right:0">10-KABINA</div></div>''', z=14)
    F.ft(f'#{i}a', {'opacity': 0, 'x': -40}, {'opacity': 1, 'x': 0}, ta, 0.2)
    F.ft(f'#{i}b', {'opacity': 0, 'x': 40}, {'opacity': 1, 'x': 0}, tb, 0.2)
    F.ft(f'#{i}l', {'scaleX': 0}, {'scaleX': 1}, tb, 0.25)
    F.ft(f'#{i}s', {'opacity': 0, 'x': 0}, {'opacity': 1, 'x': 0}, tb + 0.1, 0.1)
    F.to(f'#{i}s', {'x': 150}, tgo, 0.4, 'power3.inOut')
    F.to(f'#{i}a', {'opacity': .35}, tgo + 0.3, 0.2, 'power2.out')
    F.to(f'#{i}b', {'backgroundColor': '#fff', 'color': DARK}, tgo + 0.36, 0.12, 'power2.out')
    sfx(ta, 'tick'); sfx(tb, 'tick'); sfx(tgo, 'whoosh', .6); sfx(tgo + 0.38, 'blip')


def paperx(t0, t1, y=850):
    """A scrap of ruled paper, crossed out by hand in red."""
    i = F.nid('n')
    F.clip(t0, t1, f'''<div class="ctr" style="top:{y}px"><div id="{i}" class="paper"><span class="it" style="color:#3a2f22;font-size:50px">qog'oz-qalam</span>
<svg class="hand" viewBox="0 0 300 160" style="position:absolute;inset:-10px;width:calc(100% + 20px);height:calc(100% + 20px)"><path id="{i}a" pathLength="1" d="M18 14 C90 60 200 110 284 148"/><path id="{i}b" pathLength="1" d="M280 12 C210 60 100 108 16 150"/></svg></div></div>''', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'rotation': -14, 'scale': .8}, {'opacity': 1, 'rotation': -5, 'scale': 1}, t0, 0.2)
    F.ft(f'#{i}a', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0 + 0.3, 0.16, 'power2.out')
    F.ft(f'#{i}b', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0 + 0.46, 0.16, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0 + 0.3, 'tick'); sfx(t0 + 0.46, 'tick')


def calendar(t0, tbell, t1, y=840):
    i = F.nid('k')
    days = ''.join(f'<b{" id=" + chr(34) + i + "d" + chr(34) if n == 9 else ""}>{n + 10}</b>' for n in range(14))
    F.clip(t0, t1, f'''<div class="ctr" style="top:{y}px"><div id="{i}" class="cal"><div class="calh thin">QARZ OLINADIGAN KUN</div><div class="calg">{days}</div>
<svg class="hand" viewBox="0 0 120 120" style="position:absolute;left:300px;top:118px;width:118px;height:118px"><path id="{i}c" pathLength="1" d="M60 10 C100 8 114 40 108 68 C100 104 60 114 34 100 C6 84 6 40 30 20 C44 10 70 6 92 20"/></svg></div></div>''', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'y': 40}, {'opacity': 1, 'y': 0}, t0, 0.22)
    F.ft(f'#{i}c', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0 + 0.35, 0.3, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'tick')
    chip(tbell, t1, 'ESLATMA KELADI', y=y + 300, kind='white')


def counter(L, sel, a, b, at, dur, spaced=False): L.raw(f'cnt({json.dumps(sel)},{a},{b},{at:.3f},{dur},{str(spaced).lower()});')


# =====================================================================  THE EDIT
# --- hook: pixel words behind the head, one at a time
hook = [('choyxona', 'CHOYXONA'), ('kafe', 'KAFE'), ('fast', 'FAST-FUD'), ('monoblok', 'MONOBLOK'), ('buyurtma', 'BUYURTMA'), ('chek', 'CHEK'), ('hisob', 'HISOB')]
hw = [(cue(q), t) for q, t in hook]
ZOOM = [(0, 1.14, 0), (0.02, 1.0, 0.5)]            # (time, zoom, ease seconds): pull back on the first word
z = 1.0
bil = cue('bilasizlar')
for n, (w, t) in enumerate(hw):
    t0 = max(0.12, w['s']) if n == 0 else w['s']
    t1 = hw[n + 1][0]['s'] if n + 1 < len(hw) else bil['s']
    t1 = min(t1, t0 + 1.5)
    pix(t0, t1, t, first=(n == 0))
    if n: z += 0.018; ZOOM.append((w['s'], round(z, 3), 0.12))

# --- "$50": the price of the usual software (story style: a counted number, one red mark)
nar, mini, fifty = cue('narxi'), cue('minimum'), cue('50')
hoz = cue('hozir')
italic(nar['s'], hoz['s'], 'bunday dasturlar narxi', y=830)
bigserif(mini['s'], hoz['s'], '$<span id="usd">0</span>', y=200, size=210)
counter(B, '#usd', 0, 50, mini['s'] + 0.05, max(0.4, fifty['e'] - mini['s']))
chip(fifty['s'], hoz['s'], 'MINIMUM $50 DAN', y=910, kind='red')
sfx(mini['s'], 'sweep', .5)

# --- "milliy dastur ... FLOWI": line burst and logo card
mil, flo = cue('milliy'), cue('flowi')
chip(mil['s'], flo['s'], "O'ZIMIZNING MILLIY DASTUR", y=900)
arz = cue('arzon')
logo(flo['s'] - 0.05, arz['s'] - 0.05, top='MILLIY DASTUR')
besh = cue('beshta')
chip(arz['s'], besh['s'], 'ANCHA ARZON', y=900, kind='green')
b5 = cue('beshinchisi')
pix(besh['s'], b5['s'], '5', maxs=250, y=200, cx=860)
chip(besh['s'] + 0.15, b5['s'], 'TA KATTA QULAYLIK', y=900, kind='white')
layk, oxir = cue('layk'), cue('oxirigacha')
chip(b5['s'], layk['s'], '5-SI — NARXI', y=900)
bir = cue('birinchisi')
F.clip(layk['s'], bir['s'], f'<div class="ctr" style="top:850px"><svg id="heart" viewBox="0 0 24 24" style="width:150px;height:150px;fill:{RED};filter:drop-shadow(0 10px 30px rgba(255,59,59,.6))"><path d="M12 21s-7.5-4.6-10-9.3C.3 8.300 2 4.5 5.600 4.100 7.900 3.800 10 5 12 7.400 14 5 16.100 3.800 18.400 4.100 22 4.500 23.700 8.300 22 11.700 19.500 16.400 12 21 12 21z"/></svg></div>', z=14)
F.ft('#heart', {'scale': 0, 'rotation': -20}, {'scale': 1, 'rotation': 0}, layk['s'], 0.22, 'back.out(2.2)')
F.to('#heart', {'scale': 1.18}, layk['s'] + 0.4, 0.12, 'power2.out')
F.to('#heart', {'scale': 1}, layk['s'] + 0.52, 0.14, 'power2.in')
sfx(layk['s'], 'blip')
chip(oxir['s'], bir['s'], 'OXIRIGACHA KO\'RING', y=1040, kind='white')

# --- 01 online control
section(bir['s'] - 0.04, '01', 'ONLAYN NAZORAT', 'left')
dun, inet, ios, andr = cue('dunyoning'), cue('internet'), cue('iphone'), cue('android')
farq, onl, naz = cue('farqi'), cue('onlayn'), cue('nazorat')
tg, kun, shub, ogoh = cue('telegram'), cue('kunlik'), cue('shubhali'), cue('ogohlantiradi')
ikk = cue('ikkinchi')
chip(dun['s'], inet['s'], 'DUNYONING ISTALGAN JOYIDAN', y=900, size=42)
chip(inet['s'], ios['s'], 'FAQAT INTERNET BO\'LSA BAS', y=900, size=42)
chip(ios['s'], farq['s'], 'iPHONE', y=860, kind='white')
chip(andr['s'], farq['s'], 'ANDROID', y=960, kind='white')
chip(farq['s'], onl['s'], 'XOHLAGAN QURILMADAN', y=900)
serif(onl['s'], tg['s'], 'ONLAYN NAZORAT', y=850, size=96)
chip(tg['s'], shub['s'], 'TELEGRAM', y=860, kind='white')
chip(kun['s'], shub['s'], 'KUNLIK HISOBOT', y=960)
chip(shub['s'], ikk['s'], 'SHUBHALI HOLAT', y=860, kind='red')
chip(ogoh['s'], ikk['s'], "O'ZI OGOHLANTIRADI", y=960)

# --- 02 moving a bill
section(ikk['s'] - 0.04, '02', "HISOBNI KO'CHIRISH", 'right')
yet, uni, och, birg, oson, old = cue('yettinchi'), cue("o'ninchi"), cue("o'chirmagan"), cue('birgina'), cue('osongina'), cue('oldinlari')
endi = cue('endi')
chip(nxt(ikk, 2)['s'] + 0.9, yet['s'] - 0.05, "BIR HISOBDAN IKKINCHISIGA", y=900, size=42)
transfer(yet['s'], uni['s'], oson['s'], old['s'])
chip(och['s'], birg['s'], "HISOB O'CHIRILMAYDI", y=1090, size=40)
chip(birg['s'], old['s'], '1 TA TUGMA', y=1090, kind='white', size=40)
italic(old['s'], endi['s'], 'oldinlari ancha qiyin edi…', y=900, size=62)

# --- 03 debts
section(endi['s'] - 0.04, '03', "QARZLAR BO'LIMI", 'left')
qq, qb, chk, qan, qsi, belg = cue("qog'oz"), cue('qarzlar'), cue('chek'), cue('qancha'), cue('qanchasi'), cue('belgilash')
kuni, esl, yig = cue('kuningizni'), cue('eslatma'), cue("yig'ib")
tor = cue("to'rtinchi")
paperx(qq['s'], qb['s'] - 0.3)
serif(qb['s'] - 0.25, chk['s'], "QARZLAR BO'LIMI", y=850, size=92)
chip(chk['s'], qan['s'], 'CHEK → QARZLARGA', y=900)
chip(qan['s'], belg['s'] - 0.4, 'QANCHA HISOB YOPILDI', y=860, size=42)
chip(qsi['s'], belg['s'] - 0.4, 'QANCHASI QARZGA KETDI', y=960, kind='red', size=42)
calendar(belg['s'], esl['s'], yig['s'])
chip(yig['s'], tor['s'], 'QARZNI YIG\'ISH KUNI — NAZORATDA', y=900, size=40)

# --- 04 stock
section(tor['s'] - 0.04, '04', 'OMBOR NAZORATI', 'right')
mas, kel, qol, qqol, tel, sh2 = cue('masalliqlar'), cue('kelyapti'), cue('qoldi'), cue('qancha'), cue('telefon'), cue('shubhali')
mis, kg, yuz, n95, dem, ogr = cue('misol'), cue('10'), cue('100'), cue('95'), cue('demak'), cue("o'g'irlangan")
bsh = cue('beshinchi')
serif(mas['s'], kel['s'] - 0.1, 'OMBOR', y=850, size=120)
chip(kel['s'], tel['s'], 'NIMA KELDI', y=830, size=42)
chip(qol['s'], tel['s'], 'NIMA QOLDI', y=925, size=42)
chip(qqol['s'], tel['s'], 'QANCHA QOLDI', y=1020, size=42)
chip(tel['s'], sh2['s'], 'TELEFONDAN, ONLAYN', y=900, kind='white')
chip(sh2['s'], mis['s'], 'SHUBHALI HOLAT', y=900, kind='red')
pix(kg['s'], yuz['s'], '10 KG', maxs=230)
chip(kg['s'] + 0.2, yuz['s'], "GO'SHT", y=900)
pix(yuz['s'], n95['s'], '100', maxs=300, y=160)
chip(yuz['s'] + 0.2, n95['s'], 'TA SHASHLIK CHIQISHI KERAK', y=900, size=40)
pix(n95['s'], bsh['s'], '95', maxs=185, y=210, color='#ff5a5a', cx=845)
chip(n95['s'] + 0.2, dem['s'], 'TA CHIQDI', y=900, kind='red')
bigm = F.nid('m')
F.clip(dem['s'], bsh['s'], f'<div class="ctr" style="top:800px"><span id="{bigm}" class="ab" style="font-size:200px;color:{RED};text-shadow:0 8px 40px rgba(0,0,0,.6)">−5</span></div>', z=14)
F.ft(f'#{bigm}', {'opacity': 0, 'scale': 1.6}, {'opacity': 1, 'scale': 1}, dem['s'], 0.18)
stamp(ogr['s'], bsh['s'], "O'G'IRLANGAN", y=1030)

# --- 05 price
section(bsh['s'] - 0.04, '05', 'NARXI', 'left')
haf, bep, ust, org, tek, oyi, n369 = cue('hafta'), cue('bepul'), cue('ustanovka'), cue("o'rgatish"), cue('tekin'), cue('oylik'), cue('369')
siz = cue('sizga')
pix(haf['s'], ust['s'], '7 KUN', maxs=250)
chip(bep['s'], ust['s'], 'BEPUL', y=880, kind='green', size=84)
chip(ust['s'], oyi['s'], "O'RNATISH", y=840, kind='white')
chip(org['s'], oyi['s'], "O'RGATISH", y=935, kind='white')
chip(tek['s'], oyi['s'], 'MUTLAQO BEPUL', y=1030, kind='green')
italic(oyi['s'], siz['s'], "oylik to'lovi atigi", y=820, size=60)
B.clip(n369['s'], siz['s'], f'<div class="ctr" style="top:190px"><span id="sum" class="ab glow" style="font-size:170px;color:{CREAM}">0</span></div>', z=5)
counter(B, '#sum', 0, 369000, n369['s'], 0.7, True)
chip(n369['s'] + 0.3, siz['s'], "SO'M / OY", y=900, kind='green', size=64)
sfx(n369['s'], 'sweep', .5)

# --- more
tash, tk, br, qr, ofi, xul = cue('tashqari'), cue("to'rt"), cue('brendingizni'), cue('qr'), cue('ofitsiantingiz'), cue('xullas')
man = cue('mana')
chip(tash['s'], tk['s'] - 0.6, '+ YANA', y=900, kind='white', size=64, icon=False)
chip(tk['s'], br['s'] - 0.3, "HISOBNI TENG BO'LISH ÷4", y=900, size=42)
chip(br['s'], qr['s'] - 0.8, 'CHEKDA BRENDINGIZ LOGOSI', y=900, size=42)
chip(qr['s'], ofi['s'] - 0.4, "QR-KOD — ONLAYN TO'LOV", y=900, size=42)
chip(ofi['s'], xul['s'], 'OFITSIANT TELEFONIDAN BUYURTMA', y=900, size=38)
serif(xul['s'], man['s'] - 0.2, "…VA YANA KO'P", y=860, size=92)

# --- call to action
pas, ozi, orn, org2, pas2 = cue('pastda'), cue("o'zimiz"), cue("o'rnatib"), cue("o'rgatib"), cue('pastdagi')
chip(pas['s'], SPEECH, '@Flowisupport_bot  ·  flowi.uz', y=1085, kind='white', size=44, icon=False)
chip(orn['s'], pas2['s'], "O'ZIMIZ O'RNATAMIZ", y=860)
chip(org2['s'], pas2['s'], "O'RGATIB BERAMIZ", y=960)
# stacked closing title with corner brackets (PIXEL-REEL-SPEC beat 7)
F.clip(pas2['s'], SPEECH, f'''<div class="abs" style="left:96px;top:790px;width:888px;height:270px">
<span id="st1" class="px" style="left:24px;top:18px;font-size:130px">7 KUN</span>
<span id="st2" class="px" style="left:430px;top:164px;font-size:52px">BEPUL</span>
<span id="st3" class="px" style="left:430px;top:226px;font-size:30px">SINAB KO'RING</span>
<i class="br" id="brA" style="right:0;top:0;border-top:8px solid #fff;border-right:8px solid #fff"></i>
<i class="br" id="brB" style="left:0;bottom:0;border-bottom:8px solid #fff;border-left:8px solid #fff"></i></div>''', z=14)
F.ft('#st1', {'opacity': 0, 'scale': 1.1}, {'opacity': 1, 'scale': 1}, pas2['s'], 0.12)
F.raw(f'scr("#st2","BEPUL",{pas2["s"] + 0.1:.3f},0.45);scr("#st3","SINAB KO\'RING",{pas2["s"] + 0.2:.3f},0.6);')
F.ft('#brA', {'opacity': 0, 'x': 40, 'y': -40}, {'opacity': 1, 'x': 0, 'y': 0}, pas2['s'] + 0.05, 0.22, 'power4.out')
F.ft('#brB', {'opacity': 0, 'x': -40, 'y': 40}, {'opacity': 1, 'x': 0, 'y': 0}, pas2['s'] + 0.05, 0.22, 'power4.out')
sfx(pas2['s'], 'blip')
logo(SPEECH, END, top='FLOWI', line='Biznesingiz — nazoratda', final=True)

# --- punch-ins: alternate on every sentence after the hook
zs, hi = bil['s'], False
for w in words:
    if w['s'] <= bil['s'] - 0.01: continue
    prev = words[w['i'] - 1]['w']
    if w['i'] == bil['i'] or prev[-1] in '.?!':
        hi = not hi if w['i'] != bil['i'] else False
        ZOOM.append((w['s'], 1.08 if hi else 1.0, 0))

# --- captions: 1-3 words, the spoken word lights up
groups, g = [], []
for w in words:
    if g:
        p = g[-1]
        chars = sum(len(x['w']) for x in g) + len(w['w'])
        if len(g) >= 3 or chars > 19 or p['w'][-1] in '.?!,:;' or w['s'] - p['e'] > 0.3:
            groups.append(g); g = []
    g.append(w)
if g: groups.append(g)
for gi, g in enumerate(groups):
    t0 = max(0.1, g[0]['s'] - 0.03)
    t1 = groups[gi + 1][0]['s'] - 0.03 if gi + 1 < len(groups) else SPEECH
    t1 = min(t1, g[-1]['e'] + 0.6)
    disp = [re.sub(r'[.,;:]+$', '', x['w']).upper().replace('IPHONE', 'iPHONE') for x in g]
    size = 62
    width = tw('in', ' '.join(disp), size)
    if width > 900: size = int(size * 900 / width)
    mid = (t0 + t1) / 2
    ink = any(a <= mid <= b for a, b in WHITE)
    spans = ''.join(f'<span id="w{x["i"]}">{d}</span>' for x, d in zip(g, disp))
    F.clip(t0, t1, f'<div class="cap{" ink" if ink else ""}" style="font-size:{size}px">{spans}</div>', z=60)
    for x in g:
        F.ft(f'#w{x["i"]}', {'opacity': .45, 'scale': 1}, {'opacity': 1, 'scale': 1.07}, max(t0, x['s'] - 0.02), 0.07, 'power2.out')
        F.to(f'#w{x["i"]}', {'scale': 1}, x['e'], 0.1, 'power2.out')

CSS = f'''
@font-face{{font-family:'Pixel';src:url('assets/fonts/PressStart2P.ttf');font-weight:700}}
@font-face{{font-family:'Pixel';src:url('assets/fonts/PressStart2P.ttf');font-weight:400}}
@font-face{{font-family:'Abril';src:url('assets/fonts/Abril.ttf')}}
@font-face{{font-family:'PlayI';src:url('assets/fonts/Playfair-Italic.ttf');font-weight:400 900;font-style:italic}}
@font-face{{font-family:'Inter';src:url('assets/fonts/InterDisplay-SemiBold.otf');font-weight:600}}
@font-face{{font-family:'Inter';src:url('assets/fonts/InterDisplay-ExtraBold.otf');font-weight:800}}
@font-face{{font-family:'Inter';src:url('assets/fonts/InterDisplay-Black.otf');font-weight:900}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;overflow:hidden;background:transparent}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:'Inter',sans-serif;color:#fff;-webkit-font-smoothing:antialiased}}
.clip{{position:absolute;inset:0}}
.full{{position:absolute;inset:0}} .abs{{position:absolute}}
.dark{{background:{DARK}}} .vglow{{position:absolute;inset:0}}
.ctr{{position:absolute;left:0;right:0;display:flex;justify-content:center;align-items:center;text-align:center}} .ctr.col{{flex-direction:column}}
.sq{{position:absolute;display:block;background:#fff}}
.pxw{{position:absolute}}
.px{{position:absolute;font-family:'Pixel';font-weight:700;line-height:1;white-space:nowrap;color:#fff;text-shadow:0 6px 0 rgba(0,0,0,.35)}}
.ab{{font-family:'Abril';line-height:1;white-space:nowrap;text-transform:uppercase}}
.glow{{text-shadow:0 0 34px rgba(243,234,216,.45),0 6px 30px rgba(0,0,0,.55)}}
.it{{font-family:'PlayI';font-style:italic;font-weight:500;color:#fff;text-shadow:0 3px 22px rgba(0,0,0,.85),0 0 4px rgba(0,0,0,.6);white-space:nowrap}}
.thin{{font-family:'Inter';font-weight:600;letter-spacing:.3em;text-transform:uppercase;white-space:nowrap}}
.chip{{display:inline-flex;align-items:center;gap:.42em;padding:.42em .8em;background:rgba(7,9,15,.86);border:3px solid rgba(255,255,255,.9);font-weight:900;letter-spacing:.01em;white-space:nowrap;box-shadow:0 18px 50px -12px rgba(0,0,0,.7)}}
.chip.white{{background:#fff;color:{DARK};border-color:#fff}} .chip.white .sq{{background:{DARK}}}
.chip.red{{background:{RED};border-color:{RED};color:#fff}}
.chip.green{{background:{GREEN};border-color:{GREEN};color:{DARK}}} .chip.green .sq{{background:{DARK}}}
.hand{{overflow:visible}} .hand path{{fill:none;stroke:{RED};stroke-width:9;stroke-linecap:round;stroke-dasharray:1}}
.stamp{{padding:.16em .4em;border:10px solid {RED};color:{RED};background:rgba(7,9,15,.55);letter-spacing:.04em}}
.box{{position:absolute;top:0;width:372px;height:190px;border:6px solid #fff;display:grid;place-items:center;font-size:34px;position:absolute;background:rgba(7,9,15,.86);text-shadow:none}}
.dash{{position:absolute;height:6px;background:repeating-linear-gradient(90deg,#fff 0 16px,transparent 16px 30px);transform-origin:left center}}
.paper{{position:relative;padding:44px 64px;background:repeating-linear-gradient({CREAM} 0 38px,#c9bfa8 38px 40px);box-shadow:0 24px 60px -10px rgba(0,0,0,.7)}}
.cal{{position:relative;width:560px;padding:26px 30px 30px;background:{CREAM};color:#2a2118;box-shadow:0 24px 60px -10px rgba(0,0,0,.7)}}
.calh{{font-size:26px;letter-spacing:.14em;margin-bottom:18px;color:#6b5a45}}
.calg{{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}} .calg b{{font-family:'Abril';font-weight:400;font-size:44px;height:62px;display:grid;place-items:center}}
.ray{{position:absolute;height:3px;margin-top:-1.5px;background:#fff;transform-origin:left center}}
.br{{position:absolute;display:block;width:90px;height:90px}}
.cap{{position:absolute;left:0;right:0;top:1196px;display:flex;justify-content:center;gap:.42em;font-weight:900;letter-spacing:.005em;white-space:nowrap;text-shadow:0 0 14px rgba(0,0,0,.9),0 4px 0 rgba(0,0,0,.85),0 0 3px #000}}
.cap span{{display:inline-block}} .cap.ink{{color:{NAVY};text-shadow:none}}
'''
JS_HELPERS = '''
function cnt(sel,a,b,at,dur,sp){var el=document.querySelector(sel),o={v:a};tl.to(o,{v:b,duration:dur,ease:"power2.out",onUpdate:function(){var v=String(Math.round(o.v));el.textContent=sp?v.replace(/\\B(?=(\\d{3})+(?!\\d))/g," "):v}},at)}
function scr(sel,fin,at,dur){var el=document.querySelector(sel),o={p:0},cs="ABCDEFGHKLMNOPRSTUVXYZ0123456789#%&";function draw(){var n=Math.floor(o.p*fin.length+.001),s=fin.slice(0,n),k=Math.floor(o.p*22);for(var i=n;i<fin.length;i++){s+=fin[i]==" "?" ":cs[(i*7+k*13+fin.charCodeAt(i))%cs.length]}el.textContent=s}draw();tl.to(o,{p:1,duration:dur,ease:"none",onUpdate:draw},at)}
'''


def page(L, name):
    return f'''<!doctype html>
<html lang="uz" data-resolution="portrait">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920"><title>FLOWI talk — {name}</title>
<script src="gsap.min.js"></script><style>{CSS}</style></head>
<body>
<div id="root" data-composition-id="{name}" data-start="0" data-duration="{END}" data-width="1080" data-height="1920" data-fps="30">
{chr(10).join(L.html)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{JS_HELPERS}
{chr(10).join(L.js)}
tl.set({{}},{{}},{END});
window.__timelines = window.__timelines || {{}};
window.__timelines["{name}"] = tl;
tl.seek(0);
</script>
</body></html>'''


open(f'{HERE}/back.html', 'w').write(page(B, 'back'))
open(f'{HERE}/front.html', 'w').write(page(F, 'front'))
json.dump({'zoom': ZOOM, 'end': END, 'speech': SPEECH, 'white': WHITE}, open(f'{D}/zoom.json', 'w'))
json.dump(sorted(SFX, key=lambda s: s['t']), open(f'{D}/sfx.json', 'w'))
print(f'back {len(B.html)} clips, front {len(F.html)} clips, {len(groups)} caption groups, {len(SFX)} sfx, end {END}s')
