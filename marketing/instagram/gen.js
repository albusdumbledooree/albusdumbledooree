// FLOWI Instagram: posts 1080x1350, stories/highlights 1080x1920 — graphics only (no screens of the program).
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const ROOT = '/home/user/albusdumbledooree'; const OUT = __dirname;
const ICONS = new Function(fs.readFileSync(`${ROOT}/public/js/icons.js`, 'utf8').replace(/^'use strict';/, '') + '; return ICONS;')();
ICONS.bike = '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';
ICONS.coffee = '<path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2"/>';
ICONS.instagram = '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>';
const ic = (n, s = 48, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const LOGO_W = 'data:image/png;base64,' + fs.readFileSync(`${ROOT}/public/brand/flowi-white.png`).toString('base64');
const LOGO_N = 'data:image/png;base64,' + fs.readFileSync(`${ROOT}/public/brand/flowi-navy.png`).toString('base64');

const CSS = `
*{box-sizing:border-box;margin:0;padding:0} body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.s{position:relative;overflow:hidden;color:#fff;display:flex;flex-direction:column;
  background:radial-gradient(900px 700px at 85% 0%,rgba(33,86,232,.55),transparent 60%),radial-gradient(700px 600px at 0% 100%,rgba(20,184,166,.28),transparent 60%),linear-gradient(160deg,#0d2238,#071726 60%)}
.s.light{color:#0f172a;background:radial-gradient(800px 600px at 100% 0%,rgba(33,86,232,.12),transparent 60%),#f4f6f9}
.post{width:1080px;height:1350px;padding:88px 88px 72px} .tall{width:1080px;height:1920px;padding:150px 96px 170px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:auto}
.top img{height:46px} .top span{font-size:28px;font-weight:600;opacity:.75}
.eb{display:inline-flex;align-items:center;gap:12px;padding:12px 26px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);font-size:28px;font-weight:700;letter-spacing:.02em;margin-bottom:34px}
.light .eb{background:#e8eefd;border-color:#d4defb;color:#2156e8}
h1{font-size:96px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
h1.m{font-size:80px} h1.xl{font-size:118px}
.ac{background:linear-gradient(90deg,#6c9bff,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.light .ac{background:linear-gradient(90deg,#2156e8,#0d9488);-webkit-background-clip:text;background-clip:text}
.sub{font-size:38px;line-height:1.35;opacity:.82;margin-top:30px;font-weight:500}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:40px;font-size:28px;font-weight:600;opacity:.85}
.dots{display:flex;gap:12px}.dots i{width:14px;height:14px;border-radius:50%;background:currentColor;opacity:.3}.dots i.on{opacity:1;width:44px;border-radius:8px}
.swipe{display:flex;align-items:center;gap:10px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);border-radius:36px;padding:34px 38px}
.light .card{background:#fff;border-color:#e3e6ec;box-shadow:0 20px 40px -24px rgba(15,23,42,.25)}
.ib{width:104px;height:104px;border-radius:30px;display:grid;place-items:center;flex:none;background:linear-gradient(140deg,#2b63f0,#1a46c4);color:#fff;box-shadow:0 18px 40px -14px rgba(33,86,232,.8)}
.ib.teal{background:linear-gradient(140deg,#14b8a6,#0f766e);box-shadow:0 18px 40px -14px rgba(20,184,166,.7)}
.ib.red{background:linear-gradient(140deg,#f87171,#dc2626);box-shadow:0 18px 40px -14px rgba(220,38,38,.6)}
.ib.amber{background:linear-gradient(140deg,#fbbf24,#d97706)}
.row{display:flex;gap:30px;align-items:center}
.list{display:flex;flex-direction:column;gap:24px;margin-top:56px}
.list .card{display:flex;gap:30px;align-items:center}
.list b{display:block;font-size:40px;font-weight:800;letter-spacing:-.01em} .list small{display:block;font-size:30px;opacity:.75;margin-top:6px;line-height:1.3}
.big{font-size:260px;font-weight:900;line-height:.9;letter-spacing:-.06em}
.pill{display:inline-flex;align-items:center;gap:14px;padding:22px 38px;border-radius:999px;background:#2156e8;color:#fff;font-size:38px;font-weight:800;box-shadow:0 24px 50px -18px rgba(33,86,232,.9)}
.pill.w{background:#fff;color:#071726}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:50px}
.cmp .card{padding:34px 32px} .cmp h3{font-size:38px;font-weight:800;margin-bottom:22px;display:flex;align-items:center;gap:14px}
.cmp li{list-style:none;font-size:31px;line-height:1.3;padding:14px 0;border-top:1px solid rgba(15,23,42,.08);display:flex;gap:14px;font-weight:500}
.cmp li:first-child{border-top:0}
.bad h3{color:#dc2626}.good h3{color:#2156e8}.good{border:2px solid #2156e8!important}
.num{width:84px;height:84px;border-radius:26px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:44px;font-weight:900;flex:none}
.hero-ic{position:absolute;right:-60px;top:280px;opacity:.07}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:56px}
.grid2 .card{display:flex;flex-direction:column;gap:22px;padding:36px}
.grid2 b{font-size:38px;font-weight:800}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:40px}.chips span{padding:14px 24px;border-radius:999px;border:1px solid rgba(255,255,255,.22);font-size:28px;font-weight:600}
.stack3{position:relative;height:420px;margin-top:60px}
.tall h1.xl{font-size:150px}.tall h1.m{font-size:112px}.tall .sub{font-size:50px}.tall .list{gap:30px}.tall .list b{font-size:52px}.tall .list small{font-size:38px}
.tall .ib{width:132px;height:132px;border-radius:38px}.tall .ib svg{width:64px;height:64px}.tall .card{padding:46px 50px}.tall .big{font-size:440px}.tall .eb{font-size:36px;padding:16px 32px}
.tall .foot{font-size:36px}.tall .pill{font-size:48px;padding:30px 52px}.tall .num{width:100px;height:100px;font-size:52px}.tall .top img{height:60px}.tall .top span{font-size:36px}
.post .sub{font-size:40px}.post .chips span{font-size:30px}
.p5 h1.m{font-size:72px}.p5 .list{margin-top:40px;gap:18px}.p5 .list .card{padding:28px 34px}.p5 .sub{font-size:34px;margin-top:20px}
`;
const top = (light) => `<div class="top"><img src="${light ? LOGO_N : LOGO_W}"><span>flowi.uz</span></div>`;
const foot = (i, n, light) => `<div class="foot"><div class="dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>${i < n - 1 ? `<div class="swipe">Suring ${ic('arrow-right', 30, 2.5)}</div>` : `<div>7 kun bepul</div>`}</div>`;
const page = (cls, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s ${cls}">${body}</div></body></html>`;

const P = []; // [file, html]
// ---- Carousel 1: FLOWI nima? ----
const C1 = 5;
P.push(['p1-1', page('post', `${top()}<div><span class="eb">${ic('sparkles', 30)} Choyxona · Restoran · Fast food</span>
  <h1 class="xl">Buyurtmadan<br>foydagacha —<br><span class="ac">bitta dasturda</span></h1>
  <p class="sub">Qog'oz, daftar va "kim nima yozdi?" degan savollarsiz ishlang.</p></div>${foot(0, C1)}`)]);
const steps = [['smartphone', 'Ofitsant — telefondan', "Buyurtma bir zumda oshxonaga ketadi. Qog'oz yo'q, adashish yo'q.", ['Har bir stol rangda', 'Taom tayyor — xabar keladi']],
  ['chef-hat', 'Oshxona darhol ko\'radi', 'Buyurtma ekranga va printerga o\'zi tushadi. Har bo\'lim — o\'z printeriga.', ['Tayyorlanish vaqti', 'Stop-list']],
  ['wallet', 'Kassa — bir bosishda', 'Naqd, karta yoki aralash. Xizmat haqi va qaytim o\'zi hisoblanadi.', ['Logotipli chek', 'Kassa smenasi']],
  ['trending-up', 'Siz — foydani ko\'rasiz', "Savdo, xarajat va sof foyda — telefoningizda, istalgan joydan.", ['Har kuni hisobot', 'Telegramga xabar']]];
steps.forEach(([icn, t, d, chips], k) => P.push([`p1-${k + 2}`, page('post', `${top()}<div><div class="row" style="margin-bottom:46px"><div class="num">${k + 1}</div><div class="ib">${ic(icn, 56)}</div></div>
  <h1 class="m">${t}</h1><p class="sub">${d}</p><div class="chips">${chips.map((c) => `<span>✓ ${c}</span>`).join('')}</div></div>
  <div class="hero-ic">${ic(icn, 620, 1.2)}</div>${foot(k + 1, C1)}`)]));
P[P.length - 1][1] = page('post', `${top()}<div><div class="row" style="margin-bottom:46px"><div class="num">4</div><div class="ib teal">${ic('trending-up', 56)}</div></div>
  <h1 class="m">Siz — <span class="ac">foydani</span> ko'rasiz</h1><p class="sub">Savdo, xarajat va sof foyda — telefoningizda, istalgan joydan.</p>
  <div style="margin-top:56px"><span class="pill">${ic('gift', 40)} 7 kun bepul sinab ko'ring</span></div><p class="sub" style="font-size:32px">Ulab beramiz, menyuni kiritishga yordam beramiz.</p></div>
  <div class="hero-ic">${ic('trending-up', 620, 1.2)}</div>${foot(4, C1)}`);

// ---- Post 2: Qog'oz vs FLOWI (light) ----
P.push(['p2', page('post light', `${top(true)}<div><span class="eb">Tanish holatmi?</span><h1 class="m">Daftar yoki <span class="ac">FLOWI</span>?</h1>
  <div class="cmp"><div class="card bad"><h3>${ic('x', 40, 3)} Daftarda</h3><ul>
    <li>Taom unutiladi</li><li>Hisobda adashish</li><li>Kassada kamomad</li><li>Foyda — noma'lum</li><li>Kim nima qilgani bilinmaydi</li></ul></div>
  <div class="card good"><h3>${ic('check', 40, 3)} FLOWI'da</h3><ul>
    <li>Buyurtma soniyada oshxonada</li><li>Chek o'zi hisoblanadi</li><li>Bekor qilish — faqat ruxsat bilan</li><li>Sof foyda har kuni</li><li>Har bir amal tarixda</li></ul></div></div></div>
  <div class="foot" style="opacity:1;color:#2156e8"><b>7 kun bepul · flowi.uz</b><span style="color:#5b6474">Havola — profilda</span></div>`)]);

// ---- Carousel 3: Dostavka ----
const C3 = 3;
P.push(['p3-1', page('post', `${top()}<div><span class="eb" style="background:#16a34a;border-color:#16a34a">YANGI</span>
  <h1 class="xl"><span class="ac">Dostavka</span><br>endi alohida</h1><p class="sub">Yetkazib berish hisob-kitobi "olib ketish" bilan aralashmaydi.</p></div>
  <div class="hero-ic" style="top:420px">${ic('bike', 680, 1.2)}</div>${foot(0, C3)}`)]);
P.push(['p3-2', page('post', `${top()}<div><h1 class="m">Dostavchik — <span class="ac">o'z telefonida</span></h1>
  <div class="list">${[['bike', 'Chek dostavchikda', 'Buyurtmani o\'zi ochadi, oshxonaga o\'zi yuboradi'], ['map-pin', 'Telefon va manzil', 'Mijoz ma\'lumoti chekda saqlanadi'], ['receipt', 'Yetkazib berish haqi', 'Har bir chekka o\'zi qo\'shiladi'], ['users', 'Kassir tanlaydi', 'Qaysi dostavchik olib borishini']].map(([a, b, c]) => `<div class="card"><div class="ib">${ic(a, 50)}</div><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div></div>${foot(1, C3)}`)]);
P.push(['p3-3', page('post', `${top()}<div><h1 class="m">Hisobotda — <span class="ac">alohida</span></h1><p class="sub">Zal, olib ketish va dostavka — har biri o'z raqami bilan.</p>
  <div class="list">${[['house', 'Zal', '68%'], ['shopping-bag', 'Olib ketish', '14%'], ['bike', 'Dostavka', '18%']].map(([a, b, c], k) => `<div class="card" style="gap:26px"><div class="ib ${k === 2 ? 'teal' : ''}">${ic(a, 46)}</div><div style="flex:1"><b>${b}</b><div style="height:18px;border-radius:9px;background:rgba(255,255,255,.12);margin-top:14px"><div style="height:100%;width:${c};border-radius:9px;background:linear-gradient(90deg,#6c9bff,#5eead4)"></div></div></div></div>`).join('')}</div>
  <p class="sub" style="font-size:26px;opacity:.55">Raqamlar — namuna</p></div>${foot(2, C3)}`)]);

// ---- Post 4: Kassada kamomad ----
P.push(['p4', page('post', `${top()}<div><div class="ib red" style="margin-bottom:44px">${ic('triangle-alert', 56)}</div>
  <h1 class="m">Kechqurun kassada<br><span class="ac">kamomad</span> chiqadimi?</h1>
  <div class="list">${[['ban', 'Bekor qilish — faqat ruxsat bilan', 'Taomni o\'chirish uchun kod yoki boshliq kerak'], ['history', 'Har bir amal tarixda', 'Kim, qachon, nimani o\'zgartirgani ko\'rinadi'], ['bell', 'Shubhali holatlar', 'Chek chiqqandan keyin o\'chirilgan taomlar ro\'yxati']].map(([a, b, c]) => `<div class="card"><div class="ib">${ic(a, 50)}</div><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div></div>
  <div class="foot"><b>7 kun bepul · flowi.uz</b><span>Havola — profilda</span></div>`)]);

// ---- Post 5: ma'lumot o'chmaydi (light) ----
P.push(['p5', page('post light p5', `${top(true)}<div><div class="ib teal" style="margin-bottom:44px">${ic('shield-check', 56)}</div>
  <h1 class="m">Ma'lumotlaringiz<br><span class="ac">hech qachon</span> yo'qolmaydi</h1><p class="sub">Uch qavat himoya — kompyuter buzilsa ham, internet uzilsa ham.</p>
  <div class="list">${[['database', 'Serverda har kuni zaxira', 'Avtomatik, siz hech narsa qilmaysiz'], ['folder-open', 'Kompyuteringizda nusxa', 'Har 3 soatda "FLOWI zaxira" papkasiga'], ['send', 'Telegramda nusxa', 'Har kecha — alohida xavfsiz joyda']].map(([a, b, c]) => `<div class="card"><div class="ib">${ic(a, 50)}</div><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div></div>
  <div class="foot" style="opacity:1;color:#2156e8"><b>7 kun bepul · flowi.uz</b><span style="color:#5b6474">Havola — profilda</span></div>`)]);

// ---- Carousel 6: Kimlar uchun ----
const C6 = 2;
P.push(['p6-1', page('post', `${top()}<div><span class="eb">${ic('store', 30)} Kimlar uchun?</span><h1 class="xl">Sizning<br>biznesingiz<br><span class="ac">uchun</span></h1>
  <p class="sub">Har bir turga o'z ekranlari va hisobotlari.</p></div>${foot(0, C6)}`)]);
P.push(['p6-2', page('post', `${top()}<div><div class="grid2">${[['coffee', 'Choyxona', 'Xonalar, supa, banket'], ['utensils', 'Restoran / kafe', 'Stollar, oshxona, bar'], ['sandwich', 'Fast food', 'Tez buyurtma, dostavka'], ['shopping-cart', 'Do\'kon', 'Shtrix-kod, ombor, nasiya'], ['shirt', 'Kiyim do\'koni', 'O\'lcham, rang, qoldiq'], ['door-open', 'Eshik do\'koni', 'O\'lchov, o\'rnatish, ustalar']].map(([a, b, c], k) => `<div class="card"><div class="ib ${k % 3 === 1 ? 'teal' : ''}" style="width:88px;height:88px;border-radius:26px">${ic(a, 44)}</div><div><b>${b}</b><div style="font-size:28px;opacity:.72;margin-top:8px">${c}</div></div></div>`).join('')}</div>
  <div style="margin-top:44px"><span class="pill">${ic('gift', 40)} 7 kun bepul</span></div></div>${foot(1, C6)}`)]);

// ---- Stories 1080x1920 ----
P.push(['s1', page('tall', `${top()}<div><span class="eb">${ic('gift', 32)} Sinov</span><div class="big"><span class="ac">7</span></div><h1 class="xl" style="margin-top:10px">kun bepul</h1>
  <p class="sub">Choyxona, restoran yoki do'koningizni FLOWI'ga ulab beramiz. Yoqmasa — hech narsa to'lamaysiz.</p>
  <div style="margin-top:70px"><span class="pill w">${ic('link', 40)} Havola — profilda</span></div></div><div class="foot"><span>flowi.uz</span><span>@flowi.uz</span></div>`)]);
P.push(['s2', page('tall', `${top()}<div><span class="eb" style="background:#16a34a;border-color:#16a34a">YANGI</span><h1 class="xl"><span class="ac">Dostavka</span></h1>
  <div class="list" style="margin-top:70px">${[['bike', 'Dostavchik — o\'z telefonida'], ['map-pin', 'Mijoz telefoni va manzili'], ['chart-column', 'Hisobot alohida']].map(([a, b]) => `<div class="card"><div class="ib">${ic(a, 50)}</div><div><b>${b}</b></div></div>`).join('')}</div></div>
  <div class="hero-ic" style="top:1100px;right:-120px">${ic('bike', 760, 1.2)}</div><div class="foot"><span>7 kun bepul</span><span>flowi.uz</span></div>`)]);
P.push(['s3', page('tall', `${top()}<div><h1 class="m">Bir buyurtmaning yo'li — <span class="ac">4 qadam</span></h1>
  <div class="list" style="margin-top:70px">${[['smartphone', 'Ofitsant', 'telefondan yuboradi'], ['chef-hat', 'Oshxona', 'darhol ko\'radi'], ['wallet', 'Kassa', 'bir bosishda yopadi'], ['trending-up', 'Siz', 'foydani ko\'rasiz']].map(([a, b, c], k) => `<div class="card"><div class="num">${k + 1}</div><div class="ib">${ic(a, 50)}</div><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div></div>
  <div class="foot"><span>7 kun bepul</span><span>flowi.uz</span></div>`)]);
P.push(['s4', page('tall', `${top()}<div><div class="ib" style="width:150px;height:150px;border-radius:44px;margin-bottom:60px">${ic('message-circle', 80)}</div>
  <h1 class="xl">Savolingiz <span class="ac">bormi?</span></h1><p class="sub">Narx, ulash, printer — hammasiga javob beramiz.</p>
  <div class="list" style="margin-top:70px"><div class="card"><div class="ib">${ic('send', 50)}</div><div><b>@Flowisupport_bot</b><small>Telegram — tez javob</small></div></div>
  <div class="card"><div class="ib teal">${ic('instagram', 50)}</div><div><b>Direct</b><small>Shu yerga yozing</small></div></div></div></div><div class="foot"><span>flowi.uz</span><span>7 kun bepul</span></div>`)]);

// ---- Highlight covers (1080x1920; Instagram shows the middle circle) ----
const HL = [['h-narxlar', 'wallet'], ['h-qanday', 'sparkles'], ['h-imkoniyat', 'layout-grid'], ['h-savollar', 'circle-help'], ['h-boglanish', 'send'], ['h-yangi', 'bike']];
for (const [f, icn] of HL) P.push([f, `<!doctype html><html><head><style>${CSS} .hl{width:1080px;height:1920px;display:grid;place-items:center;background:linear-gradient(160deg,#2b63f0,#0d2238 70%)} .hl div{width:560px;height:560px;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.08);border:6px solid rgba(255,255,255,.25)}</style></head><body><div class="hl"><div>${ic(icn, 300, 1.6)}</div></div></body></html>`]);

(async () => {
  
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [f, html] of P) {
    const tall = /^s|^h-/.test(f);
    await p.setViewportSize({ width: 1080, height: tall ? 1920 : 1350 });
    await p.setContent(html); await p.waitForTimeout(150);
    const ovf = await p.evaluate(() => { const s = document.querySelector('.s,.hl'); return s.scrollHeight - s.clientHeight; });
    if (ovf > 0) console.log('OVERFLOW', f, ovf);
    await p.screenshot({ path: `${OUT}/${f}.jpg`, type: 'jpeg', quality: 92 });
  }
  await b.close(); console.log(fs.readdirSync(OUT).join(' '));
})();
