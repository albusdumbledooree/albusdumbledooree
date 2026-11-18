'use strict';
/* Platform: the shared catalog — ready dishes (with photo and MXIK code) and the barcode base shops fill in. */
const PCAT = { data: null, kind: 'dishes', q: '' };

async function loadCatalog() { PCAT.data = await GET(`/api/platform/catalog?${new URLSearchParams({ kind: PCAT.kind, q: PCAT.q })}`); }

function catalogHtml() {
  const C = PCAT.data;
  if (!C) return `<div class="card">${emptyState('book-open', 'Yuklanmoqda…')}</div>`;
  const S = C.stats;
  const thumb = (r) => `<span class="pc-thumb">${r.photo ? `<img src="${esc(r.photo)}" alt="">` : esc(r.emoji || (C.kind === 'dishes' ? '🍽️' : '📦'))}</span>`;
  const mx = (v) => (v ? `<code>${esc(v)}</code>` : '<span class="chip orange">kiritilmagan</span>');
  let table = '';
  if (C.kind === 'dishes') {
    table = C.rows.length ? `<div class="table-wrap"><table><tr><th></th><th>Nomi</th><th>Bo'lim</th><th>MXIK kodi</th><th class="right">Ishlatadi</th><th></th></tr>
      ${C.rows.map((r) => `<tr><td>${thumb(r)}</td><td><b>${esc(r.name)}</b><br><span class="small muted">${r.prep_minutes ? `${r.prep_minutes} daq` : 'tayyor'}${r.kitchen ? ' · oshxona' : ''}</span></td>
        <td>${esc(r.category || '—')}</td><td class="small">${mx(r.mxik)}</td><td class="right small muted">${r.uses} biznes</td>
        <td class="actions"><button class="btn sm" data-pcd="${r.id}" title="Tahrirlash">${icon('pencil', 15)}</button></td></tr>`).join('')}</table></div>`
      : `<p class="small muted">Hech narsa topilmadi.</p>`;
  } else {
    const pending = C.kind === 'pending';
    table = C.rows.length ? `<div class="table-wrap"><table><tr><th>Shtrix-kod</th><th>Nomi</th><th>Bo'lim</th>${pending ? '<th>Kim yubordi</th>' : '<th>MXIK</th>'}<th class="right">Do'konlar</th><th></th></tr>
      ${C.rows.map((r) => `<tr><td><code>${esc(r.barcode)}</code></td><td><b>${esc(r.emoji || '')} ${esc(r.name)}</b>${r.names.length ? `<br><span class="small muted">boshqa nomlar: ${r.names.map(esc).join(', ')}</span>` : ''}</td>
        <td>${esc(r.category || '—')}</td><td class="small">${pending ? esc(r.from || '—') : mx(r.mxik)}</td><td class="right">${r.shops}</td>
        <td class="actions">${pending ? `<button class="btn sm ok" data-pga="${esc(r.barcode)}" title="Tasdiqlash">${icon('check', 15)}</button>` : ''}
          <button class="btn sm" data-pge="${esc(r.barcode)}" title="Tahrirlash">${icon('pencil', 15)}</button>
          ${pending ? `<button class="btn sm red-text" data-pgr="${esc(r.barcode)}" title="Rad etish">${icon('x', 15)}</button>` : `<button class="btn sm red-text" data-pgd="${esc(r.barcode)}" title="O'chirish">${icon('trash-2', 15)}</button>`}</td></tr>`).join('')}</table></div>`
      : `<p class="small muted">${pending ? "Tekshirish kutayotgan tovar yo'q. Do'konlar yangi tovarni shtrix-kod bilan saqlaganda nomi shu yerga keladi." : "Hali tasdiqlangan tovar yo'q."}</p>`;
  }
  return `<div class="kpis">
      ${kpiP('Taomlar katalogi', S.dishes, `${S.sections} bo'lim`, 'book-open')}
      ${kpiP('Shtrix-kod bazasi', S.goods, 'tasdiqlangan tovar', 'scan-barcode')}
      ${kpiP('Tekshirish kutmoqda', S.pending, "do'konlardan kelgan nomlar", 'clock', S.pending ? 'warn' : '')}
      ${kpiP('MXIK kodi bor', `${S.mxik_pct}%`, 'taomlar katalogida', 'shield-check')}
    </div>
    <div class="card"><div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <div class="seg">${[['dishes', 'Taomlar'], ['goods', 'Shtrix-kodlar'], ['pending', `Tekshirish${S.pending ? ` (${S.pending})` : ''}`]].map(([k, n]) => `<button class="${PCAT.kind === k ? 'active' : ''}" data-pck="${k}">${n}</button>`).join('')}</div>
        <span class="grow"></span><input type="search" id="pc-q" placeholder="Qidirish" value="${esc(PCAT.q)}" style="max-width:240px">
        ${C.kind === 'dishes' ? `<button class="btn primary" id="pc-add">${icon('plus', 16)} Taom</button>` : ''}</div>
      ${table}
      <p class="small muted" style="margin-top:10px">${C.kind === 'dishes'
    ? "Bizneslar Menyu → \"Tayyor katalog\" orqali taom tanlab, faqat narxini yozadi. Rasm qo'shsangiz, ularning menyusiga (va QR-menyuga) ham tushadi."
    : "Do'konlar faqat shtrix-kod va nomni yuboradi — narx, qoldiq va sotuvlar kelmaydi. Tasdiqlangan nom keyin boshqa do'kon skanerlaganda o'zi chiqadi."}
        MXIK kodlarini tasnif.soliq.uz dan tekshirib kiriting (17 raqam).</p></div>`;
}

function catalogDishDialog(r = {}) {
  let photo; // undefined: unchanged, '' removed, data URL new
  openModal({
    title: `${icon('book-open')} ${r.id ? esc(r.name) : 'Yangi taom'}`,
    body: `<div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap"><div class="pc-photo" id="pc-prev">${r.photo ? `<img src="${esc(r.photo)}" alt="">` : esc(r.emoji || '🍽️')}</div>
        <div class="stack" style="gap:6px"><label class="btn sm">${icon('image', 16)} Rasm tanlash<input type="file" accept="image/*" id="pc-file" hidden></label>
          <button type="button" class="btn sm" id="pc-del" ${r.photo ? '' : 'hidden'}>${icon('x', 16)} Rasmni olib tashlash</button>
          <span class="small muted">Kvadrat, yorug' rasm yaxshi chiqadi.</span></div></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field">Nomi<input name="name" value="${esc(r.name || '')}" required maxlength="80"></label>
        <label class="field">Bo'lim<input name="category" value="${esc(r.category || '')}" list="pc-secs" maxlength="60"></label>
        <label class="field">Belgi (emoji)<input name="emoji" value="${esc(r.emoji || '')}" maxlength="8"></label>
        <label class="field">Tayyorlash vaqti (daq)<input type="number" name="prep_minutes" min="0" value="${r.prep_minutes != null ? r.prep_minutes : 10}"></label>
        <label class="field">MXIK kodi<input name="mxik" value="${esc(r.mxik || '')}" inputmode="numeric" placeholder="17 raqam"></label></div>
      <datalist id="pc-secs">${((PCAT.data && PCAT.data.sections) || []).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="kitchen" ${r.kitchen === false ? '' : 'checked'}> Oshxonada tayyorlanadi</label>`,
    onMount: (f) => {
      const prev = f.querySelector('#pc-prev'); const del = f.querySelector('#pc-del');
      f.querySelector('#pc-file').onchange = async (e) => {
        const fl = e.target.files[0]; if (!fl) return;
        try { photo = await imageToDataUrl(fl, 600, 'image/jpeg'); prev.innerHTML = `<img src="${photo}" alt="">`; del.hidden = false; } catch (err) { toastError(err); }
      };
      del.onclick = () => { photo = ''; prev.textContent = f.emoji.value || '🍽️'; del.hidden = true; };
    },
    actions: [...(r.id ? [{ label: "O'chirish", cls: 'danger', icon: 'trash-2', onClick: async () => {
      if (!(await confirmModal("Taomni o'chirish", "Katalogdan olib tashlansinmi? Bizneslar menyusidagi taomlar qoladi.", "O'chirish"))) return false;
      await DEL(`/api/platform/catalog/dishes/${r.id}`); await loadCatalog(); render();
    } }] : []), { label: 'Bekor' }, { label: 'Saqlash', cls: 'primary', icon: 'check', onClick: async (f) => {
      const d = { name: f.name.value, category: f.category.value, emoji: f.emoji.value, prep_minutes: f.prep_minutes.value, mxik: f.mxik.value, kitchen: f.kitchen.checked };
      if (photo !== undefined) d.photo = photo;
      if (r.id) await PUT(`/api/platform/catalog/dishes/${r.id}`, d); else await POST('/api/platform/catalog/dishes', d);
      toast('Saqlandi', 'ok'); await loadCatalog(); render();
    } }],
  });
}

function catalogGoodDialog(g) {
  openModal({
    title: `${icon('scan-barcode')} ${esc(g.barcode)}`,
    body: `<div class="form-grid"><label class="field">Nomi<input name="name" value="${esc(g.name)}" maxlength="80"></label>
      <label class="field">Bo'lim<input name="category" value="${esc(g.category || '')}" maxlength="60"></label>
      <label class="field">O'lchov<input name="unit" value="${esc(g.unit || 'dona')}" maxlength="20"></label>
      <label class="field">Belgi (emoji)<input name="emoji" value="${esc(g.emoji || '')}" maxlength="8"></label>
      <label class="field">MXIK kodi<input name="mxik" value="${esc(g.mxik || '')}" inputmode="numeric" placeholder="17 raqam"></label></div>
      ${g.names && g.names.length ? `<p class="small muted">Boshqa do'konlar yozgan nomlar: ${g.names.map(esc).join(', ')}</p>` : ''}`,
    actions: [{ label: 'Bekor' }, { label: g.status === 'pending' ? 'Saqlash va tasdiqlash' : 'Saqlash', cls: 'primary', icon: 'check', onClick: async (f) => {
      await PUT(`/api/platform/catalog/goods/${g.barcode}`, { name: f.name.value, category: f.category.value, unit: f.unit.value, emoji: f.emoji.value, mxik: f.mxik.value, status: 'ok' });
      toast('Saqlandi', 'ok'); await loadCatalog(); render();
    } }],
  });
}

function bindCatalog(root) {
  const re = async () => { try { await loadCatalog(); } catch (e) { toastError(e); } render(); };
  root.querySelectorAll('[data-pck]').forEach((b) => b.onclick = () => { PCAT.kind = b.dataset.pck; re(); });
  const s = root.querySelector('#pc-q');
  let timer = null;
  if (s) s.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { PCAT.q = s.value; await re(); const n = document.getElementById('pc-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
  const add = root.querySelector('#pc-add'); if (add) add.onclick = () => catalogDishDialog();
  const rowOf = (key, v) => PCAT.data.rows.find((r) => String(r[key]) === String(v));
  root.querySelectorAll('[data-pcd]').forEach((b) => b.onclick = () => catalogDishDialog(rowOf('id', b.dataset.pcd)));
  root.querySelectorAll('[data-pge]').forEach((b) => b.onclick = () => catalogGoodDialog(rowOf('barcode', b.dataset.pge)));
  root.querySelectorAll('[data-pga]').forEach((b) => b.onclick = async () => { try { await PUT(`/api/platform/catalog/goods/${b.dataset.pga}`, { status: 'ok' }); toast('Tasdiqlandi', 'ok'); } catch (e) { toastError(e); } re(); });
  root.querySelectorAll('[data-pgr]').forEach((b) => b.onclick = async () => { try { await PUT(`/api/platform/catalog/goods/${b.dataset.pgr}`, { status: 'rejected' }); toast('Rad etildi', 'ok'); } catch (e) { toastError(e); } re(); });
  root.querySelectorAll('[data-pgd]').forEach((b) => b.onclick = async () => {
    if (!(await confirmModal("Tovarni o'chirish", "Bazadan olib tashlansinmi? Do'konlardagi tovarlar qoladi.", "O'chirish"))) return;
    try { await DEL(`/api/platform/catalog/goods/${b.dataset.pgd}`); } catch (e) { toastError(e); } re();
  });
}
