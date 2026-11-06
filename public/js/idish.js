'use strict';
/*
 * Disposable tableware shop ("Bir martalik idishlar"): the product card with packs, boxes and three prices,
 * the unit picker at the till, the customer picker and the stock summary. Prices come from public/js/units.js.
 */
const PACK_NAMES = () => ({ piece: t('dona'), pack: t('pachka'), box: t('karobka') });
const TIER_NAMES = () => ({ r: t('Chakana'), o: t('Optom'), b: t('Katta optom') });

// "42 karobka + 350 dona".
function stockLabel(d, pieces = d.stock) {
  if (pieces == null) return '∞';
  return Units.hasUnits(d) ? Units.stockText(d, pieces, PACK_NAMES()) : `${pieces} ${d.unit || t('dona')}`;
}
// "Karobka (1000)".
function unitTitle(d, u) {
  const n = PACK_NAMES()[u];
  const cap = n.charAt(0).toUpperCase() + n.slice(1);
  return u === 'piece' ? cap : `${cap} (${Units.mult(d, u)})`;
}
// The biggest unit a product is counted in (for stock warnings and costs typed by the box).
function bigUnit(d) { return Units.mult(d, 'box') ? 'box' : Units.mult(d, 'pack') ? 'pack' : 'piece'; }

// ---------- The till: which unit ----------
function pickUnit(d, tier) {
  return new Promise((resolve) => {
    const bigFrom = App.settings.big_box_from || 0;
    openModal({
      title: `${icon('package')} ${esc(d.name)} — ${t('qanchadan?')}`,
      body: `<p class="small muted" style="margin-top:0">${unitsLine(d)} · ${t('Omborda')}: <b>${esc(stockLabel(d))}</b></p>
        <div class="unit-pick">${Units.unitsOf(d).map((u) => `<button type="button" class="unit-opt" data-u="${u}"><b>${esc(unitTitle(d, u))}</b>
          <span class="num">${money(Units.price(d, u, tier))}</span></button>`).join('')}</div>
        <p class="small muted">${t('Narx')}: <b>${esc(TIER_NAMES()[tier])}</b>${bigFrom ? ` · ${t('{0} karobkadan katta optom narxi', bigFrom)}` : ''}</p>`,
      actions: [{ label: t('Bekor'), onClick: () => { resolve(null); } }],
      onMount: (f) => f.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { resolve(b.dataset.u); closeModal(); }),
    });
  });
}
function unitsLine(d) {
  const pm = Units.mult(d, 'pack');
  const bm = Units.mult(d, 'box');
  return [pm ? t('1 pachka = {0} dona', pm) : '', bm ? (pm && bm % pm === 0 ? t('1 karobka = {0} pachka ({1} dona)', bm / pm, bm) : t('1 karobka = {0} dona', bm)) : ''].filter(Boolean).join(' · ');
}

// ---------- The till: which customer ----------
function pickCustomer() {
  return new Promise((resolve) => {
    let rows = [];
    const form = openModal({
      title: `${icon('book-user')} ${t('Mijoz')}`,
      body: `<input type="search" name="cq" autocomplete="off" placeholder="${esc(t('Ism yoki telefon'))}">
        <div class="cust-list stack" style="gap:6px;margin-top:10px"></div>`,
      actions: [{ label: t('Bekor'), onClick: () => { resolve(null); } }],
    });
    const list = form.querySelector('.cust-list');
    const draw = () => {
      list.innerHTML = rows.length ? rows.map((c) => `<button type="button" class="cust-row" data-cid="${c.id}"><b>${esc(c.name)}</b>
          <span class="chip">${esc(TIER_NAMES()[c.price_tier] || TIER_NAMES().r)}</span><span class="small muted">${esc(c.phone || '')}</span>
          ${c.debt ? `<span class="small red">${t('qarz')} ${num(c.debt)}</span>` : ''}</button>`).join('')
        : `<p class="muted">${t('Topilmadi')}</p>`;
      list.querySelectorAll('[data-cid]').forEach((b) => b.onclick = () => { resolve(rows.find((c) => c.id === Number(b.dataset.cid))); closeModal(); });
    };
    let tm = null;
    const load = async () => { try { rows = (await GET(`/api/customers?q=${encodeURIComponent(form.cq.value.trim())}&limit=30`)).rows; draw(); } catch (e) { toastError(e); } };
    form.cq.oninput = () => { clearTimeout(tm); tm = setTimeout(load, 250); };
    load();
    setTimeout(() => form.cq.focus(), 50);
  });
}

// ---------- Product card ----------
function idishDishForm(d, categories, suppliers) {
  const tiers = Units.parseTiers(d);
  const bu = bigUnit(d);
  const bm = Units.mult(d, bu) || 1;
  const cell = (u, tr) => (u === 'piece' && tr === 'r'
    ? `<input type="number" name="price" min="0" value="${d.price ?? ''}" required>`
    : `<input type="number" data-t="${u}.${tr}" min="0" value="${(tiers[u] || {})[tr] || ''}" placeholder="${esc(t('avto'))}">`);
  return openModal({
    title: `${icon('package')} ${d.id ? esc(d.name) : t('Yangi mahsulot')}`, size: 'wide',
    body: `<div class="form-grid">
        <label class="field">${t('Nomi')}<input name="name" value="${esc(d.name || '')}" required placeholder="${esc(t('Stakan 250 ml'))}"></label>
        <label class="field">${t("Bo'lim")}<select name="category_id"><option value="">—</option>${categories.map((c) => `<option value="${c.id}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">${t('Material')}<input name="material" value="${esc(d.material || '')}" placeholder="${esc(t("Plastik, qog'oz, folga"))}"></label>
        <label class="field">${t('Rang / turi')}<input name="color" value="${esc(d.color || '')}" placeholder="${esc(t('Oq, qopqoqli'))}"></label>
        <label class="field">${t('Shtrix-kod')}<input name="barcode" value="${esc(d.barcode || '')}"></label>
        ${suppliers.length ? `<label class="field">${t('Yetkazib beruvchi')}<select name="supplier_id"><option value="">—</option>${suppliers.map((s) => `<option value="${s.id}" ${d.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <h3 style="margin:18px 0 8px">${icon('package', 18)} ${t("O'lchov birliklari")}</h3>
      <div class="unit-rows">
        <label class="unit-row">${t('1 pachka =')} <input type="number" name="pack_size" min="0" value="${d.pack_size || ''}" placeholder="—"> ${t('dona')}</label>
        <label class="unit-row">${t('1 karobka =')} <input type="number" name="box_size" min="0" value="${d.box_size || ''}" placeholder="—"> ${t('dona')} <span class="small muted" id="box-hint"></span></label>
      </div>
      <p class="small muted">${t("Pachkasi bo'lmasa bo'sh qoldiring. Omborda hammasi donada hisoblanadi.")}</p>
      <h3 style="margin:18px 0 8px">${icon('coins', 18)} ${t('Narxlar')}</h3>
      <div class="table-wrap"><table class="price-grid"><tr><th></th><th class="right">${t('Tannarx')}</th><th class="right">${t('Chakana')}</th><th class="right">${t('Optom')}</th><th class="right">${t('Katta optom')}</th></tr>
        ${Units.UNITS.map((u) => `<tr data-row="${u}"><td><b>${esc(PACK_NAMES()[u])}</b></td><td class="right num muted" data-cost="${u}"></td>${Units.TIERS.map((tr) => `<td>${cell(u, tr)}</td>`).join('')}</tr>`).join('')}
      </table></div>
      <p class="small muted" id="price-hint"></p>
      <div class="note-box" id="margin-box"></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field" id="cost-l">${t('Tannarx (1 karobka)')}<input type="number" name="cost_big" min="0" value="${d.cost ? Math.round(d.cost * bm) : ''}"></label>
        <label class="field" id="min-l">${t('Kam qolsa ogohlantirish (karobka)')}<input type="number" name="min_big" min="0" value="${d.min_stock != null ? Math.round(d.min_stock / bm) : ''}"></label>
        <label class="field">${t("Qoldiq (bo'sh = hisoblanmaydi)")}<input type="number" name="stock_big" min="0" value="${d.stock != null ? Math.floor(d.stock / bm) : ''}" data-unit-hint></label>
        <label class="field" id="rest-l">${t('+ dona')}<input type="number" name="stock_rest" min="0" value="${d.stock != null ? d.stock - Math.floor(d.stock / bm) * bm : ''}"></label>
      </div>
      <p class="small muted">${t('Tannarx har "Mol keldi"da o\'zi yangilanadi (yo\'lkira bilan).')}</p>`,
    onMount: (f) => {
      const cur = () => ({ ...d, price: Number(f.price.value) || 0, pack_size: Number(f.pack_size.value) || 0, box_size: Number(f.box_size.value) || 0, tiers: readTiers(f) });
      const draw = () => {
        const x = cur();
        const big = bigUnit(x);
        const m = Units.mult(x, big) || 1;
        const name = PACK_NAMES()[big];
        f.querySelector('#cost-l').firstChild.textContent = `${t('Tannarx')} (1 ${name})`;
        f.querySelector('#min-l').firstChild.textContent = `${t('Kam qolsa ogohlantirish')} (${name})`;
        f.querySelector('[data-unit-hint]').previousSibling.textContent = `${t('Qoldiq')} (${name})`;
        // Only pieces (no pack, no box): one stock field and a plain price hint.
        f.querySelector('#rest-l').hidden = big === 'piece';
        f.querySelector('#price-hint').textContent = big === 'piece'
          ? t("Optom yoki katta optom bo'sh qolsa — chakana narxi olinadi.")
          : t("Bo'sh qolgan narx karobka narxidan o'zi bo'linadi; katta optom bo'lmasa — optom narxi olinadi.");
        f.querySelector('#box-hint').textContent = x.box_size && x.pack_size && x.box_size % x.pack_size === 0 ? `= ${t('{0} pachka', x.box_size / x.pack_size)}` : '';
        const piece = (Number(f.cost_big.value) || 0) / m;
        for (const u of Units.UNITS) {
          const um = Units.mult(x, u);
          f.querySelector(`[data-row="${u}"]`).hidden = !um;
          f.querySelector(`[data-cost="${u}"]`).textContent = um && piece ? num(Math.round(piece * um)) : '—';
          // The automatic price shows as the field's hint.
          for (const tr of Units.TIERS) {
            const inp = f.querySelector(`[data-t="${u}.${tr}"]`);
            if (!inp || !um) continue;
            const auto = Units.price({ ...x, tiers: { ...x.tiers, [u]: { ...(x.tiers[u] || {}), [tr]: 0 } } }, u, tr);
            inp.placeholder = auto ? num(auto) : t('avto');
          }
        }
        const bc = piece * m;
        f.querySelector('#margin-box').innerHTML = bc ? `${t('1 {0}dan foyda', name)}: ${Units.TIERS.map((tr) => {
          const p = Units.price(x, big, tr);
          return `${esc(TIER_NAMES()[tr])} <b class="${p >= bc ? 'green-text' : 'red'}">${p >= bc ? '+' : ''}${num(Math.round(p - bc))}</b> (${p ? Math.round(((p - bc) / p) * 100) : 0}%)`;
        }).join(' · ')}` : '';
      };
      f.addEventListener('input', draw);
      draw();
    },
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const x = formData(f);
      const pack = Number(x.pack_size) || 0;
      const box = Number(x.box_size) || 0;
      const probe = { pack_size: pack, box_size: box };
      const m = Units.mult(probe, bigUnit(probe)) || 1;
      const body = {
        name: x.name, category_id: x.category_id ? Number(x.category_id) : null, material: x.material, color: x.color, barcode: x.barcode,
        supplier_id: x.supplier_id ? Number(x.supplier_id) : null, price: Number(x.price) || 0, pack_size: pack, box_size: box, tiers: readTiers(f),
        cost: x.cost_big === '' ? 0 : Math.round(((Number(x.cost_big) || 0) / m) * 100) / 100,
        min_stock: x.min_big === '' ? null : Math.round(Number(x.min_big) * m),
        stock: x.stock_big === '' && x.stock_rest === '' ? null : (Number(x.stock_big) || 0) * m + (Number(x.stock_rest) || 0),
        unit: 'dona', needs_kitchen: false, prep_minutes: 0, icon: d.icon || ((categories.find((c) => c.id === Number(x.category_id)) || {}).icon || '📦'),
      };
      if (d.id) await PUT(`/api/dishes/${d.id}`, body); else await POST('/api/dishes', body);
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}
function readTiers(f) {
  const out = {};
  f.querySelectorAll('[data-t]').forEach((i) => {
    const [u, tr] = i.dataset.t.split('.');
    if (i.value !== '') (out[u] = out[u] || {})[tr] = Number(i.value);
  });
  return out;
}

// ---------- Stock summary (the goods screen) ----------
function idishStockKpis(dishes) {
  const counted = dishes.filter((d) => d.stock != null);
  const atCost = counted.reduce((s, d) => s + Math.max(0, d.stock) * (d.cost || 0), 0);
  // What the shelf would bring at the retail box (or pack, or piece) price.
  const atPrice = counted.reduce((s, d) => { const u = bigUnit(d); const m = Units.mult(d, u) || 1; return s + (Math.max(0, d.stock) / m) * Units.price(d, u, 'r'); }, 0);
  const out = counted.filter((d) => d.stock <= 0).length;
  const low = counted.filter((d) => d.stock > 0 && d.min_stock != null && d.stock <= d.min_stock).length;
  return `<div class="kpis">
    ${kpi(`${t('Ombordagi mol')} ${tip(t("Hozir omborda turgan hamma mol, kelish narxida (tannarx)."))}`, money(Math.round(atCost)), '', '', 'warehouse')}
    ${kpi(`${t('Sotsa tushadigan pul')} ${tip(t('Shu mollar chakana narxda sotilsa tushadigan pul.'))}`, money(Math.round(atPrice)), atCost ? `+${money(Math.round(atPrice - atCost))}` : '', 'good', 'coins')}
    ${kpi(t('Kam qolgan'), `${low} ${t('ta')}`, '', low ? 'warn' : '', 'triangle-alert')}
    ${kpi(t('Tugagan'), `${out} ${t('ta')}`, '', out ? 'bad' : '', 'ban')}</div>`;
}
