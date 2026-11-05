// FLOWI reels → HyperFrames compositions.
// node build.js   writes flowi-reels/r1.html, r2.html and assets/<r>.cues.json (sound-effect times for audio.py).
// Every visual beat is keyed to a word of the voice-over (assets/<r>.words.json), so a new recording stays in sync.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const PRJ = path.resolve(__dirname, '../flowi-reels');
const ICONS = new Function(fs.readFileSync(`${ROOT}/public/js/icons.js`, 'utf8').replace(/^'use strict';/, '') + '; return ICONS;')();
const ic = (n, s = 48, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const CSS = `
@font-face{font-family:'FlowiDisplay';src:url('assets/fonts/InterDisplay-SemiBold.otf') format('opentype');font-weight:600}
@font-face{font-family:'FlowiDisplay';src:url('assets/fonts/InterDisplay-Bold.otf') format('opentype');font-weight:700}
@font-face{font-family:'FlowiDisplay';src:url('assets/fonts/InterDisplay-ExtraBold.otf') format('opentype');font-weight:800}
@font-face{font-family:'FlowiDisplay';src:url('assets/fonts/InterDisplay-Black.otf') format('opentype');font-weight:900}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#071726}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:'FlowiDisplay',sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.clip{position:absolute;inset:0}
#bg{position:absolute;inset:0;background:linear-gradient(165deg,#0d2238 0%,#071726 65%)}
.blob{position:absolute;border-radius:50%}
.b1{width:1100px;height:1100px;left:300px;top:-380px;background:radial-gradient(closest-side,rgba(33,86,232,.55),transparent)}
.b2{width:1000px;height:1000px;left:-420px;top:1100px;background:radial-gradient(closest-side,rgba(20,184,166,.32),transparent)}
.b3{width:900px;height:900px;left:90px;top:520px;background:radial-gradient(closest-side,rgba(220,38,38,.38),transparent);opacity:0}
.grid{position:absolute;inset:-200px;background-image:linear-gradient(rgba(255,255,255,.035) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.035) 2px,transparent 2px);background-size:120px 120px}
.brand{position:absolute;top:236px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:22px;opacity:.9}
.brand img{height:46px}.brand span{font-size:34px;font-weight:600;opacity:.7}
.ctr{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center}
.ac{background:linear-gradient(90deg,#7aa7ff,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.red{color:#ff6b6b}
.tile{width:300px;height:300px;border-radius:84px;display:grid;place-items:center;position:relative}
.tile.r{background:linear-gradient(140deg,#f87171,#b91c1c);box-shadow:0 40px 90px -25px rgba(220,38,38,.75)}
.tile.b{background:linear-gradient(140deg,#3b74ff,#1a46c4);box-shadow:0 40px 90px -25px rgba(33,86,232,.85)}
.tile.g{background:linear-gradient(140deg,#2dd4bf,#0f766e);box-shadow:0 40px 90px -25px rgba(20,184,166,.8)}
.num{position:absolute;left:-40px;top:-40px;width:120px;height:120px;border-radius:50%;background:#fff;color:#0d2238;display:grid;place-items:center;font-size:66px;font-weight:900}
.stamp{position:absolute;right:-60px;bottom:-60px;width:170px;height:170px;border-radius:50%;background:#fff;color:#dc2626;display:grid;place-items:center;box-shadow:0 20px 50px -10px rgba(0,0,0,.5)}
.chip{display:inline-flex;align-items:center;gap:18px;padding:22px 40px;border-radius:999px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.18);font-size:46px;font-weight:800;letter-spacing:.02em}
.chip.red{background:rgba(220,38,38,.18);border-color:rgba(248,113,113,.5);color:#fecaca}
.big{font-size:150px;line-height:.95;font-weight:900;letter-spacing:-.04em}
.huge{font-size:520px;line-height:.8;font-weight:900;letter-spacing:-.06em}
.h2{font-size:96px;line-height:1.02;font-weight:900;letter-spacing:-.035em}
.row{display:flex;align-items:center;gap:34px;width:860px;padding:34px 40px;border-radius:44px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.14);margin-top:28px;text-align:left}
.row .ri{width:110px;height:110px;border-radius:32px;display:grid;place-items:center;background:linear-gradient(140deg,#3b74ff,#1a46c4);flex:none}
.row b{font-size:52px;font-weight:800;line-height:1.1;flex:1}
.row .ok{width:84px;height:84px;border-radius:50%;background:#22c55e;display:grid;place-items:center;flex:none}
.pill{display:inline-flex;align-items:center;gap:20px;padding:34px 60px;border-radius:999px;background:#2156e8;font-size:58px;font-weight:900;box-shadow:0 30px 70px -18px rgba(33,86,232,.95)}
.clip.cap{inset:auto;left:90px;right:150px;top:1290px;display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;gap:0 30px;text-align:center}
.cap span{display:inline-block;font-size:84px;line-height:1.12;font-weight:900;text-transform:uppercase;letter-spacing:-.01em;color:#fff;text-shadow:0 6px 0 rgba(0,0,0,.35),0 0 40px rgba(0,0,0,.55)}
.wipe{position:absolute;top:-200px;left:0;width:1500px;height:2400px;background:linear-gradient(90deg,#2156e8,#5eead4);transform:translateX(-2100px) skewX(-12deg)}
.flash{position:absolute;inset:0;background:#fff;opacity:0}
.conf{position:absolute;width:26px;height:40px;border-radius:6px;left:527px;top:900px;opacity:0}
.coin{position:absolute;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 60%,#b45309);border:6px solid #fcd34d;opacity:0}
`;

// ---- tiny helpers to write GSAP calls ----
const r3 = (x) => Math.round(x * 1000) / 1000;
function film(name, dur) {
  const words = JSON.parse(fs.readFileSync(`${PRJ}/assets/${name}.words.json`, 'utf8'));
  const T = (i) => words[i].s;
  const html = []; const js = []; const sfx = [];
  const clip = (id, a, b, inner, extra = '', cls = '') => html.push(`<div id="${id}" class="clip ${cls}" data-start="${r3(a)}" data-duration="${r3(b - a)}" ${extra}>${inner}</div>`);
  const seen = new Set();
  const tw = (sel, vars, at, from) => {
    if (!from) return js.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(vars)},${r3(at)});`);
    if (!seen.has(sel) && sel !== '#flash' && sel !== '#wipe') { seen.add(sel); js.push(`tl.set(${JSON.stringify(sel)},${JSON.stringify(from)},0);`); }
    js.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify({ ...vars, immediateRender: false })},${r3(at)});`);
  };
  const set = (sel, vars, at) => js.push(`tl.set(${JSON.stringify(sel)},${JSON.stringify(vars)},${r3(at)});`);
  const fx = (type, t, gain) => sfx.push(gain ? { type, t: r3(t), gain } : { type, t: r3(t) });
  // entrance helpers
  const slam = (sel, at, s = 1.6) => tw(sel, { scale: 1, opacity: 1, duration: 0.32, ease: 'back.out(2.2)' }, at, { scale: s, opacity: 0 });
  const rise = (sel, at, y = 90) => tw(sel, { y: 0, opacity: 1, duration: 0.42, ease: 'power3.out' }, at, { y, opacity: 0 });
  const popIn = (sel, at) => tw(sel, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2.6)' }, at, { scale: 0, opacity: 0 });
  const out = (sel, at) => tw(sel, { scale: 0.9, opacity: 0, duration: 0.18, ease: 'power2.in' }, at - 0.18);
  const shake = (sel, at, n = 6, amp = 14) => { for (let k = 0; k < n; k++) tw(sel, { x: k === n - 1 ? 0 : (k % 2 ? -amp : amp), duration: 0.05, ease: 'none' }, at + k * 0.05); };
  const wipe = (at) => { tw('#wipe', { x: 1500, duration: 0.5, ease: 'power3.inOut' }, at - 0.25, { x: -2100 }); fx('whoosh', at); };
  const flash = (at) => tw('#flash', { opacity: 0, duration: 0.35, ease: 'power2.out' }, at, { opacity: 0.35 });
  const confetti = (at) => {
    const cols = ['#5eead4', '#7aa7ff', '#fde047', '#f472b6', '#ffffff', '#22c55e'];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2 + (k % 3) * 0.2; const sp = 380 + ((k * 137) % 260);
      html.push(`<div class="conf" id="cf${k}" style="background:${cols[k % cols.length]}"></div>`);
      tw(`#cf${k}`, { keyframes: [{ opacity: 1, x: Math.cos(a) * sp, y: Math.sin(a) * sp - 260, rotation: (k * 53) % 360, duration: 0.55, ease: 'power3.out' }, { opacity: 0, y: Math.sin(a) * sp + 380, rotation: (k * 97) % 720, duration: 1.1, ease: 'power1.in' }] }, at);
    }
    fx('sparkle', at); fx('ding', at);
  };
  // caption: words grouped in 2–3 by pauses; the spoken word lights up
  const captions = (from, to, rename = {}, breaks = []) => {
    const ws = words.filter((w) => w.s >= from - 0.01 && w.s < to);
    const groups = []; let g = [];
    ws.forEach((w, i) => { const gap = i ? w.s - ws[i - 1].e : 0; if (g.length && (breaks.includes(words.indexOf(w)) || g.length >= 3 || gap > 0.28 || (g.map((x) => x.w).join(' ').length + w.w.length) > 18)) { groups.push(g); g = []; } g.push(w); });
    if (g.length) groups.push(g);
    groups.forEach((gr, k) => {
      const a = gr[0].s; const b = k < groups.length - 1 ? groups[k + 1][0].s : Math.min(to, gr[gr.length - 1].e + 0.5);
      const id = `cap${name}${k}`;
      clip(id, a, b, gr.map((w, j) => `<span id="${id}w${j}">${rename[w.w] || w.w}</span>`).join(''), 'style="z-index:30"', 'cap');
      tw(`#${id}`, { scale: 1, opacity: 1, duration: 0.16, ease: 'back.out(3)' }, a, { scale: 0.86, opacity: 0 });
      gr.forEach((w, j) => {
        tw(`#${id}w${j}`, { color: '#5eead4', scale: 1.06, duration: 0.08, ease: 'power2.out' }, w.s, { color: '#ffffff', scale: 1 });
        tw(`#${id}w${j}`, { color: '#ffffff', scale: 1, duration: 0.12 }, Math.max(w.e, w.s + 0.12));
      });
    });
  };
  return { words, T, html, js, sfx, clip, tw, set, fx, slam, rise, popIn, out, shake, wipe, flash, confetti, captions, dur, name };
}

function page(f, title) {
  const brand = `<div class="brand"><img src="assets/flowi-white.svg" alt="FLOWI"><span>flowi.uz</span></div>`;
  return `<!doctype html>
<html lang="uz" data-resolution="portrait">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920"><title>${title}</title>
<script src="gsap.min.js"></script><style>${CSS}</style></head>
<body>
<div id="root" data-composition-id="${f.name}" data-start="0" data-duration="${f.dur}" data-width="1080" data-height="1920" data-fps="30">
<div id="bg" class="clip" data-start="0" data-duration="${f.dur}"><div class="grid" id="grid"></div><div class="blob b1" id="b1"></div><div class="blob b2" id="b2"></div><div class="blob b3" id="b3"></div>${brand}</div>
${f.html.join('\n')}
<div id="fxl" class="clip" data-start="0" data-duration="${f.dur}" style="z-index:50;pointer-events:none"><div class="wipe" id="wipe" data-layout-allow-occlusion data-layout-allow-overflow></div><div class="flash" id="flash"></div></div>
<audio id="mix" src="assets/${f.name}-mix.wav" data-start="0" data-duration="${f.dur}" data-volume="1"></audio>
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.to("#b1",{x:-160,y:120,duration:${f.dur},ease:"none"},0);
tl.to("#b2",{x:180,y:-140,duration:${f.dur},ease:"none"},0);
tl.to("#grid",{y:120,duration:${f.dur},ease:"none"},0);
${f.js.join('\n')}
window.__timelines = window.__timelines || {};
window.__timelines["${f.name}"] = tl;
tl.seek(0);
</script>
</body></html>`;
}

// ======================= R1 — "Kassada pul yetmayaptimi?" =======================
function r1() {
  const f = film('r1', 21.0); const { T, clip, tw, set, fx, slam, rise, popIn, out, shake, wipe, flash, confetti } = f;
  // A · hook (0 → "Sababi")
  const A1 = T(6) - 0.02;
  const coins = [0, 1, 2, 3, 4].map((k) => `<div class="coin" id="coin${k}" style="left:${470 + (k - 2) * 70}px;top:640px"></div>`).join('');
  clip('a', 0, A1, `
    <div class="ctr" style="top:330px"><span class="chip" id="a-chip">${ic('store', 44)} CHOYXONA EGASI</span></div>
    <div class="ctr" style="top:520px"><div class="tile r" id="a-tile">${ic('wallet', 160, 1.8)}</div></div>${coins}
    <div class="ctr" style="top:930px"><div class="big red" id="a-minus">−?</div></div>`);
  tw('#b3', { opacity: 1, duration: 0.5 }, T(3)); tw('#b3', { opacity: 0, duration: 0.3 }, A1 - 0.3);
  slam('#a-chip', 0.05); fx('pop', 0.05);
  tw('#a-tile', { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, 0.25, { scale: 0.3, rotation: -25, opacity: 0 }); fx('whoosh', 0.3, 0.7);
  shake('#a-tile', T(4), 8, 18); fx('stamp', T(4));
  [0, 1, 2, 3, 4].forEach((k) => tw(`#coin${k}`, { keyframes: [{ opacity: 1, y: -80 - k * 12, x: (k - 2) * 40, duration: 0.25, ease: 'power2.out' }, { y: 900, x: (k - 2) * 120, rotation: 200, duration: 0.8, ease: 'power2.in' }] }, T(4) + 0.05 + k * 0.07));
  fx('tick', T(4) + 0.1); fx('tick', T(4) + 0.24); fx('tick', T(4) + 0.38);
  slam('#a-minus', T(5), 2.2); fx('thud', T(5)); flash(T(5));
  // B · "Sababi uchta"
  const B1 = T(8) - 0.04;
  clip('b', A1, B1, `<div class="ctr" style="top:560px"><div class="huge ac" id="b-3">3</div><div class="h2" id="b-t" style="margin-top:10px">SABAB</div></div>`);
  wipe(A1); tw('#b-3', { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.8)' }, A1 + 0.05, { scale: 3, opacity: 0 }); fx('thud', A1 + 0.1);
  rise('#b-t', A1 + 0.2);
  // C, D, E · the three reasons
  const reasons = [
    { id: 'c', a: B1, b: T(12) - 0.04, n: 1, icon: 'receipt', chip: "QOG'OZ", hit: T(11) },
    { id: 'd', a: T(12) - 0.04, b: T(19) - 0.04, n: 2, icon: 'trash-2', chip: 'BEKOR QILISH', hit: T(18) },
    { id: 'e', a: T(19) - 0.04, b: T(27) - 0.06, n: 3, icon: 'chart-column', chip: 'FOYDA = ?', hit: T(26) },
  ];
  reasons.forEach((r) => {
    clip(r.id, r.a, r.b, `
      <div class="ctr" style="top:420px"><div class="tile r" id="${r.id}-tile"><span id="${r.id}-ico">${ic(r.icon, 150, 1.8)}</span><span class="num" id="${r.id}-n">${r.n}</span><span class="stamp" id="${r.id}-x">${ic('x', 110, 3.4)}</span></div></div>
      <div class="ctr" style="top:880px"><span class="chip red" id="${r.id}-chip">${r.chip}</span></div>`);
    tw(`#${r.id}-tile`, { x: 0, opacity: 1, rotation: 0, duration: 0.38, ease: 'power3.out' }, r.a + 0.02, { x: 700, opacity: 0, rotation: 12 }); fx('whoosh', r.a + 0.12, 0.6);
    popIn(`#${r.id}-n`, r.a + 0.18); fx('pop', r.a + 0.2);
    rise(`#${r.id}-chip`, r.a + 0.3, 60);
    set(`#${r.id}-x`, { scale: 0, opacity: 0 }, 0);
    tw(`#${r.id}-x`, { scale: 1, opacity: 1, rotation: -8, duration: 0.22, ease: 'back.out(3)' }, r.hit, { scale: 2.4, opacity: 0, rotation: -30 }); fx('stamp', r.hit);
    shake(`#${r.id}-tile`, r.hit + 0.05, 4, 12);
    out(`#${r.id}-tile`, r.b); out(`#${r.id}-chip`, r.b);
  });
  // receipt flies away when "yo'qoladi"
  tw('#c-ico', { y: -60, rotation: -40, scale: 0.6, opacity: 0.25, duration: 0.5, ease: 'power2.in' }, T(11) - 0.3);
  // question marks for reason 3
  clip('eq', T(24), T(27) - 0.06, ['?', '?', '?'].map((q, k) => `<div class="big ac" id="q${k}" style="position:absolute;left:${[170, 820, 760][k]}px;top:${[520, 420, 760][k]}px;font-size:${[170, 130, 110][k]}px">?</div>`).join(''));
  [0, 1, 2].forEach((k) => { popIn(`#q${k}`, T(24) + k * 0.16); fx('pop', T(24) + k * 0.16, 0.6); });
  // F · the answer
  const F0 = T(27) - 0.06; const G0 = T(40) - 0.05;
  const rows = [['zap', 'Buyurtma soniyada oshxonada', T(29)], ['history', 'Har bir amal tarixda', T(32)], ['trending-up', 'Foyda har kuni ko‘rinadi', T(36)]];
  clip('f', F0, G0, `
    <div class="ctr" style="top:450px"><img id="f-logo" src="assets/flowi-white.svg" style="height:150px" alt="FLOWI"></div>
    <div class="ctr" style="top:740px">${rows.map(([i, t], k) => `<div class="row" id="f-r${k}" data-layout-allow-overflow><div class="ri">${ic(i, 62)}</div><b>${t}</b><div class="ok" id="f-ok${k}">${ic('check', 52, 3.4)}</div></div>`).join('')}</div>`);
  wipe(F0); flash(F0 + 0.2); tw('.brand', { opacity: 0, duration: 0.2 }, F0);
  tw('#f-logo', { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' }, F0 + 0.12, { scale: 2.2, opacity: 0 }); fx('thud', F0 + 0.15, 0.8);
  rows.forEach(([, , t], k) => { tw(`#f-r${k}`, { x: 0, opacity: 1, duration: 0.38, ease: 'power3.out' }, t - 0.15, { x: 500, opacity: 0 }); fx('whoosh', t - 0.05, 0.4); popIn(`#f-ok${k}`, t + 0.25); fx('pop', t + 0.27); });
  out('#f-logo', G0); [0, 1, 2].forEach((k) => out(`#f-r${k}`, G0));
  // G · CTA
  clip('g', G0, f.dur, `
    <div class="ctr" style="top:480px"><div class="tile g" id="g-gift">${ic('gift', 160, 1.8)}</div></div>
    <div class="ctr" style="top:860px"><div class="big" id="g-7"><span class="ac">7 KUN</span></div><div class="big" id="g-b" style="margin-top:6px">BEPUL</div></div>
    <div class="ctr" style="top:1240px"><span class="pill" id="g-cta">${ic('link', 56, 2.6)} Havola profilda</span></div>
    <div class="ctr" style="top:1440px"><span class="chip" id="g-sub">O‘zimiz ulab beramiz</span></div>`);
  wipe(G0);
  tw('#g-gift', { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: 'back.out(2.4)' }, G0 + 0.1, { scale: 0, rotation: -30, opacity: 0 });
  slam('#g-7', T(40), 2); fx('thud', T(40), 0.8);
  slam('#g-b', T(42), 2); f.confetti(T(42));
  tw('#g-gift', { keyframes: [{ y: -40, duration: 0.18 }, { y: 0, duration: 0.3, ease: 'bounce.out' }] }, T(42));
  rise('#g-cta', T(43)); fx('pop', T(43));
  rise('#g-sub', T(44) + 0.2, 50);
  for (let k = 0; k < 3; k++) tw('#g-cta', { keyframes: [{ scale: 1.07, duration: 0.2 }, { scale: 1, duration: 0.25 }] }, T(44) + 0.6 + k * 0.6);
  f.captions(0, T(27) - 0.06, { "Flovi'da": "FLOWI'da" }, [2, 4, 6, 8, 10, 12, 15, 19, 22, 24]);
  return f;
}

// ======================= R2 — "Bir buyurtmaning yo'li" =======================
function r2() {
  const f = film('r2', 18.4); const { T, clip, tw, set, fx, slam, rise, popIn, out, wipe, flash } = f;
  const A1 = T(4) - 0.08;
  clip('a', 0, A1, `
    <div class="ctr" style="top:360px"><div class="big" id="a-1">BIR</div><div class="big ac" id="a-2" style="font-size:118px">BUYURTMANING</div><div class="big" id="a-3">YO‘LI</div></div>
    <div class="ctr" style="top:900px"><span class="chip" id="a-tk">${ic('receipt', 52)} #27 · Osh ×2 · Choy</span></div>`);
  slam('#a-1', T(0)); fx('pop', T(0));
  slam('#a-2', T(1), 1.4); fx('thud', T(1), 0.7);
  slam('#a-3', T(2)); fx('pop', T(2));
  tw('#a-tk', { y: 0, opacity: 1, rotation: -4, duration: 0.45, ease: 'back.out(2)' }, T(3), { y: 200, opacity: 0, rotation: 10 }); fx('whoosh', T(3), 0.6);
  // B · the journey: four stations on a vertical track, camera follows the ticket
  const st = [['smartphone', 'OFITSANT', T(4)], ['chef-hat', 'OSHXONA', T(8)], ['wallet', 'KASSA', T(13)], ['trending-up', 'SIZ', T(18)]];
  const B1 = T(24) - 0.06; const GAP = 470; const Y0 = 640;
  clip('b', A1, B1, `<div id="cam" style="position:absolute;inset:0">
    <div id="track" style="position:absolute;left:536px;top:${Y0 + 150}px;width:8px;height:${GAP * 3}px;border-radius:4px;background:rgba(255,255,255,.12)"></div>
    <div id="trackon" style="position:absolute;left:536px;top:${Y0 + 150}px;width:8px;height:${GAP * 3}px;border-radius:4px;background:linear-gradient(#7aa7ff,#5eead4);transform-origin:top"></div>
    ${st.map(([i, l], k) => `<div class="ctr" style="top:${Y0 + k * GAP}px"><div class="tile b" id="s${k}" style="width:250px;height:250px;border-radius:72px;opacity:.35">${ic(i, 120, 1.8)}<span class="num" style="width:96px;height:96px;font-size:52px;left:-30px;top:-30px">${k + 1}</span></div><div class="h2" id="sl${k}" data-layout-allow-overflow style="margin-top:20px;font-size:84px;opacity:0">${l}</div></div>`).join('')}
    <div id="tk" style="position:absolute;left:0;top:0;width:150px;height:110px;border-radius:28px;background:#fff;color:#0d2238;display:grid;place-items:center;box-shadow:0 20px 50px -10px rgba(0,0,0,.6);opacity:0">${ic('receipt', 62, 2.2)}</div>
  </div>`);
  wipe(A1); tw('.brand', { opacity: 0, duration: 0.2 }, A1);
  set('#s0,#s1,#s2,#s3', { scale: 0.8 }, 0); set('#trackon', { scaleY: 0 }, 0); set('#bar0,#bar1,#bar2,#bar3,#bar4', { scaleY: 0 }, 0);
  // camera: station k centred near y=700 → cam y = -(k*GAP) ; ticket sits at station's right
  st.forEach(([, , t], k) => {
    const at = t - 0.25;
    if (k > 0) {
      tw('#cam', { y: -k * GAP, duration: 0.6, ease: 'power3.inOut' }, at - 0.15);
      tw('#trackon', { scaleY: k / 3, duration: 0.6, ease: 'power3.inOut' }, at - 0.15);
      fx('whoosh', at + 0.1, 0.5);
    }
    tw('#tk', { x: 760, y: Y0 + k * GAP + 70, opacity: 1, rotation: k % 2 ? 6 : -6, duration: k ? 0.6 : 0.4, ease: 'power3.inOut' }, at - 0.15, k ? undefined : { x: 1200, y: Y0 + 70, opacity: 0, rotation: 0 });
    tw(`#s${k}`, { opacity: 1, scale: 1.06, duration: 0.3, ease: 'back.out(2.5)' }, t); fx('pop', t);
    tw(`#sl${k}`, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, t + 0.05, { opacity: 0, y: 40 });
    if (k < 3) tw(`#s${k}`, { scale: 1, opacity: 0.7, duration: 0.3 }, st[k + 1][2] - 0.4);
  });
  // kassa: ticket turns into a check; siz: a little growing chart
  set('#tk', { backgroundColor: '#ffffff' }, 0);
  tw('#tk', { backgroundColor: '#22c55e', color: '#ffffff', duration: 0.2 }, T(17)); fx('ding', T(17), 0.5);
  clip('bars', T(20), B1, `<div style="position:absolute;left:250px;top:1000px;display:flex;align-items:flex-end;gap:22px;height:200px">${[60, 95, 80, 130, 170].map((h, k) => `<div id="bar${k}" style="width:56px;height:${h}px;border-radius:14px;background:linear-gradient(#5eead4,#14b8a6);transform-origin:bottom"></div>`).join('')}</div>`, 'style="z-index:5"');
  [0, 1, 2, 3, 4].forEach((k) => { tw(`#bar${k}`, { scaleY: 1, duration: 0.35, ease: 'back.out(2)' }, T(20) + k * 0.09); fx('tick', T(20) + k * 0.09); });
  // C · "Qog'oz yo'q, adashish yo'q"
  const C1 = T(28) - 0.06;
  clip('c', B1, C1, `
    <div class="ctr" style="top:420px"><div style="display:flex;gap:60px"><div class="tile r" id="c-t1" style="width:240px;height:240px">${ic('file-text', 120, 1.8)}<span class="stamp" id="c-x1" style="width:130px;height:130px;right:-40px;bottom:-40px">${ic('x', 84, 3.4)}</span></div>
      <div class="tile r" id="c-t2" style="width:240px;height:240px">${ic('triangle-alert', 120, 1.8)}<span class="stamp" id="c-x2" style="width:130px;height:130px;right:-40px;bottom:-40px">${ic('x', 84, 3.4)}</span></div></div></div>
    <div class="ctr" style="top:800px"><div class="h2" id="c-l1">Qog‘oz yo‘q.</div><div class="h2 ac" id="c-l2" style="margin-top:14px">Adashish yo‘q.</div></div>`);
  wipe(B1);
  popIn('#c-t1', T(24) - 0.05); rise('#c-l1', T(24)); set('#c-x1', { scale: 0 }, 0);
  tw('#c-x1', { scale: 1, opacity: 1, rotation: -8, duration: 0.22, ease: 'back.out(3)' }, T(25), { scale: 2.4, opacity: 0, rotation: -30 }); fx('stamp', T(25));
  popIn('#c-t2', T(26) - 0.05); rise('#c-l2', T(26)); set('#c-x2', { scale: 0 }, 0);
  tw('#c-x2', { scale: 1, opacity: 1, rotation: -8, duration: 0.22, ease: 'back.out(3)' }, T(27), { scale: 2.4, opacity: 0, rotation: -30 }); fx('stamp', T(27));
  // D · logo + CTA
  clip('d', C1, f.dur, `
    <div class="ctr" style="top:500px"><img id="d-logo" src="assets/flowi-white.svg" style="height:150px" alt="FLOWI"></div>
    <div class="ctr" style="top:780px"><div class="big" id="d-7"><span class="ac">7 KUN</span> BEPUL</div></div>
    <div class="ctr" style="top:1020px"><span class="chip" id="d-sub">${ic('hand', 46)} O‘zimiz ulab beramiz</span></div>
    <div class="ctr" style="top:1220px"><span class="pill" id="d-cta">${ic('link', 56, 2.6)} flowi.uz</span></div>
    <div class="ctr" style="top:1410px"><span style="font-size:44px;font-weight:700;opacity:.8" id="d-hint">Havola profilda ↑</span></div>`);
  wipe(C1); flash(C1 + 0.2); tw('.brand', { opacity: 0, duration: 0.2 }, C1);
  tw('#d-logo', { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' }, T(28) - 0.05, { scale: 2.2, opacity: 0 }); fx('thud', T(28), 0.8);
  slam('#d-7', T(29), 1.8); f.confetti(T(31));
  rise('#d-sub', T(32)); fx('pop', T(32));
  rise('#d-cta', T(34) + 0.2); fx('pop', T(34) + 0.2);
  rise('#d-hint', T(34) + 0.5, 40);
  for (let k = 0; k < 2; k++) tw('#d-cta', { keyframes: [{ scale: 1.07, duration: 0.2 }, { scale: 1, duration: 0.25 }] }, T(34) + 0.9 + k * 0.6);
  f.captions(T(4) - 0.05, T(24) - 0.06, {}, [4, 6, 8, 11, 13, 16, 18, 20, 23]);
  return f;
}

for (const f of [r1(), r2()]) {
  fs.mkdirSync(`${PRJ}/../reels-src`, { recursive: true });
  fs.writeFileSync(`${PRJ}/../reels-src/${f.name}.html`, page(f, `FLOWI ${f.name}`));
  fs.writeFileSync(`${PRJ}/assets/${f.name}.cues.json`, JSON.stringify({ duration: f.dur, sfx: f.sfx.sort((a, b) => a.t - b.t) }, null, 1));
  console.log(f.name, f.dur + 's', f.sfx.length, 'sfx');
}
