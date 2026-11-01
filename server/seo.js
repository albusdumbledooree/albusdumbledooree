'use strict';
/*
 * The front page for search engines (Google, Yandex).
 * - "/" is Uzbek, "/ru" is Russian: both are full pages from the server (the Russian texts are put in on the server,
 *   so a search robot reads them without running any script), linked to each other with hreflang.
 * - canonical address, Open Graph, structured data (the program with its prices, the questions and answers),
 *   the verification codes the owner pastes from Google Search Console and Yandex Webmaster.
 * - sitemap.xml and robots.txt name the site's own address (taken from the request).
 * The secret platform address is never named here.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LANGS = ['uz', 'ru'];
const HEAD = {
  uz: {
    title: "FLOWI — choyxona, restoran va do'kon uchun boshqaruv tizimi",
    description: "FLOWI: choyxona, restoran, fast food, do'kon va eshik do'konlari uchun dastur. Buyurtma, QR-menyu, oshxona, kassa, ombor, qarz daftari, sof foyda va kunlik eslatmalar — bitta dasturda. 14 kun bepul.",
    og: "Buyurtma, oshxona, kassa, hisobot va ish haqi — bitta dasturda. 14 kun bepul sinab ko'ring.",
    locale: 'uz_UZ', currency: "so'm / oy",
  },
  ru: {
    title: 'FLOWI — программа для чайханы, ресторана и магазина',
    description: 'FLOWI: программа учёта для чайханы, ресторана, фастфуда, магазина и магазина дверей. Заказы, QR-меню, кухня, касса, склад, долги, чистая прибыль и ежедневные напоминания — в одной программе. 14 дней бесплатно.',
    og: 'Заказы, кухня, касса, отчёты и зарплата — в одной программе. 14 дней бесплатно.',
    locale: 'ru_RU', currency: 'сум / мес',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// The object literal that starts at `start` (a "{"), read up to its closing brace, skipping strings.
function objectAt(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('landing: object not closed');
}

function createSeo({ publicDir, publicInfo, verify }) {
  const file = path.join(publicDir, 'landing.html');
  let cache = null;

  // The page and its Russian texts (the same dictionary the page's own script uses), re-read when the file changes.
  function source() {
    const st = fs.statSync(file);
    if (cache && cache.mtime === st.mtimeMs) return cache;
    const html = fs.readFileSync(file, 'utf8');
    const at = html.indexOf('var RU = {');
    const ru = at < 0 ? {} : vm.runInNewContext(`(${objectAt(html, at + 'var RU = '.length)})`, {}, { timeout: 200 });
    const uz = {};
    for (const m of html.matchAll(/<(\w+)([^>]*?)\sdata-t="([\w-]+)"([^>]*)>([\s\S]*?)<\/\1>/g)) uz[m[3]] = m[5];
    cache = { mtime: st.mtimeMs, html, ru, uz };
    return cache;
  }

  // The text of every data-t element in the chosen language (only elements whose text is a plain run without the same tag inside).
  function translate(html, dict) {
    return html.replace(/<(\w+)([^>]*?\sdata-t="([\w-]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, key, inner) => {
      const v = dict[key];
      if (typeof v !== 'string' || new RegExp(`<${tag}[\\s>]`).test(inner)) return all;
      return `<${tag}${attrs}>${v}</${tag}>`;
    });
  }

  function plansHtml(lang) {
    const info = publicInfo();
    return info.plans.map((p) => `<div class="plan"><h3>${esc(p.name)}</h3><div class="price">${String(p.price).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} <small>${HEAD[lang].currency}</small></div></div>`).join('');
  }

  function structured(lang, origin, src, dict) {
    const info = publicInfo();
    const h = HEAD[lang];
    const url = lang === 'uz' ? `${origin}/` : `${origin}/ru`;
    const faq = [];
    for (let i = 1; i <= 20; i++) {
      const q = dict[`q${i}`] ?? src.uz[`q${i}`];
      const a = dict[`a${i}`] ?? src.uz[`a${i}`];
      if (q && a) faq.push({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } });
    }
    const app = {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'FLOWI', url, inLanguage: lang,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Windows, Android, iOS, Web', description: h.description,
      image: `${origin}/landing/rooms.jpg`,
      offers: info.plans.map((p) => ({ '@type': 'Offer', name: p.name, price: String(p.price), priceCurrency: 'UZS' })),
    };
    const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'FLOWI', url: `${origin}/`, logo: `${origin}/icon-512.png` };
    const out = [app, org];
    if (faq.length) out.push({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity: faq });
    return out.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  }

  // The whole front page in one language, for this site's address.
  function page(lang, origin) {
    const src = source();
    const h = HEAD[lang];
    const dict = lang === 'ru' ? src.ru : src.uz;
    const url = lang === 'uz' ? `${origin}/` : `${origin}/ru`;
    const v = verify() || {};
    let html = lang === 'ru' ? translate(src.html, src.ru) : src.html;
    html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(h.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(h.description)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(h.title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(h.og)}">`)
      .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(origin)}/landing/rooms.jpg">`)
      .replace('<div class="wrap plans" id="plans"></div>', `<div class="wrap plans" id="plans">${plansHtml(lang)}</div>`);
    const head = [
      `<link rel="canonical" href="${esc(url)}">`,
      `<link rel="alternate" hreflang="uz" href="${esc(origin)}/">`,
      `<link rel="alternate" hreflang="ru" href="${esc(origin)}/ru">`,
      `<link rel="alternate" hreflang="x-default" href="${esc(origin)}/">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:site_name" content="FLOWI">`,
      `<meta property="og:locale" content="${h.locale}">`,
      `<meta property="og:locale:alternate" content="${lang === 'uz' ? HEAD.ru.locale : HEAD.uz.locale}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="robots" content="index, follow, max-image-preview:large">`,
      v.google ? `<meta name="google-site-verification" content="${esc(v.google)}">` : '',
      v.yandex ? `<meta name="yandex-verification" content="${esc(v.yandex)}">` : '',
      structured(lang, origin, src, dict),
    ].filter(Boolean).join('\n  ');
    return html.replace('</head>', `  ${head}\n</head>`);
  }

  function lastmod() {
    const d = new Date(fs.statSync(file).mtimeMs);
    return d.toISOString().slice(0, 10);
  }
  function sitemap(origin) {
    const alt = `<xhtml:link rel="alternate" hreflang="uz" href="${esc(origin)}/"/><xhtml:link rel="alternate" hreflang="ru" href="${esc(origin)}/ru"/>`;
    const url = (loc, pri) => `<url><loc>${esc(loc)}</loc><lastmod>${lastmod()}</lastmod><changefreq>weekly</changefreq><priority>${pri}</priority>${alt}</url>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${url(`${origin}/`, '1.0')}\n${url(`${origin}/ru`, '0.9')}\n</urlset>\n`;
  }
  // The business pages, the program and its data are not for search; "?from=…" marks on links are the same page (Yandex).
  function robots(origin) {
    return ['User-agent: *', 'Disallow: /c/', 'Disallow: /app', 'Disallow: /api/', 'Disallow: /media/', 'Disallow: /q/', '',
      'User-agent: Yandex', 'Disallow: /c/', 'Disallow: /app', 'Disallow: /api/', 'Disallow: /media/', 'Disallow: /q/',
      'Clean-param: lang&from&utm_source&utm_medium&utm_campaign&utm_content&utm_term&ref /', '',
      `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
  }

  return { page, sitemap, robots, LANGS };
}

// The site's own address as the visitor typed it (the reverse proxy in front says https).
function originOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().replace(/[^\w.:-]/g, '');
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (local ? 'http' : 'https');
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

// What the owner pastes: either the code itself or the whole <meta …> tag from the search console.
function verifyInput(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = /content\s*=\s*["']([^"']+)["']/i.exec(s);
  const code = (m ? m[1] : s).trim();
  if (!/^[\w-]{6,120}$/.test(code)) return null;
  return code;
}

module.exports = { createSeo, originOf, verifyInput };
