/* RADAR v7 — app web en React. Port de frontend/index.html */
import React, { useRef, useState } from 'react';
import { RadarProvider, useRadar } from './store';
import { SheetProvider } from './components/Sheet';
import { fCOP, num, analizarAnomalias } from './lib/logic';
import { calcScore, hayDatosScore } from './lib/score';
import IA from './pages/IA';
import Intel from './pages/Intel';
import { Secop, Proc, Rues } from './pages/Listas';
import Grafo from './pages/Grafo';
import Siif from './pages/Siif';
import Nomina from './pages/Nomina';
import { MapaPage, TiempoPage, AlertasPage } from './pages/Mas';
import Score from './pages/Score';
import Simulacion from './pages/Simulacion';
import FuentesEstado from './components/FuentesEstado';
import Legal, { AvisoLegalInicial } from './pages/Legal';

const TABS = [
  ['ia', '🤖', 'Análisis IA'], ['intel', '🧠', 'Inteligencia'], ['sim', '🔮', 'Simulación'],
  ['c', '📄', 'Contratos SECOP'], ['grafo', '🕸️', 'Grafo de relaciones'], ['rues', '🏢', 'Empresas RUES'],
  ['siif', '💰', 'Presupuesto SIIF'], ['nom', '👥', 'Nómina SIGEP'], ['proc', '⚖️', 'Procuraduría'],
  ['mapa', '🗺️', 'Mapa de riesgo'], ['tiempo', '📅', 'Línea de tiempo'], ['alertas', '🔔', 'Alertas y exportar'],
  ['score', '🧮', 'Índice de señales'], ['legal', '📜', 'Legal y privacidad'],
];
// Atajos: solo entidades públicas. No se sugieren nombres de personas (Const. arts. 15 y 21: buen nombre).
const QUICK = [['Presidencia'], ['INVIAS'], ['Alcaldía Bogotá'], ['ICBF'], ['SENA'], ['Min Salud', 'Min. Salud'], ['Gobernación Antioquia', 'Gob. Ant.'], ['DNP']];

const Logo = () => (
  <svg viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="12" stroke="#00e676" strokeWidth=".7" opacity=".2" />
    <circle cx="14" cy="14" r="7.5" stroke="#00e676" strokeWidth=".7" opacity=".38" />
    <circle cx="14" cy="14" r="3.5" stroke="#00e676" strokeWidth=".7" opacity=".6" />
    <circle cx="14" cy="14" r="1.6" fill="#00e676" />
    <line x1="14" y1="2" x2="14" y2="26" stroke="#00e676" strokeWidth=".3" opacity=".12" />
    <line x1="2" y1="14" x2="26" y2="14" stroke="#00e676" strokeWidth=".3" opacity=".12" />
    <line x1="20" y1="14" x2="26" y2="7" stroke="#00e676" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

function Main() {
  const { S, loading, progress, backend, buscar, saveAlert, saved, toast, fallo } = useRadar();
  const [tab, setTab] = useState('ia');
  const [q, setQ] = useState('');
  const [ced, setCed] = useState('');
  const content = useRef(null);

  const go = (qq = q, cc = ced) => buscar(qq, cc);
  const quick = value => { setQ(value); go(value, ced); };
  const nav = id => { setTab(id); if (content.current) content.current.scrollTop = 0; };
  const searchFrom = (qq, cc) => { setQ(qq); setCed(cc); go(qq, cc); };

  const be = !backend.checked ? ['⬤ BACKEND', undefined, ''] : backend.ok
    ? (backend.llm
      ? [`🟢 IA · ${(backend.provider || '').toUpperCase()} ${backend.model || ''}`.trim(), 'var(--green)', 'Todas las consultas de IA usan este modelo']
      : ['🟡 BACKEND (sin IA)', 'var(--yellow)', `Modelo ${backend.model || ''} no disponible: ¿está corriendo Ollama?`])
    : ['🔴 BACKEND OFF', 'var(--red)', 'Backend no disponible — no se pueden hacer búsquedas'];
  const searched = !!(S.lastQ || S.lastCed);
  const siifTotal = S.siif.reduce((s, x) => s + num(x.apropiacion_definitiva || x.apropiacion), 0);
  const kpi = v => (searched ? v : '—');
  const nomRed = searched ? (S.alerts || []).filter(a => a.severity === 'ALTO').length + analizarAnomalias(S).filter(a => a.type === 'red').length : 0;
  const badges = { proc: S.proc.length, nom: nomRed };
  const scoreColor = hayDatosScore(S) ? calcScore(S).color : null;

  const pages = {
    ia: <IA />, intel: <Intel />, sim: <Simulacion active={tab === 'sim'} />, c: <Secop />, grafo: <Grafo active={tab === 'grafo'} />, rues: <Rues />,
    siif: <Siif />, nom: <Nomina />, proc: <Proc />, mapa: <MapaPage />, tiempo: <TiempoPage active={tab === 'tiempo'} />, alertas: <AlertasPage onSearch={searchFrom} />, score: <Score />,
    legal: <Legal />,
  };

  return (
    <>
      <AvisoLegalInicial onVer={() => nav('legal')} />
      <div className="hdr">
        <div className="logo">
          <Logo />
          <div><div className="logo-name">RADAR</div><div className="logo-ver">v7 INTELIGENCIA INTEGRADA · ANTICORRUPCIÓN COLOMBIA</div></div>
        </div>
        <div className="hdr-r">
          <div className="live-pill" style={{ cursor: 'default', color: be[1] }} title={be[2]}>{be[0]}</div>
          <div className="live-pill"><div className="live-dot" />EN VIVO</div>
          <button className="btn-hdr" onClick={saveAlert} style={{ position: 'relative' }}>
            🔔 ALERTA<span className="notif-dot" style={{ display: saved.length ? 'block' : 'none' }} />
          </button>
        </div>
      </div>

      <div className="sw">
        <div className="sr">
          <div className="siw">
            <input className="si" type="text" placeholder="Nombre, entidad, empresa..." autoComplete="off" autoCorrect="off"
              value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          <input className="si-ced" type="text" placeholder="Cédula/NIT" autoComplete="off"
            value={ced} onChange={e => setCed(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          <button className="btn-go" onClick={() => go()} disabled={loading}>{loading ? progress || '...' : '▶ IR'}</button>
        </div>
        <div className="spills">
          {QUICK.map(([value, label]) => <div key={value} className="pill" onClick={() => quick(value)}>{label || value}</div>)}
        </div>
      </div>

      <div className="kstrip">
        <div className="kc"><div className="kv kg">{kpi(S.c.length)}</div><div className="kl">Contratos<br />SECOP</div></div>
        <div className="kc"><div className="kv kr">{kpi(S.proc.length)}</div><div className="kl">Sanciones<br />Procur.</div></div>
        <div className="kc"><div className="kv ky">{kpi(S.cont.length)}</div><div className="kl">Procesos<br />Fiscal</div></div>
        <div className="kc"><div className="kv kc2">{kpi(S.rues.length)}</div><div className="kl">Empresas<br />RUES</div></div>
        <div className="kc"><div className="kv kb">{searched && siifTotal ? fCOP(siifTotal) : '—'}</div><div className="kl">Presupuesto<br />SIIF</div></div>
      </div>

      <div className="content" ref={content}>
        {searched && !loading && <FuentesEstado fuentes={S.fuentes} fallo={fallo} query={S.lastQ || S.lastCed} />}
        {TABS.map(([id]) => <div key={id} className={`page${tab === id ? ' active' : ''}`}>{pages[id]}</div>)}
      </div>

      <div className="tabbar">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={`tbb${tab === id ? ' active' : ''}`} onClick={() => nav(id)}>
            <span className="tbi">{icon}</span><span className="tbl">{label}</span>
            {id === 'score'
              ? <span className="tbdot" style={{ display: scoreColor ? 'block' : 'none', background: scoreColor || undefined }} />
              : badges[id] ? <span className="tbdot" style={{ display: 'block' }}>{badges[id]}</span> : null}
          </button>
        ))}
      </div>

      <div style={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,230,118,.1)', border: '1px solid rgba(0,230,118,.3)', color: 'var(--green)', fontFamily: 'Space Mono,monospace', fontSize: '.6rem', padding: '9px 16px', borderRadius: 20, zIndex: 9999, letterSpacing: 1, transition: 'opacity .3s', whiteSpace: 'nowrap', opacity: toast ? 1 : 0, pointerEvents: 'none' }}>
        {toast}
      </div>
    </>
  );
}

export default function App() {
  return (
    <RadarProvider>
      <SheetProvider>
        <Main />
      </SheetProvider>
    </RadarProvider>
  );
}
