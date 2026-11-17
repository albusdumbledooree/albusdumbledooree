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
TAIL = 3.6
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
    B.clip(t0, t1, f'<div class="ctr" style="top:{y}px;justify-content:flex-end;padding-right:40px"><span id="{i}" class="ab glow" style="font-size:{size}px;color:{color}">{html}</span></div>', z=5)
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
        extra = f'<div class="ctr" style="top:1010px"><div id="{i}f" class="chip white" style="font-size:54px"><i class="sq" style="position:relative;width:.42em;height:.42em;background:{NAVY}"></i><span>7 KUN BEPUL</span></div></div><div class="ctr" style="top:1135px"><span id="{i}k" style="font-family:Inter;font-weight:900;font-size:74px;color:{NAVY};letter-spacing:.01em">+998 88 270 98 00</span></div><div class="ctr" style="top:1250px"><span id="{i}k2" class="thin" style="font-size:34px;color:{NAVY};letter-spacing:.06em;text-transform:none">flowi.uz &nbsp;·&nbsp; @Flowisupport_bot</span></div>'
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
        F.ft(f'#{i}k', {'opacity': 0, 'y': 20}, {'opacity': 1, 'y': 0}, tp + 0.95, 0.3)
        F.ft(f'#{i}k2', {'opacity': 0}, {'opacity': 1}, tp + 1.2, 0.3)
    WHITE.append((tp + 0.1, t1))
    sfx(t0, 'whoosh')
    sfx(tb - 0.28, 'sweep')
    sfx(tp + 0.1, 'hit')


def transfer(ta, tb, tgo, t1, y=880, a='7-STOL', b='10-KABINA', h=190, bounce=False):
    """A -> B: a white square carries it across (bounce: it keeps going back and forth)."""
    i = F.nid('r')
    F.clip(ta, t1, f'''<div class="abs" style="left:80px;top:{y}px;width:920px;height:{h}px">
<div id="{i}a" class="box px" style="left:0;height:{h}px">{a}</div>
<div id="{i}l" class="dash" style="left:372px;top:{h / 2 - 3}px;width:176px"></div>
<i class="sq" id="{i}s" style="left:372px;top:{h / 2 - 14}px;width:28px;height:28px"></i>
<div id="{i}b" class="box px" style="right:0;height:{h}px">{b}</div></div>''', z=14)
    F.ft(f'#{i}a', {'opacity': 0, 'x': -40}, {'opacity': 1, 'x': 0}, ta, 0.2)
    F.ft(f'#{i}b', {'opacity': 0, 'x': 40}, {'opacity': 1, 'x': 0}, tb, 0.2)
    F.ft(f'#{i}l', {'scaleX': 0}, {'scaleX': 1}, tb, 0.25)
    F.ft(f'#{i}s', {'opacity': 0, 'x': 0}, {'opacity': 1, 'x': 0}, tb + 0.1, 0.1)
    if bounce:
        t, k = tgo, 0
        while t + 0.45 < t1:
            F.to(f'#{i}s', {'x': 150 if k % 2 == 0 else 0}, t, 0.4, 'power3.inOut')
            F.to(f'#{i}{"b" if k % 2 == 0 else "a"}', {'backgroundColor': '#fff', 'color': DARK}, t + 0.36, 0.1, 'power2.out')
            F.to(f'#{i}{"b" if k % 2 == 0 else "a"}', {'backgroundColor': 'rgba(7,9,15,.86)', 'color': '#fff'}, t + 0.62, 0.2, 'power2.out')
            if k < 3: sfx(t + 0.38, 'tick')
            t += 0.75; k += 1
    else:
        F.to(f'#{i}s', {'x': 150}, tgo, 0.4, 'power3.inOut')
        F.to(f'#{i}a', {'opacity': .35}, tgo + 0.3, 0.2, 'power2.out')
        F.to(f'#{i}b', {'backgroundColor': '#fff', 'color': DARK}, tgo + 0.36, 0.12, 'power2.out')
        sfx(tgo, 'whoosh', .6); sfx(tgo + 0.38, 'blip')
    F.to(f'#{i}a', {'opacity': 0}, t1 - 0.1, 0.1); F.to(f'#{i}b', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(ta, 'tick'); sfx(tb, 'tick')


def grid100(t0, tred, tdrop, t1, y=850):
    """100 squares = 100 skewers; the last five turn red and drop out."""
    i = F.nid('g')
    cells = ''.join(f'<i class="sq" id="{i}_{n}" style="position:static;width:34px;height:34px"></i>' for n in range(100))
    F.clip(t0, t1, f'<div class="abs" style="left:122px;top:{y}px;width:836px;display:grid;grid-template-columns:repeat(20,34px);gap:8.2px">{cells}</div>', z=14)
    for n in range(100):
        F.ft(f'#{i}_{n}', {'scale': 0}, {'scale': 1}, t0 + 0.008 * n, 0.12, 'power4.out')
    for k, n in enumerate(range(95, 100)):
        F.to(f'#{i}_{n}', {'backgroundColor': RED}, tred + 0.07 * k, 0.08, 'power2.out')
        F.to(f'#{i}_{n}', {'y': 160, 'rotation': 50, 'opacity': 0}, tdrop + 0.06 * k, 0.4, 'power2.in')
        sfx(tred + 0.07 * k, 'tick')
    sfx(t0, 'sweep', .5)


def week7(t0, t1, y=1040):
    """Seven day squares fill up one by one."""
    i = F.nid('w')
    cells = ''.join(f'<div id="{i}_{n}" class="day">{n + 1}</div>' for n in range(7))
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px;gap:14px">{cells}</div>', z=14)
    for n in range(7):
        F.ft(f'#{i}_{n}', {'opacity': 0, 'y': 20}, {'opacity': 1, 'y': 0}, t0 + 0.05 * n, 0.14)
        F.to(f'#{i}_{n}', {'backgroundColor': GREEN, 'color': DARK, 'borderColor': GREEN}, t0 + 0.45 + 0.1 * n, 0.08, 'power2.out')
        sfx(t0 + 0.45 + 0.1 * n, 'tick', .8)


def split4(t0, t1, y=850):
    """One bill splits into four equal parts."""
    i = F.nid('v')
    parts = ''.join(f'<div id="{i}_{n}" class="part">1/4</div>' for n in range(4))
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px">{parts}</div>', z=14)
    for n in range(4):
        F.ft(f'#{i}_{n}', {'opacity': 0, 'x': (1.5 - n) * 22, 'color': 'rgba(7,9,15,0)'}, {'opacity': 1}, t0, 0.15)
        F.to(f'#{i}_{n}', {'x': 0, 'color': DARK}, t0 + 0.5, 0.3, 'power3.out')
    sfx(t0 + 0.5, 'blip')


def qrcode(t0, t1, y=785):
    """A QR-like block assembles from squares (illustration, not a real code)."""
    i = F.nid('q')
    N = 11
    def on(r, c):
        for (a, b) in ((0, 0), (0, N - 3), (N - 3, 0)):
            if a <= r < a + 3 and b <= c < b + 3: return not (r == a + 1 and c == b + 1)
        return (r * 7 + c * 13 + r * c) % 3 == 0
    cells = ''.join(f'<i class="sq" id="{i}_{r * N + c}" style="position:static;width:22px;height:22px;background:{DARK if on(r, c) else "transparent"}"></i>' for r in range(N) for c in range(N))
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><div id="{i}" style="padding:20px;background:#fff;display:grid;grid-template-columns:repeat({N},22px);gap:2px;box-shadow:0 24px 60px -10px rgba(0,0,0,.7)">{cells}</div></div>', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'scale': .8}, {'opacity': 1, 'scale': 1}, t0, 0.18)
    for n in range(N * N):
        F.ft(f'#{i}_{n}', {'scale': 0}, {'scale': 1}, t0 + 0.1 + 0.004 * ((n * 37) % (N * N)), 0.1, 'power4.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0 + 0.1, 'sweep', .4)


def meter(t0, t1, y=1118):
    """Stock level draining: what is left is always visible."""
    i = F.nid('m')
    F.clip(t0, t1, f'<div class="abs" style="left:190px;top:{y}px;width:700px;height:30px;border:4px solid #fff;background:rgba(7,9,15,.8)"><div id="{i}" style="position:absolute;inset:0;background:#fff;transform-origin:left center"></div></div>', z=14)
    F.ft(f'#{i}', {'scaleX': 1}, {'scaleX': .32}, t0 + 0.1, max(0.6, t1 - t0 - 0.3), 'power1.inOut')
    F.to(f'#{i}', {'backgroundColor': RED}, t0 + (t1 - t0) * .7, 0.15, 'power2.out')


def bubble(t0, t1, y=1050):
    """A message arriving: two lines typing in."""
    i = F.nid('u')
    F.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><div id="{i}" style="width:520px;padding:22px 26px;background:#fff;display:flex;flex-direction:column;gap:14px"><div id="{i}a" style="height:16px;width:88%;background:{DARK};transform-origin:left center"></div><div id="{i}b" style="height:16px;width:60%;background:#9aa0aa;transform-origin:left center"></div></div></div>', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'x': -80}, {'opacity': 1, 'x': 0}, t0, 0.22)
    F.ft(f'#{i}a', {'scaleX': 0}, {'scaleX': 1}, t0 + 0.2, 0.35, 'power2.out')
    F.ft(f'#{i}b', {'scaleX': 0}, {'scaleX': 1}, t0 + 0.45, 0.3, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'blip', .7)


def pulse(i, t0, n=2):
    for k in range(n):
        F.to(f'#{i}', {'scale': 1.1}, t0 + 0.3 + k * 0.4, 0.12, 'power2.out')
        F.to(f'#{i}', {'scale': 1}, t0 + 0.42 + k * 0.4, 0.16, 'power2.in')


def paperx(t0, t1, y=850):
    """A scrap of ruled paper, crossed out by hand in red."""
    i = F.nid('n')
    F.clip(t0, t1, f'''<div class="ctr" style="top:{y}px"><div id="{i}" class="paper"><span class="it" style="color:#3a2f22;font-size:50px">qog'oz-qalam</span>
<svg class="hand" viewBox="0 0 300 160" style="position:absolute;inset:-10px;width:calc(100% + 20px);height:calc(100% + 20px)"><path id="{i}a" pathLength="1" d="M18 14 C90 60 200 110 284 148"/><path id="{i}b" pathLength="1" d="M280 12 C210 60 100 108 16 150"/></svg></div></div>''', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'rotation': -14, 'scale': .8}, {'opacity': 1, 'rotation': -5, 'scale': 1.9}, t0, 0.2)
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
    pulse(chip(tbell, t1, 'ESLATMA KELADI', y=y + 285, kind='white'), tbell)


def counter(L, sel, a, b, at, dur, spaced=False): L.raw(f'cnt({json.dumps(sel)},{a},{b},{at:.3f},{dur},{str(spaced).lower()});')


# =====================================================================  THE EDIT
# --- collage helpers (COLLAGE-STYLE.md): the footage background is replaced, cut-out photos pop in on the word
COLL = []


def cbg(t0, t1):
    B.clip(t0, t1, '<div class="full cbg"></div><div class="full grain"></div>', z=1)
    COLL.append((round(t0, 3), round(t1, 3)))


def obj(t0, t1, src, x, y, w, rot=0, z=3):
    i = B.nid('o')
    B.clip(t0, t1, f'<img id="{i}" class="obj" src="assets/img/{src}" style="left:{x}px;top:{y}px;width:{w}px">', z=z)
    B.ft(f'#{i}', {'opacity': 0, 'scale': .3, 'rotation': rot - 28}, {'opacity': 1, 'scale': 1, 'rotation': rot}, t0, 0.3)
    B.to(f'#{i}', {'rotation': rot + 4, 'y': -18}, t0 + 0.3, max(0.3, t1 - t0 - 0.3), 'none')
    sfx(t0, 'whoosh', .45)
    return i


def cword(t0, t1, text, y=180, maxs=230, color=CREAM):
    size = min(maxs, 980 / tw('ab', text, 100) * 100)
    i = B.nid('w')
    B.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><span id="{i}" class="ab glow" style="font-size:{size:.0f}px;color:{color}">{text}</span></div>', z=2)
    B.ft(f'#{i}', {'opacity': 0, 'scale': 1.25}, {'opacity': 1, 'scale': 1}, t0, 0.22)
    B.to(f'#{i}', {'scale': 1.06}, t0 + 0.22, max(0.2, t1 - t0 - 0.22), 'none')
    sfx(t0, 'blip', .6)


HAND = {'circle': 'M60 10 C100 8 114 40 108 68 C100 104 60 114 34 100 C6 84 6 40 30 20 C44 10 70 6 92 20', 'line': 'M4 66 C40 50 80 74 116 54'}


def hand(L, t0, t1, x, y, w, h, kind='circle'):
    i = L.nid('d')
    L.clip(t0, t1, f'<svg class="hand" viewBox="0 0 120 120" preserveAspectRatio="none" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px"><path id="{i}" pathLength="1" vector-effect="non-scaling-stroke" d="{HAND[kind]}"/></svg>', z=6)
    L.ft(f'#{i}', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0, 0.3, 'power2.out')


# --- hook as a collage: each thing he names pops in as a cut-out photo, its word in big serif caps behind him
hw = [cue(q) for q in ('choyxona', 'kafe', 'fast', 'monoblok', 'buyurtma', 'chek', 'hisob')]
bil = cue('bilasizlar')
nar, mini, fifty, hoz = cue('narxi'), cue('minimum'), cue('50'), cue('hozir')
mil, flo, arz, besh, b5 = cue('milliy'), cue('flowi'), cue('arzon'), cue('beshta'), cue('beshinchisi')
layk, oxir, bir = cue('layk'), cue('oxirigacha'), cue('birinchisi')
ZOOM = [(0, 1.14, 0), (0.02, 1.0, 0.5)]
z = 1.0
names = ['CHOYXONA', 'KAFE', 'FAST-FUD', 'MONOBLOK', 'BUYURTMA', 'CHEK', 'HISOB']
for n, (w, t) in enumerate(zip(hw, names)):
    t0 = max(0.12, w['s']) if n == 0 else w['s']
    t1 = hw[n + 1]['s'] if n + 1 < len(hw) else bil['s']
    cword(t0, t1, t)
    if n: z += 0.018; ZOOM.append((w['s'], round(z, 3), 0.12))
obj(max(0.12, hw[0]['s']), bil['s'], 'teapot.png', 24, 430, 370, -8)
obj(hw[1]['s'], bil['s'], 'cup.png', 742, 500, 270, 8)
obj(hw[2]['s'], bil['s'], 'burger.png', 0, 930, 400, 6)
term = obj(hw[3]['s'], bil['s'], 'terminal.png', 668, 850, 380, -6)
hand(B, hw[3]['s'] + 0.3, bil['s'], 640, 830, 430, 560)
for w in hw[4:]:
    B.to(f'#{term}', {'scale': 1.14}, w['s'], 0.1, 'power2.out')
    B.to(f'#{term}', {'scale': 1}, w['s'] + 0.1, 0.16, 'power2.in')

# --- "$50": what the usual software costs
cword(nar['s'], mini['s'], 'NARXI?', maxs=260)
obj(nar['s'], hoz['s'], 'terminal.png', 330, 520, 400, -6)
bigserif(mini['s'], hoz['s'], '$<span id="usd">0</span>', y=150, size=330)
counter(B, '#usd', 0, 50, mini['s'] + 0.05, max(0.4, fifty['e'] - mini['s']))
hand(B, fifty['s'] + 0.1, hoz['s'], 560, 120, 500, 400)
for n, (x, y, s) in enumerate([(70, 480, 150), (160, 900, 110), (60, 1250, 90), (880, 640, 120), (820, 1010, 160), (930, 1300, 80)]):
    i = B.nid('u')
    B.clip(mini['s'] + 0.06 * n, hoz['s'], f'<span id="{i}" class="ab" style="position:absolute;left:{x}px;top:{y}px;font-size:{s}px;color:rgba(243,234,216,.5)">$</span>', z=2)
    B.ft(f'#{i}', {'opacity': 0, 'y': 60, 'rotation': -20 + n * 9}, {'opacity': 1, 'y': 0}, mini['s'] + 0.06 * n, 0.3)
    B.to(f'#{i}', {'y': -70}, mini['s'] + 0.06 * n + 0.3, 2.0, 'none')
chip(fifty['s'], hoz['s'], 'MINIMUM $50 DAN', y=1010, kind='red', size=64)
sfx(mini['s'], 'sweep', .5)

# --- "our own national software": a plov photo card, then the line burst and logo card
cword(mil['s'], flo['s'], 'MILLIY DASTUR')
pc = B.nid('k')
B.clip(mil['s'], flo['s'], f'<div id="{pc}" class="pol" style="left:290px;top:450px"><img src="assets/img/plov.jpg" style="width:470px;display:block"></div>', z=3)
B.ft(f'#{pc}', {'opacity': 0, 'scale': .4, 'rotation': -30}, {'opacity': 1, 'scale': 1, 'rotation': -7}, mil['s'], 0.3)
chip(mil['s'] + 0.2, flo['s'], "O'ZIMIZNIKI", y=1040, kind='white', size=64)
logo(flo['s'] - 0.05, arz['s'] - 0.05, top='MILLIY DASTUR')
cword(arz['s'], besh['s'], 'ARZON', maxs=300)
old = B.nid('x')
B.clip(arz['s'], besh['s'], f'<span id="{old}" class="ab" style="position:absolute;left:300px;top:520px;font-size:260px;color:rgba(243,234,216,.75)">$50</span>', z=3)
B.ft(f'#{old}', {'opacity': 0, 'x': -60}, {'opacity': 1, 'x': 0}, arz['s'], 0.2)
hand(B, arz['s'] + 0.25, besh['s'], 250, 530, 600, 260, 'line')
chip(arz['s'] + 0.1, besh['s'], 'ANCHA ARZON', y=900, kind='green', size=84)

five = F.nid('f')
F.clip(besh['s'], b5['s'], '<div class="ctr" style="top:600px;gap:26px">' + ''.join(f'<i class="sq" id="{five}_{n}" style="position:static;width:130px;height:130px"></i>' for n in range(5)) + '</div>', z=14)
for n in range(5):
    F.ft(f'#{five}_{n}', {'scale': 0}, {'scale': 1}, besh['s'] + 0.1 + 0.08 * n, 0.14, 'power4.out')
    sfx(besh['s'] + 0.1 + 0.08 * n, 'tick')
chip(besh['s'] + 0.15, b5['s'], '5 TA KATTA QULAYLIK', y=820, kind='white', size=64)
cword(b5['s'], layk['s'], 'NARXI', maxs=280)
chip(b5['s'], layk['s'], '5-SI — NARXI', y=640, size=84)
cword(layk['s'], bir['s'], 'LAYK', maxs=300)
F.clip(layk['s'], bir['s'], f'<div class="ctr" style="top:500px"><svg id="heart" viewBox="0 0 24 24" style="width:340px;height:340px;fill:{RED};filter:drop-shadow(0 10px 30px rgba(255,59,59,.6))"><path d="M12 21s-7.5-4.6-10-9.3C.3 8.300 2 4.5 5.600 4.100 7.900 3.800 10 5 12 7.400 14 5 16.100 3.800 18.400 4.100 22 4.500 23.700 8.300 22 11.700 19.500 16.400 12 21 12 21z"/></svg></div>', z=14)
F.ft('#heart', {'scale': 0, 'rotation': -20}, {'scale': 1, 'rotation': 0}, layk['s'], 0.22, 'back.out(2.2)')
F.to('#heart', {'scale': 1.18}, layk['s'] + 0.4, 0.12, 'power2.out')
F.to('#heart', {'scale': 1}, layk['s'] + 0.52, 0.14, 'power2.in')
sfx(layk['s'], 'blip')
chip(oxir['s'], bir['s'], 'OXIRIGACHA KO\'RING', y=920, kind='white', size=64)


# --- from section 1 on: collage background, the speaker as a grey cut-out, a dark band under him for the captions


def cws(items, end):
    """Serif key words behind the head, one after another: [(word dict, text), ...]."""
    for n, (w, t) in enumerate(items):
        cword(w['s'], items[n + 1][0]['s'] if n + 1 < len(items) else end, t)


def card(t0, t1, src, x, y, w=300, rot=-7):
    i = B.nid('k')
    B.clip(t0, t1, f'<div id="{i}" class="pol" style="left:{x}px;top:{y}px"><img src="assets/img/{src}" style="width:{w}px;display:block"></div>', z=3)
    B.ft(f'#{i}', {'opacity': 0, 'scale': .4, 'rotation': rot - 24}, {'opacity': 1, 'scale': 1, 'rotation': rot}, t0, 0.3)
    B.to(f'#{i}', {'rotation': rot + 3, 'y': -14}, t0 + 0.3, max(0.3, t1 - t0 - 0.3), 'none')
    sfx(t0, 'whoosh', .45)


def remote(t0, tlive, t1, y=800):
    """The owner abroad watches the tea house live: a dot keeps travelling the arc, live bars grow."""
    i = F.nid('r')
    bars = ''.join(f'<i id="{i}b{n}" style="display:block;width:34px;height:{h}px;background:#fff;transform-origin:bottom center"></i>' for n, h in enumerate([38, 62, 50, 84, 70, 104]))
    F.clip(t0, t1, f"""<div id="{i}" class="glass" style="left:90px;top:{y}px;width:900px;height:330px">
<svg viewBox="0 0 900 330" style="position:absolute;inset:0;width:900px;height:330px;overflow:visible"><path id="{i}p" pathLength="1" d="M110 150 Q450 -80 790 150" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="1" /></svg>
<i class="sq" id="{i}d" style="left:99px;top:139px;width:22px;height:22px;background:{RED}"></i>
<i class="sq" style="left:96px;top:136px;width:28px;height:28px;z-index:-1"></i><i class="sq" style="left:776px;top:136px;width:28px;height:28px"></i>
<div class="px" style="left:40px;top:186px;font-size:26px;text-shadow:none">BOSHLIQ</div><div class="it" style="position:absolute;left:40px;top:222px;font-size:34px">chet elda</div>
<div class="px" style="right:36px;top:186px;font-size:26px;text-shadow:none">CHOYXONA</div><div class="it" style="position:absolute;right:36px;top:222px;font-size:34px">Toshkentda</div>
<div id="{i}l" style="position:absolute;left:330px;top:176px;width:240px;height:130px;display:flex;align-items:flex-end;justify-content:center;gap:10px">{bars}</div>
<div id="{i}j" class="thin" style="position:absolute;left:0;right:0;top:-48px;text-align:center;font-size:26px;letter-spacing:.2em;text-shadow:0 2px 10px #000"><i style="display:inline-block;width:16px;height:16px;background:{RED};margin-right:10px"></i>JONLI</div></div>""", z=14)
    F.ft(f'#{i}', {'opacity': 0, 'y': 40}, {'opacity': 1, 'y': 0}, t0, 0.22)
    F.ft(f'#{i}p', {'strokeDashoffset': 1}, {'strokeDashoffset': 0}, t0 + 0.15, 0.45, 'power2.out')
    t = t0 + 0.6
    F.raw(f'tl.set("#{i}d",{{x:0,y:0}},0);')
    while t + 1.0 < t1:
        F.raw(f'tl.fromTo("#{i}d",{{x:0}},{{x:680,duration:0.9,ease:"none",immediateRender:false}},{t:.3f});tl.fromTo("#{i}d",{{y:0}},{{y:-115,duration:0.45,ease:"sine.out",immediateRender:false}},{t:.3f});tl.to("#{i}d",{{y:0,duration:0.45,ease:"sine.in"}},{t + 0.45:.3f});')
        sfx(t + 0.9, 'tick', .6)
        t += 1.2
    F.ft(f'#{i}j', {'opacity': 0}, {'opacity': 1}, tlive, 0.15)
    for n in range(6):
        F.ft(f'#{i}b{n}', {'scaleY': 0}, {'scaleY': 1}, tlive + 0.06 * n, 0.25, 'power3.out')
        F.to(f'#{i}b{n}', {'scaleY': [0.7, 1.15, 0.85, 1.1, 0.9, 1.2][n]}, tlive + 0.7, 0.5, 'sine.inOut')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'whoosh', .5); sfx(tlive, 'sweep', .4)


def debts(t0, tchk, tq1, tq2, t1, y=790):
    """A debts list: rows slide in, a receipt flies in and becomes a new row, then paid vs owed bars."""
    i = F.nid('q')
    rows = ''.join(f'<div id="{i}r{n}" class="row"><i class="sq" style="position:static;width:22px;height:22px"></i><i style="width:{w}px;height:20px;background:#aab0bb"></i><i style="margin-left:auto;width:{a}px;height:20px;background:{RED}"></i></div>' for n, (w, a) in enumerate([(330, 130), (270, 90), (360, 160)]))
    F.clip(t0, t1, f"""<div id="{i}" class="glass" style="left:90px;top:{y}px;width:900px;height:350px;padding:26px 36px">
<div class="thin" style="font-size:26px;letter-spacing:.2em;margin-bottom:14px">QARZLAR BO'LIMI</div>{rows}
<div id="{i}n" class="row" style="background:#fff"><i class="sq" style="position:static;width:22px;height:22px;background:{DARK}"></i><i style="width:300px;height:20px;background:{DARK}"></i><i style="margin-left:auto;width:140px;height:20px;background:{RED}"></i></div>
<div id="{i}c" class="paper" style="position:absolute;left:40px;top:-150px;padding:26px 30px"><span class="px" style="position:static;color:#3a2f22;font-size:30px;text-shadow:none">CHEK</span></div>
<div style="position:absolute;left:36px;right:36px;bottom:18px;display:flex;flex-direction:column;gap:8px"><div id="{i}y" style="height:22px;width:560px;background:#fff;transform-origin:left center"></div><div id="{i}z" style="height:22px;width:210px;background:{RED};transform-origin:left center"></div></div></div>""", z=14)
    F.ft(f'#{i}', {'opacity': 0, 'y': 40}, {'opacity': 1, 'y': 0}, t0, 0.22)
    for n in range(3): F.ft(f'#{i}r{n}', {'opacity': 0, 'x': -60}, {'opacity': 1, 'x': 0}, t0 + 0.15 + 0.1 * n, 0.2)
    F.ft(f'#{i}c', {'opacity': 0, 'x': -420, 'y': -260, 'rotation': -30}, {'opacity': 1, 'x': 0, 'y': 0, 'rotation': -6}, tchk, 0.35)
    F.to(f'#{i}c', {'y': 230, 'scale': .3, 'opacity': 0}, tchk + 0.75, 0.3, 'power2.in')
    F.ft(f'#{i}n', {'opacity': 0, 'scaleY': 0}, {'opacity': 1, 'scaleY': 1}, tchk + 1.0, 0.18)
    F.ft(f'#{i}y', {'scaleX': 0}, {'scaleX': 1}, tq1, 0.5, 'power2.out')
    F.ft(f'#{i}z', {'scaleX': 0}, {'scaleX': 1}, tq2, 0.4, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'whoosh', .5); sfx(tchk, 'whoosh', .5); sfx(tchk + 1.0, 'blip'); sfx(tq1, 'sweep', .4); sfx(tq2, 'tick')


def stock(t0, tin, tleft, tlow, t1, y=800):
    """Stock levels: goods arrive (bars refill), get used (bars drain), the lowest one turns red."""
    i = F.nid('o')
    rows = ''.join(f'<div class="row" style="gap:20px"><span class="px" style="position:static;width:200px;font-size:26px;text-shadow:none">{nm}</span><div style="flex:1;height:30px;border:4px solid #fff"><div id="{i}f{n}" style="height:100%;background:#fff;transform-origin:left center"></div></div></div>' for n, nm in enumerate(["GO'SHT", 'GURUCH', "YOG'"]))
    F.clip(t0, t1, f'<div id="{i}" class="glass" style="left:90px;top:{y}px;width:900px;height:300px;padding:26px 36px"><div class="thin" style="font-size:26px;letter-spacing:.2em;margin-bottom:14px">OMBOR · JONLI QOLDIQ</div>{rows}</div>', z=14)
    F.ft(f'#{i}', {'opacity': 0, 'y': 40}, {'opacity': 1, 'y': 0}, t0, 0.22)
    for n, (lo, hi, end) in enumerate([(.35, 1, .22), (.5, .95, .6), (.3, .9, .45)]):
        F.ft(f'#{i}f{n}', {'scaleX': lo}, {'scaleX': hi}, tin + 0.1 * n, 0.4, 'power2.out')
        F.to(f'#{i}f{n}', {'scaleX': end}, tleft + 0.1 * n, max(0.5, tlow - tleft), 'power1.inOut')
    F.to(f'#{i}f0', {'backgroundColor': RED}, tlow + 0.2, 0.12, 'power2.out')
    F.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'whoosh', .5); sfx(tin, 'sweep', .4); sfx(tlow + 0.2, 'slam', .6)


def hero(t0, t1, html, y=470, layer=None):
    """A big centred visual in the middle of a full-screen scene."""
    L = layer or F
    i = L.nid('v')
    L.clip(t0, t1, f'<div class="ctr" style="top:{y}px"><div id="{i}">{html}</div></div>', z=12)
    L.ft(f'#{i}', {'opacity': 0, 'scale': .5, 'rotation': -12}, {'opacity': 1, 'scale': 1, 'rotation': 0}, t0, 0.28)
    L.to(f'#{i}', {'opacity': 0}, t1 - 0.1, 0.1)
    sfx(t0, 'whoosh', .45)
    return i


PLANE = '<svg viewBox="0 0 24 24" style="width:300px;height:300px;fill:#fff;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5))"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>'
WARN = f'<svg viewBox="0 0 24 24" style="width:300px;height:300px;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5))"><path fill="{RED}" d="M1 21h22L12 2 1 21z"/><path fill="#fff" d="M11 10h2v5h-2zm0 7h2v2h-2z"/></svg>'

# --- 01 online control
section(bir['s'] - 0.04, '01', 'ONLAYN NAZORAT', 'left')
bosh, dun, inet, ios, andr = cue('boshliq'), cue('dunyoning'), cue('internet'), cue('iphone'), cue('android')
farq, onl, naz = cue('farqi'), cue('onlayn'), cue('nazorat')
tg, kun, shub, ogoh = cue('telegram'), cue('kunlik'), cue('shubhali'), cue('ogohlantiradi')
ikk = cue('ikkinchi')
t01 = bir['s'] + 0.82
cws([(dun, 'DUNYO'), (inet, 'INTERNET'), (ios, 'iPHONE'), (andr, 'ANDROID'), (farq, 'QURILMA'), (onl, 'ONLAYN'), (naz, 'NAZORAT'), (tg, 'TELEGRAM'), (kun, 'HISOBOT'), (shub, 'SHUBHA?'), (ogoh, 'OGOHLANTIRISH')], ikk['s'] - 0.04)
obj(max(t01, bosh['s']), tg['s'], 'boss.png', 110, 430, 330, -3)
card(dun['s'], tg['s'], 'dubai.jpg', 560, 450, 360, 6)
remote(dun['s'] + 0.25, onl['s'], tg['s'], y=850)
hero(tg['s'], shub['s'], PLANE, y=440)
chip(tg['s'], shub['s'], 'TELEGRAM', y=770, kind='white')
chip(kun['s'], shub['s'], 'KUNLIK HISOBOT', y=870)
bubble(kun['s'] + 0.15, shub['s'], y=980)
pulse(hero(shub['s'], ikk['s'], WARN, y=440), shub['s'], 4)
chip(shub['s'], ikk['s'], 'SHUBHALI HOLAT', y=800, kind='red', size=60)
chip(ogoh['s'], ikk['s'], "O'ZI OGOHLANTIRADI", y=930, size=54)

# --- 02 moving a bill
section(ikk['s'] - 0.04, '02', "HISOBNI KO'CHIRISH", 'right')
yet, uni, och, birg, oson, old = cue('yettinchi'), cue("o'ninchi"), cue("o'chirmagan"), cue('birgina'), cue('osongina'), cue('oldinlari')
endi = cue('endi')
cws([(yet, '7-STOL'), (uni, '10-KABINA'), (och, "O'CHMAYDI"), (birg, '1 TUGMA'), (oson, 'OSON'), (old, 'OLDIN QIYIN')], endi['s'] - 0.04)
chip(nxt(ikk, 2)['s'] + 0.9, yet['s'] - 0.05, "BIR HISOBDAN IKKINCHISIGA", y=620, size=50)
transfer(yet['s'], uni['s'], oson['s'], old['s'], y=530, h=250)
chip(och['s'], birg['s'], "HISOB O'CHIRILMAYDI", y=860, size=54)
chip(birg['s'], old['s'], '1 TA TUGMA', y=860, kind='white', size=72)
italic(old['s'], endi['s'], 'oldinlari ancha qiyin edi…', y=640, size=72)

# --- 03 debts
section(endi['s'] - 0.04, '03', "QARZLAR BO'LIMI", 'left')
qq, qb, chk, qan, qsi, belg = cue("qog'oz"), cue('qarzlar'), cue('chek'), cue('qancha'), cue('qanchasi'), cue('belgilash')
kuni, esl, yig = cue('kuningizni'), cue('eslatma'), cue("yig'ib")
tor = cue("to'rtinchi")
cws([(qq, "QOG'OZ?"), (qb, 'QARZLAR'), (chk, 'CHEK'), (qan, 'YOPILDI'), (qsi, 'QARZ'), (belg, 'BELGILASH'), (esl, 'ESLATMA'), (yig, "YIG'ISH")], tor['s'] - 0.04)
paperx(qq['s'], qb['s'] - 0.3, y=620)
debts(qb['s'] - 0.25, chk['s'], qan['s'], qsi['s'], belg['s'] - 0.3, y=620)
calendar(belg['s'], esl['s'], yig['s'], y=540)
chip(yig['s'], tor['s'], 'QARZNI YIG\'ISH KUNI — NAZORATDA', y=660, size=46)

# --- 04 stock
section(tor['s'] - 0.04, '04', 'OMBOR NAZORATI', 'right')
mas, kel, qol, qqol, tel, sh2 = cue('masalliqlar'), cue('kelyapti'), cue('qoldi'), cue('qancha'), cue('telefon'), cue('shubhali')
mis, kg, yuz, n95, dem, ogr = cue('misol'), cue('10'), cue('100'), cue('95'), cue('demak'), cue("o'g'irlangan")
bsh = cue('beshinchi')
cws([(mas, 'OMBOR'), (kel, 'KELDI'), (qol, 'QOLDI'), (qqol, 'QANCHA?'), (tel, 'TELEFONDA'), (sh2, 'SHUBHA?'), (kg, '10 KG'), (yuz, '100 TA'), (n95, '95 TA'), (dem, '5 TA?')], bsh['s'] - 0.04)
card(mas['s'], sh2['s'], 'meat.jpg', 385, 430, 300, -5)
stock(mas['s'] + 0.2, kel['s'], qol['s'], qqol['s'], sh2['s'], y=850)
pulse(hero(sh2['s'], mis['s'], WARN, y=440), sh2['s'], 3)
chip(sh2['s'], mis['s'], 'SHUBHALI HOLAT', y=800, kind='red', size=60)
card(kg['s'], n95['s'], 'meat.jpg', 100, 440, 250, -6)
chip(kg['s'] + 0.2, yuz['s'], "10 KG GO'SHT", y=560, size=60)
grid100(yuz['s'], n95['s'], dem['s'] - 0.25, dem['s'] + 0.2, y=760)
chip(yuz['s'] + 0.2, n95['s'], '100 TA SHASHLIK CHIQISHI KERAK', y=1010, size=42)
chip(n95['s'] + 0.1, dem['s'], '95 TA CHIQDI', y=1010, kind='red', size=56)
bigm = F.nid('m')
F.clip(dem['s'] + 0.15, bsh['s'], f'<div class="ctr" style="top:480px"><span id="{bigm}" class="ab" style="font-size:330px;color:{RED};text-shadow:0 8px 40px rgba(0,0,0,.6)">−5</span></div>', z=14)
F.ft(f'#{bigm}', {'opacity': 0, 'scale': 1.6}, {'opacity': 1, 'scale': 1}, dem['s'] + 0.15, 0.18)
stamp(ogr['s'], bsh['s'], "O'G'IRLANGAN", y=880, size=100)

# --- 05 price
section(bsh['s'] - 0.04, '05', 'NARXI', 'left')
haf, bep, ust, org, tek, oyi, n369 = cue('hafta'), cue('bepul'), cue('ustanovka'), cue("o'rgatish"), cue('tekin'), cue('oylik'), cue('369')
siz = cue('sizga')
cws([(haf, '7 KUN'), (bep, 'BEPUL'), (ust, "O'RNATISH"), (org, "O'RGATISH"), (tek, 'TEKIN'), (oyi, 'OYIGA')], siz['s'])
chip(bep['s'], ust['s'], 'BEPUL', y=540, kind='green', size=130)
week7(haf['s'], ust['s'], y=850)
chip(ust['s'], oyi['s'], "O'RNATISH", y=540, kind='white', size=70)
chip(org['s'], oyi['s'], "O'RGATISH", y=680, kind='white', size=70)
chip(tek['s'], oyi['s'], 'MUTLAQO BEPUL', y=820, kind='green', size=70)
italic(oyi['s'], siz['s'], "oylik to'lovi atigi", y=500, size=72)
F.clip(n369['s'], siz['s'], f'<div class="ctr" style="top:600px"><span id="sum" class="ab glow" style="font-size:200px;color:{CREAM}">0</span></div>', z=12)
counter(F, '#sum', 0, 369000, n369['s'], 0.7, True)
chip(n369['s'] + 0.3, siz['s'], "SO'M / OY", y=850, kind='green', size=80)
sfx(n369['s'], 'sweep', .5)

# --- more
tash, tk, br, qr, ofi, xul = cue('tashqari'), cue("to'rt"), cue('brendingizni'), cue('qr'), cue('ofitsiantingiz'), cue('xullas')
man = cue('mana')
STAGE_END = words[man['i'] - 1]['s'] - 0.02
cws([(tash, 'YANA'), (tk, '÷ 4'), (br, 'LOGOTIP'), (qr, 'QR-KOD'), (ofi, 'OFITSIANT'), (xul, "YANA KO'P")], STAGE_END)
chip(tash['s'], tk['s'] - 0.6, '+ YANA', y=600, kind='white', size=110, icon=False)
split4(tk['s'], br['s'] - 0.3, y=560)
chip(tk['s'], br['s'] - 0.3, "HISOBNI TENG BO'LISH ÷4", y=800, size=50)
hero(br['s'], qr['s'] - 0.8, f'<div class="paper" style="padding:50px 60px 70px;display:flex;flex-direction:column;align-items:center;gap:26px"><img src="assets/flowi-navy.svg" style="width:300px"><i style="display:block;width:300px;height:14px;background:#b9ad95"></i><i style="display:block;width:220px;height:14px;background:#b9ad95"></i><i style="display:block;width:260px;height:14px;background:#b9ad95"></i></div>', y=450)
chip(br['s'] + 0.2, qr['s'] - 0.8, 'CHEKDA BRENDINGIZ LOGOSI', y=900, size=46)
qrcode(qr['s'], ofi['s'] - 0.4, y=470)
chip(qr['s'] + 0.2, ofi['s'] - 0.4, "QR-KOD — ONLAYN TO'LOV", y=820, size=50)
chip(ofi['s'], xul['s'], 'OFITSIANT TELEFONIDAN BUYURTMA', y=560, size=44)
transfer(ofi['s'] + 0.2, ofi['s'] + 0.5, ofi['s'] + 1.0, xul['s'], y=700, a='OFITSIANT', b='OSHXONA', h=150, bounce=True)
serif(xul['s'], STAGE_END, "…VA YANA KO'P", y=620, size=110)
cbg(bil['s'], flo['s'] - 0.05)
cbg(arz['s'] - 0.05, STAGE_END)


# --- call to action
pas, ozi, orn, org2, pas2 = cue('pastda'), cue("o'zimiz"), cue("o'rnatib"), cue("o'rgatib"), cue('pastdagi')
pulse(chip(pas['s'], SPEECH, '+998 88 270 98 00', y=1052, kind='white', size=60), pas['s'], 3)
chip(orn['s'], pas2['s'], "O'ZIMIZ O'RNATAMIZ", y=860)
chip(org2['s'], pas2['s'], "O'RGATIB BERAMIZ", y=960)
# stacked closing title with corner brackets (PIXEL-REEL-SPEC beat 7)
F.clip(pas2['s'], SPEECH, f'''<div class="abs" style="left:96px;top:770px;width:888px;height:270px">
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
.box{{position:absolute;top:0;width:372px;height:190px;border:6px solid #fff;display:grid;place-items:center;font-size:34px;background:rgba(7,9,15,.86);text-shadow:none}}
.dash{{position:absolute;height:6px;background:repeating-linear-gradient(90deg,#fff 0 16px,transparent 16px 30px);transform-origin:left center}}
.paper{{position:relative;padding:44px 64px;background:repeating-linear-gradient({CREAM} 0 38px,#c9bfa8 38px 40px);box-shadow:0 24px 60px -10px rgba(0,0,0,.7)}}
.cal{{position:relative;width:560px;padding:26px 30px 30px;background:{CREAM};color:#2a2118;box-shadow:0 24px 60px -10px rgba(0,0,0,.7)}}
.calh{{font-size:26px;letter-spacing:.14em;margin-bottom:18px;color:#6b5a45}}
.calg{{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}} .calg b{{font-family:'Abril';font-weight:400;font-size:44px;height:62px;display:grid;place-items:center}}
.ray{{position:absolute;height:3px;margin-top:-1.5px;background:#fff;transform-origin:left center}}
.day{{width:96px;height:96px;border:4px solid #fff;background:rgba(7,9,15,.86);display:grid;place-items:center;font-family:'Pixel';font-size:36px}}
.part{{width:230px;height:160px;margin:0 6px;background:#fff;color:{DARK};display:grid;place-items:center;font-family:'Pixel';font-size:30px}}
.glass{{position:absolute;background:rgba(7,9,15,.9);border:3px solid rgba(255,255,255,.9);box-shadow:0 24px 60px -12px rgba(0,0,0,.8)}}
.row{{display:flex;align-items:center;gap:16px;padding:12px 14px;margin-bottom:6px;transform-origin:top center}}
.band{{position:absolute;left:0;right:0;top:1060px;bottom:0;background:linear-gradient(rgba(26,3,6,0),#1a0306 26%,#1a0306)}}
.cbg{{background:radial-gradient(120% 75% at 50% 34%,#16406e 0%,#0b2440 46%,#050d18 100%)}}
.grain{{background:url(assets/img/grain.png);background-size:1080px 1920px;opacity:.06}}
.obj{{position:absolute;filter:drop-shadow(0 22px 30px rgba(0,0,0,.6))}}
.pol{{position:absolute;padding:14px 14px 54px;background:{CREAM};box-shadow:0 24px 50px -8px rgba(0,0,0,.7)}}
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
json.dump({'zoom': ZOOM, 'end': END, 'speech': SPEECH, 'white': WHITE, 'collage': COLL}, open(f'{D}/zoom.json', 'w'))
json.dump(sorted(SFX, key=lambda s: s['t']), open(f'{D}/sfx.json', 'w'))
print(f'back {len(B.html)} clips, front {len(F.html)} clips, {len(groups)} caption groups, {len(SFX)} sfx, end {END}s')
