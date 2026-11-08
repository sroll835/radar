/* RADAR web — cliente HTTP del backend Flask (portado de js/api.js) */

// Configurable con VITE_RADAR_API en .env o con window.RADAR_API (igual que el index.html original)
const API_BASE = (typeof window !== 'undefined' && window.RADAR_API) || import.meta.env.VITE_RADAR_API || 'http://localhost:5001/api';

const K_TOKEN = 'radar_token';
const getToken = () => { try { return localStorage.getItem(K_TOKEN); } catch { return null; } };

export async function fetchTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function request(path, opts = {}, ms) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const r = await fetchTimeout(API_BASE + path, { ...opts, headers }, ms);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { const e = new Error(data.error || 'No autenticado'); e.auth = true; throw e; }
  return data;
}

export const apiGet = (path, ms) => request(path, {}, ms);
export const apiPost = (path, body, ms) => request(path, { method: 'POST', body: JSON.stringify(body) }, ms);

/** Poll un endpoint hasta status=completed|failed (patrón TaskManager) */
export async function apiPoll(path, onProgress, intervalMs = 800, maxMs = 900000) {   // 15 min: modelo local
  const t0 = Date.now();
  for (;;) {
    const r = await apiGet(path);
    onProgress?.(r.progress || 0, r.message || '');
    if (r.status === 'completed') return r.result;
    if (r.status === 'failed' || r.success === false) throw new Error(r.error || 'Error');
    if (Date.now() - t0 > maxMs) throw new Error('Tiempo de espera agotado');
    await new Promise(res => setTimeout(res, intervalMs));
  }
}

export async function health() {
  try {
    const r = await fetchTimeout(API_BASE + '/health', {}, 3000);
    if (!r.ok) return { ok: false };
    const d = await r.json();
    return { ok: true, llm: !!d.llm, provider: d.provider, model: d.model };
  } catch {
    return { ok: false };
  }
}
