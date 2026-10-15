// ⚙️ CONFIGURAÇÕES — edite só aqui
export const CONFIG = {
  // Chave gratuita em https://gnews.io (100 requisições/dia no plano free)
  GNEWS_API_KEY: 'COLE_SUA_CHAVE_AQUI',
  NEWS_REFRESH_MS: 5 * 60 * 1000,

  // Backend opcional para preço real + comparação entre lojas (ex.: Cloudflare Worker).
  // Deve responder GET ?url=... com:
  // { title, image, price, offers: [{ store, price, url }] }
  PRICE_API: '',

  // Extrai imagem e título de qualquer link (grátis, sem chave, com limite de uso)
  METADATA_API: 'https://api.microlink.io/?url='
};
