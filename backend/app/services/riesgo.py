"""RADAR v6 — Motor de Riesgo (7 detectores × 6 fuentes)"""
from typing import Dict, List, Any
from app.config import Config

def get_salario(nivel: str, grado: int) -> int:
    escala = Config.ESCALA_SALARIAL.get(nivel, {})
    if not escala: return 2_500_000
    return escala[min(escala.keys(), key=lambda k: abs(k - int(grado)))]

def _cop(v) -> str:
    n = float(v or 0)
    if n >= 1e12: return f'${n/1e12:.1f}T'
    if n >= 1e9:  return f'${n/1e9:.1f}B'
    if n >= 1e6:  return f'${n/1e6:.0f}M'
    return f'${n:,.0f}'

def detect_alerts(results: Dict[str, List], graph: dict) -> List[dict]:
    alerts = []
    C = Config
    contratos = results.get('SECOP II', [])
    sanciones = results.get('Procuraduría SIRI', [])
    fiscales  = results.get('Contraloría', [])
    siif      = results.get('SIIF Nación', [])
    rues      = results.get('RUES / Confecámaras', [])

    # A1 y A6 solo se calculan sobre contratos DE LA ENTIDAD buscada. Si se busca a un contratista (por nombre o NIT),
    # que sus contratos sean directos es lo normal (p. ej. prestación de servicios, Ley 1150/2007 art. 2 num. 4 lit. h)
    # y que él sea el «proveedor dominante» de sus propios contratos es trivial: no son señales sobre esa persona.
    de_entidad = [c for c in contratos if c.get('_coincidencia', 'entidad') == 'entidad']

    # A1 — Contratación directa elevada (señal para verificar causales, no una ilegalidad)
    directos = [c for c in de_entidad if 'directa' in (c.get('modalidad_de_contratacion','')).lower()]
    if de_entidad and len(directos)/len(de_entidad)*100 > C.RIESGO_DIRECTA_PCT:
        val = sum(float(c.get('valor_del_contrato',0) or 0) for c in directos)
        pct = round(len(directos)/len(de_entidad)*100)
        alerts.append({'id':'A1','severity':'ALTO','source':'SECOP II','icon':'🔴',
            'ley':'Art. 2 num. 4 Ley 1150/2007',
            'titulo':f'{pct}% de los contratos revisados son por contratación directa',
            'desc':(f'Valor por contratación directa: {_cop(val)}. La contratación directa es legal cuando se configura '
                    'una causal; un porcentaje alto amerita verificar la causal invocada en cada contrato.'),
            'meta':f'ALERTA · VERIFICAR CAUSALES · {_cop(val)}'})

    # (Antes A2 «conflicto de interés RUES × SECOP»: se eliminó. La matrícula mercantil en el RUES es
    #  obligatoria para los comerciantes, así que casi todo proveedor empresarial aparece en ambas fuentes: la coincidencia
    #  no indica conflicto de interés y producía falsos positivos. Un conflicto real exige cruzar socios o representantes
    #  legales con funcionarios de la entidad, dato que hoy no publica ninguna de las fuentes consultadas.)

    # A3 — Sanciones disciplinarias graves (sources.filtrar_siri ya dejó solo las vigentes o de los últimos 5 años,
    #      y sources.depurar ya separó los homónimos)
    graves = [s for s in sanciones if s.get('gravedad','') == 'GRAVE' or
              any(x in (s.get('tipo_sancion','')).lower() for x in ['destituci','inhabilitaci','inhabilidad'])]
    if graves:
        # SIRI publica una fila por sanción (p. ej. DESTITUCION + INHABILIDAD GENERAL de la misma persona): se cuentan personas
        personas = list(dict.fromkeys((s.get('cedula') or s.get('sancionado') or '?') for s in graves))
        nombres = list(dict.fromkeys((s.get('sancionado','') or '')[:30] for s in graves))
        alerts.append({'id':'A3','severity':'ALTO','source':'Procuraduría','icon':'⚖️',
            'ley':'Ley 1952/2019 (Código General Disciplinario)',
            'titulo':f'{len(personas)} persona(s) con sanción disciplinaria grave registrada ({len(graves)} registros)',
            'desc':('Incluye: ' + ', '.join(nombres[:3]) + '. Decisión administrativa disciplinaria, no condena penal. '
                    'Verifique la vigencia en el certificado oficial de la Procuraduría.'),
            'meta':'ALERTA · VERIFICAR EN SIRI'})
    # A4 — Procesos fiscales activos de alto valor
    alto_fiscal = [f for f in fiscales if float(f.get('cuantia_fallo',0) or 0) > 1e8
                   and 'ACTIVO' in f.get('estado_proceso','')]
    if alto_fiscal:
        val = sum(float(f.get('cuantia_fallo',0) or 0) for f in alto_fiscal)
        alerts.append({'id':'A4','severity':'ALTO','source':'Contraloría','icon':'🔎',
            'ley':'Ley 610/2000',
            'titulo':f'{len(alto_fiscal)} proceso(s) fiscal(es) ACTIVO(S)',
            'desc':f'Cuantía total: {_cop(val)}.',
            'meta':f'ALERTA · {_cop(val)} en proceso fiscal'})

    # A5 — Sanciones/mora en SIIF
    # SIIF (PGN por rubro) registra estos pagos como «SENTENCIAS Y CONCILIACIONES»
    sanc_siif = [s for s in siif if any(x in (s.get('rubro_presupuestal','')).lower()
                 for x in ['sancion','mora','condena','multa','sentencia','conciliaci'])]
    if sanc_siif:
        val = sum(float(s.get('compromisos',0) or 0) for s in sanc_siif)
        alerts.append({'id':'A5','severity':'MEDIO','source':'SIIF','icon':'⚠️',
            'ley':'Ley 1437/2011 CPACA',
            'titulo':f'Sentencias, conciliaciones o sanciones en SIIF: {_cop(val)} comprometidos',
            'desc':'Rubros: ' + '; '.join(sorted({(s.get('rubro_presupuestal','') or '')[:50] for s in sanc_siif}))[:200] + '.',
            'meta':f'ALERTA MEDIA · {_cop(val)}'})

    # A6 — Concentración en un proveedor (solo contratos de la entidad, ver A1)
    prov_count = {}
    for c in de_entidad:
        p = c.get('nombre_del_proveedor','')
        prov_count[p] = prov_count.get(p, 0) + 1
    dominant = max(prov_count.items(), key=lambda x: x[1]) if prov_count else None
    if dominant and dominant[1] > C.RIESGO_PROVEEDOR_N:
        val = sum(float(c.get('valor_del_contrato',0) or 0) for c in de_entidad
                  if c.get('nombre_del_proveedor','') == dominant[0])
        alerts.append({'id':'A6','severity':'MEDIO','source':'SECOP II','icon':'🔍',
            'ley':'Principio de selección objetiva',
            'titulo':f'Concentración de contratos en un proveedor: {dominant[0][:35]}',
            'desc':f'{dominant[1]} contratos por {_cop(val)} en total. La concentración por sí sola no es irregular; amerita revisar cómo se seleccionó.',
            'meta':f'ALERTA MEDIA · {dominant[1]} contratos'})
    # A7 — Sobrejecución/subejecución SIIF (la subejecución se agrupa en una sola alerta: el dataset por rubro
    # trae decenas de filas y una alerta por fila saturaba el informe)
    sub = []
    for s in siif:
        ap = float(s.get('apropiacion_definitiva',0) or 0)
        comp = float(s.get('compromisos',0) or 0)
        if ap <= 0: continue
        pct = comp/ap*100
        if pct > C.RIESGO_SOBREEJ_PCT:
            alerts.append({'id':'A7a','severity':'ALTO','source':'SIIF','icon':'📊',
                'ley':'Decreto 111/1996 EOP',
                'titulo':f'Sobrejecución {round(pct)}%: {(s.get("rubro_presupuestal",""))[:40]}',
                'desc':f'Comprometido {_cop(comp)} sobre apropiación {_cop(ap)}.',
                'meta':f'ALERTA · {round(pct)}% ejecutado'})
        elif 0 < pct < C.RIESGO_SUBEJECUCION:
            sub.append((pct, s, comp, ap))
    if sub:
        sub.sort(key=lambda x: x[0])
        pct, s, comp, ap = sub[0]
        alerts.append({'id':'A7b','severity':'MEDIO','source':'SIIF','icon':'📉',
            'ley':'EOP Art. 38',
            'titulo':f'Subejecución (<{C.RIESGO_SUBEJECUCION}%) en {len(sub)} rubro(s)',
            'desc':f'El más bajo: {(s.get("rubro_presupuestal",""))[:50]} con {round(pct)}% ({_cop(comp)} de {_cop(ap)}).',
            'meta':f'ALERTA MEDIA · {len(sub)} rubros'})

    order = {'ALTO':0,'MEDIO':1,'BAJO':2}
    alerts.sort(key=lambda a: order.get(a['severity'],3))
    return alerts
