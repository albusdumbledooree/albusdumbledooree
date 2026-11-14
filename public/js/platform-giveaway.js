'use strict';
/* Platform: the "Konkurs" bot — a giveaway bot anyone can use in their Telegram channel. Only the platform sees it. */
const PG = { data: null, q: '' };

async function loadGiveaway() { PG.data = await GET(`/api/platform/giveaway?${new URLSearchParams({ q: PG.q })}`); }

const GW_STATUS = { active: ['davom etmoqda', 'green'], drawing: ['tanlanmoqda', 'orange'], done: ['tugadi', ''], cancelled: ['bekor qilingan', 'red'] };
function gwPerson(o) { return `${esc(o.name || '—')}${o.username ? ` <span class="small muted">@${esc(o.username)}</span>` : ''}`; }

function giveawayHtml() {
  const G = PG.data;
  if (!G) return `<div class="card">${emptyState('gift', 'Yuklanmoqda…')}</div>`;
  const S = G.stats;
  const bot = G.configured
    ? `<div class="row" style="flex-wrap:wrap;gap:10px;align-items:center"><div class="grow"><b>${icon('send', 16)} <a href="https://t.me/${esc(G.bot)}" target="_blank" rel="noopener">@${esc(G.bot)}</a></b>
          <div class="small ${G.error ? 'red-text' : 'muted'}">${G.error ? `${icon('triangle-alert', 13)} ${esc(G.error)}` : G.polling ? "Ishlayapti — hamma foydalana oladi" : "To'xtagan"}</div></div>
        <button class="btn sm" id="pg-token">${icon('key-round', 15)} Tokenni almashtirish</button>
        <button class="btn sm red-text" id="pg-unlink">${icon('x', 15)} Uzish</button></div>
      <div class="switch-row" style="margin-top:6px"><div class="grow"><b>Yangi konkurslar ochiq</b><span class="small muted">O'chirilsa, odamlar yangi konkurs ocha olmaydi. Boshlanganlari oxirigacha davom etadi.</span></div>
        <label class="switch"><input type="checkbox" id="pg-open" ${G.closed ? '' : 'checked'}><span></span></label></div>
      <p class="small muted" style="margin:6px 0 0">Cheklovlar: bir odamga bir vaqtda ${G.limits.active} ta, kuniga ${G.limits.per_day} ta konkurs, eng uzog'i ${G.limits.days} kun. Har postda bot havolasi turadi.</p>`
    : `<p style="margin-top:0"><b>${icon('gift', 16)} Konkurs botini ulang</b></p>
      <ol class="small" style="padding-left:18px;line-height:1.7;margin:0 0 10px">
        <li>Telegram'da <b>@BotFather</b> ga <code>/newbot</code> yozing, botga nom bering.</li>
        <li>U bergan <b>tokenni</b> shu yerga joylang va "Saqlash" ni bosing.</li>
        <li>Botni kanalingizga admin qiling — keyin istalgan odam o'z kanalida konkurs ocha oladi.</li></ol>
      <button class="btn primary" id="pg-token">${icon('key-round', 16)} Tokenni kiritish</button>`;
  const rows = G.contests.map((c) => {
    const [label, tone] = GW_STATUS[c.status] || [c.status, ''];
    const result = c.status === 'done' ? (c.winners.length ? c.winners.map((w) => `🏆 ${esc(w.name)}${w.username ? ` @${esc(w.username)}` : ''} <span class="muted">№${w.no}</span>`).join('<br>') : '<span class="muted">g\'olib yo\'q</span>')
      : c.status === 'active' ? `<span class="small muted">natija ${fmtDateTime(c.ends_at)}</span>` : '';
    return `<tr><td class="small muted">#${c.id}</td>
      <td>${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener"><b>${esc(c.channel.title)}</b></a>` : `<b>${esc(c.channel.title)}</b>`}${c.channel.username ? `<br><span class="small muted">@${esc(c.channel.username)}</span>` : ''}</td>
      <td>${gwPerson(c.owner)}${c.owner.banned ? ' <span class="chip red">bloklangan</span>' : ''}</td>
      <td class="small" style="min-width:200px;max-width:260px">${esc(c.text)}</td>
      <td class="right"><b>${c.participants}</b><br><span class="small muted">${c.winners_n} g'olib</span></td>
      <td><span class="chip ${tone}">${label}</span><div style="margin-top:4px">${result}</div></td>
      <td class="actions"><button class="btn sm" data-pgp="${c.id}" title="Ishtirokchilar">${icon('users', 15)}</button>
        ${c.status === 'active' ? `<button class="btn sm" data-pgf="${c.id}" title="Hozir yakunlash">${icon('trophy', 15)}</button><button class="btn sm red-text" data-pgx="${c.id}" title="Bekor qilish">${icon('x', 15)}</button>` : ''}
        <button class="btn sm ${c.owner.banned ? '' : 'red-text'}" data-pgb="${esc(c.owner.tg_id)}" data-ban="${c.owner.banned ? '0' : '1'}" title="${c.owner.banned ? 'Blokdan chiqarish' : 'Tashkilotchini bloklash'}">${icon(c.owner.banned ? 'lock-open' : 'ban', 15)}</button></td></tr>`;
  }).join('');
  return `<div class="kpis">
      ${kpiP('Foydalanuvchilar', S.users, `${S.organisers} tashkilotchi`, 'users')}
      ${kpiP('Faol konkurslar', S.active, `${S.done} tasi tugagan`, 'gift', S.active ? 'good' : '')}
      ${kpiP('Ishtirokchilar', S.participants, 'barcha konkurslarda', 'hand')}
      ${kpiP('Kanallar', S.channels, '', 'send')}
    </div>
    <div class="card" style="margin-bottom:14px">${bot}</div>
    <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:10px"><b class="grow">${icon('trophy', 16)} Konkurslar</b>
        <input type="search" id="pg-q" placeholder="Kanal, tashkilotchi yoki matn" value="${esc(PG.q)}" style="max-width:300px"></div>
      ${rows ? `<div class="table-wrap"><table><tr><th>#</th><th>Kanal</th><th>Tashkilotchi</th><th>Matn</th><th class="right">Ishtirokchi</th><th>Holat</th><th></th></tr>${rows}</table></div>`
        : `<p class="small muted">${PG.q ? 'Hech narsa topilmadi.' : "Hali konkurs yo'q. Botga istalgan odam yozib, o'z kanalida konkurs ochishi mumkin."}</p>`}</div>
    ${G.banned.length ? `<div class="card" style="margin-top:14px"><b>${icon('ban', 16)} Bloklanganlar</b>
      <div class="stack" style="margin-top:8px">${G.banned.map((u) => `<div class="row" style="gap:8px"><span class="grow">${gwPerson(u)}</span><button class="btn sm" data-pgb="${esc(u.tg_id)}" data-ban="0">${icon('lock-open', 15)} Blokdan chiqarish</button></div>`).join('')}</div></div>` : ''}`;
}

function giveawayTokenDialog() {
  openModal({
    title: `${icon('key-round')} Konkurs boti tokeni`,
    body: `<p class="small muted" style="margin-top:0">@BotFather bergan to'liq qatorni joylang. Token faqat serverda saqlanadi. Arizalar va to'lov botlaridan boshqa, alohida bot bo'lsin.</p>
      <label class="field">Bot tokeni<input name="token" autocomplete="off" spellcheck="false" placeholder="7012345678:AAH…"></label>`,
    actions: [{ label: 'Bekor' }, { label: 'Saqlash', cls: 'primary', icon: 'check', onClick: async (f) => {
      await PUT('/api/platform/giveaway', { token: f.token.value.trim() });
      toast('Bot ulandi', 'ok'); await loadGiveaway(); render();
    } }],
  });
}

async function giveawayParticipants(id) {
  const r = await GET(`/api/platform/giveaway/contests/${id}/participants`);
  openModal({
    title: `${icon('users')} Konkurs #${id} — ${r.rows.length} ishtirokchi`, size: 'wide',
    body: r.rows.length ? `<div class="table-wrap"><table><tr><th>№</th><th>Ism</th><th>Qachon</th></tr>${r.rows.map((p) => `<tr><td>${p.no}</td><td>${gwPerson(p)}</td><td class="small muted">${fmtDateTime(p.joined_at)}</td></tr>`).join('')}</table></div>`
      : `<p class="muted">Hali hech kim qatnashmadi.</p>`,
    actions: [{ label: 'Yopish' }],
  });
}

function bindGiveaway(root) {
  const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText, 'ok'); } catch (e) { toastError(e); } await loadGiveaway(); render(); };
  const tk = root.querySelector('#pg-token'); if (tk) tk.onclick = giveawayTokenDialog;
  const ul = root.querySelector('#pg-unlink');
  if (ul) ul.onclick = async () => { if (await confirmModal('Botni uzish', "Bot ishlashdan to'xtaydi. Konkurslar va ishtirokchilar ro'yxati saqlanadi.", 'Uzish')) act(() => DEL('/api/platform/giveaway'), 'Uzildi'); };
  const op = root.querySelector('#pg-open'); if (op) op.onchange = () => act(() => PUT('/api/platform/giveaway/open', { open: op.checked }), 'Saqlandi');
  const s = root.querySelector('#pg-q');
  let timer = null;
  if (s) s.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { PG.q = s.value; await loadGiveaway(); render(); const n = document.getElementById('pg-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
  root.querySelectorAll('[data-pgp]').forEach((b) => b.onclick = () => giveawayParticipants(b.dataset.pgp).catch(toastError));
  root.querySelectorAll('[data-pgf]').forEach((b) => b.onclick = async () => {
    if (await confirmModal('Hozir yakunlash', "G'olib hozir tasodifiy tanlanadi va kanalga e'lon qilinadi.", 'Yakunlash', 'primary')) act(() => POST(`/api/platform/giveaway/contests/${b.dataset.pgf}/finish`), "G'olib e'lon qilindi");
  });
  root.querySelectorAll('[data-pgx]').forEach((b) => b.onclick = async () => {
    if (await confirmModal('Konkursni bekor qilish', "Kanaldagi tugma \"bekor qilindi\" bo'ladi, g'olib tanlanmaydi. Tashkilotchiga xabar boradi.", 'Bekor qilish')) act(() => POST(`/api/platform/giveaway/contests/${b.dataset.pgx}/cancel`), 'Bekor qilindi');
  });
  root.querySelectorAll('[data-pgb]').forEach((b) => b.onclick = async () => {
    const ban = b.dataset.ban === '1';
    if (ban && !(await confirmModal('Bloklash', "Bu odam yangi konkurs ocha olmaydi. Boshlangan konkurslarini alohida bekor qilishingiz mumkin.", 'Bloklash'))) return;
    act(() => PUT(`/api/platform/giveaway/users/${b.dataset.pgb}`, { banned: ban }), ban ? 'Bloklandi' : 'Blokdan chiqarildi');
  });
}
