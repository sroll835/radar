/* Términos de uso, Política de tratamiento de datos personales y canal de atención a titulares.
   Ley 1581/2012 (arts. 4, 8, 10, 14, 15, 17, 26), Decreto 1074/2015 (antes Decreto 1377/2013, art. 13: contenido
   mínimo de la política), Ley 1712/2014 (transparencia), Const. arts. 15, 20, 21 y 29.

   Los datos del responsable se configuran con variables de entorno de Vite (archivo web/.env):
     VITE_RESPONSABLE_NOMBRE, VITE_RESPONSABLE_ID, VITE_RESPONSABLE_DIRECCION, VITE_RESPONSABLE_EMAIL, VITE_RESPONSABLE_TELEFONO
   Mientras no se configuren, la página muestra «[COMPLETAR …]» para que no se publique sin ellos. */
import React, { useState } from 'react';
import { PageHeader } from '../components/ui';

export const VERSION_TERMINOS = '2026-10-31';
const K_ACEPTA = 'radar_terminos_aceptados';

const env = import.meta.env || {};
const dato = (k, etiqueta) => env[k] || `[COMPLETAR: ${etiqueta}]`;
export const RESPONSABLE = {
  nombre: dato('VITE_RESPONSABLE_NOMBRE', 'nombre o razón social del responsable'),
  id: dato('VITE_RESPONSABLE_ID', 'cédula o NIT'),
  direccion: dato('VITE_RESPONSABLE_DIRECCION', 'dirección física'),
  email: dato('VITE_RESPONSABLE_EMAIL', 'correo de atención a titulares'),
  telefono: dato('VITE_RESPONSABLE_TELEFONO', 'teléfono'),
};
const configurado = !!env.VITE_RESPONSABLE_NOMBRE && !!env.VITE_RESPONSABLE_EMAIL;

const H = ({ children }) => <div className="pt" style={{ fontSize: '.95rem', marginTop: 18, marginBottom: 6 }}>{children}</div>;
const P = ({ children }) => <p style={{ fontSize: '.78rem', lineHeight: 1.6, color: 'var(--text2, #c8cce0)', margin: '6px 0' }}>{children}</p>;
const Li = ({ children }) => <li style={{ fontSize: '.78rem', lineHeight: 1.6, color: 'var(--text2, #c8cce0)', marginBottom: 4 }}>{children}</li>;

function Terminos() {
  return (
    <>
      <H>1. Qué es RADAR</H>
      <P>RADAR es una herramienta de control social que reúne y cruza datos abiertos publicados por entidades del Estado colombiano en datos.gov.co
        (SECOP II, Procuraduría General — SIRI, Contraloría General, SIIF Nación, SIGEP y RUES), en ejercicio del derecho de acceso a la información
        pública (Ley 1712 de 2014) y de los mecanismos de participación y control ciudadano.</P>
      <H>2. Lo que RADAR no hace</H>
      <ul>
        <Li>No emite conclusiones jurídicas. Las alertas y el «Índice de señales de riesgo» son <b>señales para verificar</b> calculadas con reglas propias;
          no afirman que una persona o entidad haya cometido una falta disciplinaria, fiscal o un delito. Solo las autoridades competentes pueden declararlo,
          y toda persona se presume inocente (Const. art. 29).</Li>
        <Li>No garantiza que los datos estén completos o actualizados: provienen de terceros y pueden contener errores o retrasos.</Li>
        <Li>No confirma la identidad de las personas. Una búsqueda por nombre puede coincidir con homónimos; RADAR separa los registros de personas
          distintas con nombre similar y no los atribuye, pero <b>solo la búsqueda con número de cédula o NIT es precisa</b>.</Li>
        <Li>Las sanciones disciplinarias son decisiones administrativas, no condenas penales. RADAR solo muestra las vigentes o con efectos en los últimos cinco años.</Li>
        <Li>La sección «Simulación» es un ejercicio prospectivo con personajes ficticios; no predice hechos ni representa declaraciones de autoridades reales.</Li>
        <Li>Los textos generados con inteligencia artificial pueden contener errores y deben contrastarse con los registros originales.</Li>
      </ul>
      <H>3. Uso permitido y prohibido</H>
      <P>Puede usar RADAR para investigar, hacer veeduría, periodismo, investigación académica y control ciudadano de la gestión pública. Está prohibido:</P>
      <ul>
        <Li>Presentar las alertas o el índice como prueba de que alguien es corrupto o cometió un delito, o difundirlos sin verificar en la fuente original.</Li>
        <Li>Usar la información para hostigar, discriminar, amenazar o perfilar a personas con fines distintos al control de la gestión pública.</Li>
        <Li>Extraer datos de forma masiva o automatizada, o intentar vulnerar la seguridad del servicio.</Li>
      </ul>
      <P>Quien publique o divulgue información obtenida con RADAR es responsable de verificarla y de respetar la honra y el buen nombre de las personas (Const. arts. 15, 20 y 21).</P>
      <H>4. Errores y rectificación</H>
      <P>Si encuentra un error, escriba a <b>{RESPONSABLE.email}</b> (ver «Derechos del titular» abajo). Si el error está en el dato de origen, la corrección
        corresponde a la entidad que lo publica (p. ej. la Procuraduría para SIRI o Colombia Compra Eficiente para SECOP II); RADAR reflejará la corrección cuando la fuente la publique.
        Si el error es de RADAR (por ejemplo, una atribución equivocada), lo corregiremos.</P>
      <H>5. Ley aplicable</H>
      <P>Estos términos se rigen por la ley colombiana. Versión vigente desde {VERSION_TERMINOS}.</P>
    </>
  );
}

function Politica() {
  const R = RESPONSABLE;
  return (
    <>
      <H>1. Responsable del tratamiento</H>
      <P><b>{R.nombre}</b> · Identificación: {R.id} · Dirección: {R.direccion} · Correo: {R.email} · Teléfono: {R.telefono}.</P>
      <H>2. Qué datos se tratan y con qué finalidad</H>
      <ul>
        <Li><b>Datos de terceros provenientes de fuentes públicas</b> (nombres, números de identificación, cargos, contratos, sanciones disciplinarias y
          procesos fiscales). Se consultan en datos.gov.co en el momento de la búsqueda con la única finalidad de facilitar el control social de la gestión
          pública. Son datos de naturaleza pública publicados por las entidades obligadas, por lo que su tratamiento no requiere autorización del titular
          (Ley 1581/2012 art. 10 lit. b), pero RADAR respeta los principios de finalidad, veracidad, acceso y circulación restringida (art. 4).</Li>
        <Li><b>Términos de búsqueda</b> que usted escribe: se usan para consultar las fuentes. El servidor conserva los resultados solo en memoria mientras
          está en ejecución; no los guarda en una base de datos.</Li>
        <Li><b>Alertas guardadas</b>: se guardan solo en su navegador (almacenamiento local) y puede borrarlas desde «Alertas y exportar».</Li>
        <Li><b>Datos técnicos</b>: la dirección IP se usa transitoriamente para limitar el número de peticiones. Si el servicio exige inicio de sesión, se tratan el usuario y su rol.</Li>
      </ul>
      <H>3. Calidad del dato</H>
      <P>Para no atribuir a una persona información de otra, RADAR separa los registros de homónimos y no los usa en alertas ni índices; omite las sanciones
        disciplinarias no vigentes con más de cinco años; y no presenta como conflicto de interés la simple inscripción de un proveedor en el RUES.</P>
      <H>4. Transferencias y proveedores de IA</H>
      <P>Por defecto, la inteligencia artificial funciona en el propio servidor (Ollama) y los datos no salen de él. Los proveedores externos de IA
        (Anthropic, OpenAI, Google, DeepSeek) están desactivados. Si el responsable decide activarlos, enviará a ese proveedor, posiblemente fuera de Colombia,
        el término de búsqueda y extractos de los registros, y deberá actualizar esta política e identificar al proveedor y el país antes de hacerlo
        (Ley 1581/2012 art. 26).</P>
      <H>5. Derechos del titular</H>
      <P>Como titular de datos personales usted puede conocer, actualizar y rectificar sus datos; solicitar prueba de la autorización cuando sea exigible;
        ser informado del uso dado a sus datos; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización o pedir la supresión
        cuando no se respeten los principios, derechos y garantías legales; y acceder gratuitamente a sus datos (Ley 1581/2012 art. 8).</P>
      <H>6. Cómo ejercer sus derechos</H>
      <ul>
        <Li>Escriba a <b>{R.email}</b> indicando su nombre, número de identificación, la búsqueda o el registro al que se refiere y lo que solicita.</Li>
        <Li><b>Consultas</b>: se responden en máximo 10 días hábiles, prorrogables 5 días hábiles más avisándole el motivo (art. 14).</Li>
        <Li><b>Reclamos</b> (corrección, actualización o supresión): se responden en máximo 15 días hábiles, prorrogables 8 días hábiles más avisándole el motivo (art. 15).</Li>
        <Li>Si el dato proviene de una entidad pública, RADAR le indicará además ante qué entidad pedir la corrección en origen.</Li>
      </ul>
      <H>7. Vigencia</H>
      <P>Esta política rige desde {VERSION_TERMINOS}. Los cambios sustanciales se informarán en esta página antes de aplicarse.</P>
    </>
  );
}

export default function Legal() {
  const [tab, setTab] = useState('terminos');
  const btn = id => ({ className: 'pill', onClick: () => setTab(id), style: { cursor: 'pointer', opacity: tab === id ? 1 : 0.6 } });
  return (
    <>
      <PageHeader title="Legal y privacidad" sub={`TÉRMINOS DE USO · POLÍTICA DE TRATAMIENTO DE DATOS · VERSIÓN ${VERSION_TERMINOS}`} />
      {!configurado && (
        <div className="disc" style={{ borderColor: 'var(--red)' }}>
          ⚠ Faltan los datos del responsable del tratamiento (VITE_RESPONSABLE_NOMBRE, VITE_RESPONSABLE_EMAIL…). No publique RADAR hasta configurarlos.
        </div>
      )}
      <div className="spills" style={{ margin: '8px 0' }}>
        <div {...btn('terminos')}>Términos de uso</div>
        <div {...btn('politica')}>Tratamiento de datos</div>
      </div>
      {tab === 'terminos' ? <Terminos /> : <Politica />}
    </>
  );
}

/** Aviso que se muestra en la primera visita (y cuando cambia la versión) hasta que el usuario lo acepta */
export function AvisoLegalInicial({ onVer }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem(K_ACEPTA) === VERSION_TERMINOS; } catch { return false; } });
  if (ok) return null;
  const aceptar = () => { try { localStorage.setItem(K_ACEPTA, VERSION_TERMINOS); } catch {} setOk(true); };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg2, #0d1117)', border: '1px solid var(--border, #1a2030)', borderRadius: 12, padding: 20, maxWidth: 480 }}>
        <div className="pt" style={{ fontSize: '1rem', marginBottom: 8 }}>Antes de usar RADAR</div>
        <P>RADAR muestra datos públicos oficiales y calcula <b>señales para verificar</b>. No es una conclusión jurídica: no afirma que nadie haya cometido una falta o un delito.</P>
        <P>Una búsqueda por nombre puede coincidir con otras personas; use la cédula o el NIT para resultados precisos. Verifique siempre en la fuente original antes de publicar.</P>
        <P>Al continuar acepta los Términos de uso y la Política de tratamiento de datos.</P>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn-go" onClick={aceptar}>Entiendo y acepto</button>
          <button className="btn-hdr" onClick={() => { aceptar(); onVer?.(); }}>Leer términos y política</button>
        </div>
      </div>
    </div>
  );
}
