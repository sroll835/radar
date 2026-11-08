/* Presupuesto SIIF Nación — resumen, rubros y sanciones (portado de search.js) */
import React, { useState } from 'react';
import { useRadar } from '../store';
import { useSheet } from '../components/Sheet';
import { RubroDetail } from '../components/details';
import { Bar, Empty, Loading, MONO, NomAlert, PageHeader, SubTabs, Tag, pctCls } from '../components/ui';
import { fCOP, num, trunc, rubroDe, esRubroSancion } from '../lib/logic';

const TIPO_COLOR = { Funcionamiento: 'var(--blue)', 'Inversión': 'var(--green)', 'Servicio de la Deuda': 'var(--red)', 'Gastos de Personal': 'var(--cyan)' };
const pctColor = p => (p > 90 ? 'var(--red)' : p > 60 ? 'var(--yellow)' : 'var(--green)');
const small = { ...MONO, fontSize: '.52rem', color: 'var(--muted2)' };

function Resumen({ d }) {
  const ap = d.reduce((s, x) => s + num(x.apropiacion_definitiva || x.apropiacion), 0);
  const comp = d.reduce((s, x) => s + num(x.compromisos), 0);
  const oblig = d.reduce((s, x) => s + num(x.obligaciones), 0);
  const pagos = d.reduce((s, x) => s + num(x.pagos || x.compromisos), 0);
  const pct = v => (ap > 0 ? Math.round(v / ap * 100) : 0);
  const ejPct = pct(comp);
  const sanc = d.filter(x => esRubroSancion(rubroDe(x))).reduce((s, x) => s + num(x.compromisos || x.pagos), 0);

  const alerts = [];
  if (ejPct > 95) alerts.push(['var(--red)', '#ff1744', `Ejecución del ${ejPct}% — Posible sobrejecución o inflación de gastos`]);
  if (ejPct < 30 && ejPct > 0) alerts.push(['var(--yellow)', '#ffd600', `Ejecución del ${ejPct}% — Subejecución grave, posible parálisis institucional`]);
  if (sanc > 0) alerts.push(['var(--red)', '#ff1744', `${fCOP(sanc)} en Sanciones e Intereses de Mora — Ver pestaña ⚠ SANCIONES`]);

  const byTipo = {};
  d.forEach(x => {
    const t = x.tipo_gasto || x.tipo || 'Funcionamiento';
    byTipo[t] = byTipo[t] || { ap: 0, comp: 0 };
    byTipo[t].ap += num(x.apropiacion_definitiva); byTipo[t].comp += num(x.compromisos);
  });
  const vigencias = [...new Set(d.map(x => x.vigencia || x.ano).filter(Boolean))].sort().reverse();
  const pipe = [
    ['APROPIACIÓN', ap, 100, 'var(--blue)', 'Techo presupuestal aprobado por el Congreso'],
    ['COMPROMISOS', comp, pct(comp), 'var(--yellow)', 'Contratos y actos administrativos firmados'],
    ['OBLIGACIONES', oblig, pct(oblig), 'var(--orange)', 'Bienes/servicios recibidos por la entidad'],
    ['PAGOS', pagos, pct(pagos), 'var(--green)', 'Dinero efectivamente girado'],
  ].filter(p => p[1] > 0);

  return (
    <>
      {!!alerts.length && <div style={{ marginBottom: 12 }}>{alerts.map(([col, hex, t]) => (
        <div key={t} style={{ background: hex + '10', border: `1px solid ${hex}30`, borderRadius: 7, padding: '9px 12px', marginBottom: 6, fontSize: '.78rem', color: col, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>⚠</span><span>{t}</span>
        </div>
      ))}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
        <div className="bk"><div className="bkv kg">{fCOP(ap)}</div><div className="bkl">Apropiación total</div></div>
        <div className="bk"><div className={`bkv ${ejPct > 90 ? 'kr' : ejPct > 60 ? 'ky' : 'kg'}`}>{ejPct}%</div><div className="bkl">% Comprometido</div></div>
        <div className="bk"><div className="bkv ky">{fCOP(pagos)}</div><div className="bkl">Pagos realizados</div></div>
        <div className="bk"><div className="bkv kr">{sanc > 0 ? fCOP(sanc) : '$0'}</div><div className="bkl">Sanciones/Mora</div></div>
      </div>
      <div className="budget-bar-wrap" style={{ marginBottom: 12 }}>
        <div className="bb-title" style={{ fontSize: '.75rem', marginBottom: 10 }}>🔄 CICLO PRESUPUESTAL — {vigencias[0] || 'Vigencia actual'}</div>
        {pipe.map(([label, val, p, col, desc]) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <span style={{ ...MONO, fontSize: '.52rem', color: col, letterSpacing: 1 }}>{label}</span>
                <span style={{ ...MONO, fontSize: '.48rem', color: 'var(--muted2)', marginLeft: 8 }}>{desc}</span>
              </div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: '.9rem', color: col }}>{fCOP(val)}</span>
            </div>
            <Bar pct={p} color={col} />
            <div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', marginTop: 2 }}>{p}% de la apropiación</div>
          </div>
        ))}
      </div>
      <div className="budget-bar-wrap">
        <div className="bb-title" style={{ fontSize: '.75rem', marginBottom: 8 }}>📊 DISTRIBUCIÓN POR TIPO DE GASTO</div>
        {Object.entries(byTipo).map(([t, v]) => {
          const p = v.ap > 0 ? Math.round(v.comp / v.ap * 100) : 0;
          const col = TIPO_COLOR[t] || 'var(--muted2)';
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 500 }}>{t}</div>
                <Bar pct={p} color={col} height={3} style={{ marginTop: 4 }} />
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...MONO, fontSize: '.65rem', color: col }}>{fCOP(v.comp)}</div>
                <div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)' }}>{p}% ejec.</div>
              </div>
            </div>
          );
        })}
      </div>
      {vigencias.length > 1 && <div style={{ marginTop: 10, ...MONO, fontSize: '.5rem', color: 'var(--muted2)' }}>Vigencias disponibles: {vigencias.join(' · ')}</div>}
      <a href="https://www.pte.gov.co/Presupuesto-general-de-la-nacion" target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid rgba(0,230,118,.18)', color: 'var(--green)', ...MONO, fontSize: '.58rem', letterSpacing: 1, padding: 10, borderRadius: 7, marginTop: 12, textDecoration: 'none' }}>
        Ver ejecución oficial en MinHacienda ↗
      </a>
    </>
  );
}

function Rubros({ d }) {
  const sheet = useSheet();
  const { S } = useRadar();
  const map = {};
  d.forEach(x => {
    const r = rubroDe(x) || x.nombre_entidad || 'Sin clasificar';
    map[r] = map[r] || { ap: 0, comp: 0 };
    map[r].ap += num(x.apropiacion_definitiva); map[r].comp += num(x.compromisos);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1].ap - a[1].ap);
  const maxAp = Math.max(...sorted.map(([, v]) => v.ap), 1);
  return (
    <>
      <div className="disc">📋 Desglose por rubro presupuestal: Gastos de Personal, Adquisición de Bienes, Transferencias, Servicio de la Deuda, Inversión y <b style={{ color: 'var(--red)' }}>Sanciones e Intereses de Mora</b>.</div>
      {sorted.map(([rubro, v], i) => {
        const p = v.ap > 0 ? Math.round(v.comp / v.ap * 100) : 0;
        const sanc = esRubroSancion(rubro, true);
        const col = sanc ? 'var(--red)' : pctColor(p);
        return (
          <div key={rubro} onClick={() => sheet.open(<RubroDetail rubro={rubro} S={S} onClose={sheet.close} />)}
            style={{ background: 'var(--s1)', border: `1px solid ${sanc ? 'rgba(255,23,68,.3)' : 'var(--border)'}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: 'pointer', animation: 'ci .2s ease forwards', opacity: 0, animationDelay: `${i * 0.04}s` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: sanc ? 'var(--red)' : undefined }}>{sanc ? '⚠ ' : ''}{trunc(rubro, 40)}</div>
                {sanc && <div style={{ ...MONO, fontSize: '.5rem', color: 'var(--red)', marginTop: 2 }}>SANCIÓN / MORA — Señal de alerta</div>}
              </div>
              <Tag cls={pctCls(p)} style={{ flexShrink: 0 }}>{p}%</Tag>
            </div>
            <Bar pct={v.ap / maxAp * 100} color={col} height={5} style={{ marginBottom: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={small}>Apropi.: <span style={{ color: 'var(--text)' }}>{fCOP(v.ap)}</span></span>
              <span style={small}>Comprometido: <span style={{ color: col }}>{fCOP(v.comp)}</span></span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Sanciones({ d }) {
  const sanc = d.filter(x => esRubroSancion(rubroDe(x), true));
  const over = d.filter(x => { const ap = num(x.apropiacion_definitiva); return ap > 0 && num(x.compromisos) / ap > 1.05; });
  if (!sanc.length && !over.length)
    return <Empty icon="✅" title="Sin sanciones detectadas" sub="No se encontraron rubros de sanciones o intereses de mora en los datos disponibles. Esto no garantiza ausencia de sanciones." />;
  const total = sanc.reduce((s, x) => s + num(x.compromisos || x.pagos), 0);
  const secT = col => ({ ...MONO, fontSize: '.55rem', color: col, letterSpacing: 2, margin: '14px 0 8px', paddingBottom: 5, borderBottom: '1px solid var(--border)' });
  const big = col => ({ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '1.1rem', color: col });
  return (
    <>
      <div className="disc">⚠ Las <b style={{ color: 'var(--red)' }}>Sanciones e Intereses de Mora</b> en el SIIF son pagos que la entidad realizó por: perder procesos judiciales, multas de organismos de control, intereses por pagos tardíos y condenas judiciales. Son un indicador directo de mala gestión.</div>
      <div style={{ background: 'rgba(255,23,68,.06)', border: '1px solid rgba(255,23,68,.25)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ ...MONO, fontSize: '.55rem', color: 'var(--red)', letterSpacing: 2, marginBottom: 10 }}>🚨 RESUMEN DE ALERTAS PRESUPUESTALES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', marginBottom: 3 }}>TOTAL SANCIONES/MORA</div><div style={big('var(--red)')}>{fCOP(total)}</div></div>
          <div><div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', marginBottom: 3 }}>RUBROS SOBREEJECUTADOS</div><div style={big('var(--yellow)')}>{over.length}</div></div>
        </div>
      </div>
      {!!sanc.length && <div style={secT('var(--red)')}>⚠ SANCIONES E INTERESES DE MORA</div>}
      {sanc.map((x, i) => (
        <NomAlert key={'s' + i} delay={i * 0.07} icon="⚠️" title={trunc(rubroDe(x) || 'Sanción', 45)} meta="SEÑAL DE ALERTA · VERIFICAR CAUSAS EN CONTRALORÍA"
          desc={<>Apropiación: <b>{fCOP(x.apropiacion_definitiva)}</b> · Comprometido: <b style={{ color: 'var(--red)' }}>{fCOP(x.compromisos || x.pagos)}</b><br />
            {x.nombre_entidad && <>Entidad: {trunc(x.nombre_entidad, 40)}<br /></>}{x.vigencia && `Vigencia: ${x.vigencia}`}</>} />
      ))}
      {!!over.length && <div style={secT('var(--yellow)')}>📊 RUBROS SOBREEJECUTADOS (+105%)</div>}
      {over.map((x, i) => {
        const ap = num(x.apropiacion_definitiva), comp = num(x.compromisos);
        return <NomAlert key={'o' + i} warn delay={i * 0.07} icon="📊" title={trunc(x.rubro_presupuestal || x.nombre_entidad || 'Rubro', 45)} meta="RIESGO MEDIO · SOBREEJECUCIÓN"
          desc={`Ejecutado ${Math.round(comp / ap * 100)}% de la apropiación. Comprometido ${fCOP(comp)} sobre un techo de ${fCOP(ap)}. Exceso: ${fCOP(comp - ap)}.`} />;
      })}
      <div className="disc" style={{ marginTop: 14 }}>
        <b>¿Por qué aparecen sanciones en el SIIF?</b><br /><br />
        • <b>Condenas judiciales</b>: La entidad perdió un proceso y debe pagar.<br />
        • <b>Intereses de mora</b>: Pagos tardíos a proveedores o contratistas.<br />
        • <b>Multas de organismos de control</b>: Procuraduría, Contraloría o SIC.<br />
        • <b>Astreintes</b>: Multas diarias por incumplir órdenes judiciales.<br /><br />
        Un alto rubro de sanciones indica litigiosidad elevada o incumplimientos sistemáticos. Cruce con los procesos activos en la Contraloría para identificar el origen.
      </div>
    </>
  );
}

export default function Siif() {
  const { S, loading } = useRadar();
  const [tab, setTab] = useState('resumen');
  return (
    <>
      <PageHeader title="Presupuesto SIIF Nación" sub="MINISTERIO DE HACIENDA · EJECUCIÓN PRESUPUESTAL OFICIAL" />
      <SubTabs value={tab} onChange={setTab} tabs={[['resumen', '📊 RESUMEN'], ['rubros', '📋 RUBROS'], ['sanciones', '⚠ SANCIONES']]} />
      {loading ? <Loading text="CONSULTANDO SIIF NACIÓN..." /> : !S.siif.length
        ? <Empty icon="💰" title="Sin datos presupuestales" sub='Busque por entidad: "Presidencia", "INVIAS", "Min Salud"' />
        : tab === 'resumen' ? <Resumen d={S.siif} /> : tab === 'rubros' ? <Rubros d={S.siif} /> : <Sanciones d={S.siif} />}
    </>
  );
}
