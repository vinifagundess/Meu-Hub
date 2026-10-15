// Estado persistido no localStorage
const P = 'meuapp:';
export const load = (k, d) => { try { return JSON.parse(localStorage.getItem(P + k)) ?? d; } catch { return d; } };
export const save = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
export const state = {
  tx: load('tx', []), notes: load('notes', []), wish: load('wish', []), news: load('news', {})
};
export const persist = k => save(k, state[k]);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
