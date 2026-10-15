// Vercel Serverless Function: lê imagem, título e preço de uma página de produto
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BLOCK = /^(localhost|127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.(local|internal)$)/i;
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const num = v => {
  if (v == null || v === '') return null;
  let s = String(v).replace(/[^\d.,]/g, ''); if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s); return n > 0 ? n : null;
};
const meta = (h, names) => {
  for (const n of names) {
    const m = h.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*>`, 'i'));
    const c = m && m[0].match(/content=["']([^"']*)["']/i);
    if (c) return dec(c[1]);
  }
  return null;
};
const findProduct = n => {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) { for (const x of n) { const r = findProduct(x); if (r) return r; } return null; }
  if ([].concat(n['@type'] || []).includes('Product')) return n;
  return findProduct(n['@graph']);
};
const offerPrice = o => {
  if (!o) return null;
  if (Array.isArray(o)) { const p = o.map(offerPrice).filter(Boolean); return p.length ? Math.min(...p) : null; }
  const ps = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
  return num(o.price ?? o.lowPrice ?? ps?.price) ?? offerPrice(o.offers);
};
function parse(html, base) {
  let prod = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { prod = findProduct(JSON.parse(m[1].trim())); if (prod) break; } catch {}
  }
  let img = prod?.image; img = Array.isArray(img) ? img[0] : img; img = img?.url || img;
  const abs = s => { try { return s ? new URL(s, base).href : null; } catch { return null; } };
  return {
    title: dec(prod?.name) || meta(html, ['og:title', 'twitter:title']) || dec((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || null,
    image: abs(img) || abs(meta(html, ['og:image', 'twitter:image'])),
    price: offerPrice(prod?.offers) ?? num(meta(html, ['product:price:amount', 'og:price:amount', 'price'])),
    store: new URL(base).hostname.replace(/^www\./, '')
  };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  let u; try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'URL inválida' }); }
  if (!/^https?:$/.test(u.protocol) || BLOCK.test(u.hostname)) return res.status(400).json({ error: 'URL não permitida' });
  let out = { title: null, image: null, price: null, store: u.hostname.replace(/^www\./, '') };
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
    out = parse((await r.text()).slice(0, 2e6), r.url || u.href);
  } catch {}
  if (!out.image || !out.title) { // fallback: navegador remoto do Microlink (contorna alguns bloqueios)
    try {
      const d = ((await (await fetch('https://api.microlink.io/?url=' + encodeURIComponent(u.href), { signal: AbortSignal.timeout(9000) })).json()).data) || {};
      out.title = out.title || d.title || null; out.image = out.image || d.image?.url || d.logo?.url || null;
    } catch {}
  }
  res.status(200).json(out);
};
module.exports.parse = parse;
