// ⚙️ CONFIGURAÇÕES
// As chaves de API agora ficam NA VERCEL (Settings → Environment Variables), não no código:
//   GNEWS_API_KEY   (opcional) notícias com foto — https://gnews.io
//   X_BEARER_TOKEN  (opcional) posts do X — API paga do X
//   X_ACCOUNTS      (opcional) contas do X, separadas por vírgula (padrão: g1,CNNBrasil,folha,UOLNoticias)
export const CONFIG = {
  NEWS_REFRESH_MS: 5 * 60 * 1000,
  PRICE_REFRESH_MS: 6 * 60 * 60 * 1000
};
