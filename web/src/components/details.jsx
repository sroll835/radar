/* Contenido de los paneles de detalle (portado de sheets.js / search.js) */
import React from 'react';
import { fCOP, num, riesgo, esDirecta, ruesNit, trunc, tipoSancion, nombreFuncionario, getSalario, NIVEL_COLOR, rubroDe, esRubroSancion } from '../lib/logic';
import { CloseBtn, Flags, ShGrid } from './Sheet';
import { Bar, Lbl, MONO, Tag, riskCls } from './ui';

const pctColor = p => (p > 90 ? 'var(--red)' : p > 60 ? 'var(--yellow)' : 'var(--green)');

export function ContratoDetail({ c, S, onAlert }) {
  const r = riesgo(c);
  const flags = [];
  if (esDirecta(c)) flags.push('Contratación directa — legal si hay causal (Ley 1150/2007 art. 2 num. 4); verificar la causal invocada');
  if (parseInt(c.numero_de_oferentes, 10) <= 1) flags.push('Solo un oferente — competencia restringida');
  if (num(c.valor_del_contrato) > 5e9) flags.push('Valor > $5.000M — supervisión reforzada');
  const url = typeof c.urlproceso === 'object' ? c.urlproceso?.url : c.urlproceso;
  return (
    <>
      <div className="sh-title">{trunc(c.nombre_del_proveedor || c.nit_del_proveedor_adjudicado, 48)}</div>
      <div className="sh-sub">CONTRATO · SECOP II</div>
      <div className="sh-sec"><div className="sh-st">DATOS</div>
        <ShGrid items={[
          ['NIT', c.nit_del_proveedor_adjudicado], ['Valor', fCOP(c.valor_del_contrato), 'var(--green)'],
          ['Modalidad', c.modalidad_de_contratacion], ['Oferentes', c.numero_de_oferentes],
          ['Entidad', trunc(c.nombre_entidad, 26)], ['Dpto.', c.departamento],
          ['Firma', (c.fecha_de_firma || '').substring(0, 10)], ['Estado', c.estado_contrato],
        ]} />
      </div>
      <Flags flags={flags} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }} title="Regla fija: directa +40, valor > $5.000M +30, un oferente +25. No es una evaluación con IA ni una conclusión.">Señal por reglas: <Tag cls={riskCls(r)}>{r}</Tag></div>
      <button className="btn-mark" onClick={onAlert}>🔔 Guardar como alerta</button>
      {url && <a className="btn-ext" href={url} target="_blank" rel="noopener noreferrer">Ver en SECOP II ↗</a>}
    </>
  );
}

export function SancionDetail({ s }) {
  return (
    <>
      <div className="sh-title">{s.sancionado || s.nombre_sancionado || 'Sancionado'}</div>
      <div className="sh-sub">SANCIÓN · PROCURADURÍA</div>
      <div className="sh-sec"><div className="sh-st">DATOS</div>
        <ShGrid items={[
          ['Tipo Sanción', tipoSancion(s), 'var(--red)'], ['Cargo', s.cargo],
          ['Entidad', s.entidad || s.entidad_sancionadora], ['Término', s.termino_sancion],
          ['Ejecutoria', (s.fecha_ejecutoria || '').substring(0, 10)], ['Departamento', s.departamento],
        ]} />
      </div>
      {s._coincidencia === 'nombre' && <div className="sh-note">👥 Coincidencia solo por nombre: sin la cédula no se puede confirmar que sea la persona buscada.</div>}
      <div className="sh-note">⚠ Registro SIRI — Decisión administrativa. No implica condena penal.{s._vigente === false ? ' La sanción ya se cumplió.' : ''} Verifique en el certificado oficial de antecedentes.</div>
      <a className="btn-ext" href="https://www.procuraduria.gov.co/portal/Siri.page" target="_blank" rel="noopener noreferrer">Ver en Procuraduría ↗</a>
    </>
  );
}

export function FiscalDetail({ f }) {
  return (
    <>
      <div className="sh-title">{f.nombre_implicado || 'Implicado'}</div>
      <div className="sh-sub">PROCESO FISCAL · CONTRALORÍA</div>
      <div className="sh-sec"><div className="sh-st">DATOS</div>
        <ShGrid items={[
          ['Cuantía', fCOP(f.cuantia_fallo), 'var(--red)'], ['Estado', f.estado_proceso],
          ['Tipo', f.tipo_proceso], ['Vigencia', f.vigencia],
          ['Entidad afectada', f.entidad_afectada], ['Departamento', f.departamento],
          f.descripcion && ['Descripción', f.descripcion, null, true],
        ]} />
      </div>
      <div className="sh-note">⚠ Proceso de responsabilidad fiscal — procedimiento administrativo, no implica condena penal.</div>
    </>
  );
}

export function RuesDetail({ e, S }) {
  const nit = ruesNit(e);
  const cts = S.c.filter(c => nit && c.nit_del_proveedor_adjudicado === nit);
  return (
    <>
      <div className="sh-title">{e.razon_social || e.nombre || 'Empresa'}</div>
      <div className="sh-sub">EMPRESA · RUES / CÁMARA DE COMERCIO</div>
      <div className="sh-sec"><div className="sh-st">DATOS</div>
        <ShGrid items={[
          ['NIT', nit], ['Estado', e.estado_matricula || e.estado],
          ['Ciudad', e.ciudad || e.municipio], ['Tipo sociedad', e.tipo_sociedad || e.organizacion_juridica],
          ['Rep. legal', e.representante_legal], ['Matrícula', (e.fecha_matricula || '').substring(0, 10)],
          e.actividad_economica && ['Actividad', e.actividad_economica, null, true],
        ]} />
      </div>
      {cts.length
        ? <div className="sh-note">Este NIT aparece como proveedor en {cts.length} contrato(s) SECOP por {fCOP(cts.reduce((s, c) => s + num(c.valor_del_contrato), 0))}. Estar inscrito en el RUES y contratar con el Estado es normal y no indica conflicto de interés.</div>
        : <div className="sh-note">Sin coincidencias de NIT con proveedores SECOP en esta búsqueda.</div>}
    </>
  );
}

export function FuncionarioDetail({ f, onAlert }) {
  const nivel = f.cargo_nivel || f.nivel || 'Profesional';
  const grado = parseInt(f.grado || 1, 10);
  const conGrado = Object.prototype.hasOwnProperty.call(f, 'grado');
  const real = num(f.asignacion_basica);                 // SIGEP publica la asignación básica real
  const sal = real || (conGrado ? getSalario(nivel, grado) : null);
  const col = NIVEL_COLOR[nivel] || 'var(--text)';
  const vinc = f.tipo_vinculacion || f.vinculacion || 'N/A';
  const big = { fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '1.1rem' };
  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 4, background: col + '12', border: `1px solid ${col}30`, ...MONO, fontSize: '.5rem', fontWeight: 700, color: col, marginBottom: 10 }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: col }} />{nivel.toUpperCase()}{conGrado ? ` · GRADO ${grado}` : ''}
      </div>
      <div className="sh-title">{nombreFuncionario(f)}</div>
      <div className="sh-sub">SERVIDOR PÚBLICO · SIGEP</div>
      <ShGrid items={[
        ['Cargo', f.nombre_cargo || f.cargo], ['Entidad', trunc(f.nombre_entidad || f.entidad || 'N/A', 26)],
        f.cedula && ['Cédula', f.cedula], f.dependencia ? ['Dependencia', f.dependencia] : ['Departamento', f.departamento],
        ['Tipo vinculación', vinc, vinc.toLowerCase().includes('carrera') ? 'var(--green)' : 'var(--yellow)'],
        ['Posesión', (f.fecha_posesion || f.fecha_inicio || '').substring(0, 10)],
      ]} />
      {sal && (
        <div style={{ background: 'rgba(0,230,118,.05)', border: '1px solid rgba(0,230,118,.2)', borderRadius: 8, padding: 13, marginBottom: 13 }}>
          <div style={{ ...MONO, fontSize: '.52rem', color: 'var(--green)', letterSpacing: 2, marginBottom: 10 }}>
            💰 {real ? 'ASIGNACIÓN BÁSICA REPORTADA EN SIGEP' : 'REMUNERACIÓN ESTIMADA — DECRETO 611/2025'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><Lbl>SALARIO BASE</Lbl><div style={{ ...big, color: 'var(--green)' }}>{fCOP(sal)}/mes</div></div>
            <div><Lbl>COSTO TOTAL ENTIDAD</Lbl><div style={{ ...big, color: 'var(--yellow)' }}>{fCOP(Math.round(sal * 1.52))}/mes</div></div>
            <div><Lbl>PRIMA SERVICIOS (est.)</Lbl><div style={{ fontSize: '.82rem' }}>{fCOP(Math.round(sal / 12))}</div></div>
            <div><Lbl>CESANTÍAS ANUALES (est.)</Lbl><div style={{ fontSize: '.82rem' }}>{fCOP(Math.round(sal * 0.0833) * 12)}</div></div>
          </div>
          <div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', marginTop: 8, lineHeight: 1.5 }}>
            {real
              ? '⚠ Salario base tomado del SIGEP (dataset «Conjunto servidores públicos», que no publica nombre ni cédula). Costo total, prima y cesantías son estimaciones (aportes patronales ~52%).'
              : `⚠ Calculado con Decreto 611/2025 para nivel ${nivel} grado ${grado}. Puede haber bonificaciones adicionales según entidad. Costo total incluye aportes patronales estimados (52%).`}
          </div>
        </div>
      )}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 11, marginBottom: 13 }}>
        <div style={{ ...MONO, fontSize: '.52rem', color: 'var(--muted2)', letterSpacing: 2, marginBottom: 8 }}>📋 OBLIGACIONES LEGALES</div>
        <div style={{ fontSize: '.78rem', lineHeight: 1.6 }}>
          {(nivel === 'Directivo' || nivel === 'Asesor') && <>✅ Debe presentar declaración de bienes y rentas anual ante la DIAN y SIGEP.<br /></>}
          ✅ Sujeto al régimen disciplinario y de inhabilidades e incompatibilidades — Ley 1952/2019 (Código General Disciplinario).<br />
          ✅ Hoja de vida debe estar actualizada en SIGEP — Ley 1712/2014.<br />
          {vinc.toLowerCase().includes('provisional') && <>⚠ Cargo en provisionalidad — debe convocarse concurso de méritos (Sentencia C-588/09).<br /></>}
        </div>
      </div>
      <a className="btn-ext" href="https://www.funcionpublica.gov.co/dafpIndexerBHV/hvSigep/index" target="_blank" rel="noopener noreferrer">Ver en SIGEP ↗</a>
      <button className="btn-mark" onClick={onAlert}>🔔 Guardar búsqueda como alerta</button>
    </>
  );
}

export function RubroDetail({ rubro, S, onClose }) {
  const items = S.siif.filter(x => (rubroDe(x) || x.nombre_entidad || '') === rubro);
  const ap = items.reduce((s, x) => s + num(x.apropiacion_definitiva), 0);
  const comp = items.reduce((s, x) => s + num(x.compromisos), 0);
  const pagos = items.reduce((s, x) => s + num(x.pagos), 0);
  const pct = ap > 0 ? Math.round(comp / ap * 100) : 0;
  const sanc = esRubroSancion(rubro);
  const v = { fontSize: '.9rem', fontWeight: 600 };
  return (
    <>
      <div style={{ ...MONO, fontSize: '.5rem', fontWeight: 700, color: sanc ? 'var(--red)' : 'var(--blue)', marginBottom: 10 }}>{sanc ? '⚠ SANCIÓN / MORA' : '📋 RUBRO PRESUPUESTAL'}</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '.95rem', marginBottom: 14, lineHeight: 1.3 }}>{rubro}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
        <div><Lbl>APROPIACIÓN</Lbl><div style={{ ...v, color: 'var(--blue)' }}>{fCOP(ap)}</div></div>
        <div><Lbl>COMPROMISOS</Lbl><div style={{ ...v, color: 'var(--yellow)' }}>{fCOP(comp)}</div></div>
        <div><Lbl>PAGOS</Lbl><div style={{ ...v, color: 'var(--green)' }}>{fCOP(pagos)}</div></div>
        <div><Lbl>% EJECUCIÓN</Lbl><div style={{ ...v, color: pctColor(pct) }}>{pct}%</div></div>
      </div>
      <Bar pct={pct} color={pctColor(pct)} style={{ marginBottom: 14 }} />
      {items.map((x, i) => (
        <div key={i} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 11px', marginBottom: 6 }}>
          <div style={{ fontSize: '.8rem', fontWeight: 500, marginBottom: 4 }}>{trunc(x.nombre_entidad || 'Entidad', 35)}</div>
          <div style={{ display: 'flex', gap: 12, ...MONO, fontSize: '.52rem', color: 'var(--muted2)' }}>
            <span>Apropi: <span style={{ color: 'var(--text)' }}>{fCOP(x.apropiacion_definitiva)}</span></span>
            <span>Comp: <span style={{ color: 'var(--yellow)' }}>{fCOP(x.compromisos)}</span></span>
            {x.vigencia && <span>Vig: <span style={{ color: 'var(--text)' }}>{x.vigencia}</span></span>}
          </div>
        </div>
      ))}
      {sanc && <div className="disc" style={{ marginTop: 10, color: 'var(--red)' }}>⚠ Este rubro indica que la entidad ejecutó recursos para pagar sanciones, multas, condenas judiciales o intereses de mora. Cruce con Contraloría para identificar origen.</div>}
      <CloseBtn onClick={onClose} />
    </>
  );
}
