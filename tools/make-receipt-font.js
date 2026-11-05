'use strict';
/*
 * Makes server/receipt-font.js: DejaVu Sans Mono Bold drawn once into black-and-white dots, in the sizes the guest's
 * bill uses on a thermal printer (server/raster.js draws the bill from these, so the server needs no font library).
 * Run again only to add letters or sizes:  node tools/make-receipt-font.js   (needs Playwright with Chromium)
 * The font: public/fonts/DejaVuSansMono-Bold.ttf, licence public/fonts/LICENSE-DejaVu.txt.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const ROOT = path.join(__dirname, '..');
const SIZES = [24, 30, 34, 40, 46]; // text, the footer and "per person", the business's name, JAMI, the kitchen's place
const CHARS = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  ...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяЎўҚқҒғҲҳ',
  ...'ʻʼ‘’“”«»—–·×№−…',
].join('');

(async () => {
  const ttf = fs.readFileSync(path.join(ROOT, 'public/fonts/DejaVuSansMono-Bold.ttf')).toString('base64');
  const b = await chromium.launch();
  const p = await b.newPage();
  const out = await p.evaluate(async ({ ttf, SIZES, CHARS }) => {
    const face = new FontFace('RF', `url(data:font/ttf;base64,${ttf})`);
    document.fonts.add(await face.load());
    const res = {};
    for (const size of SIZES) {
      const c = document.createElement('canvas');
      const x = c.getContext('2d');
      x.font = `bold ${size}px RF`;
      const w = Math.round(x.measureText('M').width);
      const h = Math.round(size * 1.2);
      const base = Math.round(size * 0.93);
      c.width = w; c.height = h;
      const glyphs = {};
      for (const ch of CHARS) {
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#000'; x.font = `bold ${size}px RF`; x.textBaseline = 'alphabetic';
        x.fillText(ch, 0, base);
        const px = x.getImageData(0, 0, w, h).data;
        const rowBytes = Math.ceil(w / 8);
        const bytes = new Uint8Array(rowBytes * h);
        let any = false;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          if (px[(yy * w + xx) * 4] < 128) { bytes[yy * rowBytes + (xx >> 3)] |= 0x80 >> (xx & 7); any = true; }
        }
        if (any || ch === ' ') glyphs[ch] = btoa(String.fromCharCode(...bytes));
      }
      res[size] = { w, h, base, glyphs };
    }
    return res;
  }, { ttf, SIZES, CHARS });
  await b.close();
  const body = `'use strict';
/* DejaVu Sans Mono Bold as black-and-white dots (made by tools/make-receipt-font.js; licence: public/fonts/LICENSE-DejaVu.txt).
   sizes[px] = { w, h, base, glyphs: { char: base64 of the rows, (w + 7) >> 3 bytes each, top to bottom } } */
module.exports = ${JSON.stringify({ sizes: out })};
`;
  fs.writeFileSync(path.join(ROOT, 'server/receipt-font.js'), body);
  console.log('server/receipt-font.js', Math.round(body.length / 1024), 'KB;', SIZES.map((s) => `${s}px: ${out[s].w}x${out[s].h}, ${Object.keys(out[s].glyphs).length} glyphs`).join('; '));
})();
