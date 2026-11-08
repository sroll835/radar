/* SECOP, Procuraduría (+ Contraloría) y RUES */
import React from 'react';
import { useRadar } from '../store';
import { useSheet } from '../components/Sheet';
import { ContratoDetail, FiscalDetail, RuesDetail, SancionDetail } from '../components/details';
import { Card, Empty, Loading, PageHeader, Tag, riskCls } from '../components/ui';
import { fCOP, riesgo, trunc, tipoSancion, esSancionGrave, ruesNit } from '../lib/logic';

/** Aviso de homonimia: el backend separó registros de varias personas/empresas con nombre parecido */
export function AvisoHomonimos({ fuente, que = 'registros' }) {
  const { S } = useRadar();
  const h = S.homonimosPorFuente?.[fuente];
  if (!h?.registros?.length) return null;
  return (
    <div className="disc" style={{ borderColor: 'var(--yellow)' }}>
      👥 Se encontraron {h.registros.length} {que} de <b>{h.personas} personas o empresas distintas</b> cuyo nombre se parece a «{S.lastQ}».
      Como no es posible saber cuál corresponde a quien usted busca, <b>no se atribuyen a la búsqueda</b> ni se usan en alertas, score o informes.
      Agregue la cédula o el NIT para precisar.
    </div>
  );
}

export function Secop() {
  const { S, loading, saveAlert } = useRadar();
  const sheet = useSheet();
  return (
    <>
      <PageHeader title="Contratos SECOP II" sub="API OFICIAL · COLOMBIA COMPRA EFICIENTE" count={S.c.length ? `${S.c.length} contratos` : ''} />
      <AvisoHomonimos fuente="SECOP II" que="contratos" />
      {loading ? <Loading text="CONSULTANDO SECOP II..." /> : !S.c.length ? <Empty icon="📄" title="Sin contratos" sub="Realice una búsqueda" /> : (
        <div className="card-list">
          {S.c.slice(0, 20).map((c, i) => {
            const r = riesgo(c);
            return (
              <Card key={i} delay={i * 0.04} icon="📄" title={trunc(c.nombre_del_proveedor || 'Proveedor', 34)}
                sub={`${trunc(c.nombre_entidad || '', 32)} · ${(c.fecha_de_firma || '').substring(0, 10)}`}
                onClick={() => sheet.open(<ContratoDetail c={c} S={S} onAlert={() => { saveAlert(); sheet.close(); }} />)}>
                <Tag cls={riskCls(r)}>SEÑAL {r}</Tag>
                <Tag cls="tb">{fCOP(c.valor_del_contrato)}</Tag>
                <Tag>{trunc(c.modalidad_de_contratacion || '', 20)}</Tag>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Proc() {
  const { S, loading } = useRadar();
  const sheet = useSheet();
  return (
    <>
      <PageHeader title="Sanciones Procuraduría" sub="REGISTRO SIRI · SANCIONES DISCIPLINARIAS" count={S.proc.length ? `${S.proc.length} sanciones` : ''} />
      <div className="disc">⚖️ Decisiones administrativas disciplinarias, no condenas penales. Solo se muestran sanciones vigentes o con efectos en los últimos 5 años; verifique siempre en el certificado oficial de antecedentes de la Procuraduría.</div>
      <AvisoHomonimos fuente="Procuraduría SIRI" que="registros de sanciones" />
      {loading ? <Loading text="CONSULTANDO SIRI..." /> : !S.proc.length ? <Empty icon="✅" title="Sin sanciones atribuibles" sub={S.lastQ || S.lastCed ? 'No se encontraron sanciones atribuibles a esta búsqueda' : 'Busque un nombre'} /> : (
        <div className="card-list">
          {S.proc.map((s, i) => {
            const grave = esSancionGrave(s);
            return (
              <Card key={i} delay={i * 0.05} color={grave ? 'red' : 'yellow'} icon={grave ? '🚨' : '⚠️'}
                title={s.sancionado || s.nombre_sancionado || 'Sancionado'} sub={`${tipoSancion(s)}${s.cargo ? ' · ' + s.cargo : ''}`}
                onClick={() => sheet.open(<SancionDetail s={s} />)}>
                <Tag cls={grave ? 'tr' : 'ty'}>{grave ? 'GRAVE' : 'MODERADO'}</Tag>
                {s.fecha_ejecutoria && <Tag cls="tb">{s.fecha_ejecutoria.substring(0, 10)}</Tag>}
                {s._vigente === true && <Tag cls="ty">VIGENTE</Tag>}
                {s._vigente === false && <Tag>CUMPLIDA</Tag>}
                {s._coincidencia === 'nombre' && <Tag>COINCIDENCIA POR NOMBRE · SIN CÉDULA</Tag>}
              </Card>
            );
          })}
        </div>
      )}
      {!loading && !!S.cont.length && (
        <>
          <div className="ph" style={{ marginTop: 14 }}><div className="pt" style={{ fontSize: '.9rem' }}>Procesos Fiscales</div><div className="ps">CONTRALORÍA GENERAL · {S.cont.length} PROCESOS</div></div>
          <div className="card-list">
            {S.cont.slice(0, 15).map((f, i) => {
              const estado = f.estado_proceso || 'N/A';
              return (
                <Card key={i} delay={i * 0.04} color="red" icon="🔎" title={trunc(f.nombre_implicado || 'Implicado', 34)}
                  sub={trunc(f.entidad_afectada || f.descripcion || '', 36)} onClick={() => sheet.open(<FiscalDetail f={f} />)}>
                  <Tag cls={estado.includes('ACTIVO') ? 'tr' : estado.includes('COBRO') ? 'ty' : 'tg'}>{estado}</Tag>
                  <Tag cls="tr">{fCOP(f.cuantia_fallo)}</Tag>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export function Rues() {
  const { S, loading } = useRadar();
  const sheet = useSheet();
  const secNits = new Set(S.c.map(c => c.nit_del_proveedor_adjudicado).filter(Boolean));
  const searched = S.lastQ || S.lastCed;
  return (
    <>
      <PageHeader title="Cruce Cédula × RUES" sub="REGISTRO ÚNICO EMPRESARIAL · CÁMARA DE COMERCIO" count={searched ? `${S.rues.length} empresas encontradas` : ''} />
      <div className="disc">🏢 Ingrese una cédula o NIT en el campo superior para ver las empresas inscritas en el registro mercantil con ese número y si aparecen como proveedoras en SECOP. Estar inscrito en el RUES y contratar con el Estado es normal y no indica conflicto de interés.</div>
      {loading ? <Loading text="CRUZANDO CON RUES..." /> : !S.rues.length
        ? <Empty icon="🏢" title={searched ? 'Sin empresas' : 'Ingrese una cédula'} sub={searched ? 'No se encontraron empresas para esta búsqueda' : <>Use el campo "Cédula/NIT"<br />para detectar empresas vinculadas</>} />
        : (
          <div className="card-list">
            {S.rues.slice(0, 15).map((e, i) => {
              const nit = ruesNit(e);
              const esProveedor = !!nit && secNits.has(nit);
              return (
                <Card key={i} delay={i * 0.04} color="blue" icon="🏢"
                  title={trunc(e.razon_social || e.nombre || 'Empresa', 34)} sub={`NIT: ${nit} · ${e.ciudad || e.municipio || 'Colombia'}`}
                  onClick={() => sheet.open(<RuesDetail e={e} S={S} />)}>
                  {esProveedor && <Tag cls="tb">PROVEEDOR EN SECOP</Tag>}
                  <Tag cls="tb">{e.estado_matricula || e.estado || 'ACTIVA'}</Tag>
                  {e.actividad_economica && <Tag>{trunc(e.actividad_economica, 22)}</Tag>}
                </Card>
              );
            })}
          </div>
        )}
    </>
  );
}
