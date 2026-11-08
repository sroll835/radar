/* RADAR web — exportar PDF (ventana de impresión) y CSV (portado de export.js) */
import { contratosEntidad, esDirecta, fCOP, proveedoresRues, riesgo, ruesNit, totalValor, trunc } from './logic';
import { INDICE_NOMBRE } from './score';

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function reporteHTML(S, extra = '') {
  const ce = contratosEntidad(S);
  const directos = ce.filter(esDirecta);
  const provNits = new Set(proveedoresRues(S).map(ruesNit));
  const now = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const badge = r => `<span class="badge ${r === 'ALTO' ? 'br' : r === 'MEDIO' ? 'by' : 'bg'}">${r}</span>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte RADAR</title>
<style>body{font-family:Arial,sans-serif;margin:36px;color:#222;line-height:1.6;font-size:13px}
h1{color:#007a40;border-bottom:3px solid #007a40;padding-bottom:6px}h2{color:#333;margin-top:20px;font-size:12px;text-transform:uppercase;letter-spacing:1px}
.krow{display:flex;gap:14px;margin:12px 0;flex-wrap:wrap}.kbox{background:#f5f5f5;border-radius:6px;padding:10px 14px;flex:1;min-width:100px;text-align:center}
.kv{font-size:1.5rem;font-weight:bold;color:#007a40;display:block}.kl{font-size:.68rem;color:#666}.red{color:#c00}.yellow{color:#c70}
table{width:100%;border-collapse:collapse;margin-top:6px;font-size:.78rem}th{background:#007a40;color:#fff;padding:6px 8px;text-align:left}td{border-bottom:1px solid #eee;padding:5px 8px}
.badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:.68rem;font-weight:bold}.br{background:#ffe0e0;color:#c00}.by{background:#fff8d6;color:#c70}.bg{background:#e0ffe8;color:#007a40}
.conflict-box{background:#fff5f5;border:1px solid #fcc;border-radius:6px;padding:10px;margin-top:8px}pre{white-space:pre-wrap;font-size:.75rem;background:#f7f7f7;padding:10px;border-radius:6px}
.footer{margin-top:24px;font-size:.65rem;color:#888;border-top:1px solid #ddd;padding-top:10px}</style></head><body>
<h1>RADAR — Reporte de datos públicos</h1>
<p style="background:#fff8d6;border:1px solid #f0d878;border-radius:6px;padding:8px 10px;font-size:.75rem">⚠ Este reporte reúne datos abiertos oficiales y señales calculadas con reglas de RADAR para su verificación. No es una conclusión jurídica ni afirma que una persona o entidad haya cometido una falta o un delito. Verifique cada registro en la fuente original antes de difundirlo.${S.homonimos?.length ? ` Se excluyeron ${S.homonimos.length} registros de personas distintas con nombre similar al buscado.` : ''}</p>
<p><b>Búsqueda:</b> ${h(S.lastQ || 'General')}${S.lastCed ? ' · Cédula: ' + h(S.lastCed) : ''} | <b>Fecha:</b> ${now}</p>
<div class="krow">
<div class="kbox"><span class="kv">${S.c.length}</span><span class="kl">Contratos SECOP</span></div>
<div class="kbox"><span class="kv red">${S.proc.length}</span><span class="kl">Sanciones Procur.</span></div>
<div class="kbox"><span class="kv red">${S.cont.length}</span><span class="kl">Procesos Fiscal</span></div>
<div class="kbox"><span class="kv">${fCOP(totalValor(S.c))}</span><span class="kl">Valor Total</span></div>
<div class="kbox"><span class="kv yellow">${S.rues.length}</span><span class="kl">Empresas RUES</span></div></div>
<h2>Señales para verificar</h2>
${ce.length ? `<p>• ${directos.length}/${ce.length} contratos de la entidad (${Math.round(directos.length / ce.length * 100)}%) por contratación directa — valor: ${fCOP(totalValor(directos))}. La contratación directa es legal cuando hay causal; verificar la causal de cada contrato.</p>` : ''}
${S.proc.length ? `<p>• ${S.proc.length} registros de sanciones disciplinarias (Procuraduría, SIRI), vigentes o de los últimos 5 años. Son decisiones administrativas, no condenas penales.</p>` : ''}
${S.cont.length ? `<p>• ${S.cont.length} procesos de responsabilidad fiscal en Contraloría (procedimientos administrativos en curso o terminados).</p>` : ''}
<h2>📄 Contratos (Top 15)</h2>
<table><thead><tr><th>Proveedor</th><th>Entidad</th><th>Valor</th><th>Modalidad</th><th>Señal (reglas)</th></tr></thead><tbody>
${S.c.slice(0, 15).map(c => `<tr><td>${h(trunc(c.nombre_del_proveedor, 28))}</td><td>${h(trunc(c.nombre_entidad, 26))}</td><td><b>${fCOP(c.valor_del_contrato)}</b></td><td>${h(trunc(c.modalidad_de_contratacion, 18))}</td><td>${badge(riesgo(c))}</td></tr>`).join('')}</tbody></table>
${S.proc.length ? `<h2>⚖️ Sanciones Procuraduría</h2><table><thead><tr><th>Sancionado</th><th>Tipo Sanción</th><th>Cargo</th><th>Fecha</th></tr></thead><tbody>${S.proc.map(s => `<tr><td>${h(s.sancionado || 'N/A')}</td><td>${h(trunc(s.tipo_sancion, 28))}</td><td>${h(s.cargo || 'N/A')}</td><td>${h((s.fecha_ejecutoria || 'N/A').substring(0, 10))}</td></tr>`).join('')}</tbody></table>` : ''}
${S.rues.length ? `<h2>🏢 Empresas RUES</h2><table><thead><tr><th>Razón Social</th><th>NIT</th><th>Rep. Legal</th><th>Estado</th><th>Proveedor SECOP</th></tr></thead><tbody>${S.rues.map(e => `<tr><td>${h(trunc(e.razon_social, 24))}</td><td>${h(ruesNit(e) || 'N/A')}</td><td>${h(e.representante_legal || 'N/A')}</td><td>${h(e.estado || 'N/A')}</td><td>${provNits.has(ruesNit(e)) ? 'Sí' : 'No'}</td></tr>`).join('')}</tbody></table>` : ''}
${extra ? `<h2>🧮 ${h(INDICE_NOMBRE)}</h2><pre>${h(extra)}</pre>` : ''}
<div class="footer">⚠ Uso investigativo y de control social. Las señales se calculan con reglas de RADAR y no son conclusiones jurídicas. Las sanciones y los procesos fiscales son procedimientos administrativos — no implican condena penal. Toda persona se presume inocente. Fuentes: SECOP II, Procuraduría (SIRI), Contraloría General, RUES/Cámara de Comercio, SIIF Nación — datos.gov.co · RADAR Colombia.</div>
</body></html>`;
}

export function exportPDF(S, extra) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('El navegador bloqueó la ventana emergente');
  w.document.write(reporteHTML(S, extra));
  w.document.close();
  setTimeout(() => w.print(), 500);
}

export function exportCSV(S) {
  // (Se quitó la columna «Oferentes»: el dataset SECOP II usado no la publica y siempre salía vacía.)
  const rows = [['Proveedor', 'NIT', 'Entidad', 'Departamento', 'Modalidad', 'Valor', 'Fecha', 'Estado', 'Señal (reglas, no es conclusión)']];
  S.c.forEach(c => rows.push([c.nombre_del_proveedor, c.nit_del_proveedor_adjudicado, c.nombre_entidad, c.departamento, c.modalidad_de_contratacion,
    c.valor_del_contrato, (c.fecha_de_firma || '').substring(0, 10), c.estado_contrato, riesgo(c)]));
  const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = `radar_${new Date().toISOString().substring(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}