/* Índice de señales de riesgo — medidor, dimensiones, desglose y exportación (portado de score.js) */
import React, { useMemo } from 'react';
import { useRadar } from '../store';
import { INDICE_NOMBRE, SCORE_CONFIG, calcScore, hayDatosScore, scoreTexto } from '../lib/score';
import { exportPDF } from '../lib/export';
import { Empty, MONO, PageHeader } from '../components/ui';

const dimColor = p => (p >= 70 ? '#ff1744' : p >= 45 ? '#ffd600' : p >= 20 ? '#ff6d00' : '#00e676');
const ptsColor = r => (r > 0.6 ? '#ff1744' : r > 0.3 ? '#ffd600' : '#00e676');

function Gauge({ pct, color }) {
  const R = 80, CX = 100, CY = 95;
  const rad = a => (a * Math.PI) / 180;
  const end = -180 + (180 * pct) / 100;
  const x2 = CX + R * Math.cos(rad(end)), y2 = CY + R * Math.sin(rad(end));
  return (
    <svg className="score-arc" viewBox="0 0 200 100" width="220" height="110" style={{ '--score-color': color }}>
      <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#1a2030" strokeWidth="14" strokeLinecap="round" />
      {pct > 0 && <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />}
      <line x1={CX - R - 8} y1={CY} x2={CX - R + 4} y2={CY} stroke="#505878" strokeWidth="1.5" />
      <line x1={CX + R - 4} y1={CY} x2={CX + R + 8} y2={CY} stroke="#505878" strokeWidth="1.5" />
      <text x="20" y={CY + 14} fontFamily="Space Mono" fontSize="8" fill="#505878">0</text>
      <text x="167" y={CY + 14} fontFamily="Space Mono" fontSize="8" fill="#505878">100</text>
      <text x={CX} y={CY - 8} fontFamily="Space Mono" fontSize="7" fill={color} textAnchor="middle">ÍNDICE</text>
    </svg>
  );
}

// (Se retiraron los comparativos «Promedio Colombia 42 / Mejor localidad 18 / Peor caso 87»: no salían de ningún dato.)

export default function Score() {
  const { S, showToast } = useRadar();
  const sc = useMemo(() => (hayDatosScore(S) ? calcScore(S) : null), [S]);
  const head = <PageHeader title={INDICE_NOMBRE} sub="SEÑALES EN DATOS ABIERTOS · 5 DIMENSIONES · NO ES UNA CONCLUSIÓN JURÍDICA" />;
  if (!sc) return <>{head}<Empty icon="🧮" title="Sin datos" sub="Realice una búsqueda primero para calcular el índice" /></>;

  const exportar = () => {
    const txt = scoreTexto(S, sc);
    navigator.clipboard?.writeText(txt).catch(() => {});
    showToast(`Índice ${sc.total}/100 (${sc.nivel}) copiado al portapapeles`);
    try { exportPDF(S, txt); } catch (e) { showToast('⚠ ' + e.message); }
  };
  const small = { ...MONO, fontSize: '.52rem' };

  return (
    <>
      {head}
      <div className="score-gauge-wrap">
        <Gauge pct={sc.total} color={sc.color} />
        <div className="score-num" style={{ color: sc.color }}>{sc.total}</div>
        <div className="score-label">{INDICE_NOMBRE.toUpperCase()}</div>
        <div className="score-nivel" style={{ color: sc.color }}>SEÑALES: {sc.nivel}</div>
        <div style={{ ...small, color: 'var(--muted2)', marginTop: 5, textAlign: 'center' }}>{(S.lastQ || S.lastCed || 'Entidad consultada').toUpperCase()}</div>
      </div>

      <div className="disc" style={{ marginTop: 10 }}>
        ⚠ Este índice cuenta señales en datos públicos que ameritan verificación. <b>No mide corrupción</b> ni afirma que la persona o entidad consultada haya cometido una falta o un delito.
        {!!S.homonimos?.length && <> Se excluyeron {S.homonimos.length} registros de personas distintas con nombre similar.</>}
      </div>

      <div className="score-dims">
        {SCORE_CONFIG.dims.map(dim => {
          const d = sc.dims[dim.id], col = dimColor(d.score);
          return (
            <div key={dim.id} className="sdim">
              <div className="sdim-header"><span className="sdim-name">{dim.icon} {dim.label.toUpperCase()}</span><span className="sdim-val" style={{ color: col }}>{d.score}</span></div>
              <div className="sdim-bar"><div className="sdim-fill" style={{ width: `${d.score}%`, background: col }} /></div>
              <div className="sdim-desc">{dim.desc}</div>
              {d.items.slice(0, 2).map(f => <div key={f.id} className="sdim-flag">{f.icon} {f.detail || f.label}</div>)}
            </div>
          );
        })}
      </div>

      <div className="score-breakdown">
        <div className="sb-title">🔬 FACTORES DETECTADOS — DESGLOSE COMPLETO</div>
        {SCORE_CONFIG.dims.map(dim => {
          const d = sc.dims[dim.id];
          if (!d.items.length) return (
            <div key={dim.id} className="sb-row">
              <div className="sb-icon">{dim.icon}</div>
              <div className="sb-info"><div className="sb-iname" style={{ color: 'var(--muted2)' }}>{dim.label}</div><div className="sb-idesc">Sin señales en esta dimensión</div></div>
              <div className="sb-pts" style={{ color: 'var(--green)' }}>0 pts</div>
            </div>
          );
          return d.items.map(it => {
            const col = ptsColor(it.pts / it.max);
            return (
              <div key={dim.id + it.id} className="sb-row">
                <div className="sb-icon">{it.icon}</div>
                <div className="sb-info"><div className="sb-iname">{it.label}</div><div className="sb-idesc">{it.detail || ''} · {it.ley}</div></div>
                <div className="sb-bar-wrap"><div className="sb-bar-fill" style={{ width: `${Math.round(it.pts / it.max * 100)}%`, background: col }} /></div>
                <div className="sb-pts" style={{ color: col }}>{it.pts} pts</div>
              </div>
            );
          });
        })}
      </div>

      <div className="score-history">
        <div className="sb-title">📊 SCORE POR DIMENSIÓN — PESO PONDERADO</div>
        {SCORE_CONFIG.dims.map(dim => {
          const d = sc.dims[dim.id], col = dimColor(d.score);
          return (
            <div key={dim.id} className="sh-bar-row">
              <div className="sh-bar-lbl">{dim.icon} {dim.label.split(' ')[0]}</div>
              <div className="sh-bar-outer"><div className="sh-bar-inner" style={{ width: `${d.score}%`, background: col }}><span className="sh-bar-txt">{d.score}/100</span></div></div>
              <div style={{ ...small, color: 'var(--muted2)', marginLeft: 8, whiteSpace: 'nowrap', width: 42, textAlign: 'right' }}>×{dim.weight}% = <span style={{ color: col }}>{Math.round(d.score / 100 * dim.weight)}</span></div>
            </div>
          );
        })}
        <div className="sh-bar-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
          <div className="sh-bar-lbl" style={{ color: sc.color, fontWeight: 700 }}>TOTAL</div>
          <div className="sh-bar-outer"><div className="sh-bar-inner" style={{ width: `${sc.total}%`, background: sc.color }}><span className="sh-bar-txt">{sc.total}/100</span></div></div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '.9rem', color: sc.color, marginLeft: 8 }}>{sc.total}</div>
        </div>
      </div>

      <div className="score-metodologia">
        <b>Metodología:</b> índice de 5 dimensiones con pesos fijos (contratación 40%, disciplinario 25%, fiscal 22%, presupuestal 10%, nómina 3%). Cada dimensión aplica reglas propias de RADAR sobre una fuente de datos abiertos oficial (SECOP II, SIRI, Contraloría, SIIF, SIGEP). Las normas citadas indican el marco de cada señal; las reglas y los umbrales son de RADAR, no de las entidades que publican los datos.<br /><br />
        <b>⚠ Advertencia:</b> el índice NO es una conclusión jurídica ni una medición de corrupción. Un valor alto indica que hay más señales para verificar; no implica responsabilidad disciplinaria, fiscal ni penal de ninguna persona o entidad, que solo pueden declarar las autoridades competentes.
      </div>
      <button className="btn-mark" onClick={exportar}>📄 Exportar informe del índice</button>
    </>
  );
}
