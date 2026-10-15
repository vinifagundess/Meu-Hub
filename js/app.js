import { CONFIG } from './config.js';
import { state, persist, uid } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseBR = s => { s = String(s ?? '').replace(/[^\d.,-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? null : n; };
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';

/* ---------- Navegação ---------- */
function go(tab) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === tab));
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  history.replaceState(null, '', '#' + tab);
  window.scrollTo(0, 0);
  if (tab === 'home') renderHome();
  if (tab === 'news') loadNews();
  if (tab === 'wish') { renderWish(); refreshStale(); }
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', e => { const c = e.target.closest('[data-go]'); if (c) go(c.dataset.go); });

/* ---------- Financeiro ---------- */
const net = () => state.tx.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);
const balance = () => state.fin.initial + net(); // saldo = saldo inicial + entradas − saídas
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
let shown = null;
function countTo(el, to) {
  const from = shown ?? to, t0 = performance.now(); shown = to;
  const step = n => { const k = Math.min(1, (n - t0) / 450); el.textContent = brl(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderFin() {
  const sum = ty => state.tx.filter(t => t.type === ty).reduce((s, t) => s + t.amount, 0), b = balance();
  const el = $('#f-balance'); el.className = 'big' + (b < 0 ? ' neg' : ''); countTo(el, b);
  $('#f-initial').textContent = brl(state.fin.initial);
  $('#f-in').textContent = brl(sum('in')); $('#f-out').textContent = brl(sum('out'));
  $('#tx-list').innerHTML = state.tx.length ? state.tx.map(t => `
    <li><div>${esc(t.desc)}<small>${new Date(t.date).toLocaleDateString('pt-BR')} · ${t.type === 'in' ? 'Entrada' : 'Saída'}</small></div>
    <div><b class="${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.amount)}</b>
    <button data-del="${t.id}" aria-label="Excluir">×</button></div></li>`).join('')
    : '<li class="muted">Nenhuma transação ainda.</li>';
}
const typeNow = () => $('#tx-form input[name=type]:checked').value;
const syncBtn = () => { $('#tx-btn').textContent = typeNow() === 'in' ? 'Adicionar entrada' : 'Adicionar saída'; };
$('#tx-form').addEventListener('change', syncBtn);
$('#tx-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target), type = f.get('type'), amount = parseBR(f.get('amount'));
  if (!amount || amount <= 0) return toast('Digite um valor válido');
  state.tx.unshift({ id: uid(), type, desc: f.get('desc').trim(), amount, date: Date.now() });
  persist('tx'); e.target.reset();
  $(`#tx-form input[value=${type}]`).checked = true; syncBtn();
  renderFin(); toast(`${type === 'in' ? 'Entrada' : 'Saída'} de ${brl(amount)} adicionada`);
});
$('#tx-list').addEventListener('click', e => {
  const id = e.target.dataset.del; if (!id) return;
  state.tx = state.tx.filter(t => t.id !== id); persist('tx'); renderFin();
});
// "Ajustar saldo": você informa quanto tem HOJE e o app calcula o saldo inicial
$('#f-adjust').onclick = () => {
  const v = prompt('Qual é o seu saldo hoje? (R$)', balance().toFixed(2).replace('.', ','));
  const n = v === null ? null : parseBR(v); if (n === null) return;
  state.fin.initial = n - net(); persist('fin'); renderFin(); toast('Saldo ajustado');
};

/* ---------- Notas ---------- */
let editing = null;
const dlg = $('#note-dialog');
function renderNotes() {
  $('#notes-grid').innerHTML = state.notes.length ? state.notes.map(n =>
    `<div class="note" data-id="${n.id}"><h3>${esc(n.title || 'Sem título')}</h3><p>${esc(n.body)}</p></div>`).join('')
    : '<p class="muted">Nenhuma nota. Toque em + para criar.</p>';
}
function openNote(id) {
  editing = id; const n = state.notes.find(x => x.id === id);
  const f = $('#note-form'); f.title.value = n?.title || ''; f.body.value = n?.body || '';
  $('#note-del').style.display = n ? '' : 'none'; dlg.showModal();
}
$('#note-new').onclick = () => openNote(null);
$('#notes-grid').addEventListener('click', e => { const c = e.target.closest('.note'); if (c) openNote(c.dataset.id); });
$('#note-cancel').onclick = () => dlg.close();
$('#note-del').onclick = () => { state.notes = state.notes.filter(n => n.id !== editing); persist('notes'); dlg.close(); renderNotes(); };
$('#note-form').addEventListener('submit', () => {
  const f = $('#note-form'), title = f.title.value.trim(), body = f.body.value.trim();
  if (!title && !body) return;
  const n = state.notes.find(x => x.id === editing);
  if (n) Object.assign(n, { title, body, updated: Date.now() });
  else state.notes.unshift({ id: uid(), title, body, updated: Date.now() });
  state.notes.sort((a, b) => b.updated - a.updated);
  persist('notes'); renderNotes();
});

/* ---------- Wishlist ---------- */
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const gShop = t => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(t || '')}`;
async function fetchProduct(url) {
  const r = await fetch('/api/product?url=' + encodeURIComponent(url));
  if (!r.ok) throw new Error('api ' + r.status);
  return r.json();
}
function applyProduct(w, p) {
  w.title = p.title || w.title; w.image = p.image || w.image;
  const price = parseFloat(p.price);
  if (price && price !== w.price) { w.price = price; (w.history ||= []).push({ price, at: Date.now() }); }
  w.checked = Date.now();
}
function renderWish() {
  $('#wish-list').innerHTML = state.wish.length ? state.wish.map(w => {
    const first = w.history?.[0]?.price, d = first && w.price ? w.price - first : 0, tr = d < 0 ? 'Baixa' : d > 0 ? 'Alta' : '';
    return `<article class="wcard" data-id="${w.id}">
      <div class="wimg">${w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span>sem foto</span>'}</div>
      <div class="chipsrow"><span class="tag on">Acompanhando</span>${tr ? `<span class="tag ${d < 0 ? 'pos' : 'neg'}">${tr}</span>` : ''}</div>
      <h3>${esc(w.title || host(w.url))}</h3>
      <div class="price">${w.price ? brl(w.price) : '<button class="btn ghost sm" data-act="price">Definir preço</button>'}</div>
      ${tr ? `<p class="muted small">Preço inicial ${brl(first)}</p>` : ''}
      <p class="muted small">${esc(host(w.url))}</p>
      <div class="wlinks"><a href="${gShop(w.title)}" target="_blank" rel="noopener">Comparar</a><a href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener">Abrir URL</a></div>
      <div class="row"><button class="btn ghost sm" data-act="refresh">Atualizar</button><button class="btn ghost sm danger" data-act="del">Remover</button></div></article>`;
  }).join('') : '<p class="muted">Cole o link de um produto para começar.</p>';
}
let refreshing = false;
async function refreshStale() {
  if (refreshing) return; refreshing = true;
  for (const w of state.wish) {
    if (Date.now() - (w.checked || 0) < CONFIG.PRICE_REFRESH_MS) continue;
    try { applyProduct(w, await fetchProduct(w.url)); } catch { w.checked = Date.now(); }
    persist('wish'); renderWish();
  }
  refreshing = false;
}
$('#wish-form').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#wish-status'), url = new FormData(e.target).get('url').trim();
  const btn = e.target.querySelector('button'); btn.disabled = true; st.textContent = 'Buscando foto e preço…';
  const w = { id: uid(), url, history: [] };
  try { applyProduct(w, await fetchProduct(url)); st.textContent = w.price ? '' : 'Preço não encontrado nesse site. Toque em "Definir preço".'; }
  catch { st.textContent = 'Não consegui ler o link agora. Item salvo; toque em Atualizar para tentar de novo.'; }
  state.wish.unshift(w); persist('wish'); e.target.reset(); btn.disabled = false; renderWish();
});
$('#wish-list').addEventListener('click', async e => {
  const act = e.target.dataset.act, card = e.target.closest('[data-id]'); if (!act || !card) return;
  const w = state.wish.find(x => x.id === card.dataset.id);
  if (act === 'del') state.wish = state.wish.filter(x => x !== w);
  if (act === 'price') { const v = parseBR(prompt('Preço (R$):')); if (v) applyProduct(w, { price: v }); }
  if (act === 'refresh') { e.target.textContent = '…'; try { applyProduct(w, await fetchProduct(w.url)); } catch {} }
  persist('wish'); renderWish();
});

/* ---------- News ---------- */
const CATS = { politica: { label: 'Política' }, tech: { label: 'Tecnologia' }, entretenimento: { label: 'Entretenimento' }, mundo: { label: 'Mundo' }, x: { label: 'X' } };
let cat = 'politica', lastFetch = {}, notices = {};
$('#chips').innerHTML = Object.entries(CATS).map(([k, c]) => `<button data-cat="${k}" class="${k === cat ? 'on' : ''}">${c.label}</button>`).join('');
$('#chips').addEventListener('click', e => {
  const k = e.target.dataset.cat; if (!k) return; cat = k;
  $$('#chips button').forEach(b => b.classList.toggle('on', b.dataset.cat === k)); loadNews(true);
});
async function fetchNews(k) {
  const r = await fetch('/api/news?cat=' + k), d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erro ' + r.status);
  state.news[k] = d.articles || []; notices[k] = d.notice || ''; persist('news'); lastFetch[k] = Date.now();
}
const when = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
function renderNews() {
  const list = state.news[cat] || [];
  $('#news-list').innerHTML = list.map(a => a.tweetId
    ? `<a class="article tweet" href="${esc(safeUrl(a.url))}" data-tweet="${esc(a.tweetId)}"><div><p class="muted small"><b>𝕏</b> ${esc(a.source?.name)} · ${when(a.publishedAt)}</p><h3>${esc(a.title)}</h3></div></a>`
    : `<a class="article" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener">
      ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div><h3>${esc(a.title)}</h3><p class="muted small">${esc(a.source?.name)} · ${when(a.publishedAt)}</p></div></a>`).join('');
}
// Tweets: tenta abrir o app do X; se não abrir, cai para o navegador
$('#news-list').addEventListener('click', e => {
  const t = e.target.closest('[data-tweet]'); if (!t) return;
  e.preventDefault();
  location.href = 'twitter://status?id=' + t.dataset.tweet;
  setTimeout(() => { if (!document.hidden) window.open(t.href, '_blank', 'noopener'); }, 1200);
});
async function loadNews(force) {
  renderNews();
  if (!force && Date.now() - (lastFetch[cat] || 0) < CONFIG.NEWS_REFRESH_MS) return;
  const st = $('#news-status'); st.textContent = 'Atualizando…';
  try { await fetchNews(cat); st.textContent = notices[cat] || (state.news[cat].length ? '' : 'Nada por aqui agora.'); renderNews(); }
  catch (err) { st.textContent = err.message + (state.news[cat] ? ' (mostrando última versão salva)' : ''); }
}
setInterval(() => { if (!document.hidden && $('#news').classList.contains('active')) loadNews(); }, CONFIG.NEWS_REFRESH_MS);

/* ---------- Início ---------- */
let carTimer, lastTouch = 0;
function renderCarousel() {
  clearInterval(carTimer);
  const el = $('#h-carousel'), dots = $('#h-dots'), list = state.notes.slice(0, 8);
  el.innerHTML = list.length ? list.map(n => `<div class="slide" data-go="notes"><h3>${esc(n.title || 'Sem título')}</h3><p>${esc(n.body)}</p></div>`).join('')
    : '<div class="slide" data-go="notes"><h3>Sem anotações</h3><p>Toque para criar sua primeira nota.</p></div>';
  dots.innerHTML = list.length > 1 ? list.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('') : '';
  el.scrollLeft = 0;
  if (list.length < 2) return;
  const step = () => el.children[1].offsetLeft - el.children[0].offsetLeft;
  el.onscroll = () => { const i = Math.round(el.scrollLeft / step()); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); };
  el.onpointerdown = el.ontouchstart = () => { lastTouch = Date.now(); };
  carTimer = setInterval(() => {
    if (document.hidden || !$('#home').classList.contains('active') || Date.now() - lastTouch < 6000) return;
    const i = (Math.round(el.scrollLeft / step()) + 1) % list.length;
    el.scrollTo({ left: i * step(), behavior: 'smooth' });
  }, 4000);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function renderWeek() {
  const now = new Date(), start = new Date(now); start.setDate(now.getDate() - now.getDay());
  $('#wk-month').textContent = cap(now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  $('#wk-today').textContent = cap(now.toLocaleDateString('pt-BR', { weekday: 'long' })) + ', ' + now.getDate();
  $('#wk-days').innerHTML = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return `<div class="wd${d.toDateString() === now.toDateString() ? ' today' : ''}"><span>${l}</span><b>${d.getDate()}</b></div>`;
  }).join('');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderWeek(); });
async function renderHome() {
  renderWeek();
  const sum = ty => state.tx.filter(t => t.type === ty).reduce((s, t) => s + t.amount, 0);
  $('#h-balance').textContent = brl(balance());
  $('#h-in').textContent = brl(sum('in')); $('#h-out').textContent = brl(sum('out'));
  $('#h-n-count').textContent = state.notes.length;
  $('#h-w-count').textContent = state.wish.length;
  $('#h-w-total').textContent = brl(state.wish.reduce((s, w) => s + (w.price || 0), 0));
  $('#h-tx').innerHTML = state.tx.slice(0, 3).map(t => `<li><div>${esc(t.desc)}<small>${new Date(t.date).toLocaleDateString('pt-BR')}</small></div>
    <b class="${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.amount)}</b></li>`).join('') || '<li class="muted">Sem movimentações ainda.</li>';
  renderCarousel();
  const show = () => {
    const a = (state.news[cat] || Object.values(state.news).find(l => l?.length) || [])[0];
    $('#h-news').textContent = a ? a.title : 'Abra a aba News para carregar.';
    $('#h-news-src').textContent = a ? a.source?.name || '' : '';
    $('#h-news-card').onclick = () => a ? window.open(safeUrl(a.url), '_blank', 'noopener') : go('news');
  };
  show();
  if (!state.news[cat]?.length) { try { await fetchNews(cat); show(); } catch {} }
}

/* ---------- Init ---------- */
renderFin(); renderNotes(); renderWish();
go(location.hash.slice(1) && $('#' + location.hash.slice(1)) ? location.hash.slice(1) : 'home');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
