"""RADAR v6 — Graph Service (patrón MiroFish GraphBuilderService)"""
from typing import Dict, List, Any

NODE_COLORS = {'prov':'#00e676','entidad':'#ff1744','sanc':'#ffd600',
               'fiscal':'#448aff','rues':'#00e5ff','nom':'#e040fb'}

def _t(s, n=28):
    s = str(s); return s[:n]+'…' if len(s)>n else s

def _sz(val, base=28):
    if val>5e9: return base+18
    if val>1e9: return base+10
    if val>5e8: return base+5
    return base

def build_graph(results: Dict[str, List]) -> Dict[str, Any]:
    nodes, edges, seen = [], [], set()

    def add_node(nid, data):
        if nid not in seen:
            seen.add(nid)
            color = NODE_COLORS.get(data.get('type','prov'), '#888')
            nodes.append({'data': {'id':nid, 'color':color, 'bcolor':color+'aa', **data}})

    for i, c in enumerate(results.get('SECOP II',[])[:30]):
        nit = c.get('nit_del_proveedor_adjudicado','')
        prov = c.get('nombre_del_proveedor','')
        ent  = c.get('nombre_entidad','')
        val  = float(c.get('valor_del_contrato',0) or 0)
        pid  = f'prov_{nit or i}'
        eid  = f'ent_{ent[:18].replace(" ","_")}'
        add_node(pid, {'type':'prov','label':_t(prov),'nit':nit,'value':val,'size':_sz(val),'risk':'','subLabel':f'NIT: {nit}'})
        add_node(eid, {'type':'entidad','label':_t(ent),'nit':'','value':0,'size':36,'risk':'','subLabel':'Entidad Pública'})
        edges.append({'data':{'id':f'ec_{i}','source':pid,'target':eid,'color':'#00e676',
            'w':3 if val>2e9 else 2 if val>5e8 else 1,'etype':'contrato',
            'elabel':f'${val/1e9:.1f}B' if val>1e9 else '','valueLabel':f'${val/1e6:.0f}M',
            'modalidad':c.get('modalidad_de_contratacion','')}})

    for i, s in enumerate(results.get('Procuraduría SIRI',[])[:15]):
        sid = f'sanc_{i}'
        tipo = s.get('tipo_sancion','')
        grave = any(x in tipo.lower() for x in ['destituci','inhabilitaci'])
        add_node(sid, {'type':'sanc','label':_t(s.get('sancionado','')),'nit':'','value':0,
            'size':32 if grave else 24,'risk':'ALTO' if grave else 'MEDIO',
            'cargo':s.get('cargo',''),'sancion':tipo,'subLabel':'Procuraduría SIRI'})

    for i, f in enumerate(results.get('Contraloría',[])[:10]):
        fid = f'fiscal_{i}'
        cuant = float(f.get('cuantia_fallo',0) or 0)
        add_node(fid, {'type':'fiscal','label':_t(f.get('nombre_implicado','')),'nit':'',
            'value':cuant,'size':_sz(cuant,26),'risk':'ALTO' if cuant>5e8 else 'MEDIO',
            'cargo':'','sancion':'','subLabel':'Contraloría'})

    secop_nits = {c.get('nit_del_proveedor_adjudicado','') for c in results.get('SECOP II',[])}
    for i, e in enumerate(results.get('RUES / Confecámaras',[])[:10]):
        rid = f'rues_{i}'
        nit = e.get('nit','')
        # Estar en RUES y en SECOP es lo normal para un proveedor: el enlace es informativo, no un «conflicto»
        mismo = nit and nit in secop_nits
        add_node(rid, {'type':'rues','label':_t(e.get('razon_social','')),'nit':nit,
            'value':0,'size':22,'risk':'',
            'cargo':'','sancion':'','subLabel':'RUES'})
        if mismo and f'prov_{nit}' in seen:
            edges.append({'data':{'id':f'er_{i}','source':rid,'target':f'prov_{nit}',
                'color':'#00e5ff','w':1.5,'etype':'registro','elabel':'',
                'valueLabel':'Registro mercantil del proveedor'}})

    return {'nodes':nodes,'edges':edges,'stats':{
        'nodes':len(nodes),'edges':len(edges),
        'riesgo_alto':sum(1 for n in nodes if n['data'].get('risk')=='ALTO'),
        'clusters':max(1,len({n['data']['type'] for n in nodes}))}}
