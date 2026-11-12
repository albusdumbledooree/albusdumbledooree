'use strict';
/* Platform: FLOWI Akademiya — the open test's numbers, who learns in each business, and the lessons editor. */
const PA = { data: null, edit: null };

async function loadAcademy() { [PA.data] = await Promise.all([GET('/api/platform/academy'), loadCerts()]); PA.edit = null; }
// Every certificate (in businesses and on the site): search by name, number, phone or place.
PA.certQ = ''; PA.certSrc = '';
async function loadCerts() { PA.certs = await GET(`/api/platform/academy/certs?${new URLSearchParams({ q: PA.certQ, source: PA.certSrc })}`); }
function certsHtml() {
  const C = PA.certs;
  if (!C) return '';
  return `<div class="card" style="margin-top:14px"><div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:10px"><b class="grow">${icon('award', 16)} Sertifikatlar · ${C.counts.all} ta</b>
      <input type="search" id="pa-cq" placeholder="Ism, raqam, telefon yoki joy" value="${esc(PA.certQ)}" style="max-width:300px">
      <div class="seg">${[['', `Hammasi (${C.counts.all})`], ['app', `Bizneslar (${C.counts.app})`], ['site', `Sayt (${C.counts.site})`]].map(([k, n]) => `<button class="${PA.certSrc === k ? 'active' : ''}" data-csrc="${k}">${n}</button>`).join('')}</div></div>
    ${C.rows.length ? `<div class="table-wrap"><table><tr><th>Ism</th><th>Qayerdan</th><th class="right">Natija</th><th>Urinish</th><th>Sana</th><th></th></tr>
      ${C.rows.map((c) => `<tr><td><b>${esc(c.name)}</b><br><span class="small muted">${esc(c.code)}${c.phone ? ` · ${esc(c.phone)}` : ''}</span></td>
        <td>${c.source === 'site' ? '<span class="chip">Sayt</span> ' : ''}${esc(c.place || '—')}${c.role ? `<br><span class="small muted">${esc(c.role)}</span>` : ''}</td>
        <td class="right"><span class="chip green">${c.pct}%</span></td><td>${c.attempt > 1 ? `<span class="chip orange">${c.attempt}-urinish</span>` : '1-urinish'}</td>
        <td class="small muted">${fmtDateTime(c.at)}</td><td class="actions"><a class="btn sm" href="/test?c=${encodeURIComponent(c.code)}" target="_blank" rel="noopener" title="Ochish va chop etish">${icon('external-link', 15)}</a>
        <button class="btn sm" data-ccopy="${esc(c.code)}" title="Havolani nusxalash">${icon('copy', 15)}</button></td></tr>`).join('')}</table></div>
      ${C.total > C.rows.length ? `<p class="small muted" style="margin-top:8px">Oxirgi ${C.rows.length} tasi ko'rsatildi (jami ${C.total}). Qidiruvdan foydalaning.</p>` : ''}`
      : `<p class="small muted">${PA.certQ || PA.certSrc ? 'Hech narsa topilmadi.' : "Hali sertifikat berilmagan."}</p>`}</div>`;
}

function academyHtml() {
  const A = PA.data;
  if (!A) return `<div class="card">${emptyState('graduation-cap', 'Yuklanmoqda…')}</div>`;
  const pub = A.public;
  const C = A.content;
  const lessons = C.modules.reduce((s, m) => s + m.lessons.length, 0);
  const questions = C.modules.reduce((s, m) => s + m.lessons.reduce((x, l) => x + l.quiz.length, 0), 0);
  const learners = A.tenants.reduce((s, t) => s + (t.learners || 0), 0);
  const certified = A.tenants.reduce((s, t) => s + (t.certified || 0), 0);
  return `<div class="kpis">
      ${kpiP('Saytdagi test', pub.month.started, `30 kunda · jami ${pub.all.started}`, 'graduation-cap')}
      ${kpiP("Testdan o'tdi (sayt)", pub.month.passed, `30 kunda · jami ${pub.all.passed}`, 'award', 'good')}
      ${kpiP("Bizneslarda o'qiyapti", learners, `${A.tenants.filter((t) => t.learners).length} ta biznesda`, 'users')}
      ${kpiP('Sertifikat olgan xodim', certified, '', 'circle-check', 'good')}
    </div>
    <div class="card pa-site" style="margin-bottom:14px"><div class="row" style="flex-wrap:nowrap"><div class="grow"><b>${icon('link', 16)} Saytda ochiq test</b>
        <p class="small muted" style="margin:4px 0 0">${A.site ? `Hamma uchun: <a href="/test" target="_blank" rel="noopener"><b>${esc(location.host)}/test</b></a> — bosh sahifada ham havola bor.` : "O'chiq: bosh sahifada havola yo'q, /test sahifasida \"Test vaqtincha yopiq\" chiqadi."} Berilgan sertifikatlarni tekshirish (<b>/test?c=KOD</b>) doim ishlaydi.</p></div>
      <label class="switch" title="Saytdagi testni yoqish / o'chirish"><input type="checkbox" id="pa-site" ${A.site ? 'checked' : ''}><span></span></label></div></div>
    ${A.duel ? `<div class="card" style="margin-bottom:14px"><b>⚔️ Bellashuv</b> <span class="small muted">· 30 kunda ${A.duel.stats.all} ta (${A.duel.stats.done} tasi tugagan): jamoa ${A.duel.stats.team}, bizneslararo ${A.duel.stats.global}, havola ${A.duel.stats.link}, sayt ${A.duel.stats.site}</span>
      <div class="switch-row"><div class="grow"><b>Bizneslararo bellashuv</b><span class="small muted">Xodimlar butun FLOWI bo'yicha tasodifiy raqib bilan bellashadi (boshliq o'z biznesida o'chira oladi)</span></div><label class="switch"><input type="checkbox" data-pduel="global" ${A.duel.global ? 'checked' : ''}><span></span></label></div>
      <div class="switch-row"><div class="grow"><b>Saytda bellashuv</b><span class="small muted">flowi.uz/test — tasodifiy raqib, do'stga havola va oylik reyting</span></div><label class="switch"><input type="checkbox" data-pduel="site" ${A.duel.site ? 'checked' : ''}><span></span></label></div>
      ${A.duel.top.length ? `<p class="small" style="margin:8px 0 0">🏆 Oyning eng yaxshilari: ${A.duel.top.map((r) => `${r.no}. <b>${esc(r.name)}</b> (${esc(r.place)}) — ${r.points}`).join(' · ')}</p>` : ''}
      ${A.duel.businesses.length ? `<p class="small" style="margin:4px 0 0">🏅 Bizneslar: ${A.duel.businesses.map((b) => `${b.no}. <b>${esc(b.name)}</b> — ${b.points}`).join(' · ')}</p>` : ''}</div>` : ''}
    <div class="pa-grid">
      <div class="card"><div class="row" style="margin-bottom:8px"><b class="grow">${icon('book-open', 16)} Darslar</b>
          <span class="small muted">${C.modules.length} modul · ${lessons} dars · ${questions} savol${A.custom ? ' · <span class="chip">tahrirlangan</span>' : ''}</span></div>
        ${C.modules.map((m, mi) => `<div class="pa-mod"><div class="row"><span class="pa-ic" style="background:${esc(m.color)}">${esc(m.icon)}</span>
            <b class="grow">${esc(m.title)}</b>${m.free ? '<span class="chip green">bepul</span>' : ''}
            <button class="icon-btn ghost" data-pamod="${mi}" title="Modulni tahrirlash">${icon('pencil', 16)}</button></div>
          ${m.lessons.map((l, li) => `<button class="pa-lesson" data-pales="${mi}:${li}"><span class="grow">${li + 1}. ${esc(l.title)}</span><span class="small muted">${l.cards.length} karta · ${l.quiz.length} savol</span>${icon('chevron-right', 15)}</button>`).join('')}
          <button class="btn sm ghost" data-paadd="${mi}">${icon('plus', 15)} Dars qo'shish</button></div>`).join('')}
        <div class="row" style="margin-top:12px;gap:8px"><button class="btn sm" id="pa-addmod">${icon('plus', 15)} Modul qo'shish</button>
          ${A.custom ? `<button class="btn sm red-text" id="pa-reset">${icon('rotate-ccw', 15)} Asl darslarga qaytarish</button>` : ''}</div></div>
      <div class="stack">
        <div class="card"><b>${icon('store', 16)} Bizneslarda</b>
          <p class="small muted" style="margin:4px 0 8px">Holat va qo'shimcha to'lovni o'zgartirish uchun biznesni bosing.</p>
          ${A.tenants.length ? `<div class="table-wrap"><table><tr><th>Biznes</th><th>Akademiya</th><th class="right">O'qiyapti</th><th class="right">Sertifikat</th></tr>
            ${A.tenants.map((t) => `<tr class="clickable" data-patenant="${t.id}"><td><b>${esc(t.name)}</b><br><span class="small muted">${esc(t.code)} · ${esc(t.plan)}</span></td>
              <td>${paModeChip(t)}${t.price && t.mode !== 'off' ? `<br><span class="small"><b>+${money(t.price)}</b>/oy</span>` : ''}</td>
              <td class="right">${t.learners || 0}</td><td class="right">${t.certified || 0}</td></tr>`).join('')}</table></div>`
            : '<p class="small muted">Hali restoran yoki choyxona yo\'q.</p>'}</div>
        <div class="card"><b>${icon('graduation-cap', 16)} Saytdagi oxirgi testlar</b>
          ${pub.last.length ? `<div class="table-wrap"><table><tr><th>Ism</th><th>Joy</th><th class="right">Natija</th><th>Sana</th></tr>
            ${pub.last.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.attempt > 1 ? ` <span class="chip orange">${r.attempt}-urinish</span>` : ''}${r.phone ? `<br><span class="small muted">${esc(r.phone)}</span>` : ''}</td><td class="small">${esc(r.place || '—')}</td><td class="right"><span class="chip ${r.passed ? 'green' : 'red'}">${r.total ? Math.round((r.score / r.total) * 100) : 0}%</span></td><td class="small muted">${fmtDateTime(r.finished_at)}</td></tr>`).join('')}</table></div>`
            : '<p class="small muted">Hali hech kim topshirmagan.</p>'}</div>
      </div></div>
    ${certsHtml()}`;
}

// What a business gets: by its plan (and what the plan gives), fully open, only the free modules, or hidden.
function paModeChip(t) {
  if (t.mode === 'full') return '<span class="chip blue">To\'liq ochiq</span>';
  if (t.mode === 'free') return '<span class="chip orange">Faqat bepul</span>';
  if (t.mode === 'off') return '<span class="chip">Yashirin</span>';
  return `<span class="chip ${t.plan_full ? 'green' : ''}">Tarif: ${t.plan_full ? "to'liq" : 'bepul qismi'}</span>`;
}
// One business's Akademiya: the same fields as in its edit window.
function paTenantDialog(id) {
  const t = P.tenants.find((x) => x.id === id);
  if (!t) return;
  openModal({ title: `${icon('graduation-cap')} ${esc(t.name)}`, body: academyFields(t),
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      const d = formData(f);
      await PUT(`/api/platform/tenants/${t.id}`, { academy_mode: d.academy_mode, academy_price: Number(d.academy_price) || 0 });
      toast('Saqlandi', 'ok'); await load(); await loadAcademy(); render();
    } }] });
}

async function saveAcademy(content) {
  try { const r = await PUT('/api/platform/academy', { content }); PA.data.content = r.content; PA.data.custom = true; toast('Saqlandi', 'ok'); render(); return true; } catch (e) { toastError(e); return false; }
}
const paClone = () => JSON.parse(JSON.stringify(PA.data.content));

function bindAcademy(root) {
  root.querySelectorAll('[data-pduel]').forEach((c) => c.onchange = async () => {
    try { const r = await PUT('/api/platform/academy/duel', { [c.dataset.pduel]: c.checked }); PA.data.duel.global = r.global; PA.data.duel.site = r.site; toast('Saqlandi', 'ok'); } catch (e) { c.checked = !c.checked; toastError(e); }
  });
  const cq = root.querySelector('#pa-cq');
  if (cq) { let tm = null; cq.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { PA.certQ = cq.value.trim(); try { await loadCerts(); render(); const el = document.getElementById('pa-cq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } catch (e) { toastError(e); } }, 350); }; }
  root.querySelectorAll('[data-csrc]').forEach((b) => b.onclick = async () => { PA.certSrc = b.dataset.csrc; try { await loadCerts(); render(); } catch (e) { toastError(e); } });
  root.querySelectorAll('[data-ccopy]').forEach((b) => b.onclick = async () => {
    const url = `${location.origin}/test?c=${b.dataset.ccopy}`;
    try { await navigator.clipboard.writeText(url); toast('Havola nusxalandi', 'ok'); } catch { prompt('Havola:', url); }
  });
  const site = root.querySelector('#pa-site');
  if (site) site.onchange = async () => {
    try { const r = await PUT('/api/platform/academy/site', { on: site.checked }); PA.data.site = r.site; toast(r.site ? 'Saytdagi test yoqildi' : "Saytdagi test o'chirildi", 'ok'); render(); } catch (e) { site.checked = !site.checked; toastError(e); }
  };
  root.querySelectorAll('[data-patenant]').forEach((r) => r.onclick = () => paTenantDialog(Number(r.dataset.patenant)));
  root.querySelectorAll('[data-pamod]').forEach((b) => b.onclick = () => moduleDialog(Number(b.dataset.pamod)));
  root.querySelectorAll('[data-pales]').forEach((b) => b.onclick = () => { const [mi, li] = b.dataset.pales.split(':').map(Number); lessonDialog(mi, li); });
  root.querySelectorAll('[data-paadd]').forEach((b) => b.onclick = () => {
    const c = paClone(); const m = c.modules[Number(b.dataset.paadd)];
    m.lessons.push({ id: `${m.id}-${Date.now().toString(36)}`, title: 'Yangi dars', cards: [{ e: '📘', h: 'Sarlavha', t: 'Matn', ok: '', no: '' }], quiz: [] });
    PA.data.content = c; lessonDialog(Number(b.dataset.paadd), m.lessons.length - 1, true);
  });
  root.querySelector('#pa-addmod').onclick = () => {
    const c = paClone();
    c.modules.push({ id: `m${Date.now().toString(36)}`, icon: '📘', color: '#eef2f7', title: 'Yangi modul', free: false, lessons: [] });
    PA.data.content = c; moduleDialog(c.modules.length - 1, true);
  };
  const rs = root.querySelector('#pa-reset');
  if (rs) rs.onclick = async () => {
    if (!(await confirmModal('Asl darslarga qaytarilsinmi?', "Siz qilgan o'zgarishlar o'chadi. Xodimlarning o'qigan darslari saqlanib qoladi."))) return;
    try { const r = await POST('/api/platform/academy/reset'); PA.data.content = r.content; PA.data.custom = false; render(); } catch (e) { toastError(e); }
  };
}

function moduleDialog(mi, isNew) {
  const c = paClone(); const m = c.modules[mi];
  openModal({ title: isNew ? 'Yangi modul' : 'Modul',
    body: `<label class="field">Nomi<input name="title" value="${esc(m.title)}" maxlength="80"></label>
      <div class="row" style="gap:10px"><label class="field" style="flex:1">Belgi (emoji)<input name="icon" value="${esc(m.icon)}" maxlength="8"></label>
      <label class="field" style="flex:1">Rang<input name="color" type="color" value="${esc(m.color)}"></label></div>
      <label class="check"><input type="checkbox" name="free" ${m.free ? 'checked' : ''}> Bepul — Start tarifida ham ochiq</label>
      <label class="check"><input type="checkbox" name="site" ${m.site !== false ? 'checked' : ''}> Savollari saytdagi ochiq testda ham bo'lsin</label>`,
    onClose: () => { if (isNew) loadAcademy().then(render); },
    actions: [
      ...(isNew ? [] : [{ label: "O'chirish", cls: 'red-text', icon: 'trash-2', onClick: async () => {
        if (!(await confirmModal(`"${esc(m.title)}" o'chirilsinmi?`, `Ichidagi ${m.lessons.length} ta dars ham o'chadi.`))) return false;
        c.modules.splice(mi, 1); return saveAcademy(c);
      } }]),
      { label: 'Saqlash', cls: 'primary', onClick: (f) => {
        const d = formData(f);
        Object.assign(m, { title: d.title, icon: d.icon, color: d.color, free: !!f.free.checked, site: !!f.site.checked });
        return saveAcademy(c);
      } }] });
}

// A lesson: its cards (picture, heading, text, do / don't) and its questions (answers, the right one, why).
function lessonDialog(mi, li, isNew) {
  const c = paClone(); const m = c.modules[mi]; const l = m.lessons[li];
  const cardRow = (k, i) => `<div class="pa-block" data-card>
      <div class="row"><b class="grow">Karta ${i + 1}</b><button type="button" class="icon-btn ghost" data-rm title="O'chirish">${icon('trash-2', 15)}</button></div>
      <div class="row" style="gap:8px"><input name="e" value="${esc(k.e)}" placeholder="🙂" style="width:70px" maxlength="8"><input name="h" value="${esc(k.h)}" placeholder="Sarlavha" style="flex:1"></div>
      <textarea name="t" rows="3" placeholder="Matn (2–3 gap)">${esc(k.t)}</textarea>
      <input name="ok" value="${esc(k.ok)}" placeholder="✅ Shunday qiling"><input name="no" value="${esc(k.no)}" placeholder="❌ Bunday qilmang"></div>`;
  const quizRow = (x, i, key = i) => `<div class="pa-block" data-q>
      <div class="row"><b class="grow">Savol ${i + 1}</b><button type="button" class="icon-btn ghost" data-rm title="O'chirish">${icon('trash-2', 15)}</button></div>
      <textarea name="q" rows="2" placeholder="Savol">${esc(x.q)}</textarea>
      ${[0, 1, 2, 3].map((k) => `<label class="pa-ans"><input type="radio" name="c${key}" value="${k}" ${x.c === k ? 'checked' : ''} title="To'g'ri javob"><input name="a${k}" value="${esc(x.a[k] || '')}" placeholder="Javob ${'ABCD'[k]}"></label>`).join('')}
      <input name="why" value="${esc(x.why)}" placeholder="💡 Nega to'g'ri (javobdan keyin ko'rinadi)"></div>`;
  const form = openModal({ title: `${esc(m.title)} — dars`, size: 'wide',
    body: `<label class="field">Dars nomi<input name="title" value="${esc(l.title)}" maxlength="80"></label>
      <h3 style="margin:14px 0 6px">Kartalar</h3><div id="pa-cards">${l.cards.map(cardRow).join('')}</div>
      <button type="button" class="btn sm" id="pa-addcard">${icon('plus', 15)} Karta</button>
      <h3 style="margin:16px 0 6px">Savollar <span class="small muted">(doirachani bosib to'g'ri javobni belgilang)</span></h3><div id="pa-quiz">${l.quiz.map(quizRow).join('')}</div>
      <button type="button" class="btn sm" id="pa-addq">${icon('plus', 15)} Savol</button>`,
    onClose: () => { if (isNew) loadAcademy().then(render); },
    actions: [
      ...(isNew ? [] : [{ label: "Darsni o'chirish", cls: 'red-text', icon: 'trash-2', onClick: async () => {
        if (!(await confirmModal(`"${esc(l.title)}" o'chirilsinmi?`, ''))) return false;
        m.lessons.splice(li, 1); return saveAcademy(c);
      } }]),
      { label: 'Saqlash', cls: 'primary', onClick: (f) => {
        l.title = f.title.value;
        l.cards = [...f.querySelectorAll('[data-card]')].map((b) => ({ e: b.querySelector('[name=e]').value, h: b.querySelector('[name=h]').value, t: b.querySelector('[name=t]').value, ok: b.querySelector('[name=ok]').value, no: b.querySelector('[name=no]').value }));
        l.quiz = [...f.querySelectorAll('[data-q]')].map((b) => {
          const raw = [0, 1, 2, 3].map((k) => b.querySelector(`[name=a${k}]`).value.trim());
          const checked = b.querySelector('input[type=radio]:checked');
          const right = checked ? Number(checked.value) : 0;
          const a = raw.filter(Boolean);
          return { q: b.querySelector('[name=q]').value, a, c: Math.max(0, a.indexOf(raw[right])), why: b.querySelector('[name=why]').value };
        });
        if (l.quiz.some((x) => x.q.trim() && x.a.length < 2)) { toast('Har bir savolda kamida 2 ta javob bo\'lsin', 'warn'); return false; }
        return saveAcademy(c);
      } }] });
  const wire = () => form.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => b.closest('.pa-block').remove());
  form.querySelector('#pa-addcard').onclick = () => { form.querySelector('#pa-cards').insertAdjacentHTML('beforeend', cardRow({ e: '', h: '', t: '', ok: '', no: '' }, form.querySelectorAll('[data-card]').length)); wire(); };
  form.querySelector('#pa-addq').onclick = () => { const n = form.querySelectorAll('[data-q]').length; form.querySelector('#pa-quiz').insertAdjacentHTML('beforeend', quizRow({ q: '', a: [], c: 0, why: '' }, n, `n${Date.now()}`)); wire(); };
  wire();
}
