const fs = require('node:fs'); const { execSync } = require('node:child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = '/home/user/albusdumbledooree'; const OUT = __dirname;
const ICONS = new Function(fs.readFileSync(`${ROOT}/public/js/icons.js`, 'utf8').replace(/^'use strict';/, '') + '; return ICONS;')();
ICONS.bike = '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';
const ic = (n, s = 48, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const LOGO = 'data:image/png;base64,' + fs.readFileSync(`${ROOT}/public/brand/flowi-white.png`).toString('base64');
const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{width:1080px;height:1920px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
#bg{position:absolute;inset:-200px;background:radial-gradient(900px 800px at 80% 10%,rgba(33,86,232,.6),transparent 60%),radial-gradient(800px 700px at 10% 90%,rgba(20,184,166,.32),transparent 60%),linear-gradient(160deg,#0d2238,#071726 60%)}
.sc{position:absolute;inset:0;padding:0 96px;display:flex;flex-direction:column;justify-content:center;opacity:0}
h1{font-size:132px;line-height:1.02;font-weight:800;letter-spacing:-.035em}h2{font-size:104px;line-height:1.04;font-weight:800;letter-spacing:-.03em}
.ac{background:linear-gradient(90deg,#6c9bff,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:54px;opacity:.82;margin-top:34px;line-height:1.3;font-weight:500}
.ib{width:220px;height:220px;border-radius:64px;display:grid;place-items:center;margin-bottom:64px;background:linear-gradient(140deg,#f87171,#dc2626);box-shadow:0 30px 70px -20px rgba(220,38,38,.7)}
.ib.b{background:linear-gradient(140deg,#2b63f0,#1a46c4);box-shadow:0 30px 70px -20px rgba(33,86,232,.8)}
.x{position:absolute;right:-30px;top:-30px;width:90px;height:90px;border-radius:50%;background:#fff;color:#dc2626;display:grid;place-items:center}
.pill{display:inline-flex;align-items:center;gap:18px;padding:34px 56px;border-radius:999px;background:#2156e8;font-size:56px;font-weight:800;box-shadow:0 30px 60px -18px rgba(33,86,232,.9);margin-top:70px;align-self:flex-start}
.logo{height:110px;align-self:flex-start;margin-bottom:60px}
.top{position:absolute;top:120px;left:96px;right:96px;display:flex;justify-content:space-between;align-items:center;font-size:36px;font-weight:600;opacity:.8}.top img{height:56px}
.step{display:flex;align-items:center;gap:40px;padding:40px 48px;border-radius:44px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);margin-top:30px;opacity:0}
.step .n{width:110px;height:110px;border-radius:32px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:56px;font-weight:900;flex:none}
.step .i{width:130px;height:130px;border-radius:38px;display:grid;place-items:center;background:linear-gradient(140deg,#2b63f0,#1a46c4);flex:none}
.step b{font-size:60px;font-weight:800;display:block}.step small{font-size:40px;opacity:.75}`;
const top = `<div class="top"><img src="${LOGO}"><span>flowi.uz</span></div>`;

const REELS = {
  'r1-muammolar': { dur: 16000, html: `${top}
    <div class="sc" data-t="0,3200"><h1>Choyxona<br>egasi,</h1><h1 class="ac" style="margin-top:20px">tanish<br>holatmi?</h1></div>
    <div class="sc" data-t="3200,6200"><div class="ib" style="position:relative">${ic('utensils', 110)}<span class="x">${ic('x', 60, 3)}</span></div><h2>Taom<br>unutildi</h2><p class="sub">Qog'ozdagi buyurtma yo'qoldi, mehmon kutib qoldi.</p></div>
    <div class="sc" data-t="6200,9200"><div class="ib" style="position:relative">${ic('wallet', 110)}<span class="x">${ic('x', 60, 3)}</span></div><h2>Kassada<br>kamomad</h2><p class="sub">Pul qayerga ketgani noma'lum.</p></div>
    <div class="sc" data-t="9200,12200"><div class="ib" style="position:relative">${ic('trending-down', 110)}<span class="x">${ic('x', 60, 3)}</span></div><h2>Oy oxiri:<br>foyda qancha?</h2><p class="sub">Hech kim aniq bilmaydi.</p></div>
    <div class="sc" data-t="12200,16000,1"><h2>FLOWI<br>hammasini<br><span class="ac">bitta dasturda</span><br>hal qiladi</h2>
      <p class="sub">Buyurtma · oshxona · kassa · foyda</p><span class="pill">${ic('gift', 56)} 7 kun bepul</span></div>` },
  'r2-yol': { dur: 15000, html: `${top}
    <div class="sc" data-t="0,2600"><h1>Bir buyurtmaning<br><span class="ac">yo'li</span></h1><p class="sub">15 soniyada 👇</p></div>
    <div class="sc" data-t="2600,12000" style="justify-content:center"><h2 style="font-size:84px;margin-bottom:20px">4 qadam:</h2>
      ${[['smartphone', 'Ofitsant', 'telefondan yuboradi'], ['chef-hat', 'Oshxona', 'darhol ko\'radi'], ['wallet', 'Kassa', 'bir bosishda yopadi'], ['trending-up', 'Siz', 'foydani ko\'rasiz']].map(([a, b, c], k) =>
        `<div class="step" data-s="${2900 + k * 2100}"><div class="n">${k + 1}</div><div class="i">${ic(a, 66)}</div><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div>
    <div class="sc" data-t="12000,15000,1"><h2>Qog'oz yo'q.<br><span class="ac">Adashish yo'q.</span></h2><span class="pill">${ic('gift', 56)} 7 kun bepul · flowi.uz</span></div>` },
};

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [name, r] of Object.entries(REELS)) {
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="bg"></div>${r.html}</body></html>`);
    await p.evaluate((dur) => {
      const D = dur;
      document.getElementById('bg').animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(-80px,60px) scale(1.08)' }], { duration: D, fill: 'both' });
      for (const el of document.querySelectorAll('.sc')) {
        const [a, z, last] = el.dataset.t.split(',').map(Number);
        const k = [{ opacity: 0, transform: 'translateY(80px)', offset: 0 }, { opacity: 0, transform: 'translateY(80px)', offset: a / D },
          { opacity: 1, transform: 'translateY(0)', offset: Math.min(1, (a + 450) / D) }];
        if (!last) k.push({ opacity: 1, transform: 'translateY(0)', offset: (z - 350) / D }, { opacity: 0, transform: 'translateY(-60px)', offset: z / D });
        k.push({ opacity: last ? 1 : 0, transform: last ? 'translateY(0)' : 'translateY(-60px)', offset: 1 });
        el.animate(k, { duration: D, fill: 'both' });
      }
      for (const el of document.querySelectorAll('.step')) {
        const s = Number(el.dataset.s);
        el.animate([{ opacity: 0, transform: 'translateX(120px)', offset: 0 }, { opacity: 0, transform: 'translateX(120px)', offset: s / D }, { opacity: 1, transform: 'translateX(0)', offset: (s + 400) / D }, { opacity: 1, transform: 'translateX(0)', offset: 1 }], { duration: D, fill: 'both' });
      }
      document.getAnimations().forEach((x) => x.pause());
    }, r.dur);
    const dir = `/tmp/flowi-work/ig/frames-${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    const FPS = 30; const N = Math.round(r.dur / 1000 * FPS);
    for (let f = 0; f < N; f++) {
      await p.evaluate((t) => document.getAnimations().forEach((x) => { x.currentTime = t; }), f * 1000 / FPS);
      await p.screenshot({ path: `${dir}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 });
    }
    execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}/f%04d.jpg -f lavfi -i anullsrc=r=44100:cl=stereo -shortest -c:v libx264 -pix_fmt yuv420p -crf 19 -preset medium -c:a aac -b:a 64k -movflags +faststart ${OUT}/${name}.mp4`);
    execSync(`ffmpeg -y -loglevel error -ss ${(r.dur / 1000) - 1} -i ${OUT}/${name}.mp4 -frames:v 1 ${OUT}/${name}-cover.jpg`);
    console.log(name, N, 'frames', Math.round(fs.statSync(`${OUT}/${name}.mp4`).size / 1024), 'KB');
  }
  await b.close();
})();
