import { CONFIG } from './config.js';
import { state, persist, uid } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';

/* ---------- Navegação ---------- */
function go(tab) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === tab));
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  history.replaceState(null, '', '#' + tab);
  window.scrollTo(0, 0);
  if (tab === 'home') renderHome();
  if (tab === 'news') loadNews();
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', e => { const c = e.target.closest('[data-go]'); if (c) go(c.dataset.go); });

/* ---------- Financeiro ---------- */
const balance = () => state.tx.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);
function renderFin() {
  const sum = ty => state.tx.filter(t => t.type === ty).reduce((s, t) => s + t.amount, 0);
  $('#f-balance').textContent = brl(balance());
  $('#f-in').textContent = brl(sum('in')); $('#f-out').textContent = brl(sum('out'));
  $('#tx-list').innerHTML = state.tx.length ? state.tx.map(t => `
    <li><div>${esc(t.desc)}<small>${new Date(t.date).toLocaleDateString('pt-BR')}</small></div>
    <div><b class="${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.amount)}</b>
    <button data-del="${t.id}" aria-label="Excluir">×</button></div></li>`).join('')
    : '<p class="muted">Nenhuma transação. Adicione a primeira acima.</p>';
}
$('#tx-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.tx.unshift({ id: uid(), type: f.get('type'), desc: f.get('desc').trim(), amount: parseFloat(f.get('amount')), date: Date.now() });
  persist('tx'); e.target.reset(); renderFin();
});
$('#tx-list').addEventListener('click', e => {
  const id = e.target.dataset.del; if (!id) return;
  state.tx = state.tx.filter(t => t.id !== id); persist('tx'); renderFin();
});

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
async function fetchProduct(url) {
  // 1) Seu backend (preço real + lojas). 2) Fallback: metadados via Microlink.
  if (CONFIG.PRICE_API) {
    const r = await fetch(CONFIG.PRICE_API + (CONFIG.PRICE_API.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url));
    if (r.ok) return await r.json();
  }
  const r = await fetch(CONFIG.METADATA_API + encodeURIComponent(url));
  const d = (await r.json()).data || {};
  return { title: d.title, image: d.image?.url || d.logo?.url, price: d.price?.amount ?? null, offers: [] };
}
const searchLinks = t => { const q = encodeURIComponent(t); return [
  ['Google Shopping', `https://www.google.com/search?tbm=shop&q=${q}`],
  ['Buscapé', `https://www.buscape.com.br/search?q=${q}`],
  ['Zoom', `https://www.zoom.com.br/search?q=${q}`]]; };
function renderWish() {
  $('#wish-list').innerHTML = state.wish.length ? state.wish.map(w => {
    const hist = w.history || [], first = hist[0]?.price, drop = first && w.price && w.price < first;
    return `<div class="card" data-id="${w.id}"><div class="wish">
      ${w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy">` : '<img alt="">'}
      <div><h3>${esc(w.title || w.url)}</h3>
      <div class="price">${w.price ? brl(w.price) : '<button class="btn ghost sm" data-act="price">Definir preço</button>'}</div>
      ${drop ? `<small class="pos">↓ ${brl(first - w.price)} abaixo do preço inicial</small>` : ''}</div></div>
      ${(w.offers || []).length ? `<div class="offers">${w.offers.map(o => `<div class="split"><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener">${esc(o.store)}</a><b>${brl(o.price)}</b></div>`).join('')}</div>` : ''}
      <div class="row"><a class="btn ghost sm" href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener">Abrir</a>
      <button class="btn ghost sm" data-act="refresh">Atualizar</button>
      ${searchLinks(w.title || '').map(([n, u]) => `<a class="btn ghost sm" href="${u}" target="_blank" rel="noopener">${n}</a>`).join('')}
      <button class="btn ghost sm danger" data-act="del">Remover</button></div></div>`;
  }).join('') : '<p class="muted">Cole o link de um produto para começar.</p>';
}
function applyProduct(w, p) {
  w.title = p.title || w.title; w.image = p.image || w.image; w.offers = p.offers || [];
  const price = parseFloat(p.price);
  if (price && price !== w.price) { w.price = price; (w.history ||= []).push({ price, at: Date.now() }); }
}
$('#wish-form').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#wish-status'), url = new FormData(e.target).get('url').trim();
  st.textContent = 'Buscando informações do produto…';
  const w = { id: uid(), url, history: [] };
  try { applyProduct(w, await fetchProduct(url)); st.textContent = w.price ? '' : 'Preço não encontrado automaticamente. Toque em "Definir preço".'; }
  catch { st.textContent = 'Não foi possível ler o link. Item salvo sem imagem.'; }
  state.wish.unshift(w); persist('wish'); e.target.reset(); renderWish();
});
$('#wish-list').addEventListener('click', async e => {
  const act = e.target.dataset.act, card = e.target.closest('[data-id]'); if (!act || !card) return;
  const w = state.wish.find(x => x.id === card.dataset.id);
  if (act === 'del') state.wish = state.wish.filter(x => x !== w);
  if (act === 'price') { const v = parseFloat((prompt('Preço (R$):') || '').replace(',', '.')); if (v) applyProduct(w, { price: v }); }
  if (act === 'refresh') { e.target.textContent = '…'; try { applyProduct(w, await fetchProduct(w.url)); } catch {} }
  persist('wish'); renderWish();
});

/* ---------- News (GNews) ---------- */
const CATS = {
  politica: { label: 'Política', path: 'search', q: 'política' },
  tech: { label: 'Tecnologia', path: 'top-headlines', category: 'technology' },
  entretenimento: { label: 'Entretenimento', path: 'search', q: 'séries OR filmes OR cinema' },
  mundo: { label: 'Mundo', path: 'top-headlines', category: 'world' }
};
let cat = 'politica', lastFetch = {};
$('#chips').innerHTML = Object.entries(CATS).map(([k, c]) => `<button data-cat="${k}" class="${k === cat ? 'on' : ''}">${c.label}</button>`).join('');
$('#chips').addEventListener('click', e => {
  const k = e.target.dataset.cat; if (!k) return; cat = k;
  $$('#chips button').forEach(b => b.classList.toggle('on', b.dataset.cat === k)); loadNews(true);
});
async function fetchNews(k) {
  if (CONFIG.GNEWS_API_KEY.startsWith('COLE')) throw new Error('Adicione sua chave em js/config.js');
  const c = CATS[k], p = new URLSearchParams({ lang: 'pt', country: 'br', max: '15', apikey: CONFIG.GNEWS_API_KEY });
  c.category && p.set('category', c.category); c.q && p.set('q', c.q);
  const r = await fetch(`https://gnews.io/api/v4/${c.path}?${p}`);
  if (!r.ok) throw new Error('Erro ' + r.status + ' na API de notícias');
  state.news[k] = (await r.json()).articles || []; persist('news'); lastFetch[k] = Date.now();
}
function renderNews() {
  const list = state.news[cat] || [];
  $('#news-list').innerHTML = list.map(a => `<a class="article" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener">
    ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <div><h3>${esc(a.title)}</h3><p class="muted small">${esc(a.source?.name)} · ${new Date(a.publishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div></a>`).join('');
}
async function loadNews(force) {
  renderNews();
  if (!force && Date.now() - (lastFetch[cat] || 0) < CONFIG.NEWS_REFRESH_MS) return;
  const st = $('#news-status'); st.textContent = 'Atualizando…';
  try { await fetchNews(cat); st.textContent = ''; renderNews(); }
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
async function renderHome() {
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
