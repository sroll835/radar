/* RADAR web — estado global (equivalente al objeto S + buscarTodo de state.js / api.js) */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiPost, apiPoll, health } from './lib/api';
import { chatLocal, resumenLocal } from './lib/logic';

// fuentes: estado por fuente que devuelve el backend {estado: ok|vacia|error|no_aplica, registros, mensaje}.
// El frontend NO consulta datos.gov.co directamente: el backend (app/sources.py) es la única fuente de verdad.
// homonimos: registros de personas/empresas DISTINTAS con nombre parecido al buscado. El backend los separa para que
// nunca entren en alertas, score, grafo, KPIs ni exportaciones; solo se listan aparte con advertencia.
const EMPTY = { c: [], proc: [], cont: [], sigep: [], rues: [], siif: [], nom: [], lastQ: '', lastCed: '', alerts: [], graph: null, fuentes: null,
  homonimos: [], homonimosPorFuente: {} };
const K_ALERTS = 'radar5_alerts';

const Ctx = createContext(null);
export const useRadar = () => useContext(Ctx);

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(K_ALERTS) || '[]'); } catch { return []; } };
const persist = list => { try { localStorage.setItem(K_ALERTS, JSON.stringify(list)); } catch {} };

export function RadarProvider({ children }) {
  const [S, setS] = useState(EMPTY);
  const [taskId, setTaskId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [aiText, setAiText] = useState('Realice una búsqueda para obtener un análisis ejecutivo automático. La IA cruzará datos de SECOP, Procuraduría, Contraloría, RUES y presupuesto SIIF para detectar patrones de riesgo.');
  const [aiLoading, setAiLoading] = useState(false);
  const [chat, setChat] = useState([{ me: false, text: 'Hola, soy RADAR IA. Cuando realice una búsqueda podré responder preguntas como: ¿Qué empresa ganó más contratos? ¿Hay sanciones disciplinarias vigentes? ¿El NIT aparece en el RUES? ¿Cuánto presupuesto se ejecutó?' }]);
  const [backend, setBackend] = useState({ checked: false, ok: false, llm: false });
  const [saved, setSaved] = useState(loadSaved);
  const [toast, setToast] = useState('');
  const [fallo, setFallo] = useState('');            // la búsqueda no pudo hacerse (backend caído, auth…)
  const toastTimer = useRef(null);
  const SRef = useRef(S); SRef.current = S;

  const showToast = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  const checkBackend = useCallback(async () => {
    const h = await health();
    setBackend({ checked: true, ...h });
    return h;
  }, []);

  useEffect(() => { checkBackend(); }, [checkBackend]);

  const resumenBackend = useCallback(async (tid, data) => {
    setAiLoading(true);
    try {
      const start = await apiPost('/report', { task_id: tid, mode: 'summary' });
      if (!start.success) throw new Error(start.error);
      const res = await apiPoll('/report/status/' + start.report_task_id, (p, m) => m && setAiText(m), 1200);
      setAiText(res?.text || 'Sin resumen disponible');
    } catch {
      setAiText(resumenLocal(data));
    } finally {
      setAiLoading(false);
    }
  }, []);

  const buscar = useCallback(async (q, ced) => {
    q = (q || '').trim(); ced = (ced || '').trim();
    if (!q && !ced) { showToast('Escribe una entidad o cédula'); return; }
    setLoading(true); setProgress('...'); setAiText(''); setAiLoading(true);
    try {
      // Comprobación rápida (3 s) para no esperar el timeout completo si el backend está caído
      const h = await checkBackend();
      if (!h.ok) throw new Error('Backend no disponible');
      const start = await apiPost('/search', { query: q, cedula: ced });
      if (!start.success) throw new Error(start.error);
      const result = await apiPoll('/search/status/' + start.task_id, (pct, msg) => {
        setProgress(pct + '%'); if (msg) setAiText(msg);
      });
      const r = result?.results || {};
      const data = {
        c: r['SECOP II'] || [], proc: r['Procuraduría SIRI'] || [], cont: r['Contraloría'] || [],
        siif: r['SIIF Nación'] || [], sigep: r['SIGEP / DAFP'] || [], nom: r['SIGEP / DAFP'] || [],
        rues: r['RUES / Confecámaras'] || [], alerts: result?.alerts || [], graph: result?.graph || null,
        fuentes: result?.fuentes || null, lastQ: q, lastCed: ced,
        homonimosPorFuente: result?.homonimos || {},
        homonimos: Object.entries(result?.homonimos || {}).flatMap(([f, h]) => (h.registros || []).map(x => ({ ...x, _fuente: f }))),
      };
      setS(data); setTaskId(start.task_id); setFallo('');
      resumenBackend(start.task_id, data);
    } catch (err) {
      // Sin backend no hay búsqueda: se muestra el fallo, nunca datos locales ni de demostración
      const msg = err.auth ? 'El backend requiere autenticación' : `No se pudo consultar el backend RADAR (${err.message})`;
      console.warn('[RADAR]', msg);
      showToast('⚠ ' + msg);
      setS({ ...EMPTY, lastQ: q, lastCed: ced }); setTaskId(null); setFallo(msg);
      setAiText(`⚠ ${msg}. No se muestran resultados porque no se pudo consultar ninguna fuente; esto no significa que no existan registros.`);
      setAiLoading(false);
    } finally {
      setLoading(false); setProgress('');
    }
  }, [checkBackend, resumenBackend, showToast]);

  const sendChat = useCallback(async msg => {
    msg = (msg || '').trim();
    if (!msg) return;
    setChat(c => [...c, { me: true, text: msg }]);
    if (!taskId) { setChat(c => [...c, { me: false, text: chatLocal(msg, SRef.current) }]); return; }
    setChat(c => [...c, { me: false, text: '…', typing: true }]);
    let text;
    try {
      const start = await apiPost('/report', { task_id: taskId, mode: 'chat', message: msg });
      if (!start.success) throw new Error(start.error);
      const res = await apiPoll('/report/status/' + start.report_task_id, null, 1000);
      text = res?.text || '…';
    } catch {
      text = chatLocal(msg, SRef.current);
    }
    setChat(c => [...c.filter(b => !b.typing), { me: false, text }]);
  }, [taskId]);

  const saveAlert = useCallback(() => {
    const cur = SRef.current;
    const a = { id: Date.now(), q: cur.lastQ || 'General', ced: cur.lastCed, date: new Date().toLocaleDateString('es-CO'),
      c: cur.c.length, p: cur.proc.length, rues: cur.rues.length };
    setSaved(prev => { const next = [a, ...prev].slice(0, 20); persist(next); return next; });
    showToast('✅ Alerta guardada');
  }, [showToast]);

  const delAlert = useCallback(id => {
    setSaved(prev => { const next = prev.filter(a => a.id !== id); persist(next); return next; });
  }, []);

  const value = {
    S, taskId, loading, progress, aiText, aiLoading, chat, backend, saved, toast, fallo,
    buscar, sendChat, saveAlert, delAlert, showToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
