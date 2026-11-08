/* Estado de cada fuente de la última búsqueda: distingue «no hay registros» de «falló la consulta» */
import React from 'react';

const CORTO = { 'Procuraduría SIRI': 'Procuraduría', 'SIGEP / DAFP': 'SIGEP', 'RUES / Confecámaras': 'RUES', 'SIIF Nación': 'SIIF' };
const ESTILO = {
  ok: { cls: 'tg', txt: f => `${f.registros} registros` },
  vacia: { cls: '', txt: () => 'sin registros' },
  error: { cls: 'tr', txt: f => `error — ${f.mensaje}` },
  no_aplica: { cls: 'tb', txt: f => `no aplica — ${f.mensaje}` },
};

export function resumenFuentes(fuentes) {
  const v = Object.values(fuentes || {});
  const n = e => v.filter(f => f.estado === e).length;
  return { ok: n('ok'), vacia: n('vacia'), error: n('error'), noAplica: n('no_aplica'),
    fallidas: Object.entries(fuentes || {}).filter(([, f]) => f.estado === 'error').map(([k]) => CORTO[k] || k) };
}

export default function FuentesEstado({ fuentes, fallo, query }) {
  if (fallo) return <div className="src-banner err">⚠ {fallo}. No se consultó ninguna fuente: esto no significa que no existan registros.</div>;
  if (!fuentes) return null;
  const r = resumenFuentes(fuentes);
  let banner = null;
  if (!r.ok) {
    if (r.error && !r.vacia) banner = <div className="src-banner err">⚠ Fallaron todas las consultas ({r.fallidas.join(', ')}): no se puede saber si existen registros para «{query}».</div>;
    else if (r.error) banner = <div className="src-banner warn">∅ No hay registros para «{query}» en las fuentes que respondieron, y fallaron {r.fallidas.join(', ')}: el resultado está incompleto.</div>;
    else banner = <div className="src-banner">∅ No hay registros para «{query}» en ninguna fuente.</div>;
  } else if (r.error) {
    banner = <div className="src-banner warn">⚠ Resultados incompletos: falló {r.fallidas.join(', ')}.</div>;
  }
  return (
    <div className="src-status">
      {banner}
      <div className="ct">
        {Object.entries(fuentes).map(([k, f]) => {
          const e = ESTILO[f.estado] || ESTILO.error;
          return <span key={k} className={`tag ${e.cls}`} title={`${k} · dataset ${f.dataset || ''}`}><span className="td2" />{CORTO[k] || k}: {e.txt(f)}</span>;
        })}
      </div>
    </div>
  );
}
