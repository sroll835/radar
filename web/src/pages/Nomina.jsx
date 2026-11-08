/* Inteligencia de Nómina — funcionarios, salarios y anomalías (portado de search.js) */
import React, { useMemo, useState } from 'react';
import { useRadar } from '../store';
import { useSheet } from '../components/Sheet';
import { FuncionarioDetail } from '../components/details';
import { Bar, Card, Empty, Loading, MONO, NomAlert, PageHeader, SubTabs, Tag } from '../components/ui';
import { fCOP, trunc, nombreFuncionario, conSalario, analizarAnomalias, ESCALA_SALARIAL, NIVELES, NIVEL_COLOR } from '../lib/logic';

function Funcionarios({ list, loading }) {
  const { saveAlert } = useRadar();
  const sheet = useSheet();
  const masa = list.reduce((s, f) => s + f._salario, 0);
  return (
    <>
      <div className="disc">📋 Servidores públicos del SIGEP — Datos oficiales del Departamento Administrativo de la Función Pública.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        <div className="bk"><div className="bkv kg">{list.length || '—'}</div><div className="bkl">Funcionarios</div></div>
        <div className="bk"><div className="bkv ky">{list.length ? fCOP(masa) : '—'}</div><div className="bkl">Masa salarial/mes</div></div>
        <div className="bk"><div className="bkv kb">{list.length ? fCOP(Math.round(masa / list.length)) : '—'}</div><div className="bkl">Salario promedio</div></div>
      </div>
      {loading ? <Loading text="CONSULTANDO SIGEP..." /> : !list.length ? <Empty icon="👥" title="Sin funcionarios" sub="Busque por entidad o nombre" /> : (
        <div className="card-list">
          {list.map((f, i) => {
            const col = NIVEL_COLOR[f._nivel] || '#dde4f5';
            const vinc = f.tipo_vinculacion || f.vinculacion || 'N/A';
            const vcls = vinc.toLowerCase().includes('carrera') ? 'tg' : vinc.toLowerCase().includes('provisional') ? 'ty' : 'tb';
            return (
              <Card key={i} delay={i * 0.04} icon="💼" title={trunc(nombreFuncionario(f), 34)}
                sub={`${trunc(f.nombre_cargo || f.cargo || 'Cargo N/A', 36)} · ${trunc(f.nombre_entidad || f.entidad || 'Entidad N/A', 26)}`}
                onClick={() => sheet.open(<FuncionarioDetail f={f} onAlert={() => { saveAlert(); sheet.close(); }} />)}>
                <Tag style={{ background: col + '18', color: col, border: `1px solid ${col}30` }}>{f._nivel}</Tag>
                <Tag cls={vcls}>{trunc(vinc, 18)}</Tag>
                <Tag cls="tg" style={{ fontWeight: 700 }}>{fCOP(f._salario)}/mes</Tag>
                {f.grado && <Tag cls="tb">Grado {f._grado}</Tag>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Salarios({ list }) {
  if (!list.length) return <Empty icon="💰" title="Sin datos" sub="Realice una búsqueda primero" />;
  const byNivel = {};
  list.forEach(f => { (byNivel[f._nivel] = byNivel[f._nivel] || []).push(f); });
  const m = { ...MONO, color: 'var(--muted2)' };
  return (
    <>
      <div className="disc">💰 Escala salarial oficial — Decreto 611 de 2025. Los salarios se calculan automáticamente por nivel jerárquico y grado.</div>
      <div className="budget-bar-wrap" style={{ marginBottom: 12 }}>
        <div className="bb-title" style={{ fontSize: '.78rem', marginBottom: 8 }}>Escala Salarial Oficial — Decreto 611/2025</div>
        {NIVELES.map(n => {
          const vals = Object.values(ESCALA_SALARIAL[n]);
          const max = Math.max(...vals);
          return (
            <div key={n} className="bb-row">
              <div className="bb-label" style={{ color: NIVEL_COLOR[n], fontWeight: 600 }}>{n}</div>
              <div className="bb-bar-wrap"><div className="bb-bar" style={{ width: `${Math.round(max / 28000000 * 100)}%`, background: NIVEL_COLOR[n] }} /></div>
              <div className="bb-val" style={{ minWidth: 130, textAlign: 'right' }}>{fCOP(Math.min(...vals))} – {fCOP(max)}</div>
            </div>
          );
        })}
      </div>
      {NIVELES.filter(n => byNivel[n]?.length).map(n => {
        const g = byNivel[n];
        const masa = g.reduce((s, f) => s + f._salario, 0);
        const prom = Math.round(masa / g.length);
        const col = NIVEL_COLOR[n];
        return (
          <div key={n} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: '6px 6px 0 0', borderBottom: `2px solid ${col}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: '.88rem', color: col }}>{n}</span>
                <Tag cls="tb" style={{ marginLeft: 4 }}>{g.length} funcionarios</Tag>
              </div>
              <div style={{ ...m, fontSize: '.58rem' }}>Masa: <span style={{ color: 'var(--green)' }}>{fCOP(masa)}/mes</span></div>
            </div>
            <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
              {g.slice(0, 5).map((f, i) => {
                const bc = f._salario > prom * 1.5 ? 'var(--red)' : f._salario > prom ? 'var(--yellow)' : 'var(--green)';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trunc(nombreFuncionario(f), 28)}</div>
                      <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 1 }}>{trunc(f.nombre_cargo || f.cargo || 'N/A', 30)}{f.grado ? ` · Grado ${f._grado}` : ''}</div>
                    </div>
                    <Bar pct={f._salario / prom * 100} color={bc} height={4} style={{ width: 80, flexShrink: 0 }} />
                    <div style={{ ...MONO, fontSize: '.65rem', color: bc, whiteSpace: 'nowrap', width: 70, textAlign: 'right' }}>{fCOP(f._salario)}</div>
                  </div>
                );
              })}
              <div style={{ padding: '7px 12px', ...m, fontSize: '.52rem', textAlign: 'center' }}>{g.length > 5 ? `+ ${g.length - 5} más · ` : ''}Promedio: {fCOP(prom)}/mes</div>
            </div>
          </div>
        );
      })}
      <div className="disc" style={{ marginTop: 10 }}>
        💼 <b>Declaraciones de Bienes y Rentas:</b> Los funcionarios de nivel Directivo y Asesor deben presentar declaración pública de bienes y rentas cada año. Consulte en{' '}
        <a href="https://www.funcionpublica.gov.co" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>funcionpublica.gov.co</a> o directamente en el SIGEP de cada entidad.
      </div>
    </>
  );
}

function Anomalias({ S }) {
  const backend = S.alerts || [];
  const local = analizarAnomalias(S);
  return (
    <>
      <div className="disc">🚨 Detección automática de patrones irregulares comparando SIGEP, SECOP y Decretos Salariales oficiales.</div>
      {!backend.length && !local.length && <Empty icon="✅" title="Sin anomalías críticas" sub="Los patrones analizados no muestran irregularidades de riesgo alto. Esto no garantiza ausencia de corrupción — se recomienda revisión manual." />}
      {backend.map((a, i) => <NomAlert key={'b' + i} delay={i * 0.07} warn={a.severity === 'MEDIO'} icon={a.icon} title={a.titulo} desc={a.desc} meta={[a.meta, a.ley, a.source].filter(Boolean).join(' · ')} />)}
      {local.map((a, i) => <NomAlert key={'l' + i} delay={i * 0.08} warn={a.type === 'yellow'} icon={a.icon} title={a.title} desc={a.desc} meta={a.meta} />)}
    </>
  );
}

export default function Nomina() {
  const { S, loading } = useRadar();
  const [tab, setTab] = useState('funcionarios');
  const list = useMemo(() => S.nom.map(conSalario), [S.nom]);
  return (
    <>
      <PageHeader title="Inteligencia de Nómina" sub="SIGEP · DECRETO SALARIAL · ANOMALÍAS · FANTASMAS" />
      <SubTabs value={tab} onChange={setTab} tabs={[['funcionarios', '👥 FUNCIONARIOS'], ['salarios', '💰 SALARIOS'], ['anomalias', '🚨 ANOMALÍAS']]} />
      {tab === 'funcionarios' && <Funcionarios list={list} loading={loading} />}
      {tab === 'salarios' && <Salarios list={list} />}
      {tab === 'anomalias' && <Anomalias S={S} />}
    </>
  );
}
