/* RADAR web — configuración y elementos del grafo Cytoscape (portado de graph.js) */
import { fCOP, num, riesgo, ruesNit, trunc, tipoSancion, esSancionGrave } from './logic';

export const NODE_COLORS = { prov: '#00e676', ent: '#ff1744', sanc: '#ffd600', fiscal: '#448aff', rues: '#00e5ff', nom: '#e040fb', agente: '#e040fb', semilla: '#ff6d00' };
export const NODE_LABELS = { prov: 'Proveedor', ent: 'Entidad Pública', sanc: 'Sancionado Procur.', fiscal: 'Proceso Fiscal', rues: 'Empresa RUES', nom: 'Nómina Sospechosa', agente: 'Agente simulado', semilla: 'Entidad del documento' };

export const CY_LAYOUT = {
  name: 'cose', animate: true, animationDuration: 800, randomize: false,
  nodeRepulsion: () => 14000, idealEdgeLength: () => 120, edgeElasticity: () => 200, gravity: 0.28,
  numIter: 1000, initialTemp: 800, coolingFactor: 0.99, minTemp: 1, padding: 40,
};

export const CY_STYLE = [
  { selector: 'node', style: {
    'background-color': 'data(color)', 'border-color': 'data(bcolor)', 'border-width': 2,
    width: 'data(size)', height: 'data(size)', label: 'data(slabel)', color: 'rgba(220,230,245,.85)',
    'font-size': '7px', 'font-family': 'Space Mono,monospace', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 4,
    'text-wrap': 'ellipsis', 'text-max-width': '80px', 'text-background-color': 'rgba(5,6,10,.78)', 'text-background-opacity': 1,
    'text-background-padding': '2px', 'text-background-shape': 'roundrectangle',
    'transition-property': 'border-width,opacity', 'transition-duration': '0.2s',
  } },
  { selector: 'node.selected', style: { 'border-width': 4, 'border-color': '#fff' } },
  { selector: 'node.highlighted', style: { 'border-width': 4, 'border-color': '#ffd600' } },
  { selector: 'node.dimmed', style: { opacity: 0.12 } },
  { selector: 'edge', style: {
    width: 'data(w)', 'line-color': 'data(color)', 'line-opacity': 0.45, 'curve-style': 'bezier',
    'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'arrow-scale': 0.65,
    label: 'data(elabel)', 'font-size': '6px', 'font-family': 'Space Mono,monospace', color: 'rgba(80,88,120,.85)',
    'text-rotation': 'autorotate', 'text-background-color': 'rgba(5,6,10,.8)', 'text-background-opacity': 1, 'text-background-padding': '2px',
    'transition-property': 'opacity', 'transition-duration': '0.2s',
  } },
  { selector: 'edge[etype="sancion"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 4], 'line-opacity': 0.6 } },
  { selector: 'edge[etype="conflicto"]', style: { 'line-color': '#00e5ff', 'line-opacity': 0.8, width: 2.5 } },
  { selector: 'edge.highlighted', style: { 'line-opacity': 0.95, width: 3 } },
  { selector: 'edge.dimmed', style: { opacity: 0.04 } },
];

const nSize = (val, type) => {
  const base = { prov: 28, ent: 36, sanc: 30, fiscal: 28, rues: 26, nom: 26 }[type] || 26;
  const n = num(val);
  return n > 5e9 ? base + 18 : n > 1e9 ? base + 10 : n > 5e8 ? base + 5 : base;
};

/** Elementos construidos en el cliente (buildCyElements) */
export function buildElements(S) {
  const nodes = [], edges = [], nm = {};
  const addN = (id, d) => {
    if (nm[id]) return;
    nm[id] = true;
    const color = NODE_COLORS[d.type] || '#888';
    nodes.push({ group: 'nodes', data: { id, color, bcolor: color + 'aa', ...d, slabel: trunc(d.label, 18) } });
  };
  S.c.slice(0, 25).forEach((c, i) => {
    const pid = 'prov_' + (c.nit_del_proveedor_adjudicado || i);
    const eid = 'ent_' + (c.nombre_entidad || 'ent' + i).replace(/\W/g, '_').substring(0, 22);
    const val = num(c.valor_del_contrato);
    addN(pid, { type: 'prov', label: c.nombre_del_proveedor || 'Proveedor', nit: c.nit_del_proveedor_adjudicado || '', value: fCOP(val),
      depto: c.departamento || '', risk: riesgo(c), size: nSize(val, 'prov'), cargo: '', sancion: '', subLabel: 'NIT: ' + (c.nit_del_proveedor_adjudicado || 'N/A') });
    addN(eid, { type: 'ent', label: c.nombre_entidad || 'Entidad', nit: '', value: '', depto: c.departamento || '', risk: 'BAJO',
      size: nSize(val, 'ent'), cargo: '', sancion: '', subLabel: c.departamento || '' });
    edges.push({ group: 'edges', data: { id: 'e_c_' + i, source: pid, target: eid, color: '#00e676', w: val > 2e9 ? 3 : val > 5e8 ? 2 : 1,
      etype: 'contrato', elabel: val > 1e9 ? fCOP(val) : '', valueLabel: fCOP(val), modalidad: c.modalidad_de_contratacion || '' } });
  });
  S.proc.slice(0, 8).forEach((s, i) => {
    const id = 'sanc_' + i;
    const grave = esSancionGrave(s);
    addN(id, { type: 'sanc', label: s.sancionado || s.nombre_sancionado || 'Sancionado', nit: '', value: '', depto: s.departamento || '',
      risk: grave ? 'ALTO' : 'MEDIO', size: grave ? 34 : 26, cargo: s.cargo || '', sancion: tipoSancion(s), subLabel: 'SANCIONES PROCURADURÍA' });
    const ent = s.entidad || s.entidad_sancionadora || '';
    const key = ent.length > 3 && Object.keys(nm).find(k => k.startsWith('ent_') && k.toLowerCase().includes(ent.toLowerCase().replace(/\W/g, '_').substring(0, 8)));
    if (key) edges.push({ group: 'edges', data: { id: 'e_s_' + i, source: id, target: key, color: '#ff1744', w: 1.5, etype: 'sancion', elabel: 'SANCIÓN', valueLabel: tipoSancion(s) } });
  });
  S.cont.slice(0, 6).forEach((p, i) => {
    const cu = num(p.cuantia_fallo || p.valor_cuantia);
    addN('fiscal_' + i, { type: 'fiscal', label: p.nombre_implicado || p.implicado || 'Implicado', nit: '', value: fCOP(cu), depto: p.departamento || '',
      risk: cu > 5e8 ? 'ALTO' : 'MEDIO', size: nSize(cu, 'fiscal'), cargo: '', sancion: '', subLabel: 'PROCESO FISCAL CONTRALORÍA' });
  });
  S.rues.slice(0, 6).forEach((e, i) => {
    const id = 'rues_' + i, nit = ruesNit(e);
    // Mismo NIT en RUES y SECOP = registro mercantil del proveedor. Es informativo, no un «conflicto».
    const mismo = !!nit && S.c.some(c => c.nit_del_proveedor_adjudicado === nit);
    addN(id, { type: 'rues', label: e.razon_social || e.nombre || 'Empresa RUES', nit, value: '', depto: e.ciudad || '', risk: '',
      size: 24, cargo: '', sancion: '', subLabel: 'REGISTRO ÚNICO EMPRESARIAL' });
    if (mismo && nm['prov_' + nit]) edges.push({ group: 'edges', data: { id: 'e_rues_' + i, source: id, target: 'prov_' + nit, color: '#00e5ff', w: 1.5,
      etype: 'registro', elabel: '', valueLabel: 'Registro mercantil del proveedor' } });
  });
  return [...nodes, ...edges];
}

/** Normaliza el grafo del backend: tipo 'entidad' → 'ent', valores numéricos → COP, etiqueta corta */
export function fromBackend(g) {
  if (!g?.nodes?.length) return null;
  const nodes = g.nodes.map(n => {
    const d = { ...(n.data || n) };
    if (d.type === 'entidad') d.type = 'ent';
    if (typeof d.value === 'number') d.value = d.value ? fCOP(d.value) : '';
    d.color = d.color || NODE_COLORS[d.type] || '#888';
    d.bcolor = d.bcolor || d.color + 'aa';
    d.slabel = trunc(d.label, 18);
    return { group: 'nodes', data: d };
  });
  const ids = new Set(nodes.map(n => n.data.id));
  const edges = (g.edges || []).map(e => ({ group: 'edges', data: { ...(e.data || e) } })).filter(e => ids.has(e.data.source) && ids.has(e.data.target));
  return [...nodes, ...edges];
}
