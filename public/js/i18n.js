'use strict';
/*
 * Translations. Uzbek is the source language: every UI string is written in Uzbek and looked up
 * in the Russian/English dictionaries below. "{0}", "{1}" are placeholders.
 * Server messages arrive already filled in (e.g. '"Manti" tugagan'), so tServer() also matches
 * them against the placeholder patterns.
 */
const LANGS = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
let LANG = (() => { try { return JSON.parse(localStorage.getItem('cp_lang')) || 'uz'; } catch { return 'uz'; } })();
if (!LANGS[LANG]) LANG = 'uz';

const I18N = { ru: {}, en: {} };

function t(s, ...args) {
  let out = s;
  if (LANG !== 'uz' && I18N[LANG][s] !== undefined) out = I18N[LANG][s];
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => (args[i] ?? '')) : out;
}

const patternCache = {};
function patterns(lang) {
  if (patternCache[lang]) return patternCache[lang];
  const list = [];
  for (const [k, v] of Object.entries(I18N[lang])) {
    if (!/\{\d\}/.test(k)) continue;
    const order = [];
    const src = k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\d)\\?\}/g, (_, n) => { order.push(Number(n)); return '(.+?)'; });
    list.push({ re: new RegExp(`^${src}$`), order, v });
  }
  return (patternCache[lang] = list);
}

function tServer(msg) {
  if (LANG === 'uz' || !msg) return msg;
  const d = I18N[LANG];
  if (d[msg] !== undefined) return d[msg];
  for (const p of patterns(LANG)) {
    const m = p.re.exec(msg);
    if (!m) continue;
    // Captured parts may be field names ("Summa kiritilmagan") that have their own translation.
    const vals = [];
    p.order.forEach((n, i) => { vals[n] = d[m[i + 1]] ?? m[i + 1]; });
    return p.v.replace(/\{(\d+)\}/g, (_, i) => vals[i] ?? '');
  }
  return msg;
}

function setLang(lang) {
  LANG = LANGS[lang] ? lang : 'uz';
  try { localStorage.setItem('cp_lang', JSON.stringify(LANG)); } catch { /* ignore */ }
  document.documentElement.lang = LANG;
}
document.documentElement.lang = LANG;
