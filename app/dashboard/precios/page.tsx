'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import BorradoMasivo from '../../components/BorradoMasivo'

type Producto = {
  id: string
  nombre: string
  sku?: string | null
  categoria?: string | null
  precio?: number | null
  costo?: number | null
}

type ProductoBorrado = {
  id: string
  nombre: string
  sku?: string
}

type HistoricoPrecio = {
  id: string
  proyecto_id?: string | null
  producto_id: string
  fecha: string
  precio?: number | null
  costo?: number | null
  margen_pct?: number | null
  canal?: string | null
  motivo?: string | null
  notas?: string | null
  productos?: {
    nombre?: string | null
    sku?: string | null
    categoria?: string | null
  } | null
}

type ExcelRow = Record<string, unknown>

type ProgresoCarga = {
  activo: boolean
  total: number
  cargadas: number
  porcentaje: number
  mensaje: string
}


const MOTIVOS = ['Ajuste de mercado', 'Temporada', 'Promoción', 'Cambio de costo', 'Estrategia comercial', 'Lanzamiento', 'Liquidación', 'Otro']
const CANALES = ['Menudeo', 'Mayoreo', 'En línea', 'Canal preferente', 'Exportación', 'Otro']

function normalizarFecha(valor: any): string {
  if (!valor) return ''
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth()+1).padStart(2,'0')}-${String(valor.getDate()).padStart(2,'0')}`
  }
  if (typeof valor === 'number') {
    const date = new Date(Math.round((valor - 25569) * 86400 * 1000))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
  }
  const str = String(valor).trim()
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`
  return str
}

function normalizarNumero(valor: any) {
  if (valor === null || valor === undefined || valor === '') return null
  const limpio = String(valor).replace('$','').replace(/,/g,'').replace(/%/g,'').trim()
  const n = parseFloat(limpio)
  return Number.isNaN(n) ? null : n
}

export default function Precios() {
  const [proyectoId, setProyectoId] = useState<string | null>(null)
  const [productos,  setProductos]  = useState<Producto[]>([])
  const [historial,  setHistorial]  = useState<HistoricoPrecio[]>([])
  const [loading,    setLoading]    = useState(false)
  const [guardado,   setGuardado]   = useState(false)
  const [modo,       setModo]       = useState<'manual' | 'excel' | 'trazabilidad'>('manual')
  const [preview,    setPreview]    = useState<ExcelRow[]>([])
  const [pendingRows,setPendingRows]= useState<ExcelRow[]>([])
  const [errores,    setErrores]    = useState<string[]>([])
  const [showErrores,setShowErrores]= useState(false)
  const [progreso,   setProgreso]   = useState<ProgresoCarga>({ activo:false, total:0, cargadas:0, porcentaje:0, mensaje:'' })

  // Filtros vista
  const [prodFiltro,   setProdFiltro]   = useState('todos')
  const [agrupacion,   setAgrupacion]   = useState<'dia'|'semana'|'mes'|'año'>('mes')
  const [canalFiltro,  setCanalFiltro]  = useState('todos')
  const [añoFiltro,    setAñoFiltro]    = useState('todos')

  const [form, setForm] = useState({
    producto_id: '', fecha: new Date().toISOString().split('T')[0],
    precio: '', costo: '', canal: '', motivo: '', notas: '',
  })

  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    cargarDatos()
  }, [])

  async function cargarDatos(pid?: string | null) {
    const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
    if (!cliente) return
    const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
    if (!proyecto) return
    const id = pid || proyecto.id
    setProyectoId(id)

    const { data: prods } = await supabase.from('productos').select('id, nombre, sku, categoria, precio, costo')
      .eq('proyecto_id', id).eq('activo', true).order('nombre')
    setProductos((prods || []) as Producto[])

    const { data: hist } = await supabase.from('historico_precios')
      .select('*, productos!historico_precios_producto_id_fkey(nombre, sku, categoria)')
      .eq('proyecto_id', id)
      .order('fecha', { ascending: false })
    setHistorial((hist || []) as HistoricoPrecio[])
  }

  async function guardarPrecio() {
    if (!form.producto_id) return alert('Selecciona un producto')
    if (!form.precio) return alert('El precio de venta es requerido')
    setLoading(true)
    const { error } = await supabase.from('historico_precios').insert({
      proyecto_id: proyectoId,
      producto_id: form.producto_id,
      fecha: form.fecha,
      precio: parseFloat(form.precio),
      costo: form.costo ? parseFloat(form.costo) : null,
      canal: form.canal || null,
      motivo: form.motivo || null,
      notas: form.notas || null,
    })
    setLoading(false)
    if (error) return alert(`Error al guardar: ${error.message}`)
    setForm({ producto_id: '', fecha: new Date().toISOString().split('T')[0], precio: '', costo: '', canal: '', motivo: '', notas: '' })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    await cargarDatos(proyectoId)
  }

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9', VERDE_CL = 'dcfce7'
    const fAzulOsc = { bold:true, color:{argb:'FFFFFFFF'}, size:11, name:'Arial' }
    const fAzulMed = { bold:true, color:{argb:'FFFFFFFF'}, size:10, name:'Arial' }
    const fNormal  = { color:{argb:'FF1e293b'}, size:10, name:'Arial' }
    const fillAzulOsc  = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb:'FF'+AZUL_OSC} }
    const fillAzulMed  = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb:'FF'+AZUL_MED} }
    const fillAzulClar = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb:'FF'+AZUL_CLAR} }
    const fillGris     = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb:'FF'+GRIS} }
    const fillVerdeCl  = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb:'FF'+VERDE_CL} }
    const center = { horizontal:'center' as const, vertical:'middle' as const, wrapText:true }
    const left   = { horizontal:'left'   as const, vertical:'middle' as const, wrapText:true }

    // Hoja Datos
    const wsDatos = wb.addWorksheet('Datos')
    wsDatos.columns = [
      { header:'SKU',            key:'sku',     width:18 },
      { header:'Fecha',          key:'fecha',   width:14 },
      { header:'Precio_Venta',   key:'precio',  width:14 },
      { header:'Costo',          key:'costo',   width:14 },
      { header:'Canal',          key:'canal',   width:16 },
      { header:'Motivo_Cambio',  key:'motivo',  width:24 },
      { header:'Notas',          key:'notas',   width:30 },
    ]
    const hDatos = wsDatos.getRow(1)
    hDatos.eachCell((cell: any) => {
      cell.font = fAzulOsc; cell.fill = fillAzulOsc
      cell.alignment = center
      cell.border = { bottom:{ style:'medium', color:{argb:'FF'+AZUL_MED} } }
    })
    hDatos.height = 22

    const fecha = new Date().toISOString().split('T')[0]
    productos.forEach((p: any, i) => {
      const row = wsDatos.addRow([p.sku || '', fecha, p.precio || '', p.costo || '', '', '', ''])
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any, colNum: number) => {
        cell.font = fNormal; cell.fill = fill
        cell.alignment = colNum === 1 ? left : center
      })
      row.height = 18
    })

    // Hoja Instrucciones
    const ws = wb.addWorksheet('Instrucciones')
    ws.columns = [{ width:24 }, { width:14 }, { width:14 }, { width:38 }, { width:26 }]
    const addRow = (v: any[], h = 18) => { const row = ws.addRow(v); row.height = h; return row }
    const merge  = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
    const styleRow = (row: any, font: any, fill: any, align: any = center) =>
      row.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = font; cell.fill = fill; cell.alignment = align })
    let r = 1

    const titulo = addRow(['💰  GUÍA DE CARGA DE HISTÓRICO DE PRECIOS — INTEGRA'], 30)
    merge(r,1,r,5); titulo.getCell(1).font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Arial' }
    titulo.getCell(1).fill = fillAzulOsc; titulo.getCell(1).alignment = center; r++
    addRow([],6); r++

    const s1 = addRow(['  1.  COLUMNAS DEL ARCHIVO'], 22)
    merge(r,1,r,5); s1.getCell(1).font = fAzulOsc; s1.getCell(1).fill = fillAzulOsc; s1.getCell(1).alignment = left; r++
    const hCols = addRow(['Columna','Formato','¿Requerido?','Descripción','Ejemplo'], 20)
    styleRow(hCols, fAzulMed, fillAzulMed); r++
    const cols = [
      ['SKU',           'Texto',         '✅ Sí', 'SKU exacto del producto tal como aparece en el catálogo', 'HAR-LH-001'],
      ['Fecha',         'YYYY-MM-DD',    '✅ Sí', 'Fecha en que entró en vigor este precio',                  '2026-05-01'],
      ['Precio_Venta',  'Número decimal','✅ Sí', 'Precio de venta al público en pesos',                      '12999.00'],
      ['Costo',         'Número decimal','⚠️ No', 'Costo unitario del producto. El margen se calcula solo',   '9500.00'],
      ['Canal',         'Texto libre',   '⚠️ No', 'Canal de venta: Menudeo, Mayoreo, En línea, etc. Dejar vacío si no aplica', 'Mayoreo'],
      ['Motivo_Cambio', 'Texto libre',   '⚠️ No', 'Razón del cambio de precio',                               'Ajuste de mercado'],
      ['Notas',         'Texto libre',   '⚠️ No', 'Observaciones adicionales',                                 'Precio válido Q2 2026'],
    ]
    cols.forEach((fila, i) => {
      const row = addRow(fila, 22)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = {...left, wrapText:true} }); r++
    })
    addRow([],6); r++

    const s2 = addRow(['  2.  REGLAS IMPORTANTES'], 22)
    merge(r,1,r,5); s2.getCell(1).font = fAzulOsc; s2.getCell(1).fill = fillAzulOsc; s2.getCell(1).alignment = left; r++
    const reglas = [
      ['Margen automático',  'No necesitas calcular el margen — el sistema lo calcula automáticamente al guardar.'],
      ['Canal opcional',     'Si no manejas distinción por canal deja la columna Canal vacía. El registro se guardará sin canal.'],
      ['Histórico completo', 'Puedes cargar múltiples filas del mismo producto con fechas distintas para trazar la evolución del precio.'],
      ['SKU exacto',         'El SKU debe coincidir con el catálogo. Consulta la hoja Referencia para ver los SKUs válidos.'],
      ['Decimales',          'Usa punto (.) como separador decimal. Ejemplo: 1250.50'],
    ]
    reglas.forEach((fila, i) => {
      const row = addRow(fila, 26); merge(r,2,r,5)
      const fill = i % 2 === 0 ? fillVerdeCl : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any, colNum: number) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF'+AZUL_OSC}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = left
      }); r++
    })
    addRow([],6); r++

    const s3 = addRow(['  3.  MOTIVOS DE CAMBIO SUGERIDOS'], 22)
    merge(r,1,r,5); s3.getCell(1).font = fAzulOsc; s3.getCell(1).fill = fillAzulOsc; s3.getCell(1).alignment = left; r++
    MOTIVOS.forEach((m, i) => {
      const row = addRow([m,'','','',''], 18); merge(r,1,r,5)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); r++
    })
    addRow([],6); r++

    // Hoja Referencia SKUs
    const wsRef = wb.addWorksheet('Referencia')
    wsRef.columns = [{ width:18 }, { width:32 }, { width:20 }, { width:14 }, { width:14 }]
    const addRowRef = (v: any[], h = 18) => { const row = wsRef.addRow(v); row.height = h; return row }
    const mergeRef  = (r1: number, c1: number, r2: number, c2: number) => wsRef.mergeCells(r1, c1, r2, c2)
    let rr = 1

    const tituloRef = addRowRef(['📋  SKUs VÁLIDOS PARA HISTÓRICO DE PRECIOS'], 28)
    mergeRef(rr,1,rr,5); tituloRef.getCell(1).font = { bold:true, size:13, color:{argb:'FFFFFFFF'}, name:'Arial' }
    tituloRef.getCell(1).fill = fillAzulOsc; tituloRef.getCell(1).alignment = center; rr++
    addRowRef([],6); rr++
    const hRef = addRowRef(['SKU','Nombre del producto','Categoría','Precio actual','Costo actual'], 20)
    hRef.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    productos.forEach((p: any, i) => {
      const row = addRowRef([p.sku || '—', p.nombre, p.categoria || '—', p.precio || '—', p.costo || '—'], 18)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); rr++
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_precios_INTEGRA.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function leerArchivo(file: File) {
    if (!proyectoId) return alert('Espera a que cargue el proyecto.')
    const XLSXModule = await import('xlsx')
    const XLSX = XLSXModule.default || XLSXModule
    const reader = new FileReader()
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      if (!e.target?.result) return
      const wb = XLSX.read(e.target.result, { type:'array', cellDates:true })
      const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' }) as ExcelRow[]

      const filtradas = rows.filter((row: ExcelRow) => {
        const sku   = String(row.SKU || row.sku || '').trim()
        const precio = row.Precio_Venta ?? row.precio_venta ?? row.Precio ?? row.precio
        return sku && precio !== ''
      })
      if (!filtradas.length) return alert('No se encontraron filas válidas. Revisa que el archivo tenga SKU y Precio_Venta.')

      setProgreso({ activo:true, total:filtradas.length, cargadas:0, porcentaje:0, mensaje:'Validando archivo...' })
      setPreview(filtradas.slice(0,3))

      const errs: string[] = []
      const validas: ExcelRow[] = []
      for (const row of filtradas) {
        const skuOrig = String(row.SKU || row.sku || '').trim()
        const sku = skuOrig.toLowerCase().trim()
        const prod = productos.find((p: Producto) => (p.sku || '').toLowerCase() === sku)
        if (!prod) { errs.push(`SKU no encontrado: ${skuOrig}`); continue }
        validas.push(row)
      }

      if (errs.length > 0 && validas.length === 0) {
        setProgreso({ activo:false, total:0, cargadas:0, porcentaje:0, mensaje:'' })
        setErrores(errs); setShowErrores(true); return
      }

      setProgreso({ activo:false, total:0, cargadas:0, porcentaje:0, mensaje:'' })
      setPendingRows(validas)
      if (errs.length > 0) setErrores(errs)
      await importarPrecios(validas, errs)
    }
    reader.readAsArrayBuffer(file)
  }

  async function importarPrecios(rows: ExcelRow[], errsAnteriores: string[] = []) {
    setLoading(true)
    setProgreso({ activo:true, total:rows.length, cargadas:0, porcentaje:0, mensaje:'Importando precios...' })

    const registros: any[] = []
    for (const row of rows) {
      const skuOrig = String(row.SKU || row.sku || '').trim()
      const sku = skuOrig.toLowerCase().trim()
      const prod = productos.find((p: Producto) => (p.sku || '').toLowerCase() === sku)
      if (!prod) continue

      const fecha  = normalizarFecha(row.Fecha ?? row.fecha)
      const precio = normalizarNumero(row.Precio_Venta ?? row.precio_venta ?? row.Precio ?? row.precio)
      const costo  = normalizarNumero(row.Costo ?? row.costo)
      if (!fecha || precio === null) continue

      registros.push({
        proyecto_id: proyectoId,
        producto_id: prod.id,
        fecha,
        precio,
        costo,
        canal:  String(row.Canal  || row.canal  || '').trim() || null,
        motivo: String(row.Motivo_Cambio || row.motivo || '').trim() || null,
        notas:  String(row.Notas  || row.notas  || '').trim() || null,
      })
    }

    const tamanoLote = 100
    for (let i = 0; i < registros.length; i += tamanoLote) {
      const lote = registros.slice(i, i + tamanoLote)
      const hasta = Math.min(i + tamanoLote, registros.length)
      setProgreso({ activo:true, total:registros.length, cargadas:i,
        porcentaje: Math.round((i/registros.length)*100),
        mensaje: `Cargando ${i+1} a ${hasta} de ${registros.length}...` })
      const { error } = await supabase.from('historico_precios').insert(lote)
      if (error) {
        setLoading(false)
        setProgreso({ activo:false, total:0, cargadas:0, porcentaje:0, mensaje:'' })
        return alert(`Error al insertar: ${error.message}`)
      }
    }

    if (errsAnteriores.length > 0) { setErrores(errsAnteriores); setShowErrores(true) }
    setPreview([]); setPendingRows([])
    setLoading(false); setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    const msg = `✓ ${registros.length} registros importados${errsAnteriores.length > 0 ? ` · ${errsAnteriores.length} con errores` : ''}`
    setProgreso({ activo:true, total:registros.length, cargadas:registros.length, porcentaje:100, mensaje:msg })
    setTimeout(() => setProgreso({ activo:false, total:0, cargadas:0, porcentaje:0, mensaje:'' }), 3000)
    await cargarDatos(proyectoId)
  }

  // ─── Datos para gráfica y tabla ────────────────────────────────────
  const histFiltrado = historial.filter((h: HistoricoPrecio) => {
    if (prodFiltro !== 'todos' && h.producto_id !== prodFiltro) return false
    if (canalFiltro !== 'todos' && (h.canal || 'Sin canal') !== canalFiltro) return false
    if (añoFiltro !== 'todos' && !h.fecha.startsWith(añoFiltro)) return false
    return true
  })

  function agruparLabel(fecha: string) {
    const d = new Date(fecha + 'T12:00:00')
    if (agrupacion === 'dia')   return fecha
    if (agrupacion === 'semana') {
      const lun = new Date(d); lun.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay()-1))
      return `Sem ${lun.toLocaleDateString('es-MX', { day:'2-digit', month:'short' })}`
    }
    if (agrupacion === 'mes')   return d.toLocaleDateString('es-MX', { month:'short', year:'numeric' })
    if (agrupacion === 'año')   return String(d.getFullYear())
    return fecha
  }

  const datosGrafica = (() => {
    const mapa: Record<string, { label:string, precio:number, costo:number, margen:number, count:number }> = {}
    histFiltrado.forEach((h: HistoricoPrecio) => {
      const label = agruparLabel(h.fecha)
      if (!mapa[label]) mapa[label] = { label, precio:0, costo:0, margen:0, count:0 }
      mapa[label].precio  += h.precio || 0
      mapa[label].costo   += h.costo  || 0
      mapa[label].margen  += h.margen_pct || 0
      mapa[label].count   += 1
    })
    return Object.values(mapa).map(d => ({
      label: d.label,
      Precio: parseFloat((d.precio / d.count).toFixed(2)),
      Costo:  parseFloat((d.costo  / d.count).toFixed(2)),
      Margen: parseFloat((d.margen / d.count).toFixed(1)),
    }))
  })()

  const años = [...new Set(historial.map((h: HistoricoPrecio) => h.fecha?.substring(0,4)).filter((a): a is string => Boolean(a)))].sort().reverse()
  const canales = [...new Set(historial.map((h: HistoricoPrecio) => h.canal || 'Sin canal'))].filter(Boolean)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/productos')} className="text-xs text-gray-400 hover:text-gray-600">Catálogo</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/ventas')} className="text-xs text-gray-400 hover:text-gray-600">Ventas</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/inventario')} className="text-xs text-gray-400 hover:text-gray-600">inventario</button>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-medium text-gray-900">Histórico de Precios</p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Modal errores */}
        {showErrores && errores.length > 0 && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">⚠️ Reporte de importación</p>
              <div className="bg-red-50 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto space-y-1">
                {errores.map((e,i) => <p key={i} className="text-xs text-red-700">· {e}</p>)}
              </div>
              <button onClick={() => { setShowErrores(false); setErrores([]) }}
                className="w-full bg-gray-800 text-white text-sm font-medium py-2.5 rounded-xl">Entendido</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 p-2 flex gap-2">
          {[{id:'manual',label:'✏️ Captura manual'},{id:'excel',label:'📂 Subir archivo'},{id:'trazabilidad',label:'📊 Trazabilidad'}].map(t => (
            <button key={t.id} onClick={() => setModo(t.id as 'manual' | 'excel' | 'trazabilidad')}
              className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === t.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Captura manual */}
        {modo === 'manual' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
  <p className="text-sm font-medium text-gray-900">Registrar precio</p>
  {proyectoId && (
    <BorradoMasivo
      tabla="historico_precios"
      proyectoId={proyectoId}
      productos={productos.map((p): ProductoBorrado => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku ?? undefined,
      }))}
      campoFecha="fecha"
      onBorrado={() => cargarDatos(proyectoId)}
    />
  )}
</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Producto *</label>
                <select value={form.producto_id} onChange={e => setForm({...form, producto_id:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecciona un producto</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de vigencia *</label>
                <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                <label className="text-xs font-semibold text-emerald-800 block mb-1">💰 Precio de venta *</label>
                <input type="number" value={form.precio} onChange={e => setForm({...form, precio:e.target.value})}
                  placeholder="0.00" min="0" step="0.01"
                  className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div className="border border-blue-200 rounded-xl p-3 bg-blue-50">
                <label className="text-xs font-semibold text-blue-800 block mb-1">📦 Costo unitario</label>
                <input type="number" value={form.costo} onChange={e => setForm({...form, costo:e.target.value})}
                  placeholder="Opcional" min="0" step="0.01"
                  className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                <label className="text-xs font-semibold text-gray-700 block mb-1">📊 Margen estimado</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-500 h-[38px] flex items-center">
                  {form.precio && form.costo
                    ? <span className={`font-semibold ${parseFloat(form.precio) > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {(((parseFloat(form.precio) - parseFloat(form.costo)) / parseFloat(form.precio)) * 100).toFixed(1)}%
                      </span>
                    : <span className="text-gray-300">Se calcula automáticamente</span>
                  }
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Canal (opcional)</label>
                <select value={form.canal} onChange={e => setForm({...form, canal:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Sin distinción de canal</option>
                  {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Motivo del cambio (opcional)</label>
                <select value={form.motivo} onChange={e => setForm({...form, motivo:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Sin motivo especificado</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Notas (opcional)</label>
              <input value={form.notas} onChange={e => setForm({...form, notas:e.target.value})}
                placeholder="Ej. Precio válido Q2 2026, aplica solo en zona norte..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>
            <button onClick={guardarPrecio} disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-xl text-sm transition-colors">
              {guardado ? '✓ Precio registrado' : loading ? 'Guardando...' : 'Registrar precio'}
            </button>
          </div>
        )}

        {/* Subir archivo */}
        {modo === 'excel' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Subir histórico desde archivo</p>
              <button onClick={descargarPlantilla}
                className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                ↓ Descargar plantilla
              </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-medium">Instrucciones rápidas:</p>
              <p>1. Descarga la plantilla — ya incluye tus productos con sus precios y costos actuales</p>
              <p>2. Agrega filas con las fechas históricas de cada precio</p>
              <p>3. Si no tienes distinción por canal deja la columna Canal vacía</p>
              <p>4. El margen se calcula automáticamente — no necesitas llenarlo</p>
              <p className="text-amber-700">⚠️ Puedes cargar múltiples fechas del mismo producto para construir el historial completo</p>
            </div>
            <div onClick={() => document.getElementById('file-precios')?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <input id="file-precios" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])}/>
              <p className="text-sm text-gray-500">Arrastra tu archivo o haz clic para seleccionar</p>
              <p className="text-xs text-gray-400 mt-1">CSV · XLSX · XLS</p>
            </div>
            {progreso.activo && (
              <div className="bg-white border border-emerald-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-emerald-700">{progreso.mensaje}</p>
                  <p className="text-xs font-semibold text-emerald-700">{progreso.porcentaje}%</p>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-300" style={{width:`${progreso.porcentaje}%`}}/>
                </div>
              </div>
            )}
            {preview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Vista previa ({pendingRows.length} registros detectados):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50">
                      {Object.keys(preview[0]).slice(0,6).map(k => <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium">{k}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.map((r,i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {Object.values(r).slice(0,6).map((v,j) => <td key={j} className="px-3 py-2 text-gray-700">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {loading  && <p className="text-xs text-emerald-600 text-center">Importando precios...</p>}
            {guardado && <p className="text-xs text-emerald-600 text-center font-medium">✓ Precios importados correctamente</p>}
          </div>
        )}

        {/* Trazabilidad */}
        {modo === 'trazabilidad' && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Producto</label>
                <select value={prodFiltro} onChange={e => setProdFiltro(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="todos">Todos los productos</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Agrupación</label>
                <div className="flex gap-1">
                  {[{id:'dia',label:'Día'},{id:'semana',label:'Semana'},{id:'mes',label:'Mes'},{id:'año',label:'Año'}].map(op => (
                    <button key={op.id} onClick={() => setAgrupacion(op.id as any)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${agrupacion === op.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              {años.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Año</label>
                  <select value={añoFiltro} onChange={e => setAñoFiltro(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="todos">Todos</option>
                    {años.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
              {canales.length > 1 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Canal</label>
                  <select value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="todos">Todos los canales</option>
                    {canales.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="ml-auto text-xs text-gray-400">{histFiltrado.length} registros</div>
            </div>

            {/* Gráfica combinada */}
            {datosGrafica.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-sm font-semibold text-gray-900 mb-1">Evolución de precio, costo y margen</p>
                <p className="text-xs text-gray-400 mb-4">Barras apiladas: precio y costo (eje izq.) · Línea: margen % (eje der.)</p>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={datosGrafica} margin={{top:4, right:50, left:10, bottom:40}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="label" tick={{fontSize:10, fill:'#64748b'}} angle={-35} textAnchor="end" interval={0}/>
                    <YAxis yAxisId="left" tick={{fontSize:10, fill:'#64748b'}}
                      tickFormatter={v => `$${v.toLocaleString('es-MX')}`}
                      label={{value:'Precio / Costo ($)', angle:-90, position:'insideLeft', offset:-5, style:{fontSize:10, fill:'#64748b'}}}/>
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize:10, fill:'#7c3aed'}}
                      tickFormatter={v => `${v}%`}
                      label={{value:'Margen %', angle:90, position:'insideRight', offset:10, style:{fontSize:10, fill:'#7c3aed'}}}/>
                    <Tooltip
  formatter={(val: any, name: any) => {
    const num = typeof val === 'number' ? val : Number(val ?? 0)
    const label = String(name)

    return label === 'Margen'
      ? [`${num}%`, 'Margen']
      : [`$${num.toLocaleString('es-MX')}`, label]
  }}
/>
                    <Legend wrapperStyle={{fontSize:'11px', paddingTop:'8px'}}/>
                    <Bar yAxisId="left" dataKey="Costo"  name="Costo"  stackId="a" fill="#94a3b8" radius={[0,0,0,0]}/>
                    <Bar yAxisId="left" dataKey="Precio" name="Precio" stackId="a" fill="#2563eb" radius={[4,4,0,0]}/>
                    <Line yAxisId="right" type="monotone" dataKey="Margen" name="Margen"
                      stroke="#7c3aed" strokeWidth={2.5} dot={{r:4, fill:'#7c3aed'}} activeDot={{r:6}}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
                <p className="text-sm text-gray-400">No hay datos para mostrar con los filtros seleccionados.</p>
              </div>
            )}

            {/* Tabla historial */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Detalle del historial</p>
              {histFiltrado.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">No hay registros.</p>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{background:'#1a2e4a', color:'white'}}>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Costo</th>
                          <th className="px-3 py-2 text-right">Margen</th>
                          <th className="px-3 py-2 text-center">Canal</th>
                          <th className="px-3 py-2 text-left">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {histFiltrado.map((h, i) => (
                          <tr key={h.id} className={i%2===0 ? 'bg-blue-50' : 'bg-white'}>
                            <td className="px-3 py-2 text-gray-500">
                              {(() => { const [y,m,d] = h.fecha.split('-'); return `${d}-${m}-${y}` })()}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">{h.productos?.nombre || '—'}</td>
                            <td className="px-3 py-2 font-mono text-gray-500">{h.productos?.sku || '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-900 font-medium">${h.precio?.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{h.costo ? `$${h.costo?.toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—'}</td>
                            <td className="px-3 py-2 text-right">
  {typeof h.margen_pct === 'number'
    ? <span className={`font-medium ${h.margen_pct >= 30 ? 'text-emerald-700' : h.margen_pct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
        {h.margen_pct}%
      </span>
    : <span className="text-gray-300">—</span>
  }
</td>
                            <td className="px-3 py-2 text-center text-gray-500">{h.canal || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{h.motivo || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
