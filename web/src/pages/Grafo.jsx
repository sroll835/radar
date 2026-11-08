/* Grafo de relaciones — Cytoscape.js con filtros, búsqueda, zoom y detalle por nodo/arista */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { useRadar } from '../store';
import { useSheet, CloseBtn } from '../components/Sheet';
import { PageHeader, Tag, MONO, Lbl, riskCls } from '../components/ui';
import { buildElements, fromBackend, CY_LAYOUT, CY_STYLE, NODE_LABELS } from '../lib/graph';

const FILTERS = [['all', 'TODOS', ''], ['prov', 'PROV.', ''], ['ent', 'ENTIDADES', 'red'], ['sanc', 'SANCIONADOS', 'yellow'], ['fiscal', 'FISCAL', ''], ['rues', 'RUES', '']];
const val = { fontSize: '.82rem', fontWeight: 500 };

function NodeDetail({ node, cy, onClose }) {
  const d = node.data();
  const nb = node.neighborhood().nodes().toArray();
  const rk = d.risk || 'BAJO';
  const focus = () => { cy.animate({ fit: { eles: node.closedNeighborhood(), padding: 80 }, duration: 500 }); onClose(false); };
  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 4, background: d.color + '12', border: `1px solid ${d.color}30`, ...MONO, fontSize: '.5rem', fontWeight: 700, color: d.color, marginBottom: 10 }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: d.color }} />{NODE_LABELS[d.type] || d.type}
      </div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '1rem', marginBottom: 3, lineHeight: 1.3 }}>{d.label}</div>
      <div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', letterSpacing: 2, marginBottom: 14 }}>{d.subLabel || ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
        <span style={{ ...MONO, fontSize: '.5rem', color: 'var(--muted2)' }}>Riesgo:</span><Tag cls={riskCls(rk)}>{rk}</Tag>
        <span style={{ ...MONO, fontSize: '.5rem', color: 'var(--muted2)', marginLeft: 6 }}>Conexiones:</span><Tag cls="tb">{node.degree()}</Tag>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 13 }}>
        {d.nit && <div><Lbl>NIT / CÉDULA</Lbl><div style={{ ...val, ...MONO }}>{d.nit}</div></div>}
        {d.value && <div><Lbl>VALOR TOTAL</Lbl><div style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--green)' }}>{d.value}</div></div>}
        {d.depto && <div><Lbl>DEPARTAMENTO</Lbl><div style={val}>{d.depto}</div></div>}
        {d.cargo && <div><Lbl>CARGO</Lbl><div style={val}>{d.cargo}</div></div>}
        {d.sancion && <div style={{ gridColumn: '1/-1' }}><Lbl>TIPO SANCIÓN</Lbl><div style={{ ...val, color: 'var(--red)' }}>{d.sancion}</div></div>}
      </div>
      {!!nb.length && <div style={{ ...MONO, fontSize: '.5rem', color: 'var(--muted2)', letterSpacing: 2, marginBottom: 7, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>CONEXIONES ({nb.length})</div>}
      {nb.map(n => {
        const e = node.connectedEdges().filter(x => x.source().id() === n.id() || x.target().id() === n.id()).first();
        return (
          <div key={n.id()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: n.data('color') || '#888', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.data('label')}</div>
              <div style={{ ...MONO, fontSize: '.5rem', color: 'var(--muted2)', marginTop: 1 }}>{NODE_LABELS[n.data('type')] || n.data('type')} · {e.data('etype') || 'relación'}</div>
            </div>
            {e.data('valueLabel') && <div style={{ ...MONO, fontSize: '.62rem', color: 'var(--green)', whiteSpace: 'nowrap' }}>{e.data('valueLabel')}</div>}
          </div>
        );
      })}
      <button onClick={focus} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--gd)', border: '1px solid rgba(0,230,118,.25)', color: 'var(--green)', ...MONO, fontSize: '.58rem', letterSpacing: 1, padding: 10, borderRadius: 7, cursor: 'pointer', width: '100%', marginTop: 12 }}>
        🔍 Enfocar en grafo
      </button>
      <CloseBtn label="✕ Cerrar y limpiar" onClick={() => onClose(true)} />
    </>
  );
}

function EdgeDetail({ edge, onClose }) {
  const d = edge.data(), src = edge.source().data(), tgt = edge.target().data();
  return (
    <>
      <div style={{ ...MONO, fontSize: '.5rem', fontWeight: 700, color: 'var(--green)', marginBottom: 10 }}>CONEXIÓN</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '1rem', marginBottom: 14 }}>{d.etype || 'Relación'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <div><Lbl>ORIGEN</Lbl><div style={{ ...val, color: src.color || '#fff' }}>{src.label || '—'}</div></div>
        <div><Lbl>DESTINO</Lbl><div style={{ ...val, color: tgt.color || '#fff' }}>{tgt.label || '—'}</div></div>
        {d.valueLabel && <div><Lbl>VALOR</Lbl><div style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--green)' }}>{d.valueLabel}</div></div>}
        {d.modalidad && <div><Lbl>MODALIDAD</Lbl><div style={{ fontSize: '.82rem' }}>{d.modalidad}</div></div>}
      </div>
      <CloseBtn onClick={onClose} />
    </>
  );
}

export default function Grafo({ active }) {
  const { S } = useRadar();
  const sheet = useSheet();
  const box = useRef(null);
  const tip = useRef(null);
  const cyRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [stats, setStats] = useState(null);

  const elements = useMemo(() => fromBackend(S.graph) || buildElements(S), [S]);

  // Se (re)construye al mostrar la pestaña o al cambiar los datos (Cytoscape necesita el contenedor visible)
  useEffect(() => {
    if (!active || !box.current || !elements.length) return;
    const cy = cytoscape({
      container: box.current, elements, style: CY_STYLE, layout: CY_LAYOUT,
      minZoom: 0.08, maxZoom: 5, wheelSensitivity: 0.25, boxSelectionEnabled: false,
    });
    cyRef.current = cy;
    const clear = () => cy.elements().removeClass('selected highlighted dimmed');
    cy.on('tap', 'node', evt => {
      const n = evt.target;
      clear();
      const hood = n.closedNeighborhood();
      cy.elements().not(hood).addClass('dimmed');
      hood.edges().addClass('highlighted');
      n.addClass('selected');
      sheet.open(<NodeDetail node={n} cy={cy} onClose={limpiar => { if (limpiar) clear(); sheet.close(); }} />);
    });
    cy.on('tap', 'edge', evt => sheet.open(<EdgeDetail edge={evt.target} onClose={sheet.close} />));
    cy.on('tap', evt => { if (evt.target === cy) { clear(); sheet.close(); setFound(null); } });
    cy.on('mouseover', 'node', evt => {
      const n = evt.target, t = tip.current, r = box.current.getBoundingClientRect();
      t.innerHTML = `<b style="color:${n.data('color')}">${n.data('label')}</b><br>${NODE_LABELS[n.data('type')] || n.data('type')}<br>Conexiones: ${n.degree()}${n.data('value') ? '<br>Valor: ' + n.data('value') : ''}`;
      t.style.left = r.left + n.renderedPosition().x + 16 + 'px';
      t.style.top = r.top + n.renderedPosition().y - 40 + 'px';
      t.style.display = 'block';
    });
    cy.on('mouseout', 'node', () => { tip.current.style.display = 'none'; });
    setStats({
      nodes: cy.nodes().length, edges: cy.edges().length,
      alto: cy.nodes().filter(n => n.data('risk') === 'ALTO').length, comp: cy.elements().components().length,
    });
    setFilter('all'); setQ(''); setFound(null);
    return () => { cy.destroy(); cyRef.current = null; };
  }, [active, elements, sheet]);

  const applyFilter = type => {
    setFilter(type);
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('dimmed');
    setFound(null);
    if (type === 'all') return;
    const target = cy.nodes(`[type="${type}"]`);
    if (!target.length) return;
    const visible = target.union(target.neighborhood());
    cy.elements().addClass('dimmed');
    visible.removeClass('dimmed');
    cy.animate({ fit: { eles: visible, padding: 50 }, duration: 400 });
  };

  const search = text => {
    setQ(text);
    const cy = cyRef.current;
    const ql = text.trim().toLowerCase();
    if (!cy) return;
    cy.elements().removeClass('highlighted dimmed selected');
    if (!ql) { setFound(null); return; }
    const m = cy.nodes().filter(n => (n.data('label') || '').toLowerCase().includes(ql));
    if (!m.length) { setFound(0); return; }
    cy.elements().addClass('dimmed');
    m.addClass('highlighted').removeClass('dimmed');
    m.neighborhood().removeClass('dimmed').edges().addClass('highlighted');
    cy.animate({ fit: { eles: m, padding: 80 }, duration: 400 });
    setFound(m.length);
  };

  const cy = () => cyRef.current;
  return (
    <>
      <PageHeader title="Grafo de Relaciones" sub="CYTOSCAPE.JS · ZOOM · TOQUE PARA DETALLES" />
      <div className="grafo-controls">
        <input className="grafo-search" type="text" placeholder="🔍 Buscar nodo..." autoComplete="off" value={q}
          onChange={e => search(e.target.value)} onKeyDown={e => e.key === 'Escape' && search('')} />
        {FILTERS.map(([id, label, color]) => (
          <button key={id} className={`gcbtn ${color}${filter === id ? ' on' : ''}`} onClick={() => applyFilter(id)}>{label}</button>
        ))}
        <button className="gcbtn" onClick={() => cy()?.layout(CY_LAYOUT).run()}>REORGANIZAR</button>
        <button className="gcbtn" onClick={() => cy()?.fit(null, 40)}>FIT</button>
      </div>
      <div className="grafo-wrap">
        <div id="cy-grafo" ref={box} />
        {!elements.length && (
          <div className="empty" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="ei">🕸️</div><div className="et">Sin relaciones</div><div className="es">Realice una búsqueda para construir el grafo</div>
          </div>
        )}
        <div className="grafo-legend-ov">
          {[['#00e676', 'Proveedor'], ['#ff1744', 'Entidad'], ['#ffd600', 'Sancionado'], ['#448aff', 'Fiscal'], ['#00e5ff', 'RUES']].map(([c, l]) => (
            <div key={l} className="gl"><div className="gld" style={{ background: c }} />{l}</div>
          ))}
        </div>
        {found !== null && (
          <div className="grafo-found" style={{ display: 'block', color: found ? 'var(--green)' : 'var(--red)', borderColor: found ? 'rgba(0,230,118,.3)' : 'rgba(255,23,68,.3)' }}>
            {found ? `${found} nodo(s) encontrado(s)` : 'Sin resultados'}
          </div>
        )}
        <div className="grafo-zoom">
          <div className="gz-btn" onClick={() => cy() && cy().zoom(cy().zoom() * 1.3)}>+</div>
          <div className="gz-btn" onClick={() => cy() && cy().zoom(cy().zoom() * 0.77)}>−</div>
          <div className="gz-btn" onClick={() => cy()?.fit(null, 40)}>⊡</div>
        </div>
      </div>
      <div className="grafo-stats">
        <div className="gs-item"><div className="gs-val kg">{stats ? stats.nodes : '—'}</div><div className="gs-lbl">Nodos</div></div>
        <div className="gs-item"><div className="gs-val ky">{stats ? stats.edges : '—'}</div><div className="gs-lbl">Conexiones</div></div>
        <div className="gs-item"><div className="gs-val kr">{stats ? stats.alto : '—'}</div><div className="gs-lbl">Riesgo alto</div></div>
        <div className="gs-item"><div className="gs-val kb">{stats ? stats.comp : '—'}</div><div className="gs-lbl">Clusters</div></div>
      </div>
      <div className="cy-tip" ref={tip} />
    </>
  );
}
