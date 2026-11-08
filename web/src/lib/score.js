/* RADAR web — Índice de señales de riesgo (antes «Score de Corrupción»)
   Escala 0 (sin señales) → 100 (muchas señales para verificar), 5 dimensiones ponderadas.
   Mide cuántas señales aparecen en datos públicos; NO mide ni afirma corrupción de nadie (Const. arts. 15, 21 y 29). */
import { fCOP, num, esDirecta, tieneGrado, contratosEntidad } from './logic';

export const INDICE_NOMBRE = 'Índice de señales de riesgo';

export const SCORE_CONFIG = {
  dims: [
    { id: 'contratacion', label: 'Contratación Pública', weight: 40, icon: '📄', color: '#448aff',
      desc: 'Modalidad, competencia y concentración de proveedores (SECOP II)',
      factors: [
        { id: 'directa', label: 'Contratación directa', max: 25, icon: '🔴', ley: 'Art.2 Ley 1150/2007' },
        { id: 'monop', label: 'Proveedor dominante', max: 15, icon: '⚠️', ley: 'Principio selección objetiva' },
        { id: 'un_oferente', label: 'Contratos sin competencia', max: 15, icon: '🔴', ley: 'Art.88 Ley 1474/2011' },
        { id: 'valor_alto', label: 'Contratos de alto valor', max: 10, icon: '💰', ley: 'Supervisión Contraloría' },
      ] },
    { id: 'disciplinario', label: 'Control Disciplinario', weight: 25, icon: '⚖️', color: '#ffd600',
      desc: 'Sanciones activas y gravedad según Procuraduría General (SIRI)',
      factors: [
        { id: 'destituciones', label: 'Destituciones/Inhabilitaciones', max: 30, icon: '🚨', ley: 'Art. 48 Ley 1952/2019' },
        { id: 'suspensiones', label: 'Suspensiones en servicio', max: 15, icon: '⚠️', ley: 'Art. 48 Ley 1952/2019' },
        { id: 'multas', label: 'Multas disciplinarias', max: 10, icon: '💰', ley: 'Art. 48 Ley 1952/2019' },
      ] },
    { id: 'fiscal', label: 'Responsabilidad Fiscal', weight: 22, icon: '🔎', color: '#ff1744',
      desc: 'Daño al patrimonio público según Contraloría General',
      factors: [
        { id: 'activos_altos', label: 'Procesos activos alto valor', max: 40, icon: '🔴', ley: 'Ley 610/2000' },
        { id: 'cobro_coactivo', label: 'Fallos en cobro coactivo', max: 30, icon: '⚠️', ley: 'Ley 610/2000' },
        { id: 'cuantia_total', label: 'Cuantía total en riesgo', max: 20, icon: '💸', ley: 'Ley 610/2000' },
      ] },
    { id: 'presupuestal', label: 'Ejecución Presupuestal', weight: 10, icon: '💰', color: '#ff6d00',
      desc: 'Anomalías de ejecución y rubros de sanciones (SIIF Nación)',
      factors: [
        { id: 'sanciones_siif', label: 'Rubros de sanciones/mora', max: 50, icon: '🚨', ley: 'Decreto 111/1996' },
        { id: 'sobreejecucion', label: 'Sobrejecución presupuestal', max: 30, icon: '📊', ley: 'EOP Art.38' },
        { id: 'subejec', label: 'Subejecución grave (<30%)', max: 20, icon: '📉', ley: 'EOP Art.38' },
      ] },
    // (Se eliminó la dimensión «Conflicto de Interés RUES × SECOP»: estar en el RUES y contratar con el Estado es lo
    //  normal para un proveedor y no indica conflicto. Su peso (7%) pasó a Contratación (+5) y Fiscal (+2).)
    { id: 'nomina', label: 'Anomalías de Nómina', weight: 3, icon: '👥', color: '#e040fb',
      desc: 'Estructura de planta y vinculación laboral (SIGEP / DAFP)',
      factors: [
        { id: 'alta_dir', label: 'Exceso de cargos directivos', max: 40, icon: '⚠️', ley: 'DAFP' },
        { id: 'provisional', label: 'Alta provisionalidad', max: 35, icon: '📋', ley: 'Sentencia C-588/09' },
        { id: 'sin_grado', label: 'Sin grado salarial registrado', max: 25, icon: '🔍', ley: 'Decreto 611/2025' },
      ] },
  ],
};

const F = (dim, id) => SCORE_CONFIG.dims.find(d => d.id === dim).factors.find(f => f.id === id);
const lower = v => (v || '').toLowerCase();

export function calcScore(S) {
  const dims = {};

  // 1. Contratación (directa y concentración solo sobre contratos de la entidad buscada, ver contratosEntidad)
  let d1 = 0; const i1 = [];
  const ce = contratosEntidad(S);
  const totalC = S.c.length || 1;
  const directos = ce.filter(esDirecta);
  const pctDir = ce.length ? directos.length / ce.length * 100 : 0;
  const ptDir = Math.min(25, pctDir * 0.5);
  if (ptDir > 0) i1.push({ ...F('contratacion', 'directa'), pts: Math.round(ptDir), detail: `${Math.round(pctDir)}% contratos directos (${directos.length})` });
  d1 += ptDir;
  const provCount = {};
  ce.forEach(c => { const p = c.nombre_del_proveedor || '?'; provCount[p] = (provCount[p] || 0) + 1; });
  const maxProv = Math.max(...Object.values(provCount), 0);
  const ptMonop = maxProv > 5 ? 15 : maxProv > 3 ? 9 : maxProv > 2 ? 4 : 0;
  const topProv = Object.entries(provCount).sort((a, b) => b[1] - a[1])[0];
  if (ptMonop > 0) i1.push({ ...F('contratacion', 'monop'), pts: ptMonop, detail: topProv ? `${topProv[0].substring(0, 28)} (${topProv[1]} contratos)` : '' });
  d1 += ptMonop;
  const sinComp = S.c.filter(c => parseInt(c.numero_de_oferentes || 2, 10) <= 1);
  const ptUno = Math.min(15, sinComp.length / totalC * 30);
  if (ptUno > 0) i1.push({ ...F('contratacion', 'un_oferente'), pts: Math.round(ptUno), detail: `${sinComp.length} contratos con 1 o 0 oferentes` });
  d1 += ptUno;
  const valAlto = S.c.filter(c => num(c.valor_del_contrato) > 5e9);
  const ptVal = Math.min(10, valAlto.length * 2);
  if (ptVal > 0) i1.push({ ...F('contratacion', 'valor_alto'), pts: ptVal, detail: `${valAlto.length} contratos >$5.000M` });
  d1 += ptVal;
  dims.contratacion = { score: Math.round(Math.min(d1, 100)), items: i1 };

  // 2. Disciplinario
  let d2 = 0; const i2 = [];
  const graves = S.proc.filter(s => lower(s.gravedad || s.tipo_sancion).includes('grave') || lower(s.tipo_sancion).includes('destituci') || lower(s.tipo_sancion).includes('inhabilitaci'));
  const ptDest = Math.min(30, graves.length * 10);
  if (ptDest > 0) i2.push({ ...F('disciplinario', 'destituciones'), pts: ptDest, detail: `${graves.length} sanciones graves` });
  d2 += ptDest;
  const susps = S.proc.filter(s => lower(s.tipo_sancion).includes('suspensi'));
  const ptSusp = Math.min(15, susps.length * 5);
  if (ptSusp > 0) i2.push({ ...F('disciplinario', 'suspensiones'), pts: ptSusp, detail: `${susps.length} suspensiones` });
  d2 += ptSusp;
  const multas = S.proc.filter(s => lower(s.tipo_sancion).includes('multa'));
  const ptMulta = Math.min(10, multas.length * 3);
  if (ptMulta > 0) i2.push({ ...F('disciplinario', 'multas'), pts: ptMulta, detail: `${multas.length} multas disciplinarias` });
  d2 += ptMulta;
  dims.disciplinario = { score: Math.round(Math.min(d2, 100)), items: i2 };

  // 3. Fiscal
  let d3 = 0; const i3 = [];
  const activosAltos = S.cont.filter(f => num(f.cuantia_fallo) > 1e8 && (f.estado_proceso || '').includes('ACTIVO'));
  const ptFisc = Math.min(40, activosAltos.length * 12);
  if (ptFisc > 0) i3.push({ ...F('fiscal', 'activos_altos'), pts: ptFisc, detail: `${activosAltos.length} procesos activos >$100M` });
  d3 += ptFisc;
  const cobro = S.cont.filter(f => (f.estado_proceso || '').includes('COBRO'));
  const ptCobro = Math.min(30, cobro.length * 10);
  if (ptCobro > 0) i3.push({ ...F('fiscal', 'cobro_coactivo'), pts: ptCobro, detail: `${cobro.length} fallos en cobro coactivo` });
  d3 += ptCobro;
  const totalFiscal = S.cont.reduce((s, f) => s + num(f.cuantia_fallo), 0);
  const ptCuant = Math.min(20, Math.log10(totalFiscal + 1) * 3);
  if (ptCuant > 2) i3.push({ ...F('fiscal', 'cuantia_total'), pts: Math.round(ptCuant), detail: `Total: ${fCOP(totalFiscal)}` });
  d3 += ptCuant;
  dims.fiscal = { score: Math.round(Math.min(d3, 100)), items: i3 };

  // 4. Presupuestal
  let d4 = 0; const i4 = [];
  const sancs = S.siif.filter(s => ['sancion', 'condena', 'mora', 'multa'].some(x => lower(s.rubro_presupuestal).includes(x)));
  const valSancs = sancs.reduce((s, x) => s + num(x.compromisos), 0);
  const ptS = Math.min(50, Math.log10(valSancs + 1) * 5);
  if (ptS > 2) i4.push({ ...F('presupuestal', 'sanciones_siif'), pts: Math.round(ptS), detail: `${fCOP(valSancs)} en sanciones/mora` });
  d4 += ptS;
  const bump = (id, pts, detail) => {
    const ex = i4.find(x => x.id === id);
    if (ex) ex.pts += pts; else i4.push({ ...F('presupuestal', id), pts, detail });
  };
  S.siif.forEach(s => {
    const ap = num(s.apropiacion_definitiva), comp = num(s.compromisos);
    if (ap > 0 && comp / ap > 1.05) { d4 += 5; bump('sobreejecucion', 5, (s.rubro_presupuestal || '').substring(0, 30)); }
    if (ap > 0 && comp / ap < 0.3 && comp > 0) { d4 += 3; bump('subejec', 3, (s.rubro_presupuestal || '').substring(0, 30)); }
  });
  i4.forEach(i => { i.pts = Math.min(i.pts, i.max); });
  dims.presupuestal = { score: Math.round(Math.min(d4, 100)), items: i4 };

  // 5. Nómina
  let d6 = 0; const i6 = [];
  const planta = S.sigep.length ? S.sigep : S.nom;
  if (planta.length) {
    const n = planta.length;
    const pctD = planta.filter(f => lower(f.cargo_nivel) === 'directivo').length / n * 100;
    if (pctD > 30) { const pt = Math.min(40, (pctD - 30) * 2); d6 += pt; i6.push({ ...F('nomina', 'alta_dir'), pts: Math.round(pt), detail: `${Math.round(pctD)}% directivos (>30% anormal)` }); }
    const pctP = planta.filter(f => lower(f.tipo_vinculacion).includes('provisional')).length / n * 100;
    if (pctP > 50) { const pt = Math.min(35, (pctP - 50) * 0.7); d6 += pt; i6.push({ ...F('nomina', 'provisional'), pts: Math.round(pt), detail: `${Math.round(pctP)}% en provisionalidad` }); }
    const sinGrado = planta.filter(f => tieneGrado(f) && (!f.grado || f.grado === '0'));   // el dataset actual no publica grado
    if (sinGrado.length > 2) { const pt = Math.min(25, sinGrado.length * 3); d6 += pt; i6.push({ ...F('nomina', 'sin_grado'), pts: pt, detail: `${sinGrado.length} sin grado registrado` }); }
  }
  dims.nomina = { score: Math.round(Math.min(d6, 100)), items: i6 };

  const total = Math.round(Math.min(SCORE_CONFIG.dims.reduce((s, d) => s + dims[d.id].score / 100 * d.weight, 0), 100));
  const [nivel, color] =
    total >= 75 ? ['MUY ALTO', '#ff1744'] :
    total >= 55 ? ['ALTO', '#ff6d00'] :
    total >= 35 ? ['MODERADO', '#ffd600'] :
    total >= 15 ? ['BAJO', '#00bcd4'] : ['MÍNIMO', '#00e676'];
  return { total, nivel, color, dims };
}

export const hayDatosScore = S => !!(S.c.length || S.proc.length || S.cont.length || S.siif.length);

export function scoreTexto(S, sc) {
  return [
    `${INDICE_NOMBRE.toUpperCase()} — RADAR`,
    `Búsqueda: ${S.lastQ || S.lastCed || 'N/A'}`,
    `Índice: ${sc.total}/100 — Nivel de señales: ${sc.nivel}`,
    `Fecha: ${new Date().toLocaleString('es-CO')}`,
    '',
    ...SCORE_CONFIG.dims.map(dim => {
      const d = sc.dims[dim.id];
      return `${dim.label}: ${d.score}/100 (peso ${dim.weight}%)${d.items.map(i => `\n  - ${i.label}: ${i.pts} pts — ${i.detail || ''}`).join('')}`;
    }),
    '',
    'Metodología: reglas propias de RADAR sobre datos abiertos de datos.gov.co (SECOP II, SIRI, Contraloría, SIIF, SIGEP).',
    'Advertencia: cuenta señales que ameritan verificación. No es una conclusión jurídica ni afirma que una persona o entidad haya cometido una falta o delito.',
  ].join('\n');
}
