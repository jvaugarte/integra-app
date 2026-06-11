'use client'

import SelectorPeriodo from '../../components/SelectorPeriodo'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'
import BorradoMasivo from '../../components/BorradoMasivo'
import * as XLSX from 'xlsx'

type Producto = {
  id: string
  nombre: string
  sku?: string | null
  SKU?: string | null
  codigo?: string | null
  categoria?: string | null
  precio?: number | null
  costo?: number | null
  aplica_inventario?: boolean | null
  [key: string]: any
}

type VentaRow = {
  id: string
  producto_id: string
  periodo_tipo?: string | null
  periodo_fecha: string
  piezas?: number | null
  precio_unitario?: number | null
  costo_unitario?: number | null
  ingreso_real?: number | null
  costo_real?: number | null
  utilidad?: number | null
  descuento_pct?: number | null
  tiene_promo?: boolean | null
  tipo_promo?: string | null
  productos?: { nombre?: string | null } | null
  [key: string]: any
}

type VentaExistente = {
  id: string
  producto_id: string
  periodo_fecha: string
  periodo_tipo?: string | null
  [key: string]: any
}

type VentaAnalisisRow = {
  proyecto_id?: string | null
  producto_id?: string | null
  producto_nombre?: string | null
  categoria?: string | null
  anio?: number | string | null
  mes?: number | string | null
  semana?: number | string | null
  dia?: string | null
  fecha?: string | null
  periodo_fecha?: string | null
  semana_inicio?: string | null
  mes_inicio?: string | null
  piezas?: number | string | null
  registros?: number | string | null
  ingreso_real?: number | string | null
  costo_real?: number | string | null
  utilidad?: number | string | null
  [key: string]: any
}

type ExcelRow = Record<string, any>

type ProgresoCarga = {
  activo: boolean
  total: number
  cargadas: number
  porcentaje: number
  mensaje: string
}

type SemanaPeriodo = {
  num: number
  label: string
  fecha: string
}

type MesPeriodo = {
  label: string
  fecha: string
}



function getSemanas(año: number): SemanaPeriodo[] {
  const semanas: SemanaPeriodo[] = []
  const fecha = new Date(año, 0, 1)
  while (fecha.getDay() !== 1) fecha.setDate(fecha.getDate() + 1)
  let semana = 1
  while (fecha.getFullYear() === año) {
    const inicio = new Date(fecha)
    const fin = new Date(fecha)
    fin.setDate(fin.getDate() + 6)
    const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    semanas.push({
      num: semana,
      label: `Semana ${semana} (${fmt(inicio)} – ${fmt(fin)})`,
      fecha: inicio.toISOString().split('T')[0],
    })
    fecha.setDate(fecha.getDate() + 7)
    semana++
  }
  return semanas
}

function getMeses(año: number): MesPeriodo[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(año, i, 1)
    return {
      label: d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
      fecha: d.toISOString().split('T')[0],
    }
  })
}

export default function Ventas() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proyectoId, setProyectoId] = useState<string | null>(null)
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [modo, setModo] = useState('manual')
  const [preview, setPreview] = useState<ExcelRow[]>([])
  const [pendingRows, setPendingRows] = useState<ExcelRow[]>([])
  const [duplicados, setDuplicados] = useState<Array<string | VentaExistente>>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [ventasExistentesCache, setVentasExistentesCache] = useState<VentaExistente[]>([])
  const [ventasAnalisis, setVentasAnalisis] = useState<VentaAnalisisRow[]>([])
  const [agrupacion, setAgrupacion] = useState<'producto'|'periodo'|'categoria'>('periodo')
  const [tipoGrafica, setTipoGrafica] = useState<'linea'|'barras'>('barras')
  const [vistaPeriodo, setVistaPeriodo] = useState<'anio'|'mes'|'semana'|'dia'>('semana')
  const [metricasSeleccionadas, setMetricasSeleccionadas] = useState<string[]>(['ingreso'])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [progresoCarga, setProgresoCarga] = useState<ProgresoCarga>({
    activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '',
  })

  const año = new Date().getFullYear()
  const [añosFiltro, setAñosFiltro] = useState<number[]>([new Date().getFullYear()])
  const [mesesFiltro, setMesesFiltro] = useState<number[]>([])
  const [semanasFiltro, setSemanasFiltro] = useState<number[]>([])
  const semanas = getSemanas(año)
  const meses = getMeses(año)

  const [form, setForm] = useState({
    periodo_tipo: 'dia',
    periodo_fecha: new Date().toISOString().split('T')[0],
    semana_idx: 0,
    mes_idx: new Date().getMonth(),
    producto_id: '',
    piezas: '',
    modo_registro: 'piezas',
    monto_manual: '',
  })

  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    const params = new URLSearchParams(window.location.search)
    if (params.get('modo') === 'analisis') setModo('analisis')
    cargarDatos()
    cargarVentasAnalisis()
  }, [])
  
  async function cargarDatos(forzarProyectoId?: string) {
  const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
  if (!cliente) return
  const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
  if (!proyecto) return

  const pid = forzarProyectoId || proyecto.id
  setProyectoId(pid)

  const { data: prods } = await supabase.from('productos').select('*')
    .eq('proyecto_id', pid).eq('activo', true).order('nombre')
  setProductos((prods || []) as Producto[])

  const { data: vs } = await supabase.from('ventas')
    .select('*, productos!ventas_producto_id_fkey(nombre)')
    .eq('proyecto_id', pid)
    .order('periodo_fecha', { ascending: false })
    .limit(20)
  setVentas((vs || []) as VentaRow[])
await cargarVentasAnalisis(pid)
}

  function obtenerValor(row: any, columnas: string[]) {
    const keys = Object.keys(row)
    for (const columna of columnas) {
      const key = keys.find(k => k.toLowerCase().trim() === columna.toLowerCase().trim())
      if (key) return row[key]
    }
    return ''
  }

  function obtenerSkuProducto(producto: any) {
    return String(producto?.sku || producto?.SKU || producto?.codigo || '').toLowerCase().trim()
  }

  function normalizarNumero(valor: any) {
    if (valor === null || valor === undefined || valor === '') return null
    const limpio = String(valor).replace('$', '').replace(/,/g, '').trim()
    const numero = parseFloat(limpio)
    return Number.isNaN(numero) ? null : numero
  }

  function getFechaReal() {
    if (form.periodo_tipo === 'semana') return semanas[form.semana_idx]?.fecha || ''
    if (form.periodo_tipo === 'mes') return meses[form.mes_idx]?.fecha || ''
    return form.periodo_fecha
  }

  function calcularTotales() {
    const prod = productos.find(p => p.id === form.producto_id)
    if (!prod) return null
    let ingreso = 0, costoTotal = 0, piezas = 0, descuentoAuto: string | null = null

    const precioProducto = typeof prod.precio === 'number' ? prod.precio : 0
    const costoProducto = typeof prod.costo === 'number' ? prod.costo : 0

    if (form.modo_registro === 'dinero') {
      if (!form.monto_manual) return null
      ingreso = parseFloat(form.monto_manual)
      costoTotal = costoProducto
      if (precioProducto > 0 && ingreso < precioProducto) {
        descuentoAuto = (((precioProducto - ingreso) / precioProducto) * 100).toFixed(1)
      }
    } else {
      if (!form.piezas) return null
      piezas = parseFloat(form.piezas)
      ingreso = piezas * precioProducto
      costoTotal = piezas * costoProducto
    }

    return {
      ingreso: ingreso.toFixed(2),
      costoTotal: costoTotal.toFixed(2),
      utilidad: (ingreso - costoTotal).toFixed(2),
      descuentoAuto,
    }
  }

 async function cargarVentasAnalisis(pid?: string) {
  let idUsar = pid || proyectoId

  if (!idUsar) {
    const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
    if (!cliente) return
    const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
    if (!proyecto) return
    idUsar = proyecto.id
  }

  let todas: any[] = []
  let desde = 0
  const tamano = 1000

  while (true) {
    const { data, error } = await supabase
  .from('ventas_por_anio_mes_semana')
  .select('*')
  .eq('proyecto_id', idUsar)
  .order('anio', { ascending: true })
  .order('mes', { ascending: true })
  .order('semana', { ascending: true })
  .range(desde, desde + tamano - 1)
    if (error || !data || data.length === 0) break
    todas = todas.concat(data)
    if (data.length < tamano) break
    desde += tamano
  }

  setVentasAnalisis(todas as VentaAnalisisRow[])
}
  function getWeek(d: Date): number {
    const start = new Date(d.getFullYear(), 0, 1)
    return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
  }
  async function verificarDuplicado(productoId: string, fecha: string) {
  if (!proyectoId) return []

  const { data, error } = await supabase
    .from('ventas')
    .select('id, producto_id, periodo_tipo, periodo_fecha')
    .eq('proyecto_id', proyectoId)
    .eq('producto_id', productoId)
    .eq('periodo_fecha', fecha)

  if (error) {
    console.error('Error verificando duplicado:', error)
    return []
  }

  return data || []
}
  async function guardarVenta(reemplazar = false) {
    if (!form.producto_id) return alert('Selecciona producto')
    if (form.modo_registro === 'piezas' && !form.piezas) return alert('Ingresa las piezas vendidas')
    if (form.modo_registro === 'dinero' && !form.monto_manual) return alert('Ingresa el monto vendido')
    const totales = calcularTotales()
    if (!totales) return
    const prod = productos.find(p => p.id === form.producto_id)
    if (!prod) return alert('No se encontró el producto seleccionado')
    const fechaReal = getFechaReal()

    if (!reemplazar) {
      const dups = await verificarDuplicado(form.producto_id, fechaReal)
      if (dups.length > 0) { setDuplicados(dups); setShowConfirm(true); return }
    }

    setShowConfirm(false)
    setLoading(true)

    if (reemplazar && duplicados.length > 0) {
      const idsDuplicados = duplicados
  .filter((d): d is VentaExistente => typeof d !== 'string' && !!d?.id)
  .map(d => d.id)

if (idsDuplicados.length > 0) {
  await supabase.from('ventas').delete().in('id', idsDuplicados)
}
    }

    const { error } = await supabase.from('ventas').insert({
      proyecto_id: proyectoId,
      producto_id: form.producto_id,
      periodo_tipo: form.periodo_tipo,
      periodo_fecha: fechaReal,
      piezas: form.modo_registro === 'piezas' ? parseFloat(form.piezas) : null,
      precio_unitario: typeof prod.precio === 'number' ? prod.precio : 0,
      costo_unitario: typeof prod.costo === 'number' ? prod.costo : null,
      ingreso_real: parseFloat(totales.ingreso),
      costo_real: parseFloat(totales.costoTotal),
      utilidad: parseFloat(totales.utilidad),
      descuento_pct: totales.descuentoAuto ? parseFloat(totales.descuentoAuto) : null,
      tiene_promo: false,
    })

    setLoading(false)
    if (error) return alert(`No se pudo guardar la venta: ${error.message}`)

    setForm({ ...form, producto_id: '', piezas: '', monto_manual: '' })
    setDuplicados([])
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    cargarDatos()
  }

  function getLunes(date: Date): Date {
    const d = new Date(date)
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
    d.setDate(d.getDate() + diff)
    return d
  }

  function getNumeroSemana(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  function fmt(d: Date): string {
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
  }

  function normalizarFecha(valor: any): string {
  if (!valor) return ''

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`
  }

  if (typeof valor === 'number') {
    // Serial de Excel: 1 = 1 enero 1900, con bug de año bisiesto 1900
    const serial = valor > 59 ? valor - 1 : valor
    const msDesde1900 = (serial - 1) * 86400 * 1000
    const fecha1900 = new Date(Date.UTC(1900, 0, 1))
    const date = new Date(fecha1900.getTime() + msDesde1900)
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  }

  const str = String(valor).trim()
  const ymdConHora = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/)
  if (ymdConHora) return `${ymdConHora[1]}-${ymdConHora[2].padStart(2, '0')}-${ymdConHora[3].padStart(2, '0')}`

  const sem = str.match(/^(\d{4})-[SW](\d{1,2})$/i)
  if (sem) {
    const anio = parseInt(sem[1])
    const numSem = parseInt(sem[2])
    const jan4 = new Date(anio, 0, 4)
    const lunes = new Date(jan4)
    lunes.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (numSem - 1) * 7)
    return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, '0')}-${String(lunes.getDate()).padStart(2, '0')}`
  }

  const mesesMap: Record<string, string> = {
    enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
    julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
  }
  const mes = str.match(/^([a-záéíóúü]+)-(\d{4})$/i)
  if (mes) {
    const numMes = mesesMap[mes[1].toLowerCase()]
    if (numMes) return `${mes[2]}-${numMes}-01`
  }

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`

  return ''
}

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe'
    const VERDE = '16a34a', VERDE_CL = 'dcfce7', GRIS = 'f1f5f9'
    const fAzulOsc = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
    const fAzulMed = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fVerde   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fNormal  = { color: { argb: 'FF1e293b' }, size: 10, name: 'Arial' }
    const fNota    = { italic: true, color: { argb: 'FF1e40af' }, size: 9, name: 'Arial' }
    const fValor   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fillAzulOsc  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_OSC } }
    const fillAzulMed  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_MED } }
    const fillAzulClar = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_CLAR } }
    const fillVerde    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + VERDE } }
    const fillVerdeCl  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + VERDE_CL } }
    const fillGris     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + GRIS } }
    const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
    const left   = { horizontal: 'left' as const,   vertical: 'middle' as const, wrapText: true }

    const wsDatos = wb.addWorksheet('Datos')
    wsDatos.columns = [
      { header: 'SKU',          key: 'sku',     width: 24 },
      { header: 'Fecha',        key: 'fecha',   width: 16 },
      { header: 'Piezas',       key: 'piezas',  width: 12 },
      { header: 'Monto_Pesos',  key: 'monto',   width: 14 },
      { header: 'Periodo_Tipo', key: 'periodo', width: 14 },
    ]
    const hDatos = wsDatos.getRow(1)
    hDatos.eachCell((cell: any) => {
      cell.font = fAzulOsc; cell.fill = fillAzulOsc
      cell.alignment = center
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + AZUL_MED } } }
    })
    hDatos.height = 22

    const ws = wb.addWorksheet('Instrucciones')
    ws.columns = [{ width: 34 }, { width: 13 }, { width: 14 }, { width: 28 }, { width: 32 }]
    const addRow = (v: any[], h = 18) => { const row = ws.addRow(v); row.height = h; return row }
    const merge  = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
    const styleRow = (row: any, font: any, fill: any, align: any = center) =>
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = font; cell.fill = fill; cell.alignment = align })
    let r = 1

    const tituloRow = addRow(['GUÍA DE CAPTURA DE VENTAS - INTEGRA Inteligencia Integral'], 30)
    merge(r,1,r,5); tituloRow.getCell(1).font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Arial' }
    tituloRow.getCell(1).fill = fillAzulOsc; tituloRow.getCell(1).alignment = center; r++
    addRow([],6); r++

    const s1 = addRow(['  1.  COLUMNAS DEL ARCHIVO DE DATOS'], 22)
    merge(r,1,r,5); s1.getCell(1).font = fAzulOsc; s1.getCell(1).fill = fillAzulOsc; s1.getCell(1).alignment = left; r++
    const hCols = addRow(['Columna','Formato','¿Requerido?','Descripción','Ejemplo'], 20)
    styleRow(hCols, fAzulMed, fillAzulMed); r++
    const colsData = [
      ['SKU','Texto','Sí','SKU exacto del producto tal como aparece en el catálogo INTEGRA','REF-600'],
      ['Fecha','Ver sección 2','Sí','Para día: DD-MM-YYYY  |  Para semana: 2026-S21  |  Para mes: mayo-2026','2026-S21'],
      ['Piezas','Número entero','*','Unidades vendidas. Dejar vacío si usas Monto_Pesos','150'],
      ['Monto_Pesos','Número decimal','*','Ingreso total en pesos. Dejar vacío si usas Piezas','4500.00'],
      ['Periodo_Tipo','dia/semana/mes','Sí','Escribe exactamente: dia, semana o mes en minúsculas','semana'],
    ]
    colsData.forEach((fila, i) => {
      const row = addRow(fila, 20)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = {...left, wrapText:true} })
      r++
    })
    const notaRow = addRow(['  * Debes llenar Piezas O Monto_Pesos. Si pones ambos, el sistema usará Monto_Pesos.'], 18)
    merge(r,1,r,5); notaRow.getCell(1).font = fNota; notaRow.getCell(1).fill = fillAzulClar; notaRow.getCell(1).alignment = left; r++
    addRow([],6); r++

    const s2 = addRow(['  2.  REFERENCIA DE FECHAS POR TIPO DE PERIODO'], 22)
    merge(r,1,r,5); s2.getCell(1).font = fAzulOsc; s2.getCell(1).fill = fillAzulOsc; s2.getCell(1).alignment = left; r++

    const diaTitle = addRow(['  TIPO DÍA - Periodo_Tipo: dia'], 20)
    merge(r,1,r,5); diaTitle.getCell(1).font = { bold:true, size:10, color:{argb:'FF'+AZUL_MED}, name:'Arial' }
    diaTitle.getCell(1).fill = fillAzulClar; diaTitle.getCell(1).alignment = left; r++
    const diaExpl = addRow(['  Escribe la fecha en formato DD-MM-YYYY o YYYY-MM-DD. Ejemplo: 2026-05-15'], 18)
    merge(r,1,r,5); diaExpl.getCell(1).font = fNota; diaExpl.getCell(1).fill = fillGris; diaExpl.getCell(1).alignment = left; r++
    addRow([],6); r++

    const semTitle = addRow(['  TIPO SEMANA - Periodo_Tipo: semana'], 20)
    merge(r,1,r,5); semTitle.getCell(1).font = { bold:true, size:10, color:{argb:'FF'+VERDE}, name:'Arial' }
    semTitle.getCell(1).fill = fillVerdeCl; semTitle.getCell(1).alignment = left; r++
    const semExpl = addRow(['  Copia el valor de "Valor a usar" y pégalo en la columna Fecha de la hoja Datos.'], 18)
    merge(r,1,r,5); semExpl.getCell(1).font = fNota; semExpl.getCell(1).fill = fillGris; semExpl.getCell(1).alignment = left; r++
    const hSem = addRow(['Período (Lunes a Domingo)','Año','Núm. Semana','Valor a usar en Fecha',''], 20)
    merge(r,4,r,5); styleRow(hSem, fVerde, fillVerde); r++

    const hoy = new Date()
    const lunesHoy = getLunes(hoy)
    for (let i = 0; i < 156; i++) {
      const lunes = new Date(lunesHoy); lunes.setDate(lunesHoy.getDate() - i * 7)
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
      const numSem = getNumeroSemana(lunes)
      const anio = lunes.getFullYear()
      const valorSem = `${anio}-S${numSem.toString().padStart(2,'0')}`
      const fRow = addRow([`${fmt(lunes)} al ${fmt(domingo)}`, anio, numSem, valorSem, ''], 18)
      merge(r,4,r,5)
      const fillFila = i % 2 === 0 ? fillVerdeCl : fillGris
      fRow.eachCell({ includeEmpty: false }, (cell: any, colNum: number) => {
        cell.font = colNum === 4 ? fValor : fNormal
        cell.fill = colNum === 4 ? fillVerde : fillFila
        cell.alignment = center
      }); r++
    }
    addRow([],6); r++

    const mesTitle = addRow(['  TIPO MES - Periodo_Tipo: mes'], 20)
    merge(r,1,r,5); mesTitle.getCell(1).font = { bold:true, size:10, color:{argb:'FF'+AZUL_MED}, name:'Arial' }
    mesTitle.getCell(1).fill = fillAzulClar; mesTitle.getCell(1).alignment = left; r++
    const mesExpl = addRow(['  Copia el valor de "Valor a usar" y pégalo en la columna Fecha de la hoja Datos.'], 18)
    merge(r,1,r,5); mesExpl.getCell(1).font = fNota; mesExpl.getCell(1).fill = fillGris; mesExpl.getCell(1).alignment = left; r++
    const hMes = addRow(['Mes','Año','Valor a usar en Fecha','',''], 20)
    merge(r,3,r,5); styleRow(hMes, fAzulMed, fillAzulMed); r++
    const nombresMes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    for (let i = 0; i < 36; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      const nombreM = nombresMes[d.getMonth()]
      const anioM = d.getFullYear()
      const valorM = `${nombreM}-${anioM}`
      const mRow = addRow([nombreM, anioM, valorM, '', ''], 18)
      merge(r,3,r,5)
      const fillFila = i % 2 === 0 ? fillAzulClar : fillGris
      mRow.eachCell({ includeEmpty: false }, (cell: any, colNum: number) => {
        cell.font = colNum === 3 ? fValor : fNormal
        cell.fill = colNum === 3 ? fillAzulMed : fillFila
        cell.alignment = center
      }); r++
    }
    addRow([],6); r++

    const s3 = addRow(['  3.  NOTAS FINALES'], 22)
    merge(r,1,r,5); s3.getCell(1).font = fAzulOsc; s3.getCell(1).fill = fillAzulOsc; s3.getCell(1).alignment = left; r++
    const notas = [
      '  • El SKU debe coincidir exactamente con un producto existente en el catálogo de productos INTEGRA.',
      '  • No modifiques los nombres de las columnas en la hoja Datos.',
      '  • Usa punto (.) como separador decimal, no coma (,). Ejemplo: 1250.50',
      '  • El sistema detectará duplicados y te avisará antes de guardar.',
      '  • ¿Dudas? Consulta a tu consultor INTEGRA o usa el Asistente IA dentro de la app.',
    ]
    notas.forEach(nota => {
      const nRow = addRow([nota,'','','',''], 18)
      merge(r,1,r,5); nRow.getCell(1).font = fNormal; nRow.getCell(1).fill = fillGris; nRow.getCell(1).alignment = left; r++
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_ventas_INTEGRA.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function leerArchivoVentas(file: File) {
    if (!proyectoId) return alert('Espera a que cargue el proyecto antes de subir el archivo.')
    if (!productos.length) return alert('No hay productos cargados. Revisa tu catálogo antes de importar ventas.')

    const reader = new FileReader()

    reader.onload = async (e) => {
      const result = e.target?.result
      if (!result) return
      const wb = XLSX.read(result, { type: 'array', cellDates: false })
      const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: '' })
      console.log('Total filas leídas:', rows.length)
      console.log('Fila 1 completa:', rows[0])
      console.log('Fila 2 completa:', rows[1])



      const rowsFiltradas = rows.filter((row: ExcelRow) => {
        const sku   = obtenerValor(row, ['SKU', 'Producto'])
        const fecha = obtenerValor(row, ['Fecha'])
        const piezas = obtenerValor(row, ['Piezas'])
        const monto  = obtenerValor(row, ['Monto_Pesos'])
        const piezasValidas = piezas !== '' && piezas !== null && piezas !== undefined
        const montoValido = monto !== '' && monto !== null && monto !== undefined
        return sku && fecha && (piezasValidas || montoValido)
      })

      if (!rowsFiltradas.length) {
        return alert('No se encontraron filas válidas. Revisa que el archivo tenga SKU, Fecha y Piezas o Monto_Pesos.')
      }

      setProgresoCarga({ activo: true, total: rowsFiltradas.length, cargadas: 0, porcentaje: 0, mensaje: 'Validando archivo...' })
      setPreview(rowsFiltradas.slice(0, 3))

      // ── Validar SKUs y fechas ──
      const errores: string[] = []
      const rowsValidas: any[] = []

      for (const row of rowsFiltradas) {
        const skuOriginal = obtenerValor(row, ['SKU', 'Producto'])
        const sku   = String(skuOriginal).toLowerCase().trim()
        const fecha = normalizarFecha(obtenerValor(row, ['Fecha']))

        if (!fecha) { errores.push(`Fecha inválida para SKU ${skuOriginal}`); continue }

        const prod = productos.find(p => obtenerSkuProducto(p) === sku)
        if (!prod) { errores.push(`SKU no encontrado en catálogo: ${skuOriginal}`); continue }

        rowsValidas.push(row)
      }

      if (errores.length > 0) {
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        return alert(`No se importó el archivo. Corrige estos errores:\n\n${errores.slice(0, 10).join('\n')}${errores.length > 10 ? '\n...' : ''}`)
      }

      // ── Detectar duplicados en UNA sola consulta ──
      setProgresoCarga({ activo: true, total: rowsValidas.length, cargadas: 0, porcentaje: 10, mensaje: 'Verificando duplicados...' })

      const productosIds = [...new Set(
        rowsValidas.map(row => {
          const sku = String(obtenerValor(row, ['SKU', 'Producto'])).toLowerCase().trim()
          return productos.find(p => obtenerSkuProducto(p) === sku)?.id
        }).filter(Boolean)
      )]

      const { data: ventasExistentes } = await supabase
        .from('ventas')
        .select('id, producto_id, periodo_fecha')
        .eq('proyecto_id', proyectoId)
        .in('producto_id', productosIds)

      setVentasExistentesCache((ventasExistentes || []) as VentaExistente[])

      const setExistentes = new Set(
        (ventasExistentes || []).map((v: any) => `${v.producto_id}__${v.periodo_fecha}`)
      )

      const dups: string[] = []
      for (const row of rowsValidas) {
        const skuOriginal = obtenerValor(row, ['SKU', 'Producto'])
        const sku   = String(skuOriginal).toLowerCase().trim()
        const fecha = normalizarFecha(obtenerValor(row, ['Fecha']))
        const prod  = productos.find(p => obtenerSkuProducto(p) === sku)
        if (prod && setExistentes.has(`${prod.id}__${fecha}`)) {
          dups.push(`${skuOriginal} — ${fecha}`)
        }
      }

      setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
      setPendingRows(rowsValidas)
      setDuplicados(dups)

      if (dups.length > 0) setShowConfirm(true)
      else await importarVentas(rowsValidas, false, ventasExistentes || [])
    }

    reader.readAsArrayBuffer(file)
  }

    async function importarVentas(rows: ExcelRow[], reemplazar: boolean, ventasCache: VentaExistente[] = ventasExistentesCache) {
      if (!proyectoId) return alert('No se encontró el proyecto activo.')

      setShowConfirm(false)
      setLoading(true)
      setProgresoCarga({ activo: true, total: rows.length, cargadas: 0, porcentaje: 0, mensaje: 'Preparando registros...' })

      const registros: any[] = []
      const errores: string[] = []

      for (const row of rows) {
        const skuOriginal = obtenerValor(row, ['SKU', 'Producto'])
        const sku   = String(skuOriginal).toLowerCase().trim()
        const fecha = normalizarFecha(obtenerValor(row, ['Fecha']))
        if (!sku || !fecha) continue

        const prod = productos.find(p => obtenerSkuProducto(p) === sku)
        if (!prod) { errores.push(`SKU no encontrado: ${skuOriginal}`); continue }

        const piezas     = normalizarNumero(obtenerValor(row, ['Piezas']))
        const montoManual = normalizarNumero(obtenerValor(row, ['Monto_Pesos']))
        const periodTipo  = String(obtenerValor(row, ['Periodo_Tipo']) || 'dia').toLowerCase().trim()

        if ((piezas === null || piezas === undefined) && (montoManual === null || montoManual === undefined)) { errores.push(`SKU ${skuOriginal}: falta Piezas o Monto_Pesos`); continue }
        if (!['dia','semana','mes'].includes(periodTipo)) { errores.push(`SKU ${skuOriginal}: Periodo_Tipo inválido (${periodTipo})`); continue }

        let ingreso = 0
        let costoTotal = 0
        let descuentoAuto: number | null = null
        const precioProducto = typeof prod.precio === 'number' ? prod.precio : 0
        const costoProducto = typeof prod.costo === 'number' ? prod.costo : 0
        const piezasNum = typeof piezas === 'number' ? piezas : 0

        if (montoManual !== null) {
          ingreso    = montoManual
          costoTotal = piezas !== null ? piezasNum * costoProducto : costoProducto
          if (precioProducto > 0 && piezasNum > 0 && montoManual < piezasNum * precioProducto) {
            descuentoAuto = parseFloat((((piezasNum * precioProducto) - montoManual) / (piezasNum * precioProducto) * 100).toFixed(1))
          }
        } else {
          ingreso    = piezasNum * precioProducto
          costoTotal = piezasNum * costoProducto
        }

      registros.push({
        proyecto_id: proyectoId,
        producto_id: prod.id,
        periodo_tipo: periodTipo,
        periodo_fecha: fecha,
        piezas,
        precio_unitario: precioProducto,
        costo_unitario:  typeof prod.costo === 'number' ? prod.costo : null,
        ingreso_real:  parseFloat(ingreso.toFixed(2)),
        costo_real:    parseFloat(costoTotal.toFixed(2)),
        utilidad:      parseFloat((ingreso - costoTotal).toFixed(2)),
        descuento_pct: descuentoAuto,
        tiene_promo:   false,
      })
    }

    if (!registros.length) {
      setLoading(false)
      setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
      alert('No hay registros válidos para importar.')
      return
    }

    // Borrar duplicados en lotes de 100
if (reemplazar && ventasCache.length > 0) {
  setProgresoCarga({ activo: true, total: registros.length, cargadas: 0, porcentaje: 5, mensaje: 'Eliminando registros anteriores...' })
  
  const idsABorrar = ventasCache
    .filter(v => registros.some(r => r.producto_id === v.producto_id && r.periodo_fecha === v.periodo_fecha))
    .map(v => v.id)

  if (idsABorrar.length > 0) {
    const loteBorrado = 50
    for (let i = 0; i < idsABorrar.length; i += loteBorrado) {
      const lote = idsABorrar.slice(i, i + loteBorrado)
      await supabase.from('ventas').delete().in('id', lote)
    }
  }
}
    // ── Insertar en lotes de 100 ──
    const tamanoLote = 100
    for (let i = 0; i < registros.length; i += tamanoLote) {
      const lote = registros.slice(i, i + tamanoLote)
      const cargadasHasta = Math.min(i + tamanoLote, registros.length)

      setProgresoCarga({
        activo: true, total: registros.length, cargadas: i,
        porcentaje: Math.round((i / registros.length) * 100),
        mensaje: `Cargando ${i + 1} a ${cargadasHasta} de ${registros.length}...`,
      })

      const { error } = await supabase.from('ventas').insert(lote)
      if (error) {
        setLoading(false)
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        alert(`Error al insertar: ${error.message}`)
        return
      }

      setProgresoCarga({
        activo: true, total: registros.length, cargadas: cargadasHasta,
        porcentaje: Math.round((cargadasHasta / registros.length) * 100),
        mensaje: `Ventas cargadas: ${cargadasHasta} de ${registros.length}`,
      })
    }

    setPreview([]); setPendingRows([]); setDuplicados([]); setVentasExistentesCache([])
    setLoading(false); setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)

    const mensajeFinal = `✓ ${registros.length} ventas importadas${errores.length > 0 ? ` · ${errores.length} omitidas` : ''}`
    setProgresoCarga({ activo: true, total: registros.length, cargadas: registros.length, porcentaje: 100, mensaje: mensajeFinal })
    setTimeout(() => setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' }), 3000)

    // Recargar ventas directamente con el proyectoId que ya tenemos
const { data: vs, error: errorVentas } = await supabase
  .from('ventas')
  .select('*, productos!ventas_producto_id_fkey(nombre)')
  .eq('proyecto_id', proyectoId)
  .order('periodo_fecha', { ascending: false })
  .limit(20)
console.log('proyectoId usado:', proyectoId)
console.log('ventas resultado:', vs)
console.log('error aventas:', errorVentas)
setVentas((vs || []) as VentaRow[])
}

function toggleMetrica(metrica: string) {
  setMetricasSeleccionadas(prev => {
    if (prev.includes(metrica)) {
      const nuevo = prev.filter(m => m !== metrica)
      return nuevo.length > 0 ? nuevo : ['ingreso']
    }

    return [...prev, metrica]
  })
}

const totales = calcularTotales()

return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/productos')} className="text-xs text-gray-400 hover:text-gray-600">Catálogo</button>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-medium text-gray-900">Registrar ventas</p>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/inventario')} className="text-xs text-gray-400 hover:text-gray-600">inventario</button>
<span className="text-gray-200">/</span>
<button onClick={() => router.push('/dashboard/promociones')} className="text-xs text-gray-400 hover:text-gray-600">Promociones</button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {showConfirm && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Información duplicada detectada</p>
              <p className="text-xs text-gray-500 mb-3">Se detectaron registros que ya existen en la base de datos:</p>
              <div className="bg-amber-50 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                {(Array.isArray(duplicados) ? duplicados : []).map((d, i) => (
                  <p key={i} className="text-xs text-amber-800 font-medium">· {typeof d === 'string' ? d : `${d.periodo_tipo} — ${d.periodo_fecha}`}</p>
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-4">¿Deseas reemplazar la información anterior con la nueva?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => importarVentas(pendingRows, true, ventasExistentesCache)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 rounded-xl">
                  Sí, reemplazar
                </button>
                <button
                  onClick={() => { setShowConfirm(false); setPendingRows([]); setDuplicados([]); setVentasExistentesCache([]) }}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 p-2 flex gap-2">
          <button onClick={() => setModo('manual')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'manual' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            Captura manual
          </button>
          <button onClick={() => setModo('excel')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'excel' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            Subir Excel / CSV
          </button>
          <button onClick={() => { setModo('analisis'); cargarVentasAnalisis() }}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'analisis' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            📊 Análisis
          </button>
        </div>
        
        {modo === 'manual' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-900">Nueva venta</p>
              <BorradoMasivo
                tabla="ventas"
                proyectoId={proyectoId || ''}
                productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku ?? undefined }))}
                campoFecha="periodo_fecha"
                onBorrado={() => proyectoId && cargarDatos(proyectoId)}
              />
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-2">Período de registro</label>
              <SelectorPeriodo onChange={(p: any) => setForm({ ...form, periodo_tipo: p.tipo, periodo_fecha: p.fecha })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Producto o Servicio *</label>
                <select value={form.producto_id} onChange={e => setForm({ ...form, producto_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecciona un producto</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} — ${p.precio}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">¿Cómo registras la venta? *</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setForm({ ...form, modo_registro: 'piezas', monto_manual: '' })}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${form.modo_registro !== 'dinero' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-medium' : 'border-gray-200 text-gray-400'}`}>
                    Piezas / unidades
                  </button>
                  <button onClick={() => setForm({ ...form, modo_registro: 'dinero', piezas: '' })}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${form.modo_registro === 'dinero' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-medium' : 'border-gray-200 text-gray-400'}`}>
                    Monto en pesos
                  </button>
                </div>
                {form.modo_registro !== 'dinero'
                  ? <input type="number" value={form.piezas} onChange={e => setForm({ ...form, piezas: e.target.value })}
                      placeholder="Cantidad vendida"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  : <input type="number" value={form.monto_manual} onChange={e => setForm({ ...form, monto_manual: e.target.value })}
                      placeholder="Monto real cobrado ($)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                }
              </div>
            </div>
            {totales && (
              <div className="space-y-2 mb-4">
                {totales.descuentoAuto && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <span className="font-medium">Descuento detectado:</span> el monto es {totales.descuentoAuto}% menor al precio de lista (${productos.find(p => p.id === form.producto_id)?.precio})
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Ingreso</p>
                    <p className="text-base font-semibold text-gray-900">${totales.ingreso}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Costo</p>
                    <p className="text-base font-semibold text-gray-900">${totales.costoTotal}</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${parseFloat(totales.utilidad) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-400">Utilidad</p>
                    <p className={`text-base font-semibold ${parseFloat(totales.utilidad) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>${totales.utilidad}</p>
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => guardarVenta(false)} disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-xl text-sm transition-colors">
              {guardado ? '✓ Venta registrada' : loading ? 'Guardando...' : 'Registrar venta'}
            </button>
          </div>
        )}

                {modo === 'excel' && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">Subir ventas desde archivo</p>
                <div className="flex gap-2">
                <BorradoMasivo
                  tabla="ventas"
                  proyectoId={proyectoId || ''}
                  productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku ?? undefined }))}
                  campoFecha="periodo_fecha"
                  onBorrado={() => proyectoId && cargarDatos(proyectoId)}
                />
                <button onClick={descargarPlantilla}
                  className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                  ↓ Descargar plantilla
                </button>
                </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
                <p className="font-medium">Instrucciones rápidas:</p>
                <p>1. Descarga la plantilla — incluye instrucciones detalladas y referencia de fechas</p>
                <p>2. Llena las ventas usando el SKU exacto del catálogo de productos</p>
                <p>3. Sube el archivo — el sistema valida y detecta duplicados automáticamente</p>
                </div>
                <div onClick={() => document.getElementById('file-ventas')?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                <input id="file-ventas" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && leerArchivoVentas(e.target.files[0])}/>
                <p className="text-sm text-gray-500">Arrastra tu archivo o haz clic para seleccionar</p>
                <p className="text-xs text-gray-400 mt-1">CSV · XLSX · XLS</p>
                </div>

            {progresoCarga.activo && (
              <div className="bg-white border border-emerald-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-emerald-700">{progresoCarga.mensaje}</p>
                  <p className="text-xs font-semibold text-emerald-700">{progresoCarga.porcentaje}%</p>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progresoCarga.porcentaje}%` }}/>
                </div>
                <p className="text-xs text-gray-400 text-center">
                  {progresoCarga.cargadas} de {progresoCarga.total} registros procesados
                </p>
              </div>
            )}

            {preview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Vista previa ({pendingRows.length} ventas detectadas):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50">
                      {Object.keys(preview[0]).map(k => <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium">{k}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {Object.values(r).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {loading && <p className="text-xs text-emerald-600 text-center">Importando ventas...</p>}
            {guardado && <p className="text-xs text-emerald-600 text-center font-medium">✓ Ventas importadas correctamente</p>}
          </div>
          
        )}

        {modo === 'analisis' && (() => {
        const añosDisponibles = [...new Set(ventasAnalisis.map(v => Number(v.anio)).filter(Boolean))].sort((a,b) => b-a)
        const aniosSeleccionados = añosFiltro.length > 0 ? añosFiltro : (añosDisponibles[0] ? [añosDisponibles[0]] : [])
        const aniosAnteriores = aniosSeleccionados.map(a => a - 1)
        const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
        const metricasConfig = [
          { id: 'ingreso', label: 'Ingreso', totalLabel: 'Ingreso total', colorGrafica: '#16a34a' },
          { id: 'costo', label: 'Costo', totalLabel: 'Costo total', colorGrafica: '#94a3b8' },
          { id: 'utilidad', label: 'Utilidad', totalLabel: 'Utilidad total', colorGrafica: '#2563eb' },
        ]
        const metricasVisibles = metricasConfig.filter(m => metricasSeleccionadas.includes(m.id))

        const filtrarPorPeriodo = (v: any, anios: number[]) => {
          const anioRegistro = Number(v.anio)
          const mesRegistro = Number(v.mes)
          const semanaRegistro = Number(v.semana)
          if (anios.length > 0 && !anios.includes(anioRegistro)) return false
          if (mesesFiltro.length > 0 && !mesesFiltro.includes(mesRegistro - 1)) return false
          if (semanasFiltro.length > 0 && !semanasFiltro.includes(semanaRegistro)) return false
          return true
        }

        const ventasFiltradas = ventasAnalisis.filter(v => filtrarPorPeriodo(v, aniosSeleccionados))
        const ventasAnioAnterior = ventasAnalisis.filter(v => filtrarPorPeriodo(v, aniosAnteriores))

        const fechaBase = (v: any) => {
          const valor = v.dia || v.fecha || v.periodo_fecha || v.semana_inicio || v.mes_inicio
          if (!valor) return ''
          return String(valor).slice(0, 10)
        }

        const fechaConOffset = (fecha: string, offsetAnio: number) => {
          if (!fecha) return ''
          const partes = fecha.split('-').map(Number)
          if (partes.length < 3 || partes.some(Number.isNaN)) return fecha
          return `${partes[0] + offsetAnio}-${String(partes[1]).padStart(2,'0')}-${String(partes[2]).padStart(2,'0')}`
        }

        const clavePeriodo = (v: any, offsetAnio = 0) => {
          const anio = Number(v.anio) + offsetAnio
          const mes = Number(v.mes)
          const semana = Number(v.semana)
          if (vistaPeriodo === 'anio') return `${anio}`
          if (vistaPeriodo === 'mes') return `${anio}-${String(mes).padStart(2,'0')}`
          if (vistaPeriodo === 'semana') return `${anio}-S${String(semana).padStart(2,'0')}`
          return fechaConOffset(fechaBase(v), offsetAnio)
        }

        const etiquetaPeriodo = (key: string) => {
          if (vistaPeriodo === 'anio') return key
          if (vistaPeriodo === 'mes') {
            const [anio, mes] = key.split('-')
            return `${MESES_NOMBRES[Number(mes) - 1] || mes} ${anio}`
          }
          if (vistaPeriodo === 'semana') {
            const [anio, semana] = key.split('-S')
            return `S${Number(semana)} ${anio}`
          }
          const [anio, mes, dia] = key.split('-')
          return `${dia}/${mes}/${anio}`
        }

        const ordenPeriodo = (key: string) => {
          if (vistaPeriodo === 'anio') return Number(key)
          if (vistaPeriodo === 'mes') return Number(key.replace('-', ''))
          if (vistaPeriodo === 'semana') {
            const [anio, semana] = key.split('-S')
            return Number(anio) * 100 + Number(semana)
          }
          return Number(key.replace(/-/g, ''))
        }

        const obtenerValorMetrica = (row: any, metrica: string) => {
          if (metrica === 'ingreso') return Number(row.ingreso_real || 0)
          if (metrica === 'costo') return Number(row.costo_real || 0)
          return Number(row.utilidad || 0)
        }

        const agruparVentas = (rows: any[], offsetAnio = 0) => {
          const mapa: Record<string, { key: string, label: string, ingreso: number, costo: number, utilidad: number, piezas: number, count: number, orden: number }> = {}
          rows.forEach(v => {
            let key = '', label = '', orden = 0
            if (agrupacion === 'producto') {
              key = v.producto_id || 'sin-producto'
              label = v.producto_nombre || 'Sin nombre'
              orden = 0
            } else if (agrupacion === 'categoria') {
              key = v.categoria || 'Sin categoría'
              label = key
              orden = 0
            } else {
              key = clavePeriodo(v, offsetAnio)
              label = etiquetaPeriodo(key)
              orden = ordenPeriodo(key)
            }
            if (!mapa[key]) mapa[key] = { key, label, ingreso:0, costo:0, utilidad:0, piezas:0, count:0, orden }
            mapa[key].ingreso   += obtenerValorMetrica(v, 'ingreso')
            mapa[key].costo     += obtenerValorMetrica(v, 'costo')
            mapa[key].utilidad  += obtenerValorMetrica(v, 'utilidad')
            mapa[key].piezas    += Number(v.piezas || 0)
            mapa[key].count     += Number(v.registros || 0)
          })

          return Object.values(mapa).sort((a, b) => {
            if (agrupacion === 'periodo') return a.orden - b.orden
            return b.ingreso - a.ingreso
          })
        }

        const datosActuales = agruparVentas(ventasFiltradas, 0)

        const sumarRows = (rows: any[]) => {
          return rows.reduce(
            (acc, v: any) => {
              acc.ingreso += obtenerValorMetrica(v, 'ingreso')
              acc.costo += obtenerValorMetrica(v, 'costo')
              acc.utilidad += obtenerValorMetrica(v, 'utilidad')
              acc.piezas += Number(v.piezas || 0)
              acc.count += Number(v.registros || 0)
              return acc
            },
            {
              ingreso: 0,
              costo: 0,
              utilidad: 0,
              piezas: 0,
              count: 0,
            }
          )
        }

        const filasActualesDelDato = (datoActual: any) => {
          if (agrupacion !== 'periodo') {
            return ventasFiltradas
          }

          if (vistaPeriodo === 'anio') {
            const anioActual = Number(datoActual.key)

            return ventasFiltradas.filter((v: any) => {
              return Number(v.anio) === anioActual
            })
          }

          if (vistaPeriodo === 'mes') {
            const [anioTxt, mesTxt] = String(datoActual.key).split('-')
            const anioActual = Number(anioTxt)
            const mesActual = Number(mesTxt)

            return ventasFiltradas.filter((v: any) => {
              return Number(v.anio) === anioActual &&
                     Number(v.mes) === mesActual
            })
          }

          if (vistaPeriodo === 'semana') {
            const [anioTxt, semanaTxt] = String(datoActual.key).split('-S')
            const anioActual = Number(anioTxt)
            const semanaActual = Number(semanaTxt)

            return ventasFiltradas.filter((v: any) => {
              return Number(v.anio) === anioActual &&
                     Number(v.semana) === semanaActual
            })
          }

          const fechaActual = String(datoActual.key)

          return ventasFiltradas.filter((v: any) => {
            return fechaBase(v) === fechaActual
          })
        }

        const obtenerAnteriorExacto = (datoActual: any) => {
          if (agrupacion !== 'periodo') {
            return {
              ingreso: 0,
              costo: 0,
              utilidad: 0,
              piezas: 0,
              count: 0,
            }
          }

          const filasActuales = filasActualesDelDato(datoActual)

          if (vistaPeriodo === 'anio') {
            const anioActual = Number(datoActual.key)
            const anioAnterior = anioActual - 1

            const mesesActuales = new Set(
              filasActuales
                .map((v: any) => Number(v.mes))
                .filter((m: number) => Number.isFinite(m) && m > 0)
            )

            const semanasActuales = new Set(
              filasActuales
                .map((v: any) => Number(v.semana))
                .filter((s: number) => Number.isFinite(s) && s > 0)
            )

            const rowsAnterior = ventasAnalisis.filter((v: any) => {
              const anioRegistro = Number(v.anio)
              const mesRegistro = Number(v.mes)
              const semanaRegistro = Number(v.semana)

              if (anioRegistro !== anioAnterior) return false

              // En vista Año, compara contra el mismo avance del año anterior:
              // mismas semanas cuando existen, o mismos meses como respaldo.
              if (semanasActuales.size > 0 && !semanasActuales.has(semanaRegistro)) return false
              if (semanasActuales.size === 0 && mesesActuales.size > 0 && !mesesActuales.has(mesRegistro)) return false

              return true
            })

            return sumarRows(rowsAnterior)
          }

          if (vistaPeriodo === 'mes') {
            const [anioTxt, mesTxt] = String(datoActual.key).split('-')
            const anioAnterior = Number(anioTxt) - 1
            const mesActual = Number(mesTxt)

            const rowsAnterior = ventasAnalisis.filter((v: any) => {
              return Number(v.anio) === anioAnterior &&
                     Number(v.mes) === mesActual
            })

            return sumarRows(rowsAnterior)
          }

          if (vistaPeriodo === 'semana') {
            const [anioTxt, semanaTxt] = String(datoActual.key).split('-S')
            const anioAnterior = Number(anioTxt) - 1
            const semanaActual = Number(semanaTxt)

            const rowsAnterior = ventasAnalisis.filter((v: any) => {
              return Number(v.anio) === anioAnterior &&
                     Number(v.semana) === semanaActual
            })

            return sumarRows(rowsAnterior)
          }

          const fechaActual = String(datoActual.key)
          const fechaAnterior = fechaConOffset(fechaActual, -1)

          const rowsAnterior = ventasAnalisis.filter((v: any) => {
            return fechaBase(v) === fechaAnterior
          })

          return sumarRows(rowsAnterior)
        }

        const datos = datosActuales.map(d => {
          const anterior = obtenerAnteriorExacto(d)

          return {
            ...d,
            ingreso_anterior: anterior.ingreso,
            costo_anterior: anterior.costo,
            utilidad_anterior: anterior.utilidad,
            piezas_anterior: anterior.piezas,
            count_anterior: anterior.count,
          }
        })

        const totalIngreso  = datos.reduce((s, d) => s + d.ingreso, 0)
        const totalCosto    = datos.reduce((s, d) => s + d.costo, 0)
        const totalUtilidad = datos.reduce((s, d) => s + d.utilidad, 0)
        const totalPiezas   = datos.reduce((s, d) => s + d.piezas, 0)
        const totalAnteriorIngreso  = datos.reduce((s, d) => s + d.ingreso_anterior, 0)
        const totalAnteriorCosto    = datos.reduce((s, d) => s + d.costo_anterior, 0)
        const totalAnteriorUtilidad = datos.reduce((s, d) => s + d.utilidad_anterior, 0)
        const totalAnteriorPiezas   = datos.reduce((s, d) => s + d.piezas_anterior, 0)

        const obtenerTotal = (metrica: string, anterior = false) => {
          if (metrica === 'ingreso') return anterior ? totalAnteriorIngreso : totalIngreso
          if (metrica === 'costo') return anterior ? totalAnteriorCosto : totalCosto
          return anterior ? totalAnteriorUtilidad : totalUtilidad
        }

        const calcularDiferenciaPct = (actual: number, anterior: number) => {
          if (anterior === 0) return actual > 0 ? 100 : 0
          return ((actual - anterior) / Math.abs(anterior)) * 100
        }

        const resumenComparativo = metricasVisibles.map(m => {
          const actual = obtenerTotal(m.id, false)
          const anterior = obtenerTotal(m.id, true)
          const diferencia = calcularDiferenciaPct(actual, anterior)
          return { ...m, actual, anterior, diferencia }
        })

        const margenPromedio = totalIngreso === 0 ? 0 : (totalUtilidad / totalIngreso) * 100
        const margenPromedioAnterior = totalAnteriorIngreso === 0 ? 0 : (totalAnteriorUtilidad / totalAnteriorIngreso) * 100
        const diferenciaMargenPromedio = margenPromedio - margenPromedioAnterior

        const formatoMoneda = (valor: number) =>
          `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        const formatoNumero = (valor: number) =>
          valor.toLocaleString('es-MX', { maximumFractionDigits: 0 })

        const formatoPorcentaje = (valor: number) =>
          `${valor.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

        const kpisResumen = [
          {
            id: 'ingreso-resumen',
            titulo: 'Ingreso',
            actual: totalIngreso,
            anterior: totalAnteriorIngreso,
            diferencia: calcularDiferenciaPct(totalIngreso, totalAnteriorIngreso),
            formato: formatoMoneda,
            sufijoDiferencia: '% vs año anterior',
          },
          {
            id: 'piezas-resumen',
            titulo: 'Piezas vendidas',
            actual: totalPiezas,
            anterior: totalAnteriorPiezas,
            diferencia: calcularDiferenciaPct(totalPiezas, totalAnteriorPiezas),
            formato: formatoNumero,
            sufijoDiferencia: '% vs año anterior',
          },
          {
            id: 'margen-promedio',
            titulo: 'Margen promedio',
            actual: margenPromedio,
            anterior: margenPromedioAnterior,
            diferencia: diferenciaMargenPromedio,
            formato: formatoPorcentaje,
            sufijoDiferencia: ' pp vs año anterior',
          },
          {
            id: 'costo-ventas',
            titulo: 'Costo de ventas',
            actual: totalCosto,
            anterior: totalAnteriorCosto,
            diferencia: calcularDiferenciaPct(totalCosto, totalAnteriorCosto),
            formato: formatoMoneda,
            sufijoDiferencia: '% vs año anterior',
          },
          {
            id: 'utilidad-resumen',
            titulo: 'Utilidad',
            actual: totalUtilidad,
            anterior: totalAnteriorUtilidad,
            diferencia: calcularDiferenciaPct(totalUtilidad, totalAnteriorUtilidad),
            formato: formatoMoneda,
            sufijoDiferencia: '% vs año anterior',
          },
        ]

        const datosGrafica = agrupacion === 'periodo'
          ? datos
          : datos.slice(0, 15)

        const metricaEjeX = metricasVisibles[0] || metricasConfig[0]
        
          const crearEtiquetaDiferenciaSuperior = (metrica: string) => {
  return (props: any) => {
    const { x, y, width, index } = props

    const row = datosGrafica[index]
    if (!row) return null

    const rowMetricas = row as Record<string, any>

const actual = Number(rowMetricas[metrica] || 0)
const anterior = Number(rowMetricas[`${metrica}_anterior`] || 0)
    const diferencia = calcularDiferenciaPct(actual, anterior)

    const positivo = diferencia > 0
    const negativo = diferencia < 0
    const color = positivo ? '#059669' : negativo ? '#dc2626' : '#64748b'
    const signo = positivo ? '+' : negativo ? '-' : ''

    const posX = typeof width === 'number' ? x + width / 2 : x
    const posY = Number(y) - 10

    return (
      <text
        x={posX}
        y={posY}
        textAnchor="middle"
        fill={color}
        fontSize={11}
        fontWeight={700}
      >
        {signo}{Math.abs(diferencia).toFixed(1)}%
      </text>
    )
  }
}

        const TickEjeX = ({ x, y, payload }: any) => {
  const valor = String(payload.value || '')

  if (vistaPeriodo === 'semana') {
    const partes = valor.split(' ')
    const semana = partes[0] || valor
    const anioCompleto = partes[1] || ''
    const anioCorto = anioCompleto ? anioCompleto.slice(-2) : ''

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
          fontWeight={600}
        >
          {semana}
        </text>

        <text
          x={0}
          y={0}
          dy={26}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
        >
          {anioCorto}
        </text>
      </g>
    )
  }

  if (vistaPeriodo === 'mes') {
    const partes = valor.split(' ')
    const mes = partes[0] || valor
    const anioCompleto = partes[1] || ''
    const anioCorto = anioCompleto ? anioCompleto.slice(-2) : ''

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
          fontWeight={600}
        >
          {mes}
        </text>

        <text
          x={0}
          y={0}
          dy={26}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
        >
          {anioCorto}
        </text>
      </g>
    )
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="#64748b"
        fontSize={10}
      >
        {valor}
      </text>
    </g>
  )
}

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
  {/* Agrupar y tipo gráfica */}
  <div className="flex flex-wrap gap-3 items-end">
    <div>
      <label className="text-xs text-gray-500 block mb-1">Agrupar por</label>
      <div className="flex gap-1">
        {[{id:'producto',label:'Producto'},{id:'periodo',label:'Período'},{id:'categoria',label:'Categoría'}].map(op => (
          <button key={op.id} onClick={() => setAgrupacion(op.id as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${agrupacion === op.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}>
            {op.label}
          </button>
        ))}
      </div>
    </div>
    <div>
      <label className="text-xs text-gray-500 block mb-1">Tipo de gráfica</label>
      <div className="flex gap-1">
        {[{id:'barras',label:'📊 Barras'},{id:'linea',label:'📈 Línea'}].map(op => (
          <button key={op.id} onClick={() => setTipoGrafica(op.id as any)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tipoGrafica === op.id ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
            {op.label}
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="text-xs text-gray-500 block mb-1">Vista de periodo</label>
      <div className="flex gap-1">
        {[
          { id: 'anio', label: 'Año' },
          { id: 'mes', label: 'Mes' },
          { id: 'semana', label: 'Semana' },
          { id: 'dia', label: 'Día' },
        ].map(op => (
          <button
            key={op.id}
            onClick={() => {
              setVistaPeriodo(op.id as any)
              setAgrupacion('periodo')
            }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              vistaPeriodo === op.id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-gray-200 text-gray-500 hover:border-emerald-300'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="text-xs text-gray-500 block mb-1">Valores a mostrar</label>
      <div className="flex gap-1">
        {[
          { id: 'ingreso', label: 'Ingreso' },
          { id: 'costo', label: 'Costo' },
          { id: 'utilidad', label: 'Utilidad' },
        ].map(op => (
          <button
            key={op.id}
            onClick={() => toggleMetrica(op.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              metricasSeleccionadas.includes(op.id)
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-gray-200 text-gray-500 hover:border-emerald-300'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>

    <div className="ml-auto text-xs text-gray-400">{ventasFiltradas.length} registros</div>
  </div>

  {/* Años */}
  <div>
  <label className="text-xs text-gray-500 block mb-1">
    Año <span className="font-normal text-gray-400">— clic para seleccionar, clic de nuevo para quitar</span>
  </label>
  <div className="flex flex-wrap gap-1">
    {añosDisponibles.map(a => (
      <button key={a}
        onClick={() => {
  const nuevo = añosFiltro.includes(a) ? añosFiltro.filter(x => x !== a) : [...añosFiltro, a]
  setAñosFiltro(nuevo)
  // Seleccionar todos los meses disponibles del año
  const mesesDelAnio = [...new Set(
  ventasAnalisis
    .filter((v) => nuevo.includes(Number(v.anio)))
    .map((v) => Number(v.mes) - 1)
    .filter((m) => Number.isFinite(m) && m >= 0)
)].sort((a, b) => a - b)

setMesesFiltro(mesesDelAnio)
  setSemanasFiltro([])
}}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${añosFiltro.includes(a) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
        {a}
      </button>
    ))}
  </div>
</div>

  {/* Meses */}
  <div>
    <label className="text-xs text-gray-500 block mb-1">
      Mes <span className="font-normal text-gray-400">— clic para seleccionar, clic de nuevo para quitar</span>
    </label>
    <div className="flex flex-wrap gap-1">
      {[...new Set(
        ventasAnalisis
          .filter((v) => añosFiltro.length === 0 || añosFiltro.includes(Number(v.anio)))
          .map((v) => Number(v.mes))
          .filter((m) => Number.isFinite(m) && m > 0)
      )].sort((a, b) => a - b).map((m) => (
        <button key={m}
          onClick={() => {
            setMesesFiltro(prev =>
              prev.includes(m - 1)
                ? prev.filter(x => x !== m - 1)
                : [...prev, m - 1]
            )
            setSemanasFiltro([])
          }}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            mesesFiltro.includes(m - 1)
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'border-gray-200 text-gray-500 hover:border-emerald-300'
          }`}
        >
          {MESES_NOMBRES[m - 1] || m}
        </button>
      ))}
    </div>
  </div>

    {/* Semanas */}
  <div>
    <label className="text-xs text-gray-500 block mb-1">
      Semana <span className="font-normal text-gray-400">— clic para seleccionar, clic de nuevo para quitar</span>
    </label>

    <div className="flex flex-wrap gap-1">
      {[...new Set(
        ventasAnalisis
          .filter((v) => añosFiltro.length === 0 || añosFiltro.includes(Number(v.anio)))
          .filter((v) => mesesFiltro.length === 0 || mesesFiltro.includes(Number(v.mes) - 1))
          .map((v) => Number(v.semana))
          .filter((s) => Number.isFinite(s) && s > 0)
      )].sort((a, b) => a - b).map((s) => (
        <button
          key={s}
          onClick={() =>
            setSemanasFiltro(prev =>
              prev.includes(s)
                ? prev.filter(x => x !== s)
                : [...prev, s]
            )
          }
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            semanasFiltro.includes(s)
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'border-gray-200 text-gray-500 hover:border-emerald-300'
          }`}
        >
          S{s}
        </button>
      ))}
    </div>
  </div>

  {(añosFiltro.length > 0 || mesesFiltro.length > 0 || semanasFiltro.length > 0) && (
  <button
    onClick={() => {
      setAñosFiltro([new Date().getFullYear()])
      setMesesFiltro([])
      setSemanasFiltro([])
    }}
    className="text-xs text-gray-400 hover:text-red-400"
  >
    ✕ Limpiar filtros
  </button>
)}
</div>      
      {/* KPIs */}
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2">
        {kpisResumen.map(k => {
          const positivo = k.diferencia >= 0
          return (
            <div key={k.id} className="bg-white rounded-xl border border-gray-100 p-3 min-w-[210px] flex-1">
              <p className="text-xs text-gray-400 mb-1">{k.titulo}</p>
              <p className="text-sm font-semibold text-gray-900">
                {k.formato(k.actual)}
              </p>
              <div className="mt-2 border-t border-gray-100 pt-2">
                <p className="text-[11px] text-gray-400">Año anterior</p>
                <p className="text-xs text-gray-600">
                  {k.formato(k.anterior)}
                </p>
                <p className={`text-xs font-semibold mt-1 ${positivo ? 'text-emerald-600' : 'text-red-600'}`}>
                  {positivo ? '▲' : '▼'} {Math.abs(k.diferencia).toFixed(1)}{k.sufijoDiferencia}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Gráfica */}
      {datos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-700 mb-4">
            {tipoGrafica === 'barras' ? 'Comparativa' : 'Tendencia'} — {agrupacion === 'periodo' ? `vista por ${vistaPeriodo}` : agrupacion === 'producto' ? 'agrupado por producto' : 'agrupado por categoría'} · de los años {metricaEjeX.label} 
          </p>
          <ResponsiveContainer width="100%" height={560}>
            {tipoGrafica === 'barras' ? (
              <BarChart data={datosGrafica} margin={{top:55,right:16,left:8,bottom:78}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="label" tick={<TickEjeX />} interval={0} height={62}/>
                <YAxis tick={{fontSize:10,fill:'#64748b'}} tickFormatter={(v: any) => `$${(Number(v)/1000).toFixed(0)}k`}/>
                <Tooltip formatter={(val: any) => {
                  const num = typeof val === 'number' ? val : Number(val ?? 0)
                  return `$${num.toLocaleString('es-MX',{minimumFractionDigits:2})}`
                }}/>
                <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px',fontWeight:700}}/>
                {metricasSeleccionadas.includes('ingreso') && (
                  <Bar dataKey="ingreso" name="Ingreso" fill="#16a34a" radius={[4,4,0,0]}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('ingreso')} />
                  </Bar>
                )}
                {metricasSeleccionadas.includes('ingreso') && (
                  <Bar dataKey="ingreso_anterior" name="Ingreso AA" fill="#86efac" radius={[4,4,0,0]} />
                )}
                {metricasSeleccionadas.includes('costo') && (
                  <Bar dataKey="costo" name="Costo" fill="#94a3b8" radius={[4,4,0,0]}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('costo')} />
                  </Bar>
                )}
                {metricasSeleccionadas.includes('costo') && (
                  <Bar dataKey="costo_anterior" name="Costo AA" fill="#cbd5e1" radius={[4,4,0,0]} />
                )}
                {metricasSeleccionadas.includes('utilidad') && (
                  <Bar dataKey="utilidad" name="Utilidad" fill="#2563eb" radius={[4,4,0,0]}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('utilidad')} />
                  </Bar>
                )}
                {metricasSeleccionadas.includes('utilidad') && (
                  <Bar dataKey="utilidad_anterior" name="Utilidad AA" fill="#93c5fd" radius={[4,4,0,0]} />
                )}
              </BarChart>
            ) : (
              <LineChart data={datosGrafica} margin={{top:55,right:16,left:8,bottom:78}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="label" tick={<TickEjeX />} interval={0} height={62}/>
                <YAxis tick={{fontSize:10,fill:'#64748b'}} tickFormatter={(v: any) => `$${(Number(v)/1000).toFixed(0)}k`}/>
                <Tooltip formatter={(val: any) => {
                  const num = typeof val === 'number' ? val : Number(val ?? 0)
                  return `$${num.toLocaleString('es-MX',{minimumFractionDigits:2})}`
                }}/>
                <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px',fontWeight:700}}/>
                {metricasSeleccionadas.includes('ingreso') && (
                  <Line type="monotone" dataKey="ingreso" name="Ingreso" stroke="#16a34a" strokeWidth={2} dot={{r:3}}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('ingreso')} />
                  </Line>
                )}
                {metricasSeleccionadas.includes('ingreso') && (
                  <Line type="monotone" dataKey="ingreso_anterior" name="Ingreso AA" stroke="#86efac" strokeWidth={2} strokeDasharray="4 4" dot={{r:2}} />
                )}
                {metricasSeleccionadas.includes('costo') && (
                  <Line type="monotone" dataKey="costo" name="Costo" stroke="#94a3b8" strokeWidth={2} dot={{r:3}}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('costo')} />
                  </Line>
                )}
                {metricasSeleccionadas.includes('costo') && (
                  <Line type="monotone" dataKey="costo_anterior" name="Costo AA" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 4" dot={{r:2}} />
                )}
                {metricasSeleccionadas.includes('utilidad') && (
                  <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#2563eb" strokeWidth={2} dot={{r:3}}>
                  <LabelList content={crearEtiquetaDiferenciaSuperior('utilidad')} />
                  </Line>
                )}
                {metricasSeleccionadas.includes('utilidad') && (
                  <Line type="monotone" dataKey="utilidad_anterior" name="Utilidad AA" stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 4" dot={{r:2}} />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-medium text-gray-700 mb-3">
          Detalle — {datos.length} {agrupacion === 'producto' ? 'productos' : agrupacion === 'periodo' ? 'períodos' : 'categorías'}
        </p>
        {datos.length === 0
          ? <p className="text-sm text-gray-400 text-center py-8">No hay ventas en el período seleccionado.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{background:'#1a2e4a',color:'white'}}>
                    <th className="px-3 py-2 text-left">{agrupacion === 'producto' ? 'Producto' : agrupacion === 'periodo' ? `Período (${vistaPeriodo})` : 'Categoría'}</th>
                    <th className="px-3 py-2 text-right">Ingreso</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Utilidad</th>
                    <th className="px-3 py-2 text-right">Margen</th>
                    <th className="px-3 py-2 text-right">Piezas</th>
                    <th className="px-3 py-2 text-right">Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((d, i) => {
                    const margen = d.ingreso > 0 ? ((d.utilidad / d.ingreso) * 100).toFixed(1) : '0.0'
                    const margenNum = parseFloat(margen)
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                        <td className="px-3 py-2 font-medium text-gray-900">{d.label}</td>
                        <td className="px-3 py-2 text-right text-gray-900">${d.ingreso.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td className="px-3 py-2 text-right text-gray-500">${d.costo.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td className={`px-3 py-2 text-right font-medium ${d.utilidad >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          ${d.utilidad.toLocaleString('es-MX',{minimumFractionDigits:2})}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${margenNum >= 30 ? 'bg-emerald-100 text-emerald-700' : margenNum >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {margen}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{d.piezas.toLocaleString('es-MX')}</td>
                        <td className="px-3 py-2 text-right text-gray-400">{d.count}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#1a2e4a',color:'white'}}>
                    <td className="px-3 py-2 font-bold">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold">${totalIngreso.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                    <td className="px-3 py-2 text-right font-bold">${totalCosto.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                    <td className="px-3 py-2 text-right font-bold">${totalUtilidad.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                    <td className="px-3 py-2 text-right font-bold">{totalIngreso > 0 ? ((totalUtilidad/totalIngreso)*100).toFixed(1) : '0.0'}%</td>
                    <td className="px-3 py-2 text-right font-bold">{totalPiezas.toLocaleString('es-MX')}</td>
                    <td className="px-3 py-2 text-right font-bold">{ventasFiltradas.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
})()}

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-900 mb-4">Últimas ventas ({ventas.length})</p>
          {ventas.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">Aún no hay ventas registradas.</p>
            : ventas.map(v => (
              <div key={v.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{v.productos?.nombre}</p>
                    {v.tiene_promo && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {v.tipo_promo === 'descuento' ? `${v.descuento_pct}% dto` : v.tipo_promo === '2x1' ? '2×1' : 'Promo cruzada'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(v.periodo_fecha).toLocaleDateString('es-MX')} · {v.piezas} piezas · {v.periodo_tipo}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">${v.ingreso_real}</p>
                  {v.utilidad !== null && v.utilidad !== undefined && (
                    <p className={`text-xs ${v.utilidad >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>util. ${v.utilidad}</p>
                  )}
                </div>
              </div>
            ))
          }
        </div>

      </div>
    </main>
  )
}
