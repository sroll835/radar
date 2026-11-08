/* Mapa · Tiempo · Alertas (portado de render.js) */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRadar } from '../store';
import { useSheet } from '../components/Sheet';
import { ContratoDetail } from '../components/details';
import { Empty, PageHeader, Tag } from '../components/ui';
import { exportCSV, exportPDF } from '../lib/export';
import { fCOP, num, riesgo, totalValor, trunc } from '../lib/logic';

const DEPTOS = {
  'Bogotá D.C.': [195, 195, 17], Antioquia: [145, 155, 21], 'Valle del Cauca': [128, 215, 17], Cundinamarca: [196, 183, 14],
  'Atlántico': [158, 80, 13], Santander: [190, 140, 15], 'Bolívar': [152, 105, 15], 'Nariño': [128, 283, 14], 'Córdoba': [143, 115, 14],
  Meta: [228, 215, 16], Cauca: [138, 253, 13], Tolima: [173, 215, 14], Huila: [183, 253, 13], Cesar: [193, 98, 13], Magdalena: [178, 83, 13],
  'Norte de Santander': [203, 113, 13], Risaralda: [146, 190, 11], Caldas: [153, 180, 11], 'Quindío': [146, 198, 9], Sucre: [153, 113, 11],
  'Chocó': [108, 163, 13], Casanare: [233, 168, 14], Arauca: [233, 133, 12], 'Boyacá': [203, 156, 15], Vichada: [283, 173, 15],
  Amazonas: [218, 348, 17], 'Caquetá': [208, 283, 15], Putumayo: [173, 308, 13], 'Vaupés': [263, 293, 14], 'Guainía': [293, 243, 13],
  Guaviare: [253, 248, 14], 'La Guajira': [198, 63, 12], 'San Andrés': [70, 140, 9],
};
const hex = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`; }).join(' ');

function Mapa({ S }) {
  const [dep, setDep] = useState(null);
  const count = useMemo(() => {
    const d = {};
    S.c.forEach(c => { if (c.departamento) d[c.departamento] = (d[c.departamento] || 0) + 1; });
    [...S.proc, ...S.cont].forEach(x => { if (x.departamento) d[x.departamento] = (d[x.departamento] || 0) + 2; });
    return d;
  }, [S]);
  const maxC = Math.max(...Object.values(count), 1);
  const cts = dep ? S.c.filter(c => c.departamento === dep) : [];
  const n = dep ? count[dep] || 0 : 0;
  return (
    <>
      <div id="col-map">
        <svg id="colsvg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet">
          <rect width="400" height="500" fill="#0a0c12" />
          {Object.entries(DEPTOS).map(([name, [x, y, r]]) => {
            const k = count[name] || 0, ratio = k / maxC;
            const fill = k === 0 ? '#181c28' : ratio > 0.6 ? '#ff1744' : ratio > 0.2 ? '#ffd600' : '#00e676';
            return (
              <g key={name} style={{ cursor: 'pointer' }} onClick={() => setDep(name)}>
                <title>{name}</title>
                <polygon points={hex(x, y, r)} fill={fill} opacity={k === 0 ? 0.45 : 0.65 + ratio * 0.35}
                  stroke={dep === name ? '#fff' : '#05060a'} strokeWidth={dep === name ? 2 : 1.2} />
                {k > 0 && <text x={x} y={y + 3} textAnchor="middle" fill="#000" fontSize="6.5" fontWeight="700" fontFamily="Space Mono,monospace">{k}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 9 }}>
        {[['var(--red)', 'Riesgo Alto'], ['var(--yellow)', 'Riesgo Medio'], ['var(--green)', 'Riesgo Bajo'], ['#1a1e2c', 'Sin datos']].map(([c, l]) => (
          <div key={l} className="gl"><div className="gld" style={{ background: c }} />{l}</div>
        ))}
      </div>
      {dep && (
        <div style={{ marginTop: 12 }}>
          <div className="aibox" style={{ marginBottom: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '.95rem', marginBottom: 7 }}>{dep}</div>
            <div className="ct" style={{ marginBottom: 7 }}>
              <Tag cls="tb">{cts.length} contratos</Tag>
              <Tag cls="tg">{fCOP(totalValor(cts))}</Tag>
              {n > 5 ? <Tag cls="tr">RIESGO ALTO</Tag> : n > 2 ? <Tag cls="ty">RIESGO MEDIO</Tag> : <Tag cls="tg">RIESGO BAJO</Tag>}
            </div>
            {cts.slice(0, 2).map((c, i) => (
              <div key={i} style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 0', borderTop: '1px solid var(--border)' }}>→ {trunc(c.nombre_entidad, 28)} · {fCOP(c.valor_del_contrato)}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BarChart({ S, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!active || !canvas || !S.c.length) return;   // el canvas necesita estar visible para medir su ancho
    const byM = {};
    S.c.forEach(c => { if (c.fecha_de_firma) { const ym = c.fecha_de_firma.substring(0, 7); byM[ym] = (byM[ym] || 0) + num(c.valor_del_contrato); } });
    const keys = Object.keys(byM).sort();
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 300, H = 140, dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#10121a'; ctx.fillRect(0, 0, W, H);
    if (!keys.length) return;
    const pad = { l: 6, r: 6, t: 8, b: 24 };
    const maxV = Math.max(...keys.map(k => byM[k]));
    const bW = Math.max(7, (W - pad.l - pad.r) / keys.length - 2);
    keys.forEach((k, i) => {
      const bH = (H - pad.t - pad.b) * (byM[k] / maxV);
      const x = pad.l + i * (bW + 2), y = H - pad.b - bH;
      const grad = ctx.createLinearGradient(0, y, 0, H - pad.b);
      grad.addColorStop(0, 'rgba(0,230,118,.85)'); grad.addColorStop(1, 'rgba(0,230,118,.2)');
      ctx.fillStyle = grad; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bW, bH, 2); else ctx.rect(x, y, bW, bH);
      ctx.fill();
      if (i % Math.ceil(keys.length / 6) === 0) { ctx.fillStyle = '#505878'; ctx.font = "5.5px 'Space Mono',monospace"; ctx.textAlign = 'center'; ctx.fillText(k.substring(2), x + bW / 2, H - 5); }
    });
    ctx.fillStyle = 'rgba(0,230,118,.7)'; ctx.font = "7px 'Syne',sans-serif"; ctx.textAlign = 'left'; ctx.fillText('Valor contratos / mes', pad.l, 11);
  }, [S, active]);
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <canvas ref={ref} style={{ width: '100%', height: 140, display: 'block' }} />
    </div>
  );
}

function Tiempo({ S, active }) {
  const sheet = useSheet();
  const { saveAlert } = useRadar();
  const sorted = [...S.c].sort((a, b) => (b.fecha_de_firma || '').localeCompare(a.fecha_de_firma || ''));
  return (
    <>
      <BarChart S={S} active={active} />
      {!sorted.length ? <Empty icon="📅" title="Sin datos de tiempo" sub="Realice una búsqueda" /> : (
        <div className="tl">
          {sorted.map((c, i) => {
            const r = riesgo(c);
            return (
              <div key={i} className="tl-item" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="tl-dot" style={{ background: r === 'ALTO' ? 'var(--red)' : r === 'MEDIO' ? 'var(--yellow)' : 'var(--green)' }} />
                <div className="tl-date">{(c.fecha_de_firma || 'N/A').substring(0, 10)}</div>
                <div className="tl-card" onClick={() => sheet.open(<ContratoDetail c={c} S={S} onAlert={() => { saveAlert(); sheet.close(); }} />)}>
                  <div className="tl-name">{trunc(c.nombre_del_proveedor || 'N/A', 34)}</div>
                  <div className="tl-detail">{trunc(c.nombre_entidad, 28)} · {fCOP(c.valor_del_contrato)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Alertas({ S, onSearch }) {
  const { saved, delAlert, showToast } = useRadar();
  const run = (fn, ok) => {
    if (!S.c.length && !S.proc.length && !S.rues.length) { showToast('Realice una búsqueda primero'); return; }
    try { fn(S); showToast(ok); } catch (e) { showToast('⚠ ' + e.message); }
  };
  return (
    <>
      <button className="exp-btn" onClick={() => run(exportPDF, '📄 Generando PDF...')}><div className="exp-ico">📄</div><div className="exp-body"><div className="exp-title">Exportar PDF</div><div className="exp-sub">Reporte ejecutivo completo</div></div><div className="exp-arr">›</div></button>
      <button className="exp-btn" onClick={() => run(exportCSV, '📊 CSV descargado')}><div className="exp-ico">📊</div><div className="exp-body"><div className="exp-title">Exportar CSV</div><div className="exp-sub">Datos para Excel / Sheets</div></div><div className="exp-arr">›</div></button>
      <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
      <div className="ph"><div className="pt" style={{ fontSize: '.9rem' }}>Búsquedas guardadas</div></div>
      {!saved.length ? <Empty icon="🔔" title="Sin alertas" sub="Presione 🔔 ALERTA para guardar" /> : (
        <div className="card-list">
          {saved.map(a => (
            <div key={a.id} className="card card-blue">
              <div className="cii ci-b">🔔</div>
              <div className="cb2" style={{ cursor: 'pointer' }} onClick={() => onSearch(a.q === 'General' ? '' : a.q, a.ced || '')}>
                <div className="cn">{a.q}{a.ced ? ` (${a.ced})` : ''}</div>
                <div className="cd">{a.date} · {a.c} contratos · {a.p} sanciones · {a.rues} RUES</div>
              </div>
              <div className="chev" style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => delAlert(a.id)} title="Eliminar">✕</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* Antes eran sub-pestañas de «Más»; ahora cada una tiene su botón en el menú */
export function MapaPage() {
  const { S } = useRadar();
  return <><PageHeader title="Mapa de Riesgo" sub="CONTRATOS, SANCIONES Y PROCESOS POR DEPARTAMENTO" /><Mapa S={S} /></>;
}

export function TiempoPage({ active }) {
  const { S } = useRadar();
  return <><PageHeader title="Línea de Tiempo" sub="CONTRATOS POR FECHA DE FIRMA" /><Tiempo S={S} active={active} /></>;
}

export function AlertasPage({ onSearch }) {
  const { S } = useRadar();
  return <><PageHeader title="Alertas y Exportación" sub="BÚSQUEDAS GUARDADAS · PDF · CSV" /><Alertas S={S} onSearch={onSearch} /></>;
}
