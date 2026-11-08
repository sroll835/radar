/* Simulación de enjambre — flujo MiroFish adaptado a RADAR:
   1 Grafo semilla → 2 Agentes → 3 Simulación (dos plataformas) → 4 Predicción e informe (ReportAgent) → 5 Interacción */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { useRadar } from '../store';
import { apiGet, apiPost } from '../lib/api';
import { CY_STYLE, fromBackend } from '../lib/graph';
import { Empty, MONO, PageHeader } from '../components/ui';

const FASES = [['grafo', 'Grafo semilla'], ['agentes', 'Agentes'], ['simulacion', 'Simulación'], ['prediccion', 'Predicción'], ['interaccion', 'Interacción']];
const ACCION = { publicar: 'publica', responder: 'responde', compartir: 'comparte', denunciar: 'denuncia', solicitar_informacion: 'derecho de petición',
  comunicado: 'comunicado', citar_debate: 'cita a debate', abrir_indagacion: 'ABRE INDAGACIÓN', imputar: 'IMPUTA CARGOS', evento: 'evento' };
const HITO = new Set(['abrir_indagacion', 'imputar', 'citar_debate']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const posturaColor = p => (p > 0.2 ? 'var(--red)' : p < -0.2 ? 'var(--green)' : 'var(--yellow)');

/* Markdown mínimo y seguro (escapa HTML antes de dar formato) */
function Markdown({ text }) {
  const html = useMemo(() => {
    const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    const out = []; let list = false;
    (text || '').split('\n').forEach(l => {
      const t = l.trim();
      const li = t.match(/^[-*•]\s+(.*)/);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); return; }
      if (list) { out.push('</ul>'); list = false; }
      const h = t.match(/^(#{1,3})\s+(.*)/);
      if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      else if (t) out.push(`<p>${inline(t)}</p>`);
    });
    if (list) out.push('</ul>');
    return out.join('');
  }, [text]);
  return <div className="sim-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MiniGraph({ grafo, active }) {
  const box = useRef(null);
  const n = grafo?.nodes?.length || 0;
  useEffect(() => {
    const els = fromBackend(grafo);
    if (!active || !box.current || !els) return;
    const cy = cytoscape({ container: box.current, elements: els, style: CY_STYLE, minZoom: 0.1, maxZoom: 4, wheelSensitivity: 0.25,
      layout: { name: 'cose', animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, padding: 20 } });
    return () => cy.destroy();
  }, [n, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="sim-mini" ref={box} />;
}

function Metricas({ timeline, hitos, rondas }) {
  const W = 600, H = 170, P = 22;
  const x = r => P + (W - 2 * P) * (r / Math.max(1, rondas));
  const y = v => H - P - (H - 2 * P) * (v / 100);
  const line = (k, f = v => v) => timeline.map((t, i) => `${i ? 'L' : 'M'}${x(t.ronda).toFixed(1)},${y(f(t[k])).toFixed(1)}`).join(' ');
  return (
    <div className="sim-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map(v => <line key={v} x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="#181c28" strokeWidth="1" />)}
        {hitos.map((h, i) => <line key={i} x1={x(h.ronda)} x2={x(h.ronda)} y1={P} y2={H - P} stroke={h.tipo === 'evento' ? '#ffd600' : '#ff1744'} strokeDasharray="3,3" strokeWidth="1" />)}
        {timeline.length > 1 && <>
          <path d={line('atencion')} fill="none" stroke="#00e676" strokeWidth="2" />
          <path d={line('presion')} fill="none" stroke="#ff1744" strokeWidth="2" />
          <path d={line('sentimiento', v => (v + 1) * 50)} fill="none" stroke="#00e5ff" strokeWidth="1.5" strokeDasharray="5,3" />
        </>}
        {Array.from({ length: rondas + 1 }, (_, r) => r).filter(r => r % Math.ceil(rondas / 10 || 1) === 0).map(r => (
          <text key={r} x={x(r)} y={H - 6} fontSize="9" fill="#505878" textAnchor="middle" fontFamily="Space Mono,monospace">R{r}</text>
        ))}
      </svg>
      <div className="sim-legend">
        {[['#00e676', 'Atención pública'], ['#ff1744', 'Presión institucional'], ['#00e5ff', 'Sentimiento hacia la entidad (50 = neutro)'], ['#ffd600', 'Evento / hito']].map(([c, l]) => (
          <div key={l} className="gl"><div className="gld" style={{ background: c }} />{l}</div>
        ))}
      </div>
    </div>
  );
}

function Feed({ titulo, posts, nombres }) {
  return (
    <div className="sim-feed">
      <div className="sim-feed-h">{titulo} · {posts.length}</div>
      {!posts.length && <div className="es" style={{ textAlign: 'center', padding: 20 }}>Sin mensajes todavía</div>}
      {posts.map(p => (
        <div key={p.id} className={`sim-post${p.accion === 'evento' ? ' evento' : HITO.has(p.accion) ? ' hito' : ''}`}>
          <div className="sim-post-h">
            <span><b>{p.nombre}</b> · {ACCION[p.accion] || p.accion}</span>
            <span>R{p.ronda}{p.interacciones ? ` · ♥ ${p.interacciones}` : ''}</span>
          </div>
          {p.responde_a && <div className="sim-reply">↳ en respuesta a {nombres[p.responde_a] || p.responde_a}</div>}
          <div>{p.texto}</div>
        </div>
      ))}
    </div>
  );
}

export default function Simulacion({ active }) {
  const { S, taskId, backend, showToast } = useRadar();
  const [escenario, setEscenario] = useState('');
  const [semilla, setSemilla] = useState('');
  const [rondas, setRondas] = useState(12);
  const [nAg, setNAg] = useState(14);
  const [eventos, setEventos] = useState([]);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({ pct: 0, msg: '' });
  const [sim, setSim] = useState(null);
  const [simId, setSimId] = useState(null);
  const [err, setErr] = useState('');
  const [inject, setInject] = useState('');
  const [plat, setPlat] = useState('todas');
  const [chatWith, setChatWith] = useState('report');
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  const chatRef = useRef(null);
  useEffect(() => () => { alive.current = false; }, []);

  const q = S.lastQ || S.lastCed;
  const defEscenario = `¿Cómo reaccionarán la opinión pública y los entes de control si se difunden los hallazgos de RADAR sobre ${q || 'la entidad'}?`;

  const run = async () => {
    setErr(''); setRunning(true); setSim(null); setChat([]); setChatWith('report'); setProg({ pct: 0, msg: 'Iniciando...' });
    try {
      const start = await apiPost('/simulation/run', {
        task_id: taskId || '', query: S.lastQ || '', escenario: escenario.trim() || defEscenario, semilla,
        rondas, agentes: nAg, eventos: eventos.filter(e => e.texto.trim()),
      });
      if (!start.success) throw new Error(start.error);
      setSimId(start.sim_id);
      for (;;) {
        const r = await apiGet('/simulation/status/' + start.task_id);
        if (!alive.current) return;
        setProg({ pct: r.progress || 0, msg: r.message || '' });
        if (r.result) setSim(r.result);
        if (r.status === 'completed') break;
        if (r.status === 'failed' || r.success === false) throw new Error(r.error || 'Error en la simulación');
        await sleep(1000);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  const doInject = async () => {
    if (!inject.trim() || !simId) return;
    try {
      const r = await apiPost(`/simulation/${simId}/inject`, { texto: inject });
      if (!r.success) throw new Error(r.error);
      showToast('⚡ Evento inyectado en la próxima ronda'); setInject('');
    } catch (e) { showToast('⚠ ' + e.message); }
  };

  const send = async () => {
    const m = msg.trim();
    if (!m || !simId) return;
    setMsg('');
    setChat(c => [...c, { me: true, text: m }, { me: false, text: '…', typing: true }]);
    let text;
    try {
      const r = await apiPost(`/simulation/${simId}/chat`, { agente: chatWith, mensaje: m });
      text = r.success ? r.text : '⚠ ' + r.error;
    } catch (e) { text = '⚠ ' + e.message; }
    setChat(c => [...c.filter(b => !b.typing), { me: false, text }]);
  };

  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [chat]);

  const faseIdx = sim ? FASES.findIndex(f => f[0] === sim.fase) : -1;
  const done = sim && !running && sim.fase === 'interaccion';
  const nombres = useMemo(() => Object.fromEntries((sim?.feed || []).map(p => [p.id, p.nombre])), [sim]);
  const feedPlat = k => [...(sim?.feed || [])].filter(p => k === 'todas' || p.plataforma === k).reverse();
  const agSel = sim?.agentes?.find(a => a.id === chatWith);
  const pickAgent = id => {
    if (!done) return;
    setChatWith(id); setChat([]);
    document.getElementById('sim-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader title="Simulación de Enjambre" sub="GRAFO SEMILLA · AGENTES · SIMULACIÓN SOCIAL · PREDICCIÓN · INTERACCIÓN" />
      <div className="disc">🔮 Ensaya escenarios futuros: un enjambre de agentes ficticios (prensa, veedurías, entes de control, política, la entidad y ciudadanos)
        reacciona a los hallazgos de la búsqueda actual. Es un ejercicio prospectivo — no predice hechos ni constituye conclusión jurídica.</div>

      {backend.checked && !backend.ok && (
        <Empty icon="🔌" title="Requiere el backend" sub="La simulación se ejecuta en el servidor RADAR. Arranque el backend (python run.py) y recargue." />
      )}

      {(!backend.checked || backend.ok) && (
        <div className="sim-form">
          <div>
            <label>ESCENARIO / PREGUNTA DE PREDICCIÓN</label>
            <textarea className="sim-ta" placeholder={defEscenario} value={escenario} onChange={e => setEscenario(e.target.value)} disabled={running} />
          </div>
          <div>
            <label>MATERIAL SEMILLA ADICIONAL (OPCIONAL) — NOTICIA, INFORME O DENUNCIA</label>
            <textarea className="sim-ta" placeholder="Pegue aquí un texto: se extraerán entidades, relaciones y hechos para el grafo semilla."
              value={semilla} onChange={e => setSemilla(e.target.value)} disabled={running} />
          </div>
          <div className="sim-row">
            <div><label>RONDAS: {rondas}</label><input className="sim-range" type="range" min="5" max="40" value={rondas} onChange={e => setRondas(+e.target.value)} disabled={running} /></div>
            <div><label>AGENTES: {nAg}</label><input className="sim-range" type="range" min="8" max="30" value={nAg} onChange={e => setNAg(+e.target.value)} disabled={running} /></div>
          </div>
          <div>
            <label>VARIABLES A INYECTAR (EVENTOS PROGRAMADOS)</label>
            {eventos.map((ev, i) => (
              <div key={i} className="sim-ev">
                <span className="ps">Ronda</span>
                <input type="number" min="1" max={rondas} style={{ width: 56 }} value={ev.ronda} disabled={running}
                  onChange={e => setEventos(es => es.map((x, j) => (j === i ? { ...x, ronda: +e.target.value } : x)))} />
                <input style={{ flex: 1 }} placeholder="Ej: La Fiscalía realiza allanamiento a la entidad" value={ev.texto} disabled={running}
                  onChange={e => setEventos(es => es.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                <button className="gcbtn" onClick={() => setEventos(es => es.filter((_, j) => j !== i))} disabled={running}>✕</button>
              </div>
            ))}
            <button className="gcbtn" onClick={() => setEventos(es => [...es, { ronda: Math.ceil(rondas / 2), texto: '' }])} disabled={running}>+ AÑADIR EVENTO</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-go" style={{ padding: '10px 18px' }} onClick={run} disabled={running}>{running ? `${prog.pct}%` : '▶ SIMULAR'}</button>
            <span className="ps">{q ? `Semilla: búsqueda «${q}»${taskId ? '' : ' (sin backend: solo prensa y texto)'}` : 'Sin búsqueda: use material semilla o busque una entidad primero'}</span>
          </div>
          {err && <div className="disc" style={{ color: 'var(--red)', borderColor: 'rgba(255,23,68,.3)' }}>⚠ {err}</div>}
        </div>
      )}

      {sim && (
        <>
          <div className="sim-steps">
            {FASES.map(([id, label], i) => (
              <div key={id} className={`sim-step${done || i < faseIdx ? ' done' : i === faseIdx ? ' cur' : ''}`}><b>{done || i < faseIdx ? '✓' : i + 1}</b>{label}</div>
            ))}
          </div>
          <div className="sim-prog"><div style={{ width: `${prog.pct}%` }} /></div>
          <div className="ps" style={{ marginBottom: 6 }}>{prog.msg} · modo {sim.modo}</div>

          {/* 1. Grafo semilla */}
          <div className="sim-sec">
            <div className="sim-sec-t">① Grafo semilla <span>{sim.grafo.nodes.length} NODOS · {sim.hechos.length} HECHOS</span></div>
            <div className="sim-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))' }}>
              <div className="sim-hechos">{sim.hechos.map((h, i) => <div key={i}>{h}</div>)}</div>
              {sim.grafo.nodes.length > 0 && <MiniGraph grafo={sim.grafo} active={active} />}
            </div>
          </div>

          {/* 2. Agentes */}
          {!!sim.agentes.length && (
            <div className="sim-sec">
              <div className="sim-sec-t">② Agentes <span>{sim.agentes.length} PERSONAJES FICTICIOS · POSTURA: DEFIENDE ◀ ▶ CUESTIONA{done ? ' · TOQUE PARA ENTREVISTAR' : ''}</span></div>
              <div className="sim-agents">
                {sim.agentes.map(a => (
                  <div key={a.id} className={`sim-ag${chatWith === a.id ? ' on' : ''}`} onClick={() => pickAgent(a.id)}>
                    <div className="sim-ag-n">{a.nombre}</div>
                    <div className="sim-ag-r">{a.rol.toUpperCase()} · {a.plataforma === 'red' ? 'RED SOCIAL' : 'PRENSA/FORO'} · INF {Math.round(a.influencia * 100)}</div>
                    <div className="sim-pbar">
                      <i style={{ left: `calc(${(a.postura0 + 1) * 50}% - 1px)`, background: '#505878' }} title={`Inicial ${a.postura0}`} />
                      <i style={{ left: `calc(${(a.postura + 1) * 50}% - 1px)`, background: posturaColor(a.postura) }} title={`Actual ${a.postura}`} />
                    </div>
                    {a.bio && <div className="sim-ag-b">{a.bio}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Simulación */}
          {sim.timeline.length > 0 && (
            <div className="sim-sec">
              <div className="sim-sec-t">③ Simulación <span>RONDA {sim.ronda_actual}/{sim.rondas} · {sim.feed.length} MENSAJES</span></div>
              <Metricas timeline={sim.timeline} hitos={sim.hitos} rondas={sim.rondas} />
              {!!sim.hitos.length && (
                <div className="ct" style={{ margin: '8px 0' }}>
                  {sim.hitos.map((h, i) => <span key={i} className={`tag ${h.tipo === 'evento' ? 'ty' : 'tr'}`}><span className="td2" />R{h.ronda} · {h.texto}</span>)}
                </div>
              )}
              {running && sim.fase === 'simulacion' && (
                <div className="cir" style={{ position: 'static' }}>
                  <input className="ci2" placeholder="⚡ Inyectar variable ahora (ej: «Se filtra un audio del contratista»)" value={inject}
                    onChange={e => setInject(e.target.value)} onKeyDown={e => e.key === 'Enter' && doInject()} />
                  <button className="bsend" onClick={doInject} title="Inyectar">⚡</button>
                </div>
              )}
              <div className="sim-pick" style={{ marginTop: 8 }}>
                {[['todas', 'AMBAS PLATAFORMAS'], ['red', 'RED SOCIAL'], ['foro', 'PRENSA / FORO']].map(([k, l]) => (
                  <button key={k} className={`gcbtn${plat === k ? ' on' : ''}`} onClick={() => setPlat(k)}>{l}</button>
                ))}
              </div>
              <div className="sim-feeds">
                {(plat === 'todas' || plat === 'red') && <Feed titulo="🐦 RED SOCIAL" posts={feedPlat('red')} nombres={nombres} />}
                {(plat === 'todas' || plat === 'foro') && <Feed titulo="📰 PRENSA / FORO" posts={feedPlat('foro')} nombres={nombres} />}
              </div>
            </div>
          )}

          {/* 4. Predicción e informe */}
          {sim.ensemble && (
            <div className="sim-sec">
              <div className="sim-sec-t">④ Predicción <span>FRECUENCIA EN {sim.ensemble.corridas} CORRIDAS DEL MODELO DE REGLAS</span></div>
              <div className="score-history">
                {[...sim.ensemble.desenlaces].sort((a, b) => b.probabilidad - a.probabilidad).map(d => {
                  const col = d.probabilidad >= 60 ? '#ff1744' : d.probabilidad >= 30 ? '#ffd600' : '#00e676';
                  return (
                    <div key={d.id} className="sh-bar-row" style={{ alignItems: 'center' }}>
                      <div style={{ flex: '0 0 46%', fontSize: '.74rem' }}>{d.evento}</div>
                      <div className="sh-bar-outer"><div className="sh-bar-inner" style={{ width: `${Math.max(d.probabilidad, 2)}%`, background: col }} /></div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, width: 44, textAlign: 'right', color: col }}>{d.probabilidad}%</div>
                    </div>
                  );
                })}
              </div>
              {sim.informe && (
                <>
                  <Markdown text={sim.informe.texto} />
                  {!!sim.informe.pasos?.length && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="ps">RAZONAMIENTO DEL REPORTAGENT ({sim.informe.pasos.length} pasos ReACT)</summary>
                      {sim.informe.pasos.map((p, i) => (
                        <div key={i} style={{ ...MONO, fontSize: '.55rem', color: 'var(--muted2)', margin: '5px 0' }}>
                          {i + 1}. 💭 {p.pensamiento} → 🔧 <span style={{ color: 'var(--cyan)' }}>{p.herramienta}</span>({JSON.stringify(p.args)})
                        </div>
                      ))}
                    </details>
                  )}
                </>
              )}
            </div>
          )}

          {/* 5. Interacción */}
          {done && (
            <div className="sim-sec" id="sim-chat">
              <div className="sim-sec-t">⑤ Interacción <span>CONVERSE CON EL REPORTAGENT O CON CUALQUIER AGENTE</span></div>
              <div className="sim-pick">
                <button className={`gcbtn${chatWith === 'report' ? ' on' : ''}`} onClick={() => { setChatWith('report'); setChat([]); }}>🤖 REPORTAGENT</button>
                {sim.agentes.filter(a => a.tipo !== 'ciudadano').map(a => (
                  <button key={a.id} className={`gcbtn${chatWith === a.id ? ' on' : ''}`} onClick={() => { setChatWith(a.id); setChat([]); }}>{a.nombre}</button>
                ))}
                <select className="si-ced" style={{ width: 'auto', fontSize: '.6rem', padding: '4px 8px' }} value={agSel?.tipo === 'ciudadano' ? chatWith : ''}
                  onChange={e => { if (e.target.value) { setChatWith(e.target.value); setChat([]); } }}>
                  <option value="">Ciudadanos…</option>
                  {sim.agentes.filter(a => a.tipo === 'ciudadano').map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="ps">{chatWith === 'report' ? 'ReportAgent · conoce el informe y el ensemble' : `${agSel?.nombre} · ${agSel?.rol} · ${agSel?.acciones_n} acciones en memoria`}</div>
              <div className="sim-chat" ref={chatRef}>
                {!chat.length && <div className="cb bai">{chatWith === 'report' ? 'Pregúnteme por los desenlaces, los actores clave o las señales a vigilar.' : `Soy ${agSel?.nombre}. Pregúnteme qué hice y por qué durante la simulación.`}</div>}
                {chat.map((b, i) => <div key={i} className={`cb ${b.me ? 'buser' : 'bai'}`}>{b.text}</div>)}
              </div>
              <div className="cir">
                <input className="ci2" placeholder="Escriba su pregunta..." value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
                <button className="bsend" onClick={send}>➤</button>
              </div>
              <div className="disc" style={{ marginTop: 10 }}>Los agentes son personajes ficticios de la simulación: sus respuestas no son declaraciones reales de ninguna persona o entidad.</div>
            </div>
          )}
        </>
      )}
      {!sim && !running && backend.ok && !q && !semilla && (
        <Empty icon="🔮" title="Listo para simular" sub="Realice una búsqueda (o pegue un texto semilla) y pulse ▶ SIMULAR" />
      )}
    </>
  );
}
