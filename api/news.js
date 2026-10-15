// Vercel Serverless Function: notícias (GNews se houver chave; senão Google News RSS) e posts do X
const GN = { politica: { q: 'política' }, tech: { category: 'technology' }, entretenimento: { q: 'séries OR filmes OR cinema' }, mundo: { category: 'world' } };
const RSSQ = { politica: 'política', tech: 'tecnologia', entretenimento: 'séries filmes cinema', mundo: 'mundo internacional' };
const dec = s => String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

async function gnews(cat, key) {
  const c = GN[cat], p = new URLSearchParams({ lang: 'pt', country: 'br', max: '20', apikey: key });
  c.category && p.set('category', c.category); c.q && p.set('q', c.q);
  const r = await fetch(`https://gnews.io/api/v4/${c.q ? 'search' : 'top-headlines'}?${p}`, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('gnews ' + r.status);
  return ((await r.json()).articles || []).map(a => ({ title: a.title, url: a.url, image: a.image, source: { name: a.source?.name }, publishedAt: a.publishedAt }));
}
async function rss(cat) {
  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(RSSQ[cat] + ' when:1d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, { signal: AbortSignal.timeout(9000) });
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map(m => {
    const g = t => { const x = m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? dec(x[1]) : ''; };
    const d = new Date(g('pubDate')), src = g('source');
    return { title: g('title').replace(/ - [^-]+$/, ''), url: g('link'), image: null, source: { name: src }, publishedAt: isNaN(d) ? null : d.toISOString() };
  });
}
async function xPosts() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { articles: [], notice: 'Para ver posts do X, adicione X_BEARER_TOKEN nas variáveis da Vercel (a API do X é paga).' };
  const accts = (process.env.X_ACCOUNTS || 'g1,CNNBrasil,folha,UOLNoticias').split(',').map(s => s.trim());
  const q = `(${accts.map(a => 'from:' + a).join(' OR ')}) -is:retweet -is:reply`;
  const r = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=25&tweet.fields=created_at&expansions=author_id&user.fields=username`, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) return { articles: [], notice: 'API do X respondeu ' + r.status + '. Verifique o token e o plano.' };
  const d = await r.json(), users = Object.fromEntries((d.includes?.users || []).map(u => [u.id, u.username]));
  return { articles: (d.data || []).map(t => ({ title: t.text, tweetId: t.id, url: `https://x.com/${users[t.author_id] || 'i'}/status/${t.id}`, source: { name: '@' + (users[t.author_id] || '') }, publishedAt: t.created_at })) };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const cat = String(req.query.cat || 'politica');
  try {
    if (cat === 'x') return res.status(200).json(await xPosts());
    if (!GN[cat]) return res.status(400).json({ error: 'Categoria inválida' });
    const key = process.env.GNEWS_API_KEY;
    if (key) { try { return res.status(200).json({ articles: await gnews(cat, key) }); } catch {} }
    res.status(200).json({ articles: await rss(cat) });
  } catch (e) { res.status(502).json({ error: 'Falha ao buscar notícias' }); }
};
