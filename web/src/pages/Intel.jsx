/* Módulo Inteligencia — 7 agentes integrados (portado de js/intel.js) */
import React, { useCallback, useEffect, useState } from 'react';
import { useRadar } from '../store';
import { apiGet, apiPoll, apiPost } from '../lib/api';
import { PageHeader } from '../components/ui';

export default function Intel() {
  const { S, taskId, showToast } = useRadar();
  const [llm, setLlm] = useState(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState(null);

  const loadLLM = useCallback(async () => {
    try { setLlm(await apiGet('/llm', 5000)); } catch { setStatus('Backend sin conexión'); }
  }, []);
  useEffect(() => { loadLLM(); }, [loadLLM]);

  const setProvider = async p => {
    try { await apiPost('/llm', { provider: p }); showToast('Modelo: ' + p.toUpperCase()); loadLLM(); }
    catch { showToast('No se pudo cambiar el modelo'); }
  };

  const run = async () => {
    setRunning(true);
    try {
      const start = await apiPost('/intelligence/run', { query: S.lastQ || '', task_id: taskId || '' });
      if (!start.success) throw new Error(start.error);
      setRes(await apiPoll('/intelligence/status/' + start.task_id, (pct, msg) => setStatus(`${pct}% · ${msg}`)));
      setStatus('Listo');
    } catch (e) {
      setStatus('Error: ' + e.message);
    } finally { setRunning(false); }
  };

  const ex = res?.ejecutivo || {};
  return (
    <>
      <PageHeader title="Inteligencia" sub="7 AGENTES · UN SOLO ANÁLISIS" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn-go" style={{ padding: '9px 14px' }} onClick={run} disabled={running}>{running ? '...' : '▶ ANALIZAR'}</button>
        {llm?.available && (
          <select className="si-ced" style={{ width: 'auto' }} value={llm.active} onChange={e => setProvider(e.target.value)}>
            {Object.keys(llm.available).map(k => <option key={k} value={k}>{k.toUpperCase()}{llm.available[k] ? ' ✓' : ' (sin clave)'}</option>)}
          </select>
        )}
        <span className="ps">{status}</span>
      </div>
      <div className="aibox"><div className="ai-text">
        {res ? <><b>Resumen ejecutivo</b> · confianza global {ex.confianza || 0}% · {ex.agentes_ok}/{ex.agentes_total} agentes<br /><br />{ex.texto}</>
          : 'Pulsa ANALIZAR (usa la búsqueda actual como contexto si existe). Los 7 agentes corren en paralelo y se integran en un resumen ejecutivo.'}
      </div></div>
      {!!(ex.top_predicciones || []).length && (
        <>
          <div className="ps" style={{ margin: '10px 0 4px' }}>PREDICCIONES PRINCIPALES</div>
          {ex.top_predicciones.map((p, i) => (
            <div key={i} className="bk" style={{ marginBottom: 6, padding: '8px 10px' }}>
              <b>{p.probabilidad || '?'}%</b> · {p.evento} <span className="ps">{p.agente} · {p.horizonte || ''}</span>
            </div>
          ))}
        </>
      )}
      {(res?.agentes || []).map((a, i) => (
        <div key={i} className="bk" style={{ margin: '8px 0', padding: '10px 12px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>{a.icon || ''} {a.agente}</b>
            <span className="ps">Confianza {a.confianza}% · {a.evidencias || 0} evid. · {a.modo || ''}</span>
          </div>
          <div style={{ margin: '6px 0', fontSize: '.82rem' }}>{a.resumen}</div>
          <div style={{ fontSize: '.76rem', color: 'var(--muted2)' }}>{a.analisis}</div>
          {(a.predicciones || []).map((p, j) => <div key={j} className="ps" style={{ marginTop: 4 }}>▸ {p.probabilidad}% {p.evento} ({p.horizonte || ''})</div>)}
          {!!(a.fuentes || []).length && (
            <details style={{ marginTop: 6 }}>
              <summary className="ps">Fuentes ({a.fuentes.length})</summary>
              {a.fuentes.map((f, j) => (
                <div key={j} className="ps" style={{ margin: '2px 0' }}>
                  {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>{f.titulo}</a> : f.titulo} — {f.fuente}
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </>
  );
}
