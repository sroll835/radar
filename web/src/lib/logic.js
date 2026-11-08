/* RADAR web — lógica de dominio portada de state.js / search.js / render.js */

export const num = v => parseFloat(v) || 0;

export const fCOP = v => {
  const n = num(v);
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toLocaleString('es-CO');
};

export const trunc = (s, n) => (s && s.length > n ? s.substring(0, n) + '…' : s || 'N/A');

/** Nivel de señal por contrato con reglas fijas (no es IA): directa +40, valor > $5.000M +30, 1 oferente +25 */
export const riesgo = c => {
  let s = 0;
  if ((c.modalidad_de_contratacion || '').toLowerCase().includes('directa')) s += 40;
  if (num(c.valor_del_contrato) > 5e9) s += 30;
  if (parseInt(c.numero_de_oferentes, 10) <= 1) s += 25;
  return s >= 55 ? 'ALTO' : s >= 25 ? 'MEDIO' : 'BAJO';
};

export const esDirecta = c => (c.modalidad_de_contratacion || '').toLowerCase().includes('directa');
export const ruesNit = e => e.nit || e.numero_identificacion || '';
export const tipoSancion = s => s.tipo_sancion || s.tipo_de_sancion || 'Sanción';
export const esSancionGrave = s => {
  const t = tipoSancion(s).toLowerCase();
  return t.includes('destituci') || t.includes('inhabilitaci');
};
export const nombreFuncionario = f =>
  `${f.primer_nombre || ''} ${f.segundo_nombre || ''} ${f.primer_apellido || ''} ${f.segundo_apellido || ''}`
    .replace(/\s+/g, ' ').trim() || f.nombre_completo || 'Funcionario';

/** Empresas RUES cuyo NIT aparece como proveedor en SECOP. Es un dato informativo (el registro mercantil del
 *  proveedor), NO un conflicto de interés: casi todo proveedor empresarial está inscrito en el RUES. */
export const proveedoresRues = S => {
  const nits = new Set(S.c.map(c => c.nit_del_proveedor_adjudicado).filter(Boolean));
  return S.rues.filter(e => ruesNit(e) && nits.has(ruesNit(e)));
};

/** Contratos que pertenecen a la entidad buscada. Si se buscó a un contratista (por nombre o NIT), que sus
 *  contratos sean directos o que él sea su propio «proveedor dominante» no es una señal sobre esa persona. */
export const contratosEntidad = S => S.c.filter(c => (c._coincidencia || 'entidad') === 'entidad');

export const totalValor = list => list.reduce((s, c) => s + num(c.valor_del_contrato), 0);

/* ── SIIF ── */
export const rubroDe = x => x.rubro_presupuestal || x.concepto_gasto || x.nombre_rubro || '';
export const esRubroSancion = (rubro, conIntereses = false) => {
  const r = (rubro || '').toLowerCase();
  // SIIF (PGN por rubro) registra estos pagos como «SENTENCIAS Y CONCILIACIONES»
  return ['sancion', 'multa', 'mora', 'condena', 'sentencia', 'conciliaci'].some(k => r.includes(k)) || (conIntereses && r.includes('interes'));
};

/* ── Escala salarial Decreto 611/2025 ── */
export const ESCALA_SALARIAL = {
  Directivo: { 1: 4200000, 2: 4800000, 3: 5500000, 4: 6200000, 5: 7100000, 6: 8200000, 7: 9300000, 8: 10500000, 9: 11800000, 10: 13000000, 11: 13900000, 12: 14900000, 13: 16200000, 14: 17600000, 18: 21000000, 24: 28000000 },
  Asesor: { 1: 2900000, 2: 3300000, 3: 3800000, 4: 4300000, 5: 5000000, 6: 5700000, 7: 6600000, 8: 7500000, 9: 8600000, 10: 9600000, 11: 10700000, 12: 11800000, 13: 12700000, 14: 13200000, 18: 15000000 },
  Profesional: { 1: 2100000, 2: 2400000, 3: 2700000, 4: 3000000, 5: 3400000, 6: 3800000, 7: 4300000, 8: 4800000, 9: 5400000, 10: 5900000, 11: 6500000, 12: 7000000, 13: 7600000, 14: 8100000, 18: 10200000 },
  Técnico: { 1: 1550000, 2: 1650000, 3: 1780000, 4: 1920000, 5: 2060000, 6: 2210000, 7: 2370000, 8: 2530000, 9: 2710000, 10: 2900000, 11: 3100000, 12: 3300000, 13: 3500000, 14: 3700000 },
  Asistencial: { 1: 1160000, 2: 1220000, 3: 1290000, 4: 1370000, 5: 1450000, 6: 1540000, 7: 1650000, 8: 1760000, 9: 1890000, 10: 2030000, 11: 2170000, 12: 2330000, 13: 2490000, 14: 2660000 },
};
export const NIVELES = ['Directivo', 'Asesor', 'Profesional', 'Técnico', 'Asistencial'];

export function getSalario(nivel, grado) {
  const escala = ESCALA_SALARIAL[nivel];
  if (!escala) return null;
  const g = parseInt(grado, 10) || 1;
  const grades = Object.keys(escala).map(Number).sort((a, b) => a - b);
  const closest = grades.reduce((prev, curr) => (Math.abs(curr - g) < Math.abs(prev - g) ? curr : prev));
  return escala[closest];
}

export const NIVEL_COLOR = {
  Directivo: '#ff1744', Asesor: '#ff6d00', Profesional: '#448aff', Técnico: '#00e676', Asistencial: '#505878',
};

export const conSalario = f => {
  const nivel = f.cargo_nivel || f.nivel || 'Profesional';
  const grado = parseInt(f.grado || 1, 10);
  // SIGEP publica la asignación básica real: se usa esa; la escala del decreto solo como estimación si falta
  const real = num(f.asignacion_basica);
  return { ...f, _nivel: nivel, _grado: grado, _salarioReal: real > 0, _salario: real || getSalario(nivel, grado) || 2500000 };
};

/** El dataset SIGEP actual no trae grado: las reglas sobre grado solo se aplican si la columna existe */
export const tieneGrado = f => Object.prototype.hasOwnProperty.call(f, 'grado');

/* ── Análisis de anomalías (analyzeNomina) ── */
export function analizarAnomalias(S) {
  const alerts = [];
  const nom = S.nom;
  const total = nom.length;
  const directivos = nom.filter(f => (f.cargo_nivel || '').toLowerCase().includes('directivo'));

  const topeGrado = nom.filter(f => {
    if (!tieneGrado(f)) return false;
    const nivel = f.cargo_nivel || f.nivel || 'Profesional';
    const sal = getSalario(nivel, parseInt(f.grado || 1, 10));
    if (!sal) return false;
    return sal >= Math.max(...Object.values(ESCALA_SALARIAL[nivel] || {})) * 0.95 && nivel !== 'Directivo';
  });
  if (topeGrado.length) alerts.push({ type: 'yellow', icon: '⚠️',
    title: `${topeGrado.length} funcionario(s) en grado máximo de su nivel`,
    desc: 'Empleados en el tope de la escala salarial de su nivel. Algunos pueden tener primas o bonificaciones adicionales no reportadas en SIGEP que elevan la remuneración total por encima del decreto.',
    meta: 'VERIFICAR · DECRETO 611/2025' });

  if (total > 0 && directivos.length / total > 0.3) alerts.push({ type: 'red', icon: '🚨',
    title: `Alta concentración de cargos directivos (${Math.round(directivos.length / total * 100)}%)`,
    desc: `${directivos.length} de ${total} funcionarios son nivel Directivo. Lo normal es menos del 10-15%. Una proporción alta amerita revisar la estructura de la planta de personal.`,
    meta: 'ALERTA · CONCENTRACIÓN DIRECTIVA' });

  const provisionales = nom.filter(f => (f.tipo_vinculacion || '').toLowerCase().includes('provisional'));
  if (provisionales.length && provisionales.length / total > 0.5) alerts.push({ type: 'yellow', icon: '⚠️',
    title: `${provisionales.length} funcionarios en provisionalidad (${Math.round(provisionales.length / total * 100)}%)`,
    desc: 'Los cargos en provisionalidad superan el 50% de la planta. La Corte Constitucional ha reiterado que los empleos de carrera deben proveerse por concurso de méritos; se recomienda verificar si se han convocado.',
    meta: 'ALERTA MEDIA · ALTA PROVISIONALIDAD' });

  const sinGrado = nom.filter(f => tieneGrado(f) && (!f.grado || f.grado === '0'));
  if (sinGrado.length > 2) alerts.push({ type: 'yellow', icon: '🔍',
    title: `${sinGrado.length} funcionario(s) sin grado salarial registrado en SIGEP`,
    desc: 'Funcionarios sin grado registrado no pueden ser verificados contra el decreto salarial. Esto puede indicar hojas de vida desactualizadas o cargos creados sin clasificar correctamente en la escala.',
    meta: 'VERIFICAR EN SIGEP' });

  // Concentración y contratación directa: solo sobre contratos DE LA ENTIDAD buscada (ver contratosEntidad)
  const ce = contratosEntidad(S);
  const provCount = {};
  ce.forEach(c => { const p = c.nombre_del_proveedor || ''; provCount[p] = (provCount[p] || 0) + 1; });
  const dominant = Object.entries(provCount).sort((a, b) => b[1] - a[1])[0];
  if (dominant && dominant[1] > 3) {
    const val = totalValor(ce.filter(c => c.nombre_del_proveedor === dominant[0]));
    alerts.push({ type: 'yellow', icon: '🔍',
      title: `Concentración de contratos en un proveedor: ${trunc(dominant[0], 28)}`,
      desc: `Aparece en ${dominant[1]} contratos por un valor total de ${fCOP(val)}. La concentración por sí sola no es irregular; conviene revisar cómo se seleccionó al contratista en cada proceso.`,
      meta: `ALERTA MEDIA · ${dominant[1]} CONTRATOS` });
  }

  const directos = ce.filter(esDirecta);
  if (ce.length && directos.length > ce.length * 0.4) alerts.push({ type: 'red', icon: '🔴',
    title: `${Math.round(directos.length / ce.length * 100)}% de los contratos revisados son por contratación directa`,
    desc: `${directos.length} de ${ce.length} contratos usan la modalidad de contratación directa, por ${fCOP(totalValor(directos))}. La contratación directa es legal cuando se configura una causal (Ley 1150/2007 art. 2 num. 4); un porcentaje alto amerita verificar la causal invocada en cada contrato.`,
    meta: 'ALERTA · VERIFICAR CAUSALES · LEY 1150/2007' });
  // (Se eliminó la alerta «conflicto de interés RUES × SECOP»: estar inscrito en el RUES no es un conflicto.)
  return alerts;
}

/* ── Resumen local (buildFallback) ── */
export function resumenLocal(S) {
  if (!S.c.length && !S.proc.length && !S.cont.length && !S.rues.length && !S.siif.length)
    return 'No se encontraron registros para esta búsqueda en las fuentes consultadas.';
  const d = S.c.filter(esDirecta).length;
  const pct = S.c.length ? Math.round(d / S.c.length * 100) : 0;
  let txt = `Se analizaron ${S.c.length} contratos por ${fCOP(totalValor(S.c))}, con ${pct}% adjudicados por contratación directa. `;
  if (S.proc.length) txt += `La Procuraduría registra ${S.proc.length} sanciones disciplinarias. `;
  if (S.cont.length) txt += `La Contraloría reporta ${S.cont.length} procesos de responsabilidad fiscal. `;
  if (S.homonimos?.length) txt += `Hay ${S.homonimos.length} registros de personas distintas con nombre similar que no se atribuyen a esta búsqueda; agregue la cédula para precisarla. `;
  txt += 'Son señales para verificar, no conclusiones sobre responsabilidad.';
  return txt.trim();
}

/* ── Chat sin backend: respuestas por reglas sobre los datos cargados ── */
export function chatLocal(msg, S) {
  const m = msg.toLowerCase();
  if (!S.lastQ && !S.lastCed) return 'Primero realice una búsqueda para que pueda analizar los datos.';
  if (m.includes('conflict') || m.includes('interés') || m.includes('interes'))
    return 'RADAR no puede determinar conflictos de interés: para eso habría que cruzar socios y representantes legales de los proveedores con los funcionarios de la entidad, y las fuentes abiertas consultadas no publican ese dato. Que un proveedor esté inscrito en el RUES es lo normal y no indica conflicto.';
  if (m.includes('empresa') || m.includes('proveedor') || m.includes('ganó') || m.includes('gano')) {
    const by = {};
    S.c.forEach(c => { const p = c.nombre_del_proveedor || '?'; by[p] = (by[p] || 0) + num(c.valor_del_contrato); });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? `Proveedores con mayor valor contratado: ${top.map(([p, v]) => `${p} (${fCOP(v)})`).join('; ')}.` : 'No hay contratos SECOP cargados.';
  }
  if (m.includes('rues') || m.includes('nit')) return `Hay ${S.rues.length} empresa(s) RUES asociadas a la búsqueda; ${proveedoresRues(S).length} son proveedores en SECOP (registro mercantil del proveedor; no indica conflicto de interés).`;
  if (m.includes('presupuesto') || m.includes('siif') || m.includes('ejecut')) {
    const ap = S.siif.reduce((s, x) => s + num(x.apropiacion_definitiva), 0);
    const comp = S.siif.reduce((s, x) => s + num(x.compromisos), 0);
    return S.siif.length ? `Apropiación ${fCOP(ap)}, compromisos ${fCOP(comp)} (${ap ? Math.round(comp / ap * 100) : 0}% ejecutado).` : 'No hay datos SIIF para esta búsqueda.';
  }
  if (m.includes('sanci') || m.includes('procur')) return `La Procuraduría registra ${S.proc.length} sanción(es), ${S.proc.filter(esSancionGrave).length} grave(s) (destitución/inhabilidad).`;
  if (m.includes('fiscal') || m.includes('contralor')) return `Hay ${S.cont.length} proceso(s) fiscal(es) por ${fCOP(S.cont.reduce((s, f) => s + num(f.cuantia_fallo), 0))}.`;
  return resumenLocal(S) + ' (Respuesta local: el backend con IA no está disponible.)';
}
