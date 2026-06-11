'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import BorradoMasivo from '../../components/BorradoMasivo'

type Producto = {
  id: string
  proyecto_id?: string | null
  nombre: string
  sku?: string | null
  SKU?: string | null
  categoria?: string | null
  precio?: number | null
  costo?: number | null
  activo?: boolean | null
  aplica_inventario: boolean
}

type InventarioRow = {
  id: string
  proyecto_id?: string | null
  producto_id: string
  fecha: string
  disponible: number | null
  notas?: string | null
}

type InventarioPendienteRow = {
  id?: string
  proyecto_id?: string | null
  producto_id: string
  en_transito?: number | null
  ordenado?: number | null
  notas_pendiente?: string | null
  updated_at?: string | null
}

type InventarioCacheRow = {
  id: string
  producto_id: string
  fecha: string
}

type ImportRow = Record<string, unknown>

type RegistroDisponible = {
  proyecto_id: string
  producto_id: string
  fecha: string
  disponible: number
  notas: string | null
}

type RegistroPendiente = {
  proyecto_id: string
  producto_id: string
  en_transito: number
  ordenado: number
  notas_pendiente: string | null
  updated_at: string
}

type InventarioActualRow = Producto & {
  ultimoDisponible: InventarioRow | null
  pendiente: InventarioPendienteRow | null
}

const normalizar = (s: string) => s.toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proyectoId, setProyectoId] = useState<string | null>(null)
  const [inventario, setInventario] = useState<InventarioRow[]>([])
  const [inventarioPendiente, setInventarioPendiente] = useState<InventarioPendienteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [modo, setModo] = useState<'manual' | 'excel' | 'vista'>('manual')
  const [preview, setPreview] = useState<ImportRow[]>([])
  const [pendingRows, setPendingRows] = useState<ImportRow[]>([])
  const [duplicados, setDuplicados] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [inventarioCache, setInventarioCache] = useState<InventarioCacheRow[]>([])
  const [erroresImportacion, setErroresImportacion] = useState<string[]>([])
  const [showErrores, setShowErrores] = useState(false)
  const [progresoCarga, setProgresoCarga] = useState({
    activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '',
  })
  const [form, setForm] = useState({
    producto_id: '',
    fecha: new Date().toISOString().split('T')[0],
    disponible: '',
    en_transito: '',
    ordenado: '',
    notas: '',
  })
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    cargarDatos()
  }, [])

  async function cargarDatos(pid?: string) {
    const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
    if (!cliente) return
    const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
    if (!proyecto) return
    const idProyecto = pid || proyecto.id
    setProyectoId(String(idProyecto))

    const { data: prods } = await supabase.from('productos').select('*')
      .eq('proyecto_id', idProyecto).eq('activo', true).order('nombre')
    setProductos((prods || []) as Producto[])

    // Historial de disponible
const { data: inv } = await supabase.from('inventario')
  .select('*')
  .eq('proyecto_id', idProyecto)
  .order('fecha', { ascending: false })
setInventario((inv || []) as InventarioRow[])

// Foto actual de en tránsito y ordenado
const { data: pend } = await supabase.from('inventario_pendiente')
  .select('*')
  .eq('proyecto_id', idProyecto)
setInventarioPendiente((pend || []) as InventarioPendienteRow[])
}

  function obtenerSkuProducto(producto: Producto | ImportRow | null | undefined) {
    return normalizar(String(producto?.sku || producto?.SKU || ''))
  }

  function normalizarNumero(valor: unknown) {
    if (valor === null || valor === undefined || valor === '') return null
    const limpio = String(valor).replace('$', '').replace(/,/g, '').trim()
    const numero = parseFloat(limpio)
    return Number.isNaN(numero) ? null : numero
  }

  // Combinar inventario histórico + pendiente por producto
  const inventarioActual: InventarioActualRow[] = productos
    .filter(p => p.aplica_inventario)
    .map(prod => {
      const registros = inventario.filter(i => i.producto_id === prod.id)
      const ultimoDisponible = registros[0] || null
      const pendiente = inventarioPendiente.find(p => p.producto_id === prod.id) || null
      return { ...prod, ultimoDisponible, pendiente }
    })

  function semaforo(disponible: number) {
    if (disponible <= 0)  return { color: 'bg-red-100 text-red-700 border-red-200',     label: 'Sin stock',  dot: 'bg-red-500' }
    if (disponible <= 5)  return { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Stock bajo', dot: 'bg-amber-500' }
    return { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'En stock', dot: 'bg-emerald-500' }
  }

  async function guardarInventario() {
    if (!proyectoId) return alert('Espera a que cargue el proyecto.')
    if (!form.producto_id) return alert('Selecciona un producto')
    if (form.disponible === '') return alert('El inventario Disponible es requerido')
    setLoading(true)

    // ── Disponible → insert histórico ──
    const { error: errInv } = await supabase.from('inventario').insert({
      proyecto_id: proyectoId,
      producto_id: form.producto_id,
      fecha: form.fecha,
      disponible: parseFloat(form.disponible) || 0,
      notas: form.notas || null,
    })
   if (errInv) { setLoading(false); return alert(`Error al guardar disponible: ${errInv.message}`) }

    // ── En Tránsito / Ordenado → upsert (foto actual) ──
    if (form.en_transito !== '' || form.ordenado !== '') {
      const { error: errPend } = await supabase.from('inventario_pendiente').upsert({
        proyecto_id: proyectoId,
        producto_id: form.producto_id,
        en_transito: form.en_transito !== '' ? parseFloat(form.en_transito) : 0,
        ordenado:    form.ordenado    !== '' ? parseFloat(form.ordenado)    : 0,
        notas_pendiente: form.notas || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'producto_id' })
      if (errPend) { setLoading(false); return alert(`Error al guardar pendiente: ${errPend.message}`) }
    }

    setLoading(false)
    setForm({ producto_id: '', fecha: new Date().toISOString().split('T')[0], disponible: '', en_transito: '', ordenado: '', notas: '' })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    cargarDatos(proyectoId)
  }

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9', VERDE_CL = 'dcfce7', AMBER = 'fef3c7'
    const fAzulOsc = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
    const fAzulMed = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fNormal  = { color: { argb: 'FF1e293b' }, size: 10, name: 'Arial' }
    const fNota    = { italic: true, color: { argb: 'FF1e40af' }, size: 9, name: 'Arial' }
    const fillAzulOsc  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_OSC } }
    const fillAzulMed  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_MED } }
    const fillAzulClar = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_CLAR } }
    const fillGris     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + GRIS } }
    const fillAmber    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AMBER } }
    const fillVerdeCl  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + VERDE_CL } }
    const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
    const left   = { horizontal: 'left' as const,   vertical: 'middle' as const, wrapText: true }

    const wsDatos = wb.addWorksheet('Datos')
    wsDatos.columns = [
      { header: 'SKU',         key: 'sku',        width: 20 },
      { header: 'Fecha',       key: 'fecha',       width: 14 },
      { header: 'Disponible',  key: 'disponible',  width: 14 },
      { header: 'En_Transito', key: 'en_transito', width: 14 },
      { header: 'Ordenado',    key: 'ordenado',    width: 14 },
      { header: 'Notas',       key: 'notas',       width: 30 },
    ]
    const hDatos = wsDatos.getRow(1)
    hDatos.eachCell((cell: any) => {
        cell.font = fAzulOsc; cell.fill = fillAzulOsc
        cell.alignment = center
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + AZUL_MED } } }
        })
        hDatos.height = 22

        const hoy = new Date()
        const fecha = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`
        productos.filter(p => p.aplica_inventario).forEach((p, i) => {
        const pend = inventarioPendiente.find(ip => ip.producto_id === p.id)
        const row = wsDatos.addRow([
        p.sku || '',
        fecha,
        '',
        pend?.en_transito ?? '',
        pend?.ordenado ?? '',
        '',
      ])
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = fNormal; cell.fill = fill
        cell.alignment = colNum === 1 ? left : center
      })
    })

    const ws = wb.addWorksheet('Instrucciones')
    ws.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 40 }, { width: 28 }]
    const addRow = (v: unknown[], h = 18) => { const row = ws.addRow(v); row.height = h; return row }
    const merge  = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
    const styleRow = (row: any, font: any, fill: any, align: any = center) =>
    row.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.font = font
    cell.fill = fill
    cell.alignment = align
  })

    let r = 1

    const titulo = addRow(['📦  GUÍA DE CARGA DE INVENTARIO — INTEGRA Inteligencia Integral'], 30)
    merge(r,1,r,5); titulo.getCell(1).font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Arial' }
    titulo.getCell(1).fill = fillAzulOsc; titulo.getCell(1).alignment = center; r++
    addRow([],6); r++

    const s1 = addRow(['  1.  QUÉ SIGNIFICA CADA TIPO DE INVENTARIO'], 22)
    merge(r,1,r,5); s1.getCell(1).font = fAzulOsc; s1.getCell(1).fill = fillAzulOsc; s1.getCell(1).alignment = left; r++

    const tipos = [
      ['✅  DISPONIBLE', '✅ Requerido', 'Unidades en tu almacén listas para vender HOY. Se guarda historial completo por fecha — útil para análisis de rotación.', 'Tienes 50 laptops → Disponible: 50'],
      ['🚚  EN TRÁNSITO', '⚠️ Opcional', 'Orden de compra CONFIRMADA con fecha de envío conocida. Se guarda solo la foto más reciente — se reemplaza cada vez que se actualiza.', 'Proveedor confirmó envío de 20 unidades → En Tránsito: 20'],
      ['📋  ORDENADO', '⚠️ Opcional', 'Orden de compra EMITIDA sin confirmación de envío. Se guarda solo la foto más reciente — se reemplaza cada vez que se actualiza.', 'Enviaste orden de 30 unidades sin confirmación → Ordenado: 30'],
    ]
    tipos.forEach((fila, i) => {
      const row = addRow(fila, 44)
      merge(r,3,r,4)
      const fill = i === 0 ? fillVerdeCl : i === 1 ? fillAzulClar : fillAmber
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF1a2e4a'}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = { ...left, wrapText: true }
      }); r++
    })
    addRow([],6); r++

    const s2 = addRow(['  2.  COLUMNAS DEL ARCHIVO'], 22)
    merge(r,1,r,5); s2.getCell(1).font = fAzulOsc; s2.getCell(1).fill = fillAzulOsc; s2.getCell(1).alignment = left; r++
    const hCols = addRow(['Columna','Formato','¿Requerido?','Descripción','Ejemplo'], 20)
    styleRow(hCols, fAzulMed, fillAzulMed); r++
    const cols = [
      ['SKU',         'Texto',         '✅ Sí', 'SKU exacto del producto tal como aparece en el catálogo',                    'HAR-LH-001'],
      ['Fecha',       'YYYY-MM-DD',    '✅ Sí', 'Fecha del conteo. Solo aplica al Disponible — En Tránsito y Ordenado ignoran la fecha', '2026-05-28'],
      ['Disponible',  'Número entero', '✅ Sí', 'Unidades disponibles para venta ahora. Se guarda con historial.',             '50'],
      ['En_Transito', 'Número entero', '⚠️ No', 'Unidades con envío confirmado. Reemplaza el valor anterior al cargar.',       '20'],
      ['Ordenado',    'Número entero', '⚠️ No', 'Unidades ordenadas sin confirmación. Reemplaza el valor anterior al cargar.', '30'],
      ['Notas',       'Texto libre',   '⚠️ No', 'Observaciones sobre este registro',                                          'Conteo semanal'],
    ]
    cols.forEach((fila, i) => {
      const altura = [0, 2, 3, 4].includes(i) ? 44 : 22
      const row = addRow(fila, altura)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = {...left, wrapText:true} }); r++
    })
    addRow([],6); r++

    const s3 = addRow(['  3.  REGLAS IMPORTANTES'], 22)
    merge(r,1,r,5); s3.getCell(1).font = fAzulOsc; s3.getCell(1).fill = fillAzulOsc; s3.getCell(1).alignment = left; r++
    const reglas = [
      ['Solo Disponible es obligatorio', 'Puedes dejar En_Transito y Ordenado vacíos. El sistema funcionará con solo el inventario disponible.'],
      ['SKU exacto', 'El SKU debe coincidir exactamente con el catálogo. Consulta la hoja Referencia.'],
      ['Disponible tiene historial', 'Cada carga del Disponible se guarda con su fecha. Puedes cargar varios días en el mismo archivo.'],
      ['En Tránsito y Ordenado no tienen historial', 'Cada carga de estos campos reemplaza el valor anterior. Solo se conserva el más reciente con su fecha de actualización.'],
      ['Duplicados en Disponible', 'Si ya existe un registro del mismo SKU y fecha, el sistema te preguntará si deseas reemplazarlo.'],
    ]
    reglas.forEach((fila, i) => {
      const altura = [0, 1, 3].includes(i) ? 52 : 26
      const row = addRow(fila, altura); merge(r,2,r,5)
      const fill = i % 2 === 0 ? fillVerdeCl : fillGris
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF'+AZUL_OSC}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = left
      }); r++
    })
    addRow([],6); r++

    const s4 = addRow(['  4.  REFERENCIA DE SKUs VÁLIDOS'], 22)
    merge(r,1,r,5); s4.getCell(1).font = fAzulOsc; s4.getCell(1).fill = fillAzulOsc; s4.getCell(1).alignment = left; r++
    const hRef = addRow(['Categoría', 'SKU', 'Última actualización', 'Nombre del producto', 'Disponible'], 40)
    styleRow(hRef, fAzulMed, fillAzulMed); r++
    productos.filter(p => p.aplica_inventario).forEach((p, i) => {
      const registros = inventario.filter(inv => inv.producto_id === p.id)
      const ultimoInv = registros.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0]
      const fechaUltima = ultimoInv ? new Date(ultimoInv.fecha).toLocaleDateString('es-MX') : 'Sin registro'
      const disponibleActual = ultimoInv ? ultimoInv.disponible : '—'
      const row = addRow([p.categoria || '—', p.sku || '—', fechaUltima, p.nombre, disponibleActual], 36)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); r++
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_inventario_INTEGRA.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function leerArchivo(file: File) {
    if (!proyectoId) return alert('Espera a que cargue el proyecto.')
    if (!productos.length) return alert('No hay productos cargados.')

    const XLSXModule = await import('xlsx')
    const XLSX = XLSXModule.default || XLSXModule
    const reader = new FileReader()

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      const result = e.target?.result
      if (!result) return alert('No se pudo leer el archivo.')
      const wb = XLSX.read(result, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as ImportRow[]

      const rowsFiltradas = rows.filter((row: ImportRow) => {
        const sku  = String(row.SKU || row.sku || '').trim()
        const disp = row.Disponible ?? row.disponible
        return sku && disp !== ''
      })

      if (!rowsFiltradas.length) {
        return alert('No se encontraron filas válidas. Revisa que el archivo tenga SKU y Disponible.')
      }

      setProgresoCarga({ activo: true, total: rowsFiltradas.length, cargadas: 0, porcentaje: 0, mensaje: 'Validando archivo...' })
      setPreview(rowsFiltradas.slice(0, 3))

      const errores: string[] = []
      const rowsValidas: ImportRow[] = []

      for (const row of rowsFiltradas) {
        const skuOriginal = String(row.SKU || row.sku || '').trim()
        const sku = normalizar(skuOriginal)
        const prod = productos.find(p => obtenerSkuProducto(p) === sku)
        if (!prod) { errores.push(`SKU no encontrado: ${skuOriginal}`); continue }
        if (!prod.aplica_inventario) { errores.push(`SKU ${skuOriginal}: es un servicio, no aplica inventario`); continue }
        rowsValidas.push(row)
      }

      console.log('Filas filtradas:', rowsFiltradas.length)
      console.log('Filas válidas:', rowsValidas.length)
      console.log('Errores:', errores)
      console.log('Productos cargados:', productos.length)

      if (errores.length > 0) {
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        setErroresImportacion(errores)
        setShowErrores(true)
        return
      }

      setProgresoCarga({ activo: true, total: rowsValidas.length, cargadas: 0, porcentaje: 10, mensaje: 'Verificando duplicados...' })

      const productosIds = [...new Set(
        rowsValidas.map(row => {
          const sku = normalizar(String(row.SKU || row.sku || ''))
          return productos.find(p => obtenerSkuProducto(p) === sku)?.id
        }).filter((id): id is string => Boolean(id))
      )]

      // Solo verificar duplicados en inventario (disponible histórico)
      const { data: invExistente } = await supabase
        .from('inventario')
        .select('id, producto_id, fecha')
        .eq('proyecto_id', proyectoId)
        .in('producto_id', productosIds)

      setInventarioCache((invExistente || []) as InventarioCacheRow[])

      const setExistentes = new Set(
        (invExistente || []).map(i => `${i.producto_id}__${i.fecha}`)
      )

      const dups: string[] = []
      for (const row of rowsValidas) {
        const sku   = normalizar(String(row.SKU || row.sku || ''))
        const fecha = String(row.Fecha || row.fecha || '').trim()
        const prod  = productos.find(p => obtenerSkuProducto(p) === sku)
        if (prod && setExistentes.has(`${prod.id}__${fecha}`)) {
          dups.push(`${row.SKU || row.sku} — ${fecha}`)
        }
      }

      setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
      setPendingRows(rowsValidas)
      setDuplicados(dups)

      if (dups.length > 0) setShowConfirm(true)
      else await importarInventario(rowsValidas, false, invExistente || [])
    }

    reader.readAsArrayBuffer(file)
  }

  async function importarInventario(rows: ImportRow[], reemplazar: boolean, cache: InventarioCacheRow[] = inventarioCache) {
    if (!proyectoId) return alert('Espera a que cargue el proyecto.')
    setShowConfirm(false)
    setLoading(true)
    setProgresoCarga({ activo: true, total: rows.length, cargadas: 0, porcentaje: 0, mensaje: 'Preparando registros...' })

    const registrosDisponible: RegistroDisponible[] = []
    const registrosPendiente: RegistroPendiente[] = []
    const errores: string[] = []

    for (const row of rows) {
      const skuOriginal = String(row.SKU || row.sku || '').trim()
      const sku   = normalizar(skuOriginal)
      const normalizarFechaInv = (valor: unknown): string => {
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

const fecha = normalizarFechaInv(row.Fecha ?? row.fecha)
      const disponible = normalizarNumero(row.Disponible ?? row.disponible)

      if (!sku || !fecha) continue
      if (disponible === null) { errores.push(`SKU ${skuOriginal}: Disponible es requerido`); continue }

      const prod = productos.find(p => obtenerSkuProducto(p) === sku)
      if (!prod) { errores.push(`SKU no encontrado: ${skuOriginal}`); continue }

      // Registro histórico de disponible
      registrosDisponible.push({
        proyecto_id: proyectoId,
        producto_id: prod.id,
        fecha,
        disponible,
        notas: String(row.Notas || row.notas || '').trim() || null,
      })

      // Foto actual de en tránsito y ordenado (upsert)
      const enTransito = normalizarNumero(row.En_Transito ?? row.en_transito)
      const ordenado   = normalizarNumero(row.Ordenado    ?? row.ordenado)
      if (enTransito !== null || ordenado !== null) {
        // Verificar si ya existe uno para este producto
        const yaExiste = registrosPendiente.find(r => r.producto_id === prod.id)
        if (!yaExiste) {
          registrosPendiente.push({
            proyecto_id: proyectoId,
            producto_id: prod.id,
            en_transito: enTransito ?? 0,
            ordenado:    ordenado   ?? 0,
            notas_pendiente: String(row.Notas || row.notas || '').trim() || null,
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    if (!registrosDisponible.length) {
      setLoading(false)
      setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
      alert('No hay registros válidos para importar.')
      return
    }

    // Borrar duplicados de disponible en lotes de 50
    if (reemplazar && cache.length > 0) {
      setProgresoCarga({ activo: true, total: registrosDisponible.length, cargadas: 0, porcentaje: 5, mensaje: 'Eliminando registros anteriores...' })
      const idsABorrar = cache
        .filter(v => registrosDisponible.some(r => r.producto_id === v.producto_id && r.fecha === v.fecha))
        .map(v => v.id)
      if (idsABorrar.length > 0) {
        const loteBorrado = 50
        for (let i = 0; i < idsABorrar.length; i += loteBorrado) {
          await supabase.from('inventario').delete().in('id', idsABorrar.slice(i, i + loteBorrado))
        }
      }
    }

    // Insertar disponible en lotes de 100
    const tamanoLote = 100
    for (let i = 0; i < registrosDisponible.length; i += tamanoLote) {
      const lote = registrosDisponible.slice(i, i + tamanoLote)
      const cargadasHasta = Math.min(i + tamanoLote, registrosDisponible.length)
      setProgresoCarga({
        activo: true, total: registrosDisponible.length, cargadas: i,
        porcentaje: Math.round((i / registrosDisponible.length) * 80),
        mensaje: `Cargando disponible: ${i + 1} a ${cargadasHasta}...`,
      })
      const { error } = await supabase.from('inventario').insert(lote)
      if (error) {
        setLoading(false)
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        alert(`Error al insertar disponible: ${error.message}`)
        return
      }
    }

    // Upsert de en tránsito y ordenado
    if (registrosPendiente.length > 0) {
      setProgresoCarga({ activo: true, total: registrosDisponible.length, cargadas: registrosDisponible.length, porcentaje: 90, mensaje: 'Actualizando En Tránsito y Ordenado...' })
      const { error } = await supabase.from('inventario_pendiente').upsert(
        registrosPendiente, { onConflict: 'producto_id' }
      )
      if (error) {
        setLoading(false)
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        alert(`Error al actualizar pendiente: ${error.message}`)
        return
      }
    }

    if (errores.length > 0) {
      setErroresImportacion(errores)
      setShowErrores(true)
    }

    setPreview([]); setPendingRows([]); setDuplicados([]); setInventarioCache([])
    setLoading(false); setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)

    const mensajeFinal = `✓ ${registrosDisponible.length} registros importados${errores.length > 0 ? ` · ${errores.length} con errores` : ''}`
    setProgresoCarga({ activo: true, total: registrosDisponible.length, cargadas: registrosDisponible.length, porcentaje: 100, mensaje: mensajeFinal })
    setTimeout(() => setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' }), 3000)

    await cargarDatos(proyectoId)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/productos')} className="text-xs text-gray-400 hover:text-gray-600">Catálogo</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/ventas')} className="text-xs text-gray-400 hover:text-gray-600">Ventas</button>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-medium text-gray-900">Inventario</p>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/promociones')} className="text-xs text-gray-400 hover:text-gray-600">Promociones</button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Modal duplicados */}
        {showConfirm && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Registros duplicados detectados</p>
              <p className="text-xs text-gray-500 mb-3">Ya existe inventario disponible registrado para:</p>
              <div className="bg-amber-50 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                {duplicados.map((d, i) => <p key={i} className="text-xs text-amber-800 font-medium">· {d}</p>)}
              </div>
              <p className="text-xs text-gray-500 mb-4">¿Deseas reemplazar los registros anteriores?</p>
              <div className="flex gap-3">
                <button onClick={() => importarInventario(pendingRows, true, inventarioCache)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 rounded-xl">
                  Sí, reemplazar
                </button>
                <button onClick={() => { setShowConfirm(false); setPendingRows([]); setDuplicados([]); setInventarioCache([]) }}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal errores */}
        {showErrores && erroresImportacion.length > 0 && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <p className="text-sm font-semibold text-gray-900">Reporte de importación</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Se detectaron <strong>{erroresImportacion.length}</strong> registros con problemas:
              </p>
              <div className="bg-red-50 rounded-lg p-3 mb-4 max-h-64 overflow-y-auto space-y-1">
                {erroresImportacion.map((e, i) => <p key={i} className="text-xs text-red-700">· {e}</p>)}
              </div>
              <p className="text-xs text-gray-400 mb-4">Consulta la hoja <strong>Referencia</strong> de la plantilla para ver los SKUs válidos.</p>
              <button onClick={() => { setShowErrores(false); setErroresImportacion([]) }}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl">
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Explicación tipos */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">¿Qué tipos de inventario puedes registrar?</p>
          <p className="text-xs text-gray-400 mb-4">Solo el <strong>Disponible</strong> es obligatorio. Los otros son opcionales según la información con la que cuentes.</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"/>
                <p className="text-xs font-semibold text-emerald-800">DISPONIBLE</p>
                <span className="text-xs bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full ml-auto">Requerido</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">Unidades en tu almacén listas para vender <strong>hoy</strong>.</p>
              <p className="text-xs text-emerald-700 font-medium">📊 Guarda historial por fecha</p>
            </div>
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"/>
                <p className="text-xs font-semibold text-blue-800">EN TRÁNSITO</p>
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-auto">Opcional</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">Orden de compra <strong>confirmada</strong> con fecha de envío.</p>
              <p className="text-xs text-blue-700 font-medium">🔄 Solo guarda el más reciente</p>
            </div>
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"/>
                <p className="text-xs font-semibold text-amber-800">ORDENADO</p>
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full ml-auto">Opcional</span>
              </div>
              <p className="text-xs text-gray-600 mb-1">Orden emitida <strong>sin confirmación</strong> de envío.</p>
              <p className="text-xs text-amber-700 font-medium">🔄 Solo guarda el más reciente</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 p-2 flex gap-2">
          <button onClick={() => setModo('manual')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'manual' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            ✏️ Captura manual
          </button>
          <button onClick={() => setModo('excel')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'excel' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            📂 Subir archivo
          </button>
          <button onClick={() => setModo('vista')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'vista' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            📊 Vista inventario
          </button>
        </div>

        {/* Captura manual */}
{modo === 'manual' && (
  <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Registrar inventario</p>

              <div className="flex gap-2">
                {proyectoId && (
                  <BorradoMasivo
                    tabla="inventario"
                    proyectoId={proyectoId}
                    productos={productos.map((p) => ({
                      id: p.id,
                      nombre: p.nombre,
                      sku: p.sku ?? undefined,
                    }))}
                    campoFecha="fecha"
                    onBorrado={() => cargarDatos(proyectoId)}
                  />
                )}
              </div>
            </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Producto *</label>
        <select
          value={form.producto_id}
          onChange={(e) => setForm({ ...form, producto_id: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Selecciona un producto</option>
          {productos.filter((p) => p.aplica_inventario).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.sku ? `(${p.sku})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Fecha del conteo *</label>
        <input
          type="date"
          value={form.fecha}
          onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    </div>

    <div className="grid grid-cols-3 gap-4">
      <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
        <label className="text-xs font-semibold text-emerald-800 block mb-1">✅ Disponible *</label>
        <p className="text-xs text-gray-500 mb-1">
          En almacén. <span className="text-emerald-700 font-medium">Guarda historial.</span>
        </p>
        <input
          type="number"
          value={form.disponible}
          onChange={(e) => setForm({ ...form, disponible: e.target.value })}
          placeholder="0"
          min="0"
          className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="border border-blue-200 rounded-xl p-3 bg-blue-50">
        <label className="text-xs font-semibold text-blue-800 block mb-1">🚚 En Tránsito</label>
        <p className="text-xs text-gray-500 mb-1">
          Envío confirmado. <span className="text-blue-700 font-medium">Reemplaza anterior.</span>
        </p>
        <input
          type="number"
          value={form.en_transito}
          onChange={(e) => setForm({ ...form, en_transito: e.target.value })}
          placeholder="Opcional"
          min="0"
          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="border border-amber-200 rounded-xl p-3 bg-amber-50">
        <label className="text-xs font-semibold text-amber-800 block mb-1">📋 Ordenado</label>
        <p className="text-xs text-gray-500 mb-1">
          Sin confirmación. <span className="text-amber-700 font-medium">Reemplaza anterior.</span>
        </p>
        <input
          type="number"
          value={form.ordenado}
          onChange={(e) => setForm({ ...form, ordenado: e.target.value })}
          placeholder="Opcional"
          min="0"
          className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
    </div>

    <div>
      <label className="text-xs text-gray-500 block mb-1">Notas (opcional)</label>
      <input
        value={form.notas}
        onChange={(e) => setForm({ ...form, notas: e.target.value })}
        placeholder="Ej. Conteo físico semanal, ajuste por merma..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>

    <button
      onClick={guardarInventario}
      disabled={loading}
      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-xl text-sm transition-colors"
    >
      {guardado ? '✓ Inventario registrado' : loading ? 'Guardando...' : 'Registrar inventario'}
    </button>
  </div>
)}
        {/* Subir archivo */}
        {modo === 'excel' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Subir inventario desde archivo</p>
              <button onClick={descargarPlantilla}
                className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                ↓ Descargar plantilla
              </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-medium">Instrucciones rápidas:</p>
              <p>1. Descarga la plantilla — ya incluye tus productos y valores actuales de En Tránsito y Ordenado</p>
              <p>2. Llena <strong>Disponible</strong> para cada producto y fecha (puedes poner varios días)</p>
              <p>3. Actualiza <strong>En_Transito</strong> y <strong>Ordenado</strong> si cambiaron — reemplazarán los valores anteriores</p>
              <p>4. Sube el archivo — el sistema detecta duplicados en Disponible automáticamente</p>
              <p className="text-amber-700">⚠️ En Tránsito y Ordenado siempre se reemplazan con el valor más reciente del archivo</p>
            </div>
            <div onClick={() => document.getElementById('file-inv')?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <input id="file-inv" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])}/>
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
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-300" style={{ width: `${progresoCarga.porcentaje}%` }}/>
                </div>
                <p className="text-xs text-gray-400 text-center">{progresoCarga.cargadas} de {progresoCarga.total} registros procesados</p>
              </div>
            )}

            {preview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Vista previa ({pendingRows.length} productos detectados):</p>
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
            {loading && <p className="text-xs text-emerald-600 text-center">Importando inventario...</p>}
            {guardado && <p className="text-xs text-emerald-600 text-center font-medium">✓ Inventario importado correctamente</p>}
          </div>
        )}

        {/* Vista inventario */}
        {modo === 'vista' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Estado actual del inventario</p>
                <p className="text-xs text-gray-400 mt-0.5">{inventarioActual.filter(p => p.ultimoDisponible).length} de {inventarioActual.length} productos con registro</p>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/>En stock</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"/>Stock bajo</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/>Sin stock</span>
              </div>
            </div>
            {inventarioActual.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No hay productos con inventario activo.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{background:'#1a2e4a', color:'white'}}>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-left">Categoría</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-center">Disponible</th>
                        <th className="px-3 py-2 text-center">Último conteo</th>
                        <th className="px-3 py-2 text-center">🚚 En Tránsito</th>
                        <th className="px-3 py-2 text-center">📋 Ordenado</th>
                        <th className="px-3 py-2 text-center">Actualizado</th>
                        <th className="px-3 py-2 text-center">Total esperado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventarioActual.map((p, i) => {
                        const disp  = p.ultimoDisponible?.disponible ?? null
                        const trans = p.pendiente?.en_transito ?? null
                        const ord   = p.pendiente?.ordenado    ?? null
                        const total = (disp || 0) + (trans || 0) + (ord || 0)
                        const sem   = disp !== null ? semaforo(disp) : null
                        const updAt = p.pendiente?.updated_at
                          ? new Date(p.pendiente.updated_at).toLocaleDateString('es-MX')
                          : '—'
                        return (
                          <tr key={p.id} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                            <td className="px-3 py-2 font-mono text-gray-500">{p.sku || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{p.nombre}</td>
                            <td className="px-3 py-2 text-gray-500">{p.categoria || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {sem
                                ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${sem.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sem.dot}`}/>{sem.label}
                                  </span>
                                : <span className="text-gray-300 text-xs">Sin registro</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-900">{disp !== null ? disp : '—'}</td>
                            <td className="px-3 py-2 text-center text-gray-400 text-xs">
                              {p.ultimoDisponible ? new Date(p.ultimoDisponible.fecha + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                            </td>
                            <td className="px-3 py-2 text-center text-blue-600 font-medium">{trans !== null ? trans : '—'}</td>
                            <td className="px-3 py-2 text-center text-amber-600 font-medium">{ord !== null ? ord : '—'}</td>
                            <td className="px-3 py-2 text-center text-gray-400 text-xs">{updAt}</td>
                            <td className="px-3 py-2 text-center text-gray-700 font-semibold">{p.ultimoDisponible ? total : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

      </div>
    </main>
  )
}
