'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

function fechaHaceNSemanas(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n * 7); return d.toISOString().split('T')[0]
}
function fechaHaceNMeses(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().split('T')[0]
}

function clasificar(margenPct: number, ventasRec: number, rotacion: number, inventario: number, promedioVentas: number, promedioMargen: number) {
  const altaVenta  = ventasRec >= promedioVentas
  const altoMargen = margenPct >= promedioMargen
  const altoInv    = inventario > 0 && rotacion < 1
  if (altaVenta && altoMargen)  return 'Estrella'
  if (altaVenta && !altoMargen) return 'Volumen bajo margen'
  if (!altaVenta && altoMargen) return 'Nicho rentable'
  if (!altaVenta && !altoMargen && altoInv) return 'Inventario problema'
  if (!altaVenta && !altoMargen && inventario === 0) return 'Estratégico'
  return 'Complementario'
}

function puntaje(margenPct: number, ventasRec: number, rotacion: number, tendencia: number, maxVentas: number, maxMargen: number) {
  const pMargen    = Math.min(30, (margenPct / Math.max(maxMargen, 1)) * 30)
  const pVentas    = Math.min(30, (ventasRec  / Math.max(maxVentas, 1)) * 30)
  const pRotacion  = Math.min(25, Math.min(rotacion, 5) / 5 * 25)
  const pTendencia = tendencia > 0 ? Math.min(15, tendencia * 3) : Math.max(0, 15 + tendencia * 2)
  return Math.round(pMargen + pVentas + pRotacion + pTendencia)
}

function semaforo(score: number) {
  if (score >= 80) return { color: '#16a34a', bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Producto fuerte',       dot: '🟢' }
  if (score >= 60) return { color: '#ca8a04', bg: 'bg-yellow-100',  text: 'text-yellow-800',  label: 'Con oportunidad',       dot: '🟡' }
  if (score >= 40) return { color: '#ea580c', bg: 'bg-orange-100',  text: 'text-orange-800',  label: 'Débil o mal gestionado',dot: '🟠' }
  return              { color: '#dc2626', bg: 'bg-red-100',     text: 'text-red-800',     label: 'Producto crítico',      dot: '🔴' }
}

const ACCIONES: Record<string, string> = {
  'Estrella':              'Impulsar, asegurar inventario, activar en promociones',
  'Volumen bajo margen':   'Renegociar costo con proveedor, revisar descuentos y ajustar precio',
  'Nicho rentable':        'Vender a clientes específicos, usar en venta consultiva o cruzada',
  'Inventario problema':   'Liquidar o descontinuar, evitar reorden hasta agotar existencia',
  'Estratégico':           'Mantener con control, medir si atrae ventas de otros productos',
  'Complementario':        'Usar activamente en venta cruzada con productos estrella',
}

const COLORES_CLASE: Record<string, string> = {
  'Estrella':              '#16a34a',
  'Volumen bajo margen':   '#2563eb',
  'Nicho rentable':        '#7c3aed',
  'Inventario problema':   '#dc2626',
  'Estratégico':           '#0891b2',
  'Complementario':        '#d97706',
}

export default function Matriz() {
  const [proyectoId, setProyectoId]   = useState(null)
  const [productos,  setProductos]    = useState([])
  const [ventas,     setVentas]       = useState([])
  const [inventario, setInventario]   = useState([])
  const [invPend,    setInvPend]      = useState([])
  const [loading,    setLoading]      = useState(true)
  const [vista,      setVista]        = useState<'matriz'|'bcg'|'tendencia'>('matriz')
  const [filtroClase,    setFiltroClase]    = useState('Todos')
  const [filtroSem,      setFiltroSem]      = useState('Todos')
  const [busqueda,       setBusqueda]       = useState('')
  const [filtroGrafica,  setFiltroGrafica]  = useState<'todos'|'categoria'|'clase'>('todos')
  const [filtroCatBCG,   setFiltroCatBCG]   = useState('todas')
  const [filtroClaseBCG, setFiltroClaseBCG] = useState('todas')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    cargarDatos()
  }, [])

  async function cargarDatos() {
  setLoading(true)
  const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
  if (!cliente) return
  const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
  if (!proyecto) return
  const pid = proyecto.id
  setProyectoId(pid)

  const [{ data: prods }, { data: vMatrix }, { data: inv }, { data: pend }] = await Promise.all([
    supabase.from('productos').select('*').eq('proyecto_id', pid).eq('activo', true),
    supabase.from('ventas_matriz').select('*').eq('proyecto_id', pid),
    supabase.from('inventario').select('*').eq('proyecto_id', pid).order('fecha', { ascending: false }),
    supabase.from('inventario_pendiente').select('*').eq('proyecto_id', pid),
  ])

  setProductos(prods || [])
  setVentas(vMatrix || [])
  setInventario(inv || [])
  setInvPend(pend || [])
  setLoading(false)
}
 
 
  const hace4sem   = fechaHaceNSemanas(4)
  const hace13sem  = fechaHaceNSemanas(13)
  const hace3meses = fechaHaceNMeses(3)
  const hace6meses = fechaHaceNMeses(6)
  console.log('Total ventas cargadas:', ventas.length)
  console.log('hace4sem:', hace4sem)
  console.log('hace3meses:', hace3meses)
  console.log('Ejemplo ventas recientes:', ventas.filter(v => v.periodo_fecha >= hace4sem).slice(0,3))

const matrizRaw = productos.map(prod => {
  const v = ventas.find(v => v.producto_id === prod.id) || {}
  const pzRec    = v.pz_4sem   || 0
  const ingRec   = v.ing_4sem  || 0
  const pzRot    = v.pz_13sem  || 0
  const ing3m    = v.ing_3m    || 0
  const costo3m  = v.costo_3m  || 0
  const pz3m     = v.pz_3m     || 0
  const frec3m   = v.frec_3m   || 0
  const ing3mAnt = v.ing_3m_ant || 0
  const tendencia = ing3mAnt > 0 ? ((ing3m - ing3mAnt) / ing3mAnt) * 100 : ing3m > 0 ? 100 : 0
  const margenPct = ing3m > 0 ? ((ing3m - costo3m) / ing3m) * 100 : 0
  const invRecs = inventario.filter(i => i.producto_id === prod.id)
  const dispAct = invRecs[0]?.disponible ?? 0
  const pendRec = invPend.find(p => p.producto_id === prod.id)
  const enTrans = pendRec?.en_transito ?? 0
  const ordenado = pendRec?.ordenado ?? 0
  const rotacion = dispAct > 0 ? pzRot / dispAct : pzRot > 0 ? 99 : 0
  return {
    id: prod.id, nombre: prod.nombre, sku: prod.sku || '—', categoria: prod.categoria || '—',
    precio: prod.precio, costo: prod.costo,
    ingRec, pzRec, ing3m, costo3m, pz3m, frec3m, margenPct,
    ing3mAnt, tendencia, dispAct, enTrans, ordenado, rotacion,
    totalPeriodos: 0,
  }
})

  const avgVentas = matrizRaw.reduce((s, p) => s + p.pzRec, 0) / Math.max(matrizRaw.length, 1)
  const avgMargen = matrizRaw.filter(p => p.margenPct > 0).reduce((s, p) => s + p.margenPct, 0) / Math.max(matrizRaw.filter(p => p.margenPct > 0).length, 1)
  const maxVentas = Math.max(...matrizRaw.map(p => p.pzRec), 1)
  const maxMargen = Math.max(...matrizRaw.map(p => p.margenPct), 1)

  const matriz = matrizRaw.map(p => {
    const clase  = clasificar(p.margenPct, p.pzRec, p.rotacion, p.dispAct, avgVentas, avgMargen)
    const score  = puntaje(p.margenPct, p.pzRec, p.rotacion, p.tendencia, maxVentas, maxMargen)
    const sem    = semaforo(score)
    const accion = ACCIONES[clase] || '—'
    return { ...p, clase, score, sem, accion }
  }).sort((a, b) => b.score - a.score)

  const matrizFiltrada = matriz.filter(p => {
    if (filtroClase !== 'Todos' && p.clase !== filtroClase) return false
    if (filtroSem !== 'Todos') {
      if (filtroSem === 'Verde'    && p.score <  80) return false
      if (filtroSem === 'Amarillo' && (p.score < 60 || p.score >= 80)) return false
      if (filtroSem === 'Naranja'  && (p.score < 40 || p.score >= 60)) return false
      if (filtroSem === 'Rojo'     && p.score >= 40) return false
    }
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase()) && !p.sku.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const datosBCG = matrizFiltrada.filter(p => {
  if (filtroCatBCG !== 'todas' && p.categoria !== filtroCatBCG) return false
  if (filtroGrafica === 'clase' && filtroClaseBCG !== 'todas' && p.clase !== filtroClaseBCG) return false
  return true
})

  const total      = matriz.length
  const estrellas  = matriz.filter(p => p.clase === 'Estrella').length
  const criticos   = matriz.filter(p => p.score < 40).length
  const sinVentas  = matriz.filter(p => p.pz3m === 0).length
  const avgScore   = Math.round(matriz.reduce((s, p) => s + p.score, 0) / Math.max(total, 1))

  const categoriasBCG = [...new Set(matriz.map(p => p.categoria).filter(Boolean))]

  async function exportarExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Matriz de Datos')
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9'
    const fBl = { bold:true, color:{argb:'FFFFFFFF'}, size:10, name:'Arial' }
    const fN  = { color:{argb:'FF1e293b'}, size:10, name:'Arial' }
    const center = { horizontal:'center' as const, vertical:'middle' as const }
    const left   = { horizontal:'left'   as const, vertical:'middle' as const }
    ws.columns = [
      { header:'SKU',             key:'sku',    width:16 },
      { header:'Nombre',          key:'nombre', width:30 },
      { header:'Categoría',       key:'cat',    width:18 },
      { header:'Clasificación',   key:'clase',  width:22 },
      { header:'Puntaje',         key:'score',  width:10 },
      { header:'Semáforo',        key:'sem',    width:18 },
      { header:'Ventas 4sem (pz)',key:'pzRec',  width:16 },
      { header:'Ventas 3m ($)',   key:'ing3m',  width:16 },
      { header:'Margen %',        key:'margen', width:12 },
      { header:'Rotación',        key:'rot',    width:12 },
      { header:'Tendencia %',     key:'tend',   width:14 },
      { header:'Disponible',      key:'disp',   width:12 },
      { header:'En Tránsito',     key:'trans',  width:14 },
      { header:'Ordenado',        key:'ord',    width:12 },
      { header:'Acción recomendada', key:'accion', width:50 },
    ]
    const hRow = ws.getRow(1)
    hRow.eachCell(cell => {
      cell.font = fBl
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+AZUL_OSC} }
      cell.alignment = center
    })
    hRow.height = 22
    matrizFiltrada.forEach((p, i) => {
      const row = ws.addRow([
        p.sku, p.nombre, p.categoria, p.clase, p.score, p.sem.label,
        p.pzRec, Math.round(p.ing3m), p.margenPct.toFixed(1)+'%',
        p.rotacion.toFixed(2), p.tendencia.toFixed(1)+'%',
        p.dispAct, p.enTrans, p.ordenado, p.accion,
      ])
      const fill = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb: i%2===0 ? 'FF'+AZUL_CLAR : 'FF'+GRIS} }
      row.eachCell({ includeEmpty:true }, cell => { cell.font = fN; cell.fill = fill; cell.alignment = left })
      row.height = 18
    })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `matriz_datos_INTEGRA_${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  console.log('datosBCG:', datosBCG.length, datosBCG[0])
  
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/productos')} className="text-xs text-gray-400 hover:text-gray-600">Catálogo</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/ventas')} className="text-xs text-gray-400 hover:text-gray-600">Ventas</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/inventario')} className="text-xs text-gray-400 hover:text-gray-600">Inventario</button>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-medium text-gray-900">Matriz de Datos</p>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm text-gray-500">Calculando matriz de datos...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Matriz de Datos</h1>
                <p className="text-xs text-gray-400 mt-0.5">Clasificación y salud de productos basada en ventas, margen, rotación e inventario</p>
              </div>
              <button onClick={exportarExcel}
                className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors font-medium">
                ↓ Exportar Excel
              </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label:'Productos analizados', valor: total,     color:'text-gray-900',    bg:'bg-white' },
                { label:'Estrellas',             valor: estrellas, color:'text-emerald-700', bg:'bg-emerald-50' },
                { label:'Críticos 🔴',           valor: criticos,  color:'text-red-700',     bg:'bg-red-50' },
                { label:'Sin ventas (3m)',        valor: sinVentas, color:'text-amber-700',   bg:'bg-amber-50' },
                { label:'Puntaje promedio',       valor: avgScore,  color:'text-blue-700',    bg:'bg-blue-50' },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-xl border border-gray-100 p-3 text-center`}>
                  <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.valor}</p>
                </div>
              ))}
            </div>

            {/* Leyenda clasificaciones */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Clasificaciones de productos</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ACCIONES).map(([clase, accion]) => (
                  <div key={clase} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                    <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{background: COLORES_CLASE[clase]}}/>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{clase}</p>
                      <p className="text-xs text-gray-500">{accion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-100 p-2 flex gap-2">
              {[
                { id:'matriz',    label:'📋 Tabla Matriz' },
                { id:'bcg',       label:'📊 Matriz BCG' },
                { id:'tendencia', label:'📈 Vista Tendencia' },
              ].map(t => (
                <button key={t.id} onClick={() => setVista(t.id as any)}
                  className={`flex-1 py-2 text-sm rounded-lg transition-colors ${vista === t.id ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Filtros generales */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Buscar</label>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Nombre o SKU..."
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 w-40"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Clasificación</label>
                <select value={filtroClase} onChange={e => setFiltroClase(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option>Todos</option>
                  {Object.keys(ACCIONES).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Semáforo</label>
                <div className="flex gap-1">
                  {['Todos','Verde','Amarillo','Naranja','Rojo'].map(s => (
                    <button key={s} onClick={() => setFiltroSem(s)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${filtroSem === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
             <div className="ml-auto text-xs text-gray-400">{datosBCG.length} productos</div>
  </div>


            {/* ── TABLA MATRIZ ── */}
            {vista === 'matriz' && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{background:'#1a2e4a', color:'white'}}>
                        <th className="px-3 py-2.5 text-left sticky left-0" style={{background:'#1a2e4a'}}>SKU</th>
                        <th className="px-3 py-2.5 text-left">Producto</th>
                        <th className="px-3 py-2.5 text-center">Puntaje</th>
                        <th className="px-3 py-2.5 text-center">Semáforo</th>
                        <th className="px-3 py-2.5 text-center">Clasificación</th>
                        <th className="px-3 py-2.5 text-right">Vtas 4sem (pz)</th>
                        <th className="px-3 py-2.5 text-right">Vtas 3m ($)</th>
                        <th className="px-3 py-2.5 text-right">Margen %</th>
                        <th className="px-3 py-2.5 text-right">Rotación</th>
                        <th className="px-3 py-2.5 text-right">Tendencia</th>
                        <th className="px-3 py-2.5 text-right">Disp.</th>
                        <th className="px-3 py-2.5 text-right">Tránsito</th>
                        <th className="px-3 py-2.5 text-left">Acción recomendada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrizFiltrada.length === 0
                        ? <tr><td colSpan={13} className="text-center py-10 text-gray-400">No hay productos con los filtros seleccionados</td></tr>
                        : matrizFiltrada.map((p, i) => (
                          <tr key={p.id} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                            <td className="px-3 py-2 font-mono text-gray-500 sticky left-0" style={{background: i%2===0 ? '#eff6ff' : 'white'}}>{p.sku}</td>
                            <td className="px-3 py-2 font-medium text-gray-900 max-w-xs truncate">{p.nombre}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div className="h-full rounded-full" style={{width:`${p.score}%`, background: p.sem.color}}/>
                                </div>
                                <span className="font-bold text-gray-800 w-6">{p.score}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.sem.bg} ${p.sem.text}`}>
                                {p.sem.dot} {p.sem.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                style={{background: COLORES_CLASE[p.clase]}}>
                                {p.clase}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{p.pzRec.toLocaleString('es-MX')}</td>
                            <td className="px-3 py-2 text-right text-gray-700">${Math.round(p.ing3m).toLocaleString('es-MX')}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-medium ${p.margenPct >= 30 ? 'text-emerald-700' : p.margenPct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                                {p.margenPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-medium ${p.rotacion >= 2 ? 'text-emerald-700' : p.rotacion >= 1 ? 'text-amber-600' : 'text-red-600'}`}>
                                {p.rotacion.toFixed(2)}x
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-medium ${p.tendencia > 10 ? 'text-emerald-700' : p.tendencia < -10 ? 'text-red-600' : 'text-amber-600'}`}>
                                {p.tendencia > 0 ? '↑' : p.tendencia < 0 ? '↓' : '—'} {Math.abs(p.tendencia).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{p.dispAct}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{p.enTrans > 0 ? p.enTrans : '—'}</td>
                            <td className="px-3 py-2 text-gray-500 max-w-xs" style={{minWidth:'200px', whiteSpace:'normal', lineHeight:'1.3'}}>
                              {p.accion}
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── MATRIZ BCG ── */}
            {vista === 'bcg' && (
              <div className="space-y-4">
                {/* Filtros BCG */}
<div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
  <div className="flex flex-wrap gap-3 items-end">
    <div>
      <label className="text-xs text-gray-500 block mb-1">Color de puntos</label>
      <div className="flex gap-1">
        {[
          { id:'todos',     label:'Todos' },
          { id:'categoria', label:'Categoría' },
          { id:'clase',     label:'Clasificación' },
        ].map(op => (
          <button key={op.id} onClick={() => setFiltroGrafica(op.id as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filtroGrafica === op.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
            {op.label}
          </button>
        ))}
      </div>
    </div>
    {filtroGrafica === 'clase' && (
      <div>
        <label className="text-xs text-gray-500 block mb-1">Clasificación</label>
        <select value={filtroClaseBCG} onChange={e => setFiltroClaseBCG(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="todas">Todas</option>
          {Object.keys(ACCIONES).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    )}
    <div className="ml-auto text-xs text-gray-400">{datosBCG.length} productos</div>
  </div>
  <div className="flex flex-wrap gap-3 items-end">
    <div>
      <label className="text-xs text-gray-500 block mb-1">Categoría</label>
      <select value={filtroCatBCG} onChange={e => setFiltroCatBCG(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
        <option value="todas">Todas las categorías</option>
        {categoriasBCG.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
    <div>
      <label className="text-xs text-gray-500 block mb-1">Semáforo</label>
      <div className="flex gap-1">
        {['Todos','Verde','Amarillo','Naranja','Rojo'].map(s => (
          <button key={s} onClick={() => setFiltroSem(s)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${filtroSem === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
            {s}
          </button>
        ))}
      </div>
    </div>
  </div>
</div>  

                {/* Leyenda cuadrantes */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label:'⭐ Producto Estrella',     desc:'Alto margen · Altas ventas',  bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-800' },
                    { label:'🐄 Producto Vaca',          desc:'Bajo margen · Altas ventas',  bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-800'    },
                    { label:'❓ Producto Interrogante', desc:'Alto margen · Bajas ventas',  bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-800'   },
                    { label:'🐕 Producto Perro',         desc:'Bajo margen · Bajas ventas',  bg:'bg-red-50',     border:'border-red-200',     text:'text-red-800'     },
                  ].map(q => (
                    <div key={q.label} className={`${q.bg} border ${q.border} rounded-xl p-3`}>
                      <p className={`text-xs font-semibold ${q.text}`}>{q.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{q.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Gráfica BCG */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Matriz BCG — Margen % vs Ventas</p>
                  <p className="text-xs text-gray-400 mb-4">Eje X: Margen % · Eje Y: Ventas 4 semanas (pz) · Líneas en los promedios del portafolio</p>

                  <div className="relative">
                    {/* Etiquetas flotantes de cuadrantes */}
                    <div className="absolute pointer-events-none" style={{zIndex:10, top:'20px', bottom:'60px', left:'65px', right:'20px'}}>
                      <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                        <div className="flex items-start justify-start p-2">
                          <span style={{fontSize:'11px', fontWeight:700, color:'#b45309', background:'#fef3c7', padding:'3px 8px', borderRadius:'6px', opacity:0.7}}>❓ Interrogante</span>
                        </div>
                        <div className="flex items-start justify-end p-2">
                          <span style={{fontSize:'11px', fontWeight:700, color:'#15803d', background:'#dcfce7', padding:'3px 8px', borderRadius:'6px', opacity:0.7}}>⭐ Estrella</span>
                        </div>
                        <div className="flex items-end justify-start p-2">
                          <span style={{fontSize:'11px', fontWeight:700, color:'#b91c1c', background:'#fee2e2', padding:'3px 8px', borderRadius:'6px', opacity:0.7}}>🐕 Perro</span>
                        </div>
                        <div className="flex items-end justify-end p-2">
                          <span style={{fontSize:'11px', fontWeight:700, color:'#1d4ed8', background:'#dbeafe', padding:'3px 8px', borderRadius:'6px', opacity:0.7}}>🐄 Vaca</span>
                        </div>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={460}>
                      <ScatterChart margin={{top:20, right:30, bottom:50, left:65}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                        <XAxis
                          dataKey="margenPct"
                          name="Margen %"
                          type="number"
                          domain={['auto','auto']}
                          tickFormatter={v => `${v.toFixed(0)}%`}
                          tick={{fontSize:10, fill:'#64748b'}}
                          label={{value:'Margen %', position:'insideBottom', offset:-10, style:{fontSize:11, fill:'#64748b'}}}
                        />
                        <YAxis
                          dataKey="pzRec"
                          name="Ventas (pz)"
                          type="number"
                          domain={['auto','auto']}
                          tick={{fontSize:10, fill:'#64748b'}}
                          label={{value:'Ventas 4sem (pz)', angle:-90, position:'insideLeft', offset:15, style:{fontSize:11, fill:'#64748b'}}}
                        />
                        <ReferenceLine
                          x={avgMargen}
                          stroke="#1a2e4a"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          label={{value:`Margen prom. ${avgMargen.toFixed(1)}%`, position:'insideTopRight', fontSize:9, fill:'#1a2e4a'}}
                        />
                        <ReferenceLine
                          y={avgVentas}
                          stroke="#1a2e4a"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          label={{value:`Prom. ${avgVentas.toFixed(0)}pz`, position:'insideTopRight', fontSize:9, fill:'#1a2e4a'}}
                        />
                        <Tooltip
                          cursor={{strokeDasharray:'3 3'}}
                          content={({ payload }) => {
                            if (!payload?.length) return null
                            const d = payload[0]?.payload
                            if (!d) return null
                            const cuadrante =
                              d.margenPct >= avgMargen && d.pzRec >= avgVentas ? '⭐ Estrella'      :
                              d.margenPct <  avgMargen && d.pzRec >= avgVentas ? '🐄 Vaca'          :
                              d.margenPct >= avgMargen && d.pzRec <  avgVentas ? '❓ Interrogante'  :
                              '🐕 Perro'
                            return (
                              <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'12px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', fontSize:'12px', maxWidth:'220px'}}>
                                <p style={{fontWeight:600, color:'#111827', marginBottom:'4px'}}>{d.nombre}</p>
                                <p style={{color:'#9ca3af', fontFamily:'monospace', marginBottom:'4px'}}>{d.sku}</p>
                                <p style={{color:'#6b7280'}}>Categoría: {d.categoria}</p>
                                <p style={{color:'#6b7280'}}>Margen: <span style={{fontWeight:600, color: d.margenPct >= 30 ? '#15803d' : d.margenPct >= 15 ? '#b45309' : '#dc2626'}}>{d.margenPct.toFixed(1)}%</span></p>
                                <p style={{color:'#6b7280'}}>Ventas 4sem: <span style={{fontWeight:600, color:'#111827'}}>{d.pzRec.toLocaleString('es-MX')} pz</span></p>
                                <p style={{color:'#6b7280'}}>Ingresos 3m: <span style={{fontWeight:600, color:'#111827'}}>${Math.round(d.ing3m).toLocaleString('es-MX')}</span></p>
                                <p style={{color:'#6b7280'}}>Tendencia: <span style={{fontWeight:600, color: d.tendencia > 0 ? '#15803d' : '#dc2626'}}>{d.tendencia > 0 ? '↑' : '↓'} {Math.abs(d.tendencia).toFixed(1)}%</span></p>
                                <p style={{fontWeight:700, marginTop:'8px', color:'#111827'}}>{cuadrante}</p>
                                <p style={{color:'#9ca3af', fontSize:'11px', marginTop:'2px'}}>{ACCIONES[d.clase]}</p>
                              </div>
                            )
                          }}
                        />
                        <Scatter
                          data={datosBCG}
                          name="Productos"
                          shape={(props: any) => {
                            const { cx, cy, payload } = props
                            if (!cx || !cy) return null
                            const color =
                              payload.margenPct >= avgMargen && payload.pzRec >= avgVentas ? '#16a34a' :
                              payload.margenPct <  avgMargen && payload.pzRec >= avgVentas ? '#2563eb' :
                              payload.margenPct >= avgMargen && payload.pzRec <  avgVentas ? '#d97706' :
                              '#dc2626'
                            const r = Math.max(6, Math.min(16, payload.score / 7))
                            return (
                              <circle
                                cx={cx} cy={cy} r={r}
                                fill={color} fillOpacity={0.85}
                                stroke="white" strokeWidth={1.5}
                              />
                            )
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Conteo por cuadrante */}
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[
                      { label:'⭐ Estrella',     f: (p) => p.margenPct >= avgMargen && p.pzRec >= avgVentas, bg:'bg-emerald-50', text:'text-emerald-700' },
                      { label:'🐄 Vaca',          f: (p) => p.margenPct <  avgMargen && p.pzRec >= avgVentas, bg:'bg-blue-50',    text:'text-blue-700'    },
                      { label:'❓ Interrogante', f: (p) => p.margenPct >= avgMargen && p.pzRec <  avgVentas, bg:'bg-amber-50',   text:'text-amber-700'   },
                      { label:'🐕 Perro',         f: (p) => p.margenPct <  avgMargen && p.pzRec <  avgVentas, bg:'bg-red-50',     text:'text-red-700'     },
                    ].map(q => {
                      const n = datosBCG.filter(q.f).length
                      return (
                        <div key={q.label} className={`${q.bg} rounded-xl p-3 text-center`}>
                          <p className={`text-xs font-semibold ${q.text}`}>{q.label}</p>
                          <p className={`text-2xl font-bold ${q.text} mt-1`}>{n}</p>
                          <p className="text-xs text-gray-400">productos</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Tablas por cuadrante */}
                <div className="space-y-3">
                  {[
                    { label:'⭐ Estrella',     desc:'Impulsar, asegurar inventario y activar en promociones.',    f: (p) => p.margenPct >= avgMargen && p.pzRec >= avgVentas, color:'#16a34a' },
                    { label:'🐄 Vaca',          desc:'Renegociar costo, revisar descuentos y ajustar precio.',     f: (p) => p.margenPct <  avgMargen && p.pzRec >= avgVentas, color:'#2563eb' },
                    { label:'❓ Interrogante', desc:'Venta consultiva o cruzada, explorar si puede crecer.',       f: (p) => p.margenPct >= avgMargen && p.pzRec <  avgVentas, color:'#d97706' },
                    { label:'🐕 Perro',         desc:'Evaluar si vale mantener, liquidar o descontinuar.',         f: (p) => p.margenPct <  avgMargen && p.pzRec <  avgVentas, color:'#dc2626' },
                  ].map(q => {
                    const prods = datosBCG.filter(q.f).sort((a, b) => b.score - a.score)
                    if (!prods.length) return null
                    return (
                      <div key={q.label} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between" style={{background: q.color + '18'}}>
                          <p className="text-sm font-semibold" style={{color: q.color}}>{q.label} — {prods.length} productos</p>
                          <p className="text-xs text-gray-500">{q.desc}</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-3 py-2 text-left text-gray-500 font-medium">Producto</th>
                                <th className="px-3 py-2 text-left text-gray-500 font-medium">Categoría</th>
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Margen %</th>
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Ventas 4sem</th>
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Ingresos 3m</th>
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Tendencia</th>
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Puntaje</th>
                              </tr>
                            </thead>
                            <tbody>
                              {prods.map((p, i) => (
                                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-2 font-medium text-gray-900">
                                    {p.nombre}
                                    <span className="text-gray-400 font-mono ml-1">({p.sku})</span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500">{p.categoria}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`font-medium ${p.margenPct >= 30 ? 'text-emerald-700' : p.margenPct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                                      {p.margenPct.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-700">{p.pzRec.toLocaleString('es-MX')} pz</td>
                                  <td className="px-3 py-2 text-right text-gray-700">${Math.round(p.ing3m).toLocaleString('es-MX')}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`font-medium ${p.tendencia > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                      {p.tendencia > 0 ? '↑' : '↓'} {Math.abs(p.tendencia).toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-gray-800">{p.score}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── TENDENCIA ── */}
            {vista === 'tendencia' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Vista de tendencia por producto</p>
                  <p className="text-xs text-gray-400 mt-0.5">Comparativa últimos 3 meses vs 3 meses anteriores. Verde = creciendo, rojo = cayendo.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{background:'#1a2e4a', color:'white'}}>
                        <th className="px-3 py-2.5 text-left">Producto</th>
                        <th className="px-3 py-2.5 text-right">3m anteriores ($)</th>
                        <th className="px-3 py-2.5 text-right">Últimos 3m ($)</th>
                        <th className="px-3 py-2.5 text-center">Tendencia</th>
                        <th className="px-3 py-2.5 text-center">Frecuencia</th>
                        <th className="px-3 py-2.5 text-center">Clasificación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrizFiltrada.sort((a, b) => b.tendencia - a.tendencia).map((p, i) => (
                        <tr key={p.id} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            <p>{p.nombre}</p>
                            <p className="text-gray-400 font-mono text-xs">{p.sku}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {p.ing3mAnt > 0 ? `$${Math.round(p.ing3mAnt).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 font-medium">
                            {p.ing3m > 0 ? `$${Math.round(p.ing3m).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.ing3mAnt === 0 && p.ing3m === 0
                              ? <span className="text-gray-300">Sin datos</span>
                              : p.ing3mAnt === 0 && p.ing3m > 0
                              ? <span className="text-emerald-700 font-medium">✦ Nuevo</span>
                              : (
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div className="h-full rounded-full"
                                      style={{width:`${Math.min(Math.abs(p.tendencia),100)}%`, background: p.tendencia > 0 ? '#16a34a' : '#dc2626'}}/>
                                  </div>
                                  <span className={`font-semibold w-14 text-right ${p.tendencia > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {p.tendencia > 0 ? '▲' : '▼'} {Math.abs(p.tendencia).toFixed(1)}%
                                  </span>
                                </div>
                              )
                            }
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{p.frec3m} período{p.frec3m !== 1 ? 's' : ''}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{background: COLORES_CLASE[p.clase]}}>
                              {p.clase}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
