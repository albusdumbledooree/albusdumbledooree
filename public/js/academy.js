'use strict';
/*
 * FLOWI Akademiya: short lessons for the staff (a few cards and three questions each) and one final test with a certificate.
 * A worker learns from their own phone; the boss sees who has read what and how the test went (the "Xodimlar" tab).
 * The lessons come from the platform; a plan without the section opens only the free modules.
 */
const AC = { mod: null, lesson: null, test: null, result: null, tab: null };

function acProgressPct(d) {
  const all = d.modules.flatMap((m) => m.lessons);
  return all.length ? Math.round((all.filter((l) => d.progress[l.id]).length / all.length) * 100) : 0;
}
function acModuleDone(d, m) { return m.lessons.filter((l) => d.progress[l.id]).length; }
function acModuleScore(d, m) {
  const p = m.lessons.map((l) => d.progress[l.id]).filter((x) => x && x.total);
  const ok = p.reduce((s, x) => s + x.ok, 0); const total = p.reduce((s, x) => s + x.total, 0);
  return total ? Math.round((ok / total) * 100) : null;
}
function acShuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = r[i]; r[i] = r[j]; r[j] = x; } return r; }
function acFind(d, lessonId) {
  for (const m of d.modules) { const i = m.lessons.findIndex((l) => l.id === lessonId); if (i >= 0) return { m, l: m.lessons[i], i }; }
  return null;
}
function acNextLesson(d, lessonId) {
  const all = d.modules.filter((m) => m.open).flatMap((m) => m.lessons);
  const i = all.findIndex((l) => l.id === lessonId);
  return all.slice(i + 1).find((l) => !d.progress[l.id]) || null;
}

// Reading a card aloud: the Android app's own voice, else the browser's.
const AcVoice = {
  on: false,
  say(text) {
    this.stop();
    this.on = true;
    if (window.FlowiAndroid && FlowiAndroid.speak) { FlowiAndroid.speak(text, LANG); return; }
    if (!('speechSynthesis' in window)) { this.on = false; return toast(t("Bu qurilmada ovozli o'qish yo'q"), 'warn'); }
    const u = new SpeechSynthesisUtterance(text);
    const v = Voice.pick();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'uz-UZ';
    u.rate = 0.95;
    u.onend = () => { this.on = false; };
    speechSynthesis.speak(u);
  },
  stop() { this.on = false; try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch { /* ignore */ } },
};

Views.academy = {
  title: () => t('Akademiya'), icon: () => 'graduation-cap', roles: ['owner', 'admin', 'cashier', 'waiter', 'chef'],
  on: () => !isShop() && !App.academyOff,
  async load() {
    // The boss opens on who has learned what; workers on their lessons.
    if (!AC.tab) AC.tab = can('owner', 'admin') ? 'team' : 'learn';
    const d = await GET('/api/academy');
    if (can('owner', 'admin') && AC.tab === 'team') d.team = await GET('/api/academy/team');
    if (AC.tab === 'duel') {
      [d.duels, d.rating] = await Promise.all([GET('/api/academy/duels'), GET(`/api/academy/rating?scope=${AC.rscope || 'team'}`).catch(() => null)]);
      if (AC.duelView) d.duelView = await GET(`/api/academy/duels/${AC.duelView}`).catch(() => null);
    }
    return d;
  },
  render(d) {
    if (AC.duel) return acDuelPlayHtml(d);
    if (AC.test) return acTestHtml(d);
    if (AC.result) return acResultHtml(d);
    if (AC.lesson) return acLessonHtml(d);
    const managers = can('owner', 'admin');
    const head = `<div class="page-head">${managers ? `<a class="btn sm" href="#/staff">${icon('arrow-left', 16)}</a>` : ''}<h1>${icon('graduation-cap', 24)} ${t('Akademiya')}</h1></div>
      <div class="seg ac-tabs" style="margin:0 0 14px"><button class="${AC.tab === 'learn' ? 'active' : ''}" data-actab="learn">${icon('book-open', 16)} ${t('Darslar')}</button>
        <button class="${AC.tab === 'duel' ? 'active' : ''}" data-actab="duel">⚔️ ${t('Bellashuv')}</button>
        ${managers ? `<button class="${AC.tab === 'team' ? 'active' : ''}" data-actab="team">${icon('users', 16)} ${t('Xodimlar')}</button>` : ''}</div>`;
    if (managers && AC.tab === 'team' && d.team) return head + acTeamHtml(d.team);
    if (AC.tab === 'duel' && d.duels) return head + acDuelHomeHtml(d);
    const pct = acProgressPct(d);
    const done = d.modules.filter((m) => m.open && m.lessons.length && acModuleDone(d, m) === m.lessons.length).length;
    const best = d.tests.filter((x) => x.passed).sort((a, b) => b.pct - a.pct)[0];
    return `${head}
      <div class="ac-hero"><div class="grow"><b>${esc(App.user.name)}</b><span>${t('{0} / {1} modul', done, d.modules.length)}${best ? ` · ${icon('award', 14)} ${t('Sertifikat')}: ${best.pct}%` : ''}</span>
        <div class="ac-bar"><i style="width:${pct}%"></i></div></div><div class="ac-pct">${pct}%</div></div>
      ${d.full ? '' : `<div class="ac-plan">${icon('lock', 16)} ${t("Bepul modullar ochiq. Hamma darslar, yakuniy test va sertifikat — Biznes va Pro tariflarida.")}</div>`}
      <div class="ac-mods">${d.modules.map((m) => acModuleHtml(d, m)).join('')}</div>
      ${acFinalHtml(d)}`;
  },
  bind(root, d) {
    root.querySelectorAll('[data-actab]').forEach((b) => b.onclick = () => { AC.tab = b.dataset.actab; AC.duelView = null; refreshView(); });
    if (AC.duel) return acDuelPlayBind(root, d);
    if (AC.tab === 'team' && d.team && !AC.lesson && !AC.test && !AC.result) return acTeamBind(root, d.team);
    if (AC.tab === 'duel' && d.duels && !AC.lesson && !AC.test && !AC.result) return acDuelHomeBind(root, d);
    if (AC.test) return acTestBind(root, d);
    if (AC.result) return acResultBind(root, d);
    if (AC.lesson) return acLessonBind(root, d);
    root.querySelectorAll('[data-acmod]').forEach((b) => b.onclick = () => {
      const m = d.modules.find((x) => x.id === b.dataset.acmod);
      if (!m.open) return toast(t('Bu modul Biznes va Pro tariflarida'), 'warn');
      AC.mod = AC.mod === m.id ? null : m.id; renderView(d);
    });
    root.querySelectorAll('[data-aclesson]').forEach((b) => b.onclick = () => acOpenLesson(d, b.dataset.aclesson));
    const st = root.querySelector('#ac-start');
    if (st) st.onclick = () => acStartTest(st);
    root.querySelectorAll('[data-accert]').forEach((b) => b.onclick = () => acCertificate(Number(b.dataset.accert)));
  },
};

function acModuleHtml(d, m) {
  const n = acModuleDone(d, m);
  const sc = acModuleScore(d, m);
  const full = m.lessons.length && n === m.lessons.length;
  const open = AC.mod === m.id && m.open;
  return `<div class="ac-mod ${m.open ? '' : 'locked'} ${open ? 'open' : ''}">
    <button class="ac-mod-h" data-acmod="${esc(m.id)}"><span class="ac-ic" style="background:${esc(m.color)}">${esc(m.icon)}</span>
      <span class="grow"><b>${esc(m.title)}</b><small>${t('{0} dars', m.lessons.length)}${m.free && !d.full ? ` · ${t('bepul')}` : ''}</small>
      ${m.open ? `<span class="ac-mbar"><i style="width:${m.lessons.length ? (n / m.lessons.length) * 100 : 0}%"></i></span>` : ''}</span>
      ${!m.open ? icon('lock', 18) : full ? `<span class="chip green">${icon('check', 13)} ${sc != null ? `${sc}%` : ''}</span>` : `<span class="small muted">${n}/${m.lessons.length}</span>`}</button>
    ${open ? `<div class="ac-lessons">${m.lessons.map((l, i) => {
      const p = d.progress[l.id];
      return `<button class="ac-lesson ${p ? 'done' : ''}" data-aclesson="${esc(l.id)}"><span class="ac-n">${p ? icon('check', 14) : i + 1}</span>
        <span class="grow">${esc(l.title)}</span>${p && p.total ? `<span class="small muted">${p.ok}/${p.total}</span>` : ''}${icon('chevron-right', 16)}</button>`;
    }).join('')}</div>` : ''}</div>`;
}

function acFinalHtml(d) {
  const T = d.test;
  const last = d.tests[0];
  const certs = d.tests.filter((x) => x.passed);
  let state;
  if (!T.plan) state = `<p class="muted">${t('Yakuniy test va sertifikat — Biznes va Pro tariflarida.')}</p>`;
  else if (T.lessons_left) state = `<p class="muted">${t("Test hamma darslar o'qilgandan keyin ochiladi. Yana {0} ta dars qoldi.", T.lessons_left)}</p>`;
  else if (T.retry_at) state = `<p class="muted">${t('Qayta topshirish: {0}', fmtDateTime(T.retry_at))}</p>`;
  else state = `<p class="muted">${t("{0} ta savol. O'tish uchun {1}% to'g'ri javob kerak.", d.test_size, d.pass_pct)}</p>
    <button class="btn primary lg block" id="ac-start">${icon('graduation-cap', 20)} ${last ? t('Testni qayta topshirish') : t('Testni boshlash')}</button>`;
  return `<div class="card ac-final"><h3>${icon('award', 20)} ${t('Yakuniy test')}</h3>${state}
    ${last ? `<p class="small" style="margin-top:10px">${t('Oxirgi natija')}: <span class="chip ${last.passed ? 'green' : 'red'}">${last.pct}% · ${last.passed ? t("o'tdi") : t("o'tmadi")}</span>${last.attempt ? ` <span class="chip orange">${t('{0}-urinish', last.attempt)}</span>` : ''} <span class="muted">${fmtDateTime(last.finished_at)}</span></p>` : ''}
    ${certs.length ? `<div class="row" style="margin-top:8px;gap:8px">${certs.slice(0, 3).map((c) => `<button class="btn sm" data-accert="${c.id}">${icon('award', 16)} ${t('Sertifikat')} · ${c.pct}%</button>`).join('')}</div>` : ''}</div>`;
}

// ---------- A lesson: cards one by one, then its questions ----------
function acOpenLesson(d, id) {
  const f = acFind(d, id);
  if (!f || f.l.locked) return;
  AcVoice.stop();
  AC.lesson = { id, step: 0, quiz: acShuffle(f.l.quiz).map((x) => ({ ...x, order: acShuffle(x.a.map((text, i) => ({ i, text }))), chosen: null })), q: 0, saved: false };
  renderView(d); window.scrollTo(0, 0);
}
function acLessonHtml(d) {
  const L = AC.lesson;
  const f = acFind(d, L.id);
  if (!f) { AC.lesson = null; return ''; }
  const { m, l } = f;
  const cards = l.cards;
  const total = cards.length + L.quiz.length;
  const pos = L.step < cards.length ? L.step : cards.length + L.q;
  const top = `<div class="ac-top"><button class="icon-btn ghost" id="ac-back" title="${esc(t('Orqaga'))}">${icon('arrow-left')}</button>
    <div class="grow"><small>${esc(m.title)}</small><b>${esc(l.title)}</b></div></div>
    <div class="ac-dots">${Array.from({ length: total }, (_, i) => `<i class="${i < pos ? 'd' : i === pos ? 'a' : ''}"></i>`).join('')}</div>`;
  if (L.step < cards.length) {
    const c = cards[L.step];
    return `<div class="ac-wrap">${top}<div class="ac-card">
      ${c.e ? `<div class="ac-ill" style="background:${esc(m.color)}">${esc(c.e)}</div>` : ''}
      <h2>${esc(c.h)}</h2><p>${esc(c.t)}</p>
      ${c.ok ? `<div class="ac-do">✅ ${esc(c.ok)}</div>` : ''}${c.no ? `<div class="ac-dont">❌ ${esc(c.no)}</div>` : ''}</div>
      <div class="ac-btns"><button class="btn" id="ac-say">${icon('volume-2', 18)} ${t('Eshitish')}</button>
        <button class="btn primary" id="ac-next">${L.step + 1 < cards.length ? t('Keyingi') : L.quiz.length ? t('Savollarga') : t('Tugatish')} ${icon('arrow-right', 18)}</button></div></div>`;
  }
  if (L.q < L.quiz.length) {
    const x = L.quiz[L.q];
    const answered = x.chosen !== null;
    return `<div class="ac-wrap">${top}<div class="ac-qhead">${t('Savol {0} / {1}', L.q + 1, L.quiz.length)}</div>
      <div class="ac-q">${esc(x.q)}</div>
      ${x.order.map((o, k) => `<button class="ac-opt ${answered ? (o.i === x.c ? 'right' : o.i === x.chosen ? 'wrong' : 'dim') : ''}" data-acopt="${o.i}" ${answered ? 'disabled' : ''}><b>${'ABCDEF'[k]})</b> ${esc(o.text)}</button>`).join('')}
      ${answered && x.why ? `<div class="ac-why">💡 ${esc(x.why)}</div>` : ''}
      ${answered ? `<div class="ac-btns"><button class="btn primary block" id="ac-qnext">${L.q + 1 < L.quiz.length ? t('Keyingi savol') : t('Natija')} ${icon('arrow-right', 18)}</button></div>` : ''}</div>`;
  }
  const ok = L.quiz.filter((x) => x.chosen === x.c).length;
  const next = acNextLesson(d, L.id);
  return `<div class="ac-wrap">${top}<div class="ac-card ac-done"><div class="ac-big">${L.quiz.length && ok === L.quiz.length ? '🏆' : '✅'}</div>
    <h2>${t('Dars tugadi!')}</h2>${L.quiz.length ? `<p>${t("To'g'ri javoblar: {0} / {1}", ok, L.quiz.length)}</p>` : ''}
    ${L.quiz.length && ok < L.quiz.length ? `<p class="muted small">${t("Xato javoblar uchun darsni yana bir o'qib chiqing — keyingi safar yaxshi natija saqlanadi.")}</p>` : ''}</div>
    <div class="ac-btns"><button class="btn" id="ac-home">${icon('list', 18)} ${t('Darslar')}</button>
      ${next ? `<button class="btn primary" data-acnext="${esc(next.id)}">${t('Keyingi dars')} ${icon('arrow-right', 18)}</button>` : ''}</div></div>`;
}
function acLessonBind(root, d) {
  const L = AC.lesson;
  const f = acFind(d, L.id);
  const back = () => { AcVoice.stop(); AC.lesson = null; AC.mod = f ? f.m.id : AC.mod; refreshView(); };
  const b = root.querySelector('#ac-back'); if (b) b.onclick = back;
  const h = root.querySelector('#ac-home'); if (h) h.onclick = back;
  const say = root.querySelector('#ac-say');
  if (say) say.onclick = () => { const c = f.l.cards[L.step]; if (AcVoice.on) return AcVoice.stop(); AcVoice.say([c.h, c.t, c.ok, c.no ? `${t('Qilmang')}: ${c.no}` : ''].filter(Boolean).join('. ')); };
  const nx = root.querySelector('#ac-next');
  if (nx) nx.onclick = () => { AcVoice.stop(); L.step++; acMaybeSave(d); renderView(d); window.scrollTo(0, 0); };
  root.querySelectorAll('[data-acopt]').forEach((o) => o.onclick = () => { L.quiz[L.q].chosen = Number(o.dataset.acopt); renderView(d); });
  const qn = root.querySelector('#ac-qnext');
  if (qn) qn.onclick = () => { L.q++; acMaybeSave(d); renderView(d); window.scrollTo(0, 0); };
  const nl = root.querySelector('[data-acnext]');
  if (nl) nl.onclick = () => acOpenLesson(d, nl.dataset.acnext);
}
// The lesson is over (cards read, questions answered): saved once, the better result stays.
async function acMaybeSave(d) {
  const L = AC.lesson;
  const f = acFind(d, L.id);
  if (L.saved || L.step < f.l.cards.length || L.q < L.quiz.length) return;
  L.saved = true;
  try {
    const r = await POST('/api/academy/lesson', { lesson: L.id, ok: L.quiz.filter((x) => x.chosen === x.c).length });
    d.progress = r.progress;
    if (currentData === d && AC.lesson === L) renderView(d);
  } catch (e) { L.saved = false; toastError(e); }
}

// ---------- The final test ----------
async function acStartTest(btn) {
  btn.disabled = true;
  try {
    const r = await POST('/api/academy/test');
    AC.test = { id: r.id, questions: r.questions, i: 0, answers: {} };
    AC.result = null;
    refreshView(); window.scrollTo(0, 0);
  } catch (e) { btn.disabled = false; toastError(e); }
}
function acTestHtml() {
  const T = AC.test;
  const x = T.questions[T.i];
  const chosen = T.answers[x.id];
  const answered = Object.keys(T.answers).length;
  return `<div class="ac-wrap"><div class="ac-top"><button class="icon-btn ghost" id="ac-quit" title="${esc(t('Chiqish'))}">${icon('x')}</button>
      <div class="grow"><small>${t('Yakuniy test')}</small><b>${t('Savol {0} / {1}', T.i + 1, T.questions.length)}</b></div></div>
    <div class="ac-bar dark"><i style="width:${(answered / T.questions.length) * 100}%"></i></div>
    <div class="ac-q" style="margin-top:14px">${esc(x.q)}</div>
    ${x.a.map((o, k) => `<button class="ac-opt ${chosen === o.i ? 'sel' : ''}" data-actopt="${o.i}"><b>${'ABCDEF'[k]})</b> ${esc(o.text)}</button>`).join('')}
    <div class="ac-btns">${T.i > 0 ? `<button class="btn" id="ac-prev">${icon('arrow-left', 18)}</button>` : ''}
      ${T.i + 1 < T.questions.length ? `<button class="btn primary" id="ac-tnext" ${chosen === undefined ? 'disabled' : ''}>${t('Keyingi savol')} ${icon('arrow-right', 18)}</button>`
        : `<button class="btn ok" id="ac-finish" ${answered < T.questions.length ? 'disabled' : ''}>${icon('check', 18)} ${t('Yakunlash')}</button>`}</div></div>`;
}
function acTestBind(root, d) {
  const T = AC.test;
  root.querySelectorAll('[data-actopt]').forEach((o) => o.onclick = () => { T.answers[T.questions[T.i].id] = Number(o.dataset.actopt); renderView(d); });
  const nx = root.querySelector('#ac-tnext'); if (nx) nx.onclick = () => { T.i++; renderView(d); window.scrollTo(0, 0); };
  const pv = root.querySelector('#ac-prev'); if (pv) pv.onclick = () => { T.i--; renderView(d); };
  root.querySelector('#ac-quit').onclick = async () => {
    if (!(await confirmModal(t('Testdan chiqasizmi?'), t('Javoblar saqlanmaydi. Testni keyin qaytadan boshlaysiz.')))) return;
    AC.test = null; refreshView();
  };
  const fin = root.querySelector('#ac-finish');
  if (fin) fin.onclick = async () => {
    fin.disabled = true;
    try { AC.result = await POST(`/api/academy/test/${T.id}`, { answers: T.answers }); AC.test = null; refreshView(); window.scrollTo(0, 0); } catch (e) { fin.disabled = false; toastError(e); }
  };
}
function acResultHtml() {
  const R = AC.result;
  const wrong = R.results.filter((x) => !x.ok);
  return `<div class="ac-wrap"><div class="ac-card ac-done"><div class="ac-big">${R.passed ? '🎓' : '📚'}</div>
      <h2>${R.passed ? t('Tabriklaymiz! Testdan o\'tdingiz') : t("Bu safar o'tmadi")}</h2>
      <div class="ac-score ${R.passed ? 'ok' : 'bad'}">${R.pct}%</div><p>${t("To'g'ri javoblar: {0} / {1}", R.score, R.total)}${R.attempt ? ` · <span class="chip orange">${t('{0}-urinish', R.attempt)}</span>` : ''}</p>
      ${R.weak.length ? `<p class="small muted">${t("Ko'proq takrorlang")}: <b>${R.weak.map(esc).join(', ')}</b></p>` : ''}
      ${!R.passed && R.retry_at ? `<p class="small muted">${t('Qayta topshirish: {0}', fmtDateTime(R.retry_at))}</p>` : ''}</div>
    <div class="ac-btns"><button class="btn" id="ac-rhome">${icon('list', 18)} ${t('Darslar')}</button>
      ${R.passed ? `<button class="btn primary" data-accert="${R.id}">${icon('award', 18)} ${t('Sertifikat')}</button>` : ''}</div>
    ${wrong.length ? `<h3 style="margin:18px 0 8px">${t('Xato javoblar')}</h3>${wrong.map((x) => `<div class="card ac-rev"><b>${esc(x.q)}</b>
      ${x.chosen ? `<div class="ac-dont">❌ ${esc(x.chosen)}</div>` : ''}<div class="ac-do">✅ ${esc(x.right)}</div>${x.why ? `<div class="small muted" style="margin-top:6px">💡 ${esc(x.why)}</div>` : ''}</div>`).join('')}` : ''}</div>`;
}
function acResultBind(root) {
  root.querySelector('#ac-rhome').onclick = () => { AC.result = null; refreshView(); };
  root.querySelectorAll('[data-accert]').forEach((b) => b.onclick = () => acCertificate(Number(b.dataset.accert)));
}

// ---------- The boss: who has learned what ----------
function acTeamHtml(T) {
  const rows = T.rows;
  const passed = rows.filter((r) => r.best).length;
  const started = rows.filter((r) => r.done || r.last).length;
  const avg = rows.filter((r) => r.best).length ? Math.round(rows.filter((r) => r.best).reduce((s, r) => s + r.best.pct, 0) / passed) : 0;
  const state = (r) => r.best ? `<span class="chip green">${icon('award', 13)} ${r.best.pct}%</span>`
    : r.last ? `<span class="chip red">${r.last.pct}% · ${t('qayta')}</span>`
    : r.done ? `<span class="chip">${t('davom etyapti')}</span>` : `<span class="chip">${t('boshlamagan')}</span>`;
  return `<div class="kpis">
      ${kpi(t('Xodimlar'), num(rows.length), '', '', 'users')}
      ${kpi(t("Testdan o'tdi"), num(passed), '', passed ? 'good' : '', 'award')}
      ${kpi(t("O'rtacha ball"), passed ? `${avg}%` : '—', '', '', 'chart-column')}
      ${kpi(t('Boshlamagan'), num(rows.length - started), '', rows.length - started ? 'warn' : '', 'clock')}</div>
    ${T.weak ? `<div class="ac-plan">${icon('triangle-alert', 16)} ${t("Ko'p xato qilinadigan mavzu")}: <b>${esc(T.weak.title)}</b> (${t("o'rtacha {0}%", T.weak.pct)})</div>` : ''}
    ${T.full ? '' : `<div class="ac-plan">${icon('lock', 16)} ${t("Bepul modullar ochiq. Hamma darslar, yakuniy test va sertifikat — Biznes va Pro tariflarida.")}</div>`}
    <div class="card"><div class="table-wrap"><table>
      <tr><th>${t('Xodim')}</th><th>${t('Darslar')}</th><th>${t('Yakuniy test')}</th><th>${t('Urinishlar')}</th><th>⚔️ ${t('Bellashuv')}</th><th>${t('Oxirgi')}</th></tr>
      ${rows.map((r) => `<tr><td><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.position || roleName(r.role))}</span></td>
        <td><span class="ac-mbar sm"><i style="width:${r.lessons ? (r.done / r.lessons) * 100 : 0}%"></i></span><span class="small">${r.done}/${r.lessons}</span></td>
        <td>${state(r)}${r.best ? ` <button class="btn sm ghost" data-accert="${r.best.id}" title="${esc(t('Sertifikat'))}">${icon('printer', 15)}</button>` : ''}</td>
        <td class="small">${r.attempts ? `<b>${r.attempts}</b>${r.history.length > 1 ? ` <span class="muted">(${r.history.map((p) => `${p}%`).join(' → ')})</span>` : ''}` : '—'}</td>
        <td class="small">${r.duel ? `<b class="green-text">${r.duel.win}</b> / ${r.duel.draw} / <span class="red">${r.duel.loss}</span>` : '—'}</td>
        <td class="small muted">${r.last_at ? fmtDateTime(r.last_at) : '—'}</td></tr>`).join('')}
    </table></div></div>
    ${can('owner') ? `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 4px">⚔️ ${t('Bellashuv sozlamalari')}</h3>
      ${[['duel_on', t('Bellashuv'), t('Xodimlar bir-biri bilan bilim bellashuvi')], ['duel_global', t('Boshqa choyxonalar bilan'), t("Umumiy reytingda xodimning ismi va choyxona nomi ko'rinadi")],
        ['duel_work', t('Ish vaqtida ham'), t("O'chiq bo'lsa — ochiq cheki yoki smenasi bor xodim bellashuv boshlay olmaydi")]].map(([k, n, h]) => `<div class="switch-row"><div class="grow"><b>${n}</b><span class="small muted">${h}</span></div>
        <label class="switch"><input type="checkbox" data-dset="${k}" ${App.settings[k] ? 'checked' : ''}><span></span></label></div>`).join('')}</div>` : ''}
    <p class="small muted" style="margin-top:10px">${icon('info', 14)} ${t("Xodim darslarni o'z telefonida, \"Akademiya\" bo'limida o'qiydi. Har bir darsdan keyin 3 ta savol, oxirida {0}% bilan o'tiladigan yakuniy test.", T.pass_pct)}</p>`;
}
function acTeamBind(root) {
  root.querySelectorAll('[data-accert]').forEach((b) => b.onclick = () => acCertificate(Number(b.dataset.accert)));
  root.querySelectorAll('[data-dset]').forEach((c) => c.onchange = async () => {
    try { App.settings = await PUT('/api/settings', { [c.dataset.dset]: c.checked }); toast(t('Saqlandi'), 'ok'); } catch (e) { c.checked = !c.checked; toastError(e); }
  });
}

// ---------- Certificate (A4, landscape) ----------
async function acCertificate(id) {
  const w = window.open('', '_blank');
  if (!w) return toast(t("Brauzer yangi oynani to'sib qo'ydi — ruxsat bering"), 'warn');
  let c;
  try { c = await GET(`/api/academy/cert/${id}`); } catch (e) { w.close(); return toastError(e); }
  w.document.write(certificateHtml({ name: c.name, place: App.settings.name || '', pct: c.pct, score: c.score, total: c.total, at: c.at, code: c.code, attempt: c.attempt }));
  w.document.close();
}
// Shared with the site's open test (test.html has its own copy of the look).
function certificateHtml(c) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sertifikat — ${esc(c.name)}</title><style>
    @page { size: A4 landscape; margin: 0; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
    .c { width: 297mm; height: 209mm; padding: 16mm; display: flex; }
    .in { flex: 1; border: 3px solid #0f2130; border-radius: 14px; padding: 14mm 18mm; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }
    .in:before { content: ''; position: absolute; inset: 5px; border: 1px solid #c9a227; border-radius: 10px; pointer-events: none; }
    .brand { font-weight: 900; letter-spacing: 3px; font-size: 18pt; } .brand span { color: #2156e8; }
    .kind { margin-top: 8mm; font-size: 30pt; font-weight: 800; letter-spacing: 1px; } .sub { color: #555; margin-top: 2mm; font-size: 12pt; }
    .name { margin-top: 12mm; font-size: 30pt; font-weight: 800; border-bottom: 2px solid #c9a227; padding: 0 12mm 3mm; }
    .txt { margin-top: 8mm; font-size: 13pt; line-height: 1.6; max-width: 200mm; }
    .row { margin-top: auto; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11pt; color: #333; }
    .score { font-size: 24pt; font-weight: 800; color: #16a34a; } .qr { width: 30mm; height: 30mm; } .qr svg { width: 100%; height: 100%; }
    .att { display: inline-block; margin-top: 4mm; background: #fff4dc; color: #8a5a10; font-weight: 800; font-size: 11pt; padding: 1mm 4mm; border-radius: 20px; }
    @media screen { body { background: #e9ebef; padding: 20px; } .c { background: #fff; margin: auto; box-shadow: 0 6px 30px #0002; } .p { text-align: center; margin: 14px; } .p button { font-size: 16px; padding: 10px 22px; border-radius: 10px; border: 0; background: #2156e8; color: #fff; cursor: pointer; } }
    @media print { .p { display: none; } }
  </style></head><body><div class="p"><button onclick="print()">🖨 Chop etish</button></div><div class="c"><div class="in">
    <div class="brand">FLOW<span>I</span> AKADEMIYA</div>
    <div class="kind">SERTIFIKAT</div><div class="sub">Ofitsantlik va xizmat madaniyati kursi</div>
    <div class="name">${esc(c.name)}</div>
    <div class="txt">${c.place ? `<b>${esc(c.place)}</b> · ` : ''}xizmat madaniyati, dasturxon odobi, mehmon bilan muloqot va FLOWI dasturida ishlash bo'yicha kursni muvaffaqiyatli tamomladi va yakuniy testdan o'tdi.${c.attempt ? `<br><span class="att">${c.attempt}-urinishda o'tdi</span>` : ''}</div>
    <div class="row"><div style="text-align:left">Sana: <b>${fmtDate(c.at)}</b><br>Raqam: <b>${esc(c.code || '')}</b>${c.code ? `<br><small>Tekshirish: ${esc(location.host)}/test?c=${esc(c.code)}</small>` : ''}</div>
      ${c.code ? `<div class="qr">${qrSvg(`${location.origin}/test?c=${c.code}`)}</div>` : '<div class="medal">🏅</div>'}
      <div style="text-align:right">Natija<div class="score">${c.pct}%</div>${c.score}/${c.total} to'g'ri javob</div></div>
  </div></div></body></html>`;
}

// ---------- Bellashuv: two people, the same 10 questions, 20 seconds each; more right answers wins, then the faster ----------
const RES_TXT = { win: () => t("Yutdingiz!"), loss: () => t('Yutqazdingiz'), draw: () => t('Durang') };
function acDuelLink(code) { return `${location.origin}/test?d=${code}`; }
function acDuelRow(x) {
  const op = x.opponent ? `${esc(x.opponent.name)}${x.opponent.place ? ` <span class="muted small">· ${esc(x.opponent.place)}</span>` : ''}` : `<span class="muted">${x.mode === 'link' ? t('Havola yuborildi') : t('Raqib kutilmoqda')}</span>`;
  const st = x.status === 'done' ? `<span class="chip ${x.result === 'win' ? 'green' : x.result === 'loss' ? 'red' : ''}">${RES_TXT[x.result]()} ${x.me.score}:${x.opponent.score}</span>`
    : x.status === 'expired' || x.status === 'declined' ? `<span class="chip">${x.status === 'declined' ? t('Rad etildi') : t('Vaqti tugadi')}</span>`
    : x.me.done ? `<span class="chip orange">${t('Raqib o\'ynamadi')}</span>` : `<span class="chip blue">${t('Sizning navbatingiz')}</span>`;
  return `<button class="ac-duel-row" data-dview="${x.id}"><span class="grow">${{ team: '🏠', global: '🌍', link: '🔗', site: '🌐' }[x.mode] || '⚔️'} ${op}<br><span class="small muted">${fmtDateTime(x.created_at)}</span></span>${st}</button>`;
}
function acDuelHomeHtml(d) {
  const D = d.duels;
  if (D.blocked) return `<div class="card">${emptyState('lock', esc(D.blocked))}</div>`;
  if (d.duelView) return acDuelResultHtml(d.duelView);
  const invites = D.list.filter((x) => x.me && x.me.side === 'b' && !x.me.done && !x.me.started && ['invited', 'playing'].includes(x.status));
  const mine = D.list.filter((x) => !invites.includes(x));
  const R = d.rating;
  return `${invites.map((x) => `<div class="card ac-invite"><div class="grow"><b>⚔️ ${t('{0} sizni bellashuvga chaqirdi!', esc(x.opponent ? x.opponent.name : ''))}</b>
      <span class="small muted">${t('{0} ta savol · har biriga {1} soniya', x.size, x.seconds)}</span></div>
      <button class="btn" data-ddecline="${x.id}">${t('Rad etish')}</button><button class="btn primary" data-daccept="${x.id}">${t('Qabul qilish')}</button></div>`).join('')}
    <div class="ac-duel-hero"><div><b>⚔️ ${t('Kim ko\'proq biladi?')}</b><span>${t('{0} ta savol · har biriga {1} soniya · ikkalangizga bir xil savollar. Ko\'p to\'g\'ri javob bergan yutadi, teng bo\'lsa — tezrog\'i.', D.size, D.seconds)}</span></div>
      <div class="ac-tally"><b>${D.mine.win}</b><small>${t('g\'alaba')}</small></div><div class="ac-tally"><b>${D.mine.loss}</b><small>${t('mag\'lubiyat')}</small></div></div>
    <div class="ac-modes">
      <button class="ac-mode" data-dmode="team"><span>🏠</span><b>${t("O'z jamoam")}</b><small>${t('Hamkasbni tanlab chaqirasiz')}</small></button>
      ${D.global ? `<button class="ac-mode" data-dmode="global"><span>🌍</span><b>${t('Boshqa choyxonalar')}</b><small>${t('Tasodifiy raqib — butun FLOWI bo\'yicha')}</small></button>` : ''}
      <button class="ac-mode" data-dmode="link"><span>🔗</span><b>${t('Havola orqali')}</b><small>${t('Do\'stga Telegramda yuborasiz')}</small></button></div>
    ${D.work ? '' : `<p class="small muted" style="margin:6px 0 0">${icon('info', 14)} ${t("Ochiq chekingiz yoki smenangiz bo'lsa bellashuv boshlanmaydi — avval mijozlar.")}</p>`}
    <div class="ac-duel-grid">
      <div class="card"><h3 style="margin:0 0 8px">${t('Bellashuvlarim')}</h3>${mine.length ? `<div class="ac-duel-list">${mine.map(acDuelRow).join('')}</div>` : `<p class="small muted">${t("Hali bellashuv yo'q. Birinchisini boshlang!")}</p>`}</div>
      <div class="card"><div class="row" style="margin-bottom:8px"><h3 class="grow" style="margin:0">🏆 ${t('Oyning reytingi')}</h3>
        <div class="seg">${[['team', t('Jamoa')], ['flowi', 'FLOWI']].map(([k, n]) => `<button class="${(AC.rscope || 'team') === k ? 'active' : ''}" data-rscope="${k}">${n}</button>`).join('')}</div></div>
        ${R && R.top.length ? `${R.top.slice(0, 10).map((r) => `<div class="ac-rank ${r.me ? 'me' : ''}"><span class="no">${['🥇', '🥈', '🥉'][r.no - 1] || r.no}</span><span class="grow"><b>${esc(r.name)}</b>${(AC.rscope || 'team') === 'flowi' ? `<small>${esc(r.place)}</small>` : ''}</span><span class="small muted">${r.win}/${r.draw}/${r.loss}</span><b>${r.points}</b></div>`).join('')}
          ${R.mine && R.mine.no > 10 ? `<div class="ac-rank me"><span class="no">${R.mine.no}</span><span class="grow"><b>${t('Siz')}</b></span><b>${R.mine.points}</b></div>` : ''}
          ${R.businesses && R.businesses.length && (AC.rscope || 'team') === 'flowi' ? `<p class="small" style="margin:10px 0 0">🏅 <b>${t('Choyxonalar')}:</b> ${R.businesses.slice(0, 3).map((b) => `${b.no}. ${esc(b.name)} (${b.points})`).join(' · ')}</p>` : ''}
          <p class="small muted" style="margin:8px 0 0">${t("G'alaba — 3 ball, durang — 1 ball. G'/D/M — g'alaba, durang, mag'lubiyat.")}</p>`
          : `<p class="small muted">${t("Bu oy hali bellashuv bo'lmadi.")}</p>`}</div></div>`;
}
function acDuelHomeBind(root, d) {
  if (d.duelView) {
    const back = root.querySelector('#ac-dback'); if (back) back.onclick = () => { AC.duelView = null; refreshView(); };
    const again = root.querySelector('#ac-dagain'); if (again) again.onclick = () => { AC.duelView = null; refreshView(); };
    const cp = root.querySelector('[data-dcopy]'); if (cp) cp.onclick = () => acShareLink(cp.dataset.dcopy);
    const pl = root.querySelector('[data-dplay]'); if (pl) pl.onclick = () => acDuelStart(() => POST(`/api/academy/duels/${pl.dataset.dplay}/accept`));
    return;
  }
  root.querySelectorAll('[data-rscope]').forEach((b) => b.onclick = () => { AC.rscope = b.dataset.rscope; refreshView(); });
  root.querySelectorAll('[data-dview]').forEach((b) => b.onclick = () => {
    const x = d.duels.list.find((y) => y.id === Number(b.dataset.dview));
    if (x && !x.me.done && ['open', 'invited', 'playing'].includes(x.status)) return acDuelStart(() => POST(`/api/academy/duels/${x.id}/accept`));
    AC.duelView = Number(b.dataset.dview); refreshView();
  });
  root.querySelectorAll('[data-daccept]').forEach((b) => b.onclick = () => acDuelStart(() => POST(`/api/academy/duels/${b.dataset.daccept}/accept`)));
  root.querySelectorAll('[data-ddecline]').forEach((b) => b.onclick = async () => { try { await POST(`/api/academy/duels/${b.dataset.ddecline}/decline`); refreshView(); } catch (e) { toastError(e); } });
  root.querySelectorAll('[data-dmode]').forEach((b) => b.onclick = () => {
    const mode = b.dataset.dmode;
    if (mode !== 'team') return acDuelStart(() => POST('/api/academy/duels', { mode }));
    const list = d.duels.colleagues;
    if (!list.length) return toast(t("Jamoada boshqa xodim yo'q"), 'warn');
    openModal({ title: `⚔️ ${t('Kimni chaqirasiz?')}`,
      body: `<div class="ac-pick">${list.map((u) => `<button type="button" class="ac-pick-row" data-pick="${u.id}"><span class="avatar ${u.role}">${esc(initials(u.name))}</span>
        <span class="grow"><b>${esc(u.name)}</b><small>${u.online ? `<i class="conn on"></i> ${t('Hozir dasturda')}` : esc(u.position || roleName(u.role))} · ${t('{0} g\'alaba', u.win)}</small></span>${icon('chevron-right', 16)}</button>`).join('')}</div>`,
      onMount: (f) => f.querySelectorAll('[data-pick]').forEach((p) => p.onclick = () => { closeModal(); acDuelStart(() => POST('/api/academy/duels', { mode: 'team', user_id: Number(p.dataset.pick) })); }) });
  });
}
async function acShareLink(code) {
  const url = acDuelLink(code);
  const text = t("Keling, bellashamiz! Kim ko'proq biladi — ofitsantlik bo'yicha 10 ta savol:");
  if (navigator.share) { try { await navigator.share({ title: 'FLOWI ⚔️', text, url }); return; } catch { /* closed */ } }
  try { await navigator.clipboard.writeText(url); toast(t('Havola nusxalandi — Telegramda yuboring'), 'ok'); } catch { prompt(t('Havola'), url); }
}
async function acDuelStart(fn) {
  try {
    const r = await fn();
    AC.duel = { id: r.duel.id, code: r.duel.code, mode: r.duel.mode, opponent: r.duel.opponent, questions: r.questions, i: 0, answers: {}, size: r.duel.size, seconds: r.duel.seconds, until: 0, result: null };
    AC.duelView = null;
    acDuelNext();
    if (currentView === Views.academy) renderView(currentData); else location.hash = '#/academy';
    window.scrollTo(0, 0);
  } catch (e) { toastError(e); }
}
// Each question has its own clock; when it runs out the next one comes (no answer = wrong).
function acDuelNext() {
  const D = AC.duel;
  clearInterval(AC.tick);
  D.until = Date.now() + D.seconds * 1000;
  AC.tick = setInterval(() => {
    if (!AC.duel || AC.duel !== D) return clearInterval(AC.tick);
    const left = Math.max(0, Math.ceil((D.until - Date.now()) / 1000));
    const el = document.getElementById('ac-dt'); if (el) { el.textContent = `⏱ ${left}`; el.classList.toggle('red', left <= 5); }
    const bar = document.getElementById('ac-dbar'); if (bar) bar.style.width = `${(left / D.seconds) * 100}%`;
    if (left <= 0) acDuelAdvance();
  }, 250);
}
function acDuelAdvance() {
  const D = AC.duel;
  if (!D || D.result) return;
  if (D.i + 1 < D.questions.length) { D.i++; acDuelNext(); if (currentView === Views.academy) renderView(currentData); return; }
  clearInterval(AC.tick);
  D.result = 'sending';
  if (currentView === Views.academy) renderView(currentData);
  POST(`/api/academy/duels/${D.id}/answer`, { answers: D.answers }).then((r) => { D.result = r; if (currentView === Views.academy) renderView(currentData); })
    .catch((e) => { D.result = null; toastError(e); });
}
function acDuelPlayHtml() {
  const D = AC.duel;
  if (D.result === 'sending') return `<div class="ac-wrap"><div class="card">${emptyState('loader', t('Natija hisoblanmoqda…'))}</div></div>`;
  if (D.result) {
    const R = D.result;
    return `<div class="ac-wrap">${acDuelResultHtml({ ...R.duel, wrong: R.results }, true)}
      ${D.mode === 'link' && !R.duel.opponent ? `<div class="card" style="margin-top:12px"><b>🔗 ${t('Endi havolani do\'stingizga yuboring')}</b><p class="small muted">${esc(acDuelLink(D.code))}</p>
        <button class="btn primary block" data-dcopy="${esc(D.code)}">${icon('send', 18)} ${t('Yuborish')}</button></div>` : ''}
      <div class="ac-btns"><button class="btn primary block" id="ac-dclose">${t('Bellashuvlarga qaytish')}</button></div></div>`;
  }
  const x = D.questions[D.i];
  const chosen = D.answers[x.id];
  const left = Math.max(0, Math.ceil((D.until - Date.now()) / 1000));
  return `<div class="ac-wrap"><div class="ac-top"><div class="grow"><small>⚔️ ${D.opponent ? `${esc(App.user.name)} ✕ ${esc(D.opponent.name)}` : t('Bellashuv')}</small><b>${t('Savol {0} / {1}', D.i + 1, D.questions.length)}</b></div>
      <span class="chip ${left <= 5 ? 'red' : 'blue'}" id="ac-dt">⏱ ${left}</span></div>
    <div class="ac-bar dark"><i id="ac-dbar" style="width:${(left / D.seconds) * 100}%"></i></div>
    <div class="ac-q" style="margin-top:14px">${esc(x.q)}</div>
    ${x.a.map((o, k) => `<button class="ac-opt ${chosen === o.i ? 'sel' : ''}" data-dopt="${o.i}"><b>${'ABCDEF'[k]})</b> ${esc(o.text)}</button>`).join('')}
    <div class="ac-btns"><button class="btn primary block" id="ac-dnext" ${chosen === undefined ? 'disabled' : ''}>${D.i + 1 < D.questions.length ? t('Keyingi savol') : t('Yakunlash')} ${icon('arrow-right', 18)}</button></div></div>`;
}
function acDuelPlayBind(root) {
  const D = AC.duel;
  if (D.result && D.result !== 'sending') {
    root.querySelector('#ac-dclose').onclick = () => { AC.duel = null; refreshView(); };
    const cp = root.querySelector('[data-dcopy]'); if (cp) cp.onclick = () => acShareLink(cp.dataset.dcopy);
    return;
  }
  root.querySelectorAll('[data-dopt]').forEach((o) => o.onclick = () => { D.answers[D.questions[D.i].id] = Number(o.dataset.dopt); renderView(currentData); });
  const nx = root.querySelector('#ac-dnext'); if (nx) nx.onclick = () => acDuelAdvance();
}
function acDuelResultHtml(x, fresh) {
  const me = x.me || {}; const op = x.opponent;
  const done = x.status === 'done';
  const sec = (ms) => (ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`);
  return `${fresh ? '' : `<div class="page-head" style="margin-top:-4px"><button class="btn sm" id="ac-dback">${icon('arrow-left', 16)}</button><h2>${t('Bellashuv natijasi')}</h2></div>`}
    <div class="card ac-vs-card">${done ? `<div class="ac-vs">
        <div class="${x.result === 'win' ? 'w' : x.result === 'loss' ? 'l' : ''}"><span class="crown">${x.result === 'win' ? '👑' : ''}</span><b>${esc(App.user.name)}</b><small>${esc(App.settings.name || '')}</small><div class="big">${me.score}</div><small>${sec(me.ms)}</small></div>
        <i>VS</i>
        <div class="${x.result === 'loss' ? 'w' : x.result === 'win' ? 'l' : ''}"><span class="crown">${x.result === 'loss' ? '👑' : ''}</span><b>${esc(op.name)}</b><small>${esc(op.place || '')}&nbsp;</small><div class="big">${op.score}</div><small>${sec(op.ms)}</small></div></div>
        <div class="ac-vs-res ${x.result}">${RES_TXT[x.result]()}${x.result === 'win' ? ' +3' : x.result === 'draw' ? ' +1' : ''}</div>`
      : `<div class="ac-done"><div class="ac-big">⏳</div><h2>${me.done ? t("Javoblaringiz qabul qilindi") : t('Bellashuv')}</h2>
        <p>${x.status === 'expired' ? t("Raqib vaqtida o'ynamadi — bellashuv yopildi.") : x.status === 'declined' ? t('Raqib chaqiruvni rad etdi.') : op ? t("{0} hali o'ynamadi. Natija kelganda xabar beramiz.", esc(op.name)) : x.mode === 'link' ? t("Do'stingiz havolani ochib o'ynasa, natija shu yerda chiqadi.") : t("Raqib topilishi bilan u ham shu savollarga javob beradi. Natija kelganda xabar beramiz.")}</p>
        ${x.mode === 'link' && x.joinable && !fresh ? `<button class="btn primary" data-dcopy="${esc(x.code)}">${icon('send', 18)} ${t('Havolani yuborish')}</button>` : ''}
        ${!me.done && ['open', 'invited', 'playing'].includes(x.status) && !fresh ? `<button class="btn primary" data-dplay="${x.id}">${t("O'ynash")}</button>` : ''}</div>`}</div>
    ${(x.wrong || []).length ? `<h3 style="margin:16px 0 8px">${t('Xato javoblar')}</h3>${x.wrong.map((w) => `<div class="card ac-rev"><b>${esc(w.q)}</b>${w.chosen ? `<div class="ac-dont">❌ ${esc(w.chosen)}</div>` : ''}<div class="ac-do">✅ ${esc(w.right)}</div>${w.why ? `<div class="small muted" style="margin-top:6px">💡 ${esc(w.why)}</div>` : ''}</div>`).join('')}` : ''}`;
}

// A duel's news reaches the worker wherever they are.
Live.on('duel', (d) => {
  if (!App.user || d.to !== App.user.id) return;
  const msg = d.kind === 'invite' ? t('{0} sizni bellashuvga chaqirdi!', d.from)
    : d.kind === 'result' ? `${t('Bellashuv natijasi')}: ${RES_TXT[d.result]()} (${d.opponent})`
    : d.kind === 'joined' ? t("{0} bellashuvingizga qo'shildi", d.opponent) : t('{0} chaqiruvni rad etdi', d.opponent);
  Voice.chime('ready');
  notifySystem('FLOWI ⚔️', msg);
  toast(msg, d.kind === 'declined' ? 'warn' : 'ok', 8000);
  if (currentView === Views.academy && !AC.duel && !AC.test && !AC.lesson) refreshView();
});
