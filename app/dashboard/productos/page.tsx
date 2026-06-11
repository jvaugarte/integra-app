'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import BorradoMasivo from '../../components/BorradoMasivo'

type AtributoAsignado = {
  nombre?: string | null
  valor?: string | null
}

type Producto = {
  id: string
  nombre: string
  precio?: number | null
  costo?: number | null
  aplica_inventario?: boolean | null
  categoria?: string | null
  sku?: string | null
  atributos_asignados?: AtributoAsignado[]
}

type Categoria = {
  id: string
  nombre: string
}

type Atributo = {
  id: string
  nombre: string
}

type AtributoValor = {
  id: string
  atributo_id: string
  valor: string
}

type ExcelRow = Record<string, any>

type ProductoAtributoJoin = {
  producto_id: string
  atributo_id?: string | null
  atributos?: { nombre?: string | null } | { nombre?: string | null }[] | null
  atributo_valores?: { valor?: string | null } | { valor?: string | null }[] | null
}

function relacionUno<T>(valor: T | T[] | null | undefined): T | undefined {
  return Array.isArray(valor) ? valor[0] : valor ?? undefined
}

const normalizar = (s: string) => s.toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function generarSKU(categoria: string, nombre: string, consecutivo: number): string {
  const prefCat = categoria
    ? normalizar(categoria).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase()
    : 'GEN'
  const palabras = normalizar(nombre).replace(/[^a-z0-9\s]/g, '').split(' ').filter(Boolean)
  const prefNom = palabras.map(p => p[0]?.toUpperCase() || '').slice(0, 3).join('')
  const num = String(consecutivo).padStart(3, '0')
  return `${prefCat}-${prefNom}-${num}`
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proyectoId, setProyectoId] = useState<string | null>(null)
  const [atributos, setAtributos] = useState<Atributo[]>([])
  const [valoresPorAtributo, setValoresPorAtributo] = useState<Record<string, AtributoValor[]>>({})
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [form, setForm] = useState({
    nombre: '', precio: '', costo: '',
    aplica_inventario: true, categoria_id: '', sku: '', sku_manual: false,
    atributos_seleccionados: {} as Record<string, string>
  })
  const [formAtributo, setFormAtributo] = useState({ nombre: '' })
  const [formValor, setFormValor] = useState({ atributo_id: '', valor: '' })
  const [formCategoria, setFormCategoria] = useState({ nombre: '' })

  const [loading, setLoading] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [modo, setModo] = useState('manual')
  const [seccion, setSeccion] = useState<'producto'|'categorias'|'atributos'|'instrucciones'>('instrucciones')
  const [archivoFile, setArchivoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ExcelRow[]>([])
  const [duplicados, setDuplicados] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingRows, setPendingRows] = useState<ExcelRow[]>([])
  const [subModoExcel, setSubModoExcel] = useState('subir')
  const [erroresImportacion, setErroresImportacion] = useState<string[]>([])
  const [showErrores, setShowErrores] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    cargarDatos()
  }, [])

  async function cargarDatos() {
    const { data: cliente } = await supabase.from('clientes').select('id').limit(1).single()
    if (!cliente) return
    const { data: proyecto } = await supabase.from('proyectos').select('id').eq('cliente_id', cliente.id).limit(1).single()
    if (!proyecto) return
    setProyectoId(proyecto.id as string)

    const { data: prods } = await supabase.from('productos').select('*')
      .eq('proyecto_id', proyecto.id).eq('activo', true).order('nombre')

    const { data: prodAttrs } = await supabase.from('producto_atributos')
      .select('producto_id, atributo_id, atributo_valores(valor), atributos(nombre)')
      .in('producto_id', (prods || []).map(p => p.id))

    const prodsConAtributos = ((prods || []) as Producto[]).map((p) => ({
      ...p,
      atributos_asignados: ((prodAttrs || []) as ProductoAtributoJoin[])
        .filter((a) => a.producto_id === p.id)
        .map((a) => {
          const atributo = relacionUno(a.atributos)
          const valor = relacionUno(a.atributo_valores)
          return { nombre: atributo?.nombre ?? null, valor: valor?.valor ?? null }
        }),
    }))
    setProductos(prodsConAtributos as Producto[])

    const { data: cats } = await supabase.from('categorias')
      .select('*').eq('proyecto_id', proyecto.id).order('nombre')
    setCategorias((cats || []) as Categoria[])

    const { data: attrs } = await supabase.from('atributos')
      .select('*').eq('proyecto_id', proyecto.id).order('nombre')
    setAtributos((attrs || []) as Atributo[])

    if (attrs?.length) {
      const valMap: Record<string, AtributoValor[]> = {}
      for (const attr of attrs) {
        const { data: vals } = await supabase.from('atributo_valores')
          .select('*').eq('atributo_id', attr.id).order('valor')
        valMap[attr.id] = (vals || []) as AtributoValor[]
      }
      setValoresPorAtributo(valMap)
    }
  }

  async function generarSkuAuto(nombre: string, categoriaId: string) {
    if (!nombre) return ''
    const cat = categorias.find((c) => c.id === categoriaId)
    const { count } = await supabase.from('productos')
      .select('*', { count: 'exact', head: true }).eq('proyecto_id', proyectoId)
    const consecutivo = (count || 0) + 1
    return generarSKU(cat?.nombre || '', nombre, consecutivo)
  }

  async function guardarProducto() {
    if (!form.nombre || !form.precio) return alert('Nombre y precio son requeridos')
    setLoading(true)
    const sku = form.sku_manual ? form.sku : await generarSkuAuto(form.nombre, form.categoria_id)
    const { data: prod } = await supabase.from('productos').insert({
      proyecto_id: proyectoId,
      nombre: form.nombre,
      precio: parseFloat(form.precio),
      costo: form.costo ? parseFloat(form.costo) : null,
      aplica_inventario: form.aplica_inventario,
      categoria: categorias.find((c) => c.id === form.categoria_id)?.nombre || null,
      sku: sku || null,
    }).select().single()

    if (prod) {
      for (const [atributoId, valorId] of Object.entries(form.atributos_seleccionados)) {
        if (valorId) {
          await supabase.from('producto_atributos').insert({
            producto_id: prod.id, atributo_id: atributoId, valor_id: valorId,
          })
        }
      }
    }

    setForm({
      nombre: '', precio: '', costo: '',
      aplica_inventario: true, categoria_id: '', sku: '', sku_manual: false,
      atributos_seleccionados: {}
    })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    cargarDatos()
    setLoading(false)
  }

  async function guardarCategoria() {
    if (!formCategoria.nombre) return
    await supabase.from('categorias').insert({ proyecto_id: proyectoId, nombre: formCategoria.nombre })
    setFormCategoria({ nombre: '' })
    cargarDatos()
  }

  async function eliminarCategoria(id: string) {
    await supabase.from('categorias').delete().eq('id', id)
    cargarDatos()
  }

  async function guardarAtributo() {
    if (!formAtributo.nombre) return
    await supabase.from('atributos').insert({ proyecto_id: proyectoId, nombre: formAtributo.nombre })
    setFormAtributo({ nombre: '' })
    cargarDatos()
  }

  async function eliminarAtributo(id: string) {
    await supabase.from('atributos').delete().eq('id', id)
    cargarDatos()
  }

  async function guardarValor() {
    if (!formValor.atributo_id || !formValor.valor) return
    const valores = formValor.valor.split(',').map(v => v.trim()).filter(Boolean)
    for (const val of valores) {
      await supabase.from('atributo_valores').insert({ atributo_id: formValor.atributo_id, valor: val })
    }
    setFormValor({ ...formValor, valor: '' })
    cargarDatos()
  }

  async function eliminarValor(id: string) {
    await supabase.from('atributo_valores').delete().eq('id', id)
    cargarDatos()
  }

  async function eliminarProducto(id: string) {
    await supabase.from('productos').update({ activo: false }).eq('id', id)
    cargarDatos()
  }

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9', VERDE_CL = 'dcfce7'
    const fAzulOsc = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
    const fAzulMed = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fNormal  = { color: { argb: 'FF1e293b' }, size: 10, name: 'Arial' }
    const fillAzulOsc  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_OSC } }
    const fillAzulMed  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_MED } }
    const fillAzulClar = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_CLAR } }
    const fillVerdeCl  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + VERDE_CL } }
    const fillGris     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + GRIS } }
    const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
    const left   = { horizontal: 'left' as const,   vertical: 'middle' as const, wrapText: true }

    const wsDatos = wb.addWorksheet('Datos')
    const columnasBase = [
      { header: 'Nombre',              key: 'nombre',    width: 30 },
      { header: 'Precio',              key: 'precio',    width: 14 },
      { header: 'Costo',               key: 'costo',     width: 14 },
      { header: 'Aplica_inventario',   key: 'aplica',    width: 18 },
      { header: 'Categoria_Principal', key: 'categoria', width: 22 },
      { header: 'SKU',                 key: 'sku',       width: 16 },
    ]
    const columnasAtributos = atributos.map(attr => ({
      header: attr.nombre, key: `attr_${attr.id}`, width: 18,
    }))
    wsDatos.columns = [...columnasBase, ...columnasAtributos]
    const hDatos = wsDatos.getRow(1)
    hDatos.eachCell((cell: any) => {
      cell.font = fAzulOsc; cell.fill = fillAzulOsc
      cell.alignment = center
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + AZUL_MED } } }
    })
    hDatos.height = 22

    const ws = wb.addWorksheet('Instrucciones')
    ws.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 42 }, { width: 28 }, { width: 28 }]
    const addRow = (v: any[], h = 18) => { const row = ws.addRow(v); row.height = h; return row }
    const merge  = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)
    const styleRow = (row: any, font: any, fill: any, align: any = center) =>
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = font; cell.fill = fill; cell.alignment = align })
    let r = 1

    const titulo = addRow(['📦  GUÍA DE CAPTURA DE CATÁLOGO — INTEGRA Inteligencia Integral'], 30)
    merge(r,1,r,6); titulo.getCell(1).font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Arial' }
    titulo.getCell(1).fill = fillAzulOsc; titulo.getCell(1).alignment = center; r++
    addRow([],6); r++

    const s1 = addRow(['  1.  COLUMNAS DEL ARCHIVO DE DATOS'], 22)
    merge(r,1,r,6); s1.getCell(1).font = fAzulOsc; s1.getCell(1).fill = fillAzulOsc; s1.getCell(1).alignment = left; r++
    const hCols = addRow(['Columna','Formato','¿Requerido?','Descripción','Ejemplo'], 20)
    styleRow(hCols, fAzulMed, fillAzulMed); r++
    const colsData = [
      ['Nombre',           'Texto',          '✅ Sí', 'Nombre del producto o servicio',                                    'Laptop HP 15'],
      ['Precio',           'Número decimal', '✅ Sí', 'Precio de venta al público',                                        '12999.00'],
      ['Costo',            'Número decimal', '⚠️ No', 'Costo unitario de compra o producción',                             '9500.00'],
      ['Aplica_inventario','SI / NO',        '✅ Sí', 'SI si es producto físico, NO si es servicio',                       'SI'],
      ['Categoria',        'Texto',          '⚠️ No', 'Nombre de la categoría tal como está en el sistema',                'Hardware'],
      ['SKU',              'Texto',          '⚠️ No', 'Código del producto. Si lo dejas vacío el sistema genera uno auto', 'HAR-LH-001'],
    ]
    colsData.forEach((fila, i) => {
      const row = addRow(fila, 20)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = {...left, wrapText:true} })
      r++
    })
    addRow([],6); r++

    const s2 = addRow(['  2.  REGLAS IMPORTANTES'], 22)
    merge(r,1,r,6); s2.getCell(1).font = fAzulOsc; s2.getCell(1).fill = fillAzulOsc; s2.getCell(1).alignment = left; r++
    const reglas = [
      ['SKU automático',    'Si dejas la columna SKU vacía el sistema genera uno con formato CAT-NOM-001 automáticamente.'],
      ['Categoría',         'El nombre debe coincidir exactamente con las categorías creadas en el sistema.'],
      ['Aplica_inventario', 'Escribe exactamente SI o NO. Los servicios deben tener NO.'],
      ['Decimales',         'Usa punto (.) como separador decimal. Ejemplo: 1250.50 — NO uses coma.'],
      ['Atributos',         'Escribe el valor exactamente como aparece en la hoja Referencia. El sistema lo busca automáticamente.'],
      ['inventario',        'El inventario se registra en la sección de inventario, no aquí. Solo indica si el producto aplica inventario (SI/NO).'],
    ]
    reglas.forEach((fila, i) => {
      const row = addRow(fila, 22); merge(r,2,r,6)
      const fill = i % 2 === 0 ? fillVerdeCl : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF'+AZUL_OSC}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = left
      }); r++
    })
    addRow([],6); r++

    const s3 = addRow(['  3.  EJEMPLO DE CAPTURA CORRECTA'], 22)
    merge(r,1,r,6); s3.getCell(1).font = fAzulOsc; s3.getCell(1).fill = fillAzulOsc; s3.getCell(1).alignment = left; r++
    const hEj = addRow(['Nombre','Precio','Costo','Aplica_inventario','Categoria','SKU'], 20)
    styleRow(hEj, fAzulMed, fillAzulMed); r++
    const ejemplos = [
      ['Laptop HP 15 Core i5', '12999.00', '9500.00', 'SI', 'Hardware', ''],
      ['Mouse Inalambrico',     '450.00',   '290.00',  'SI', 'Periféricos', 'PER-MI-001'],
      ['Reparacion PC',         '600.00',   '150.00',  'NO', 'Servicios', ''],
    ]
    ejemplos.forEach((fila, i) => {
      const row = addRow(fila, 20)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = center })
      r++
    })
    addRow([],6); r++

    const s4 = addRow(['  4.  NOTAS FINALES'], 22)
    merge(r,1,r,6); s4.getCell(1).font = fAzulOsc; s4.getCell(1).fill = fillAzulOsc; s4.getCell(1).alignment = left; r++
    const notas = [
      '  • Puedes subir el archivo en formato CSV, XLS o XLSX.',
      '  • El sistema detectará duplicados y te preguntará si deseas reemplazarlos u omitirlos.',
      '  • Los valores de atributos se buscan automáticamente — consulta la hoja Referencia para ver los valores válidos.',
      '  • El inventario (cantidades disponibles) se registra en la sección de inventario, no en el catálogo.',
      '  • ¿Dudas? Consulta a tu consultor INTEGRA o usa el Asistente IA dentro de la app.',
    ]
    notas.forEach(nota => {
      const nRow = addRow([nota,'','','','',''], 18)
      merge(r,1,r,6); nRow.getCell(1).font = fNormal; nRow.getCell(1).fill = fillGris; nRow.getCell(1).alignment = left; r++
    })

    const wsRef = wb.addWorksheet('Referencia')
    wsRef.columns = [{ width: 25 }, { width: 20 }, { width: 35 }]
    const addRowRef = (v: any[], h = 18) => { const row = wsRef.addRow(v); row.height = h; return row }
    const mergeRef  = (r1: number, c1: number, r2: number, c2: number) => wsRef.mergeCells(r1, c1, r2, c2)
    let rr = 1

    const tituloRef = addRowRef(['📋  VALORES VÁLIDOS PARA TU CATÁLOGO'], 28)
    mergeRef(rr,1,rr,3); tituloRef.getCell(1).font = { bold:true, size:13, color:{argb:'FFFFFFFF'}, name:'Arial' }
    tituloRef.getCell(1).fill = fillAzulOsc; tituloRef.getCell(1).alignment = center; rr++
    addRowRef([],6); rr++

    const sCat = addRowRef(['  CATEGORÍAS PRINCIPALES'], 22)
    mergeRef(rr,1,rr,3); sCat.getCell(1).font = fAzulOsc; sCat.getCell(1).fill = fillAzulOsc
    sCat.getCell(1).alignment = { horizontal:'left' as const, vertical:'middle' as const }; rr++
    const hCat = addRowRef(['Nombre de categoría','Usar exactamente este valor en columna Categoria_Principal',''], 20)
    mergeRef(rr,2,rr,3); hCat.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    categorias.forEach((cat, i) => {
      const row = addRowRef([cat.nombre, cat.nombre, ''], 18)
      mergeRef(rr,2,rr,3)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any, colNum: number) => {
        cell.font = colNum === 2 ? { bold:true, size:10, color:{argb:'FF16a34a'}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = center
      }); rr++
    })
    addRowRef([],6); rr++

    const sAttr = addRowRef(['  ATRIBUTOS Y VALORES VÁLIDOS'], 22)
    mergeRef(rr,1,rr,3); sAttr.getCell(1).font = fAzulOsc; sAttr.getCell(1).fill = fillAzulOsc
    sAttr.getCell(1).alignment = { horizontal:'left' as const, vertical:'middle' as const }; rr++
    const hAttr = addRowRef(['Atributo','Valores válidos (escribe uno de estos en la columna correspondiente)',''], 20)
    mergeRef(rr,2,rr,3); hAttr.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    atributos.forEach((attr, i) => {
      const valores = (valoresPorAtributo[attr.id] || []).map(v => v.valor).join(', ')
      const row = addRowRef([attr.nombre, valores, ''], 20)
      mergeRef(rr,2,rr,3)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, (cell: any) => {
        cell.font = fNormal; cell.fill = fill
        cell.alignment = { horizontal:'left' as const, vertical:'middle' as const, wrapText:true }
      }); rr++
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_catalogo_INTEGRA.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function leerArchivo(file: File) {
    setArchivoFile(file)
    const XLSXModule = await import('xlsx')
    const XLSX = XLSXModule.default || XLSXModule
    const reader = new FileReader()
    reader.onload = async (e) => {
      const result = e.target?.result
      if (!result) return

      const wb = XLSX.read(result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      setPreview((rows as ExcelRow[]).slice(0, 3))
      const nombres = (rows as ExcelRow[]).map((r) => normalizar(r.Nombre || '')).filter(Boolean)
      const { data: existentes } = await supabase.from('productos')
        .select('nombre').eq('proyecto_id', proyectoId).eq('activo', true)
      const nombresExistentes = (existentes || []).map((p: any) => normalizar(p.nombre))
      const dups = nombres.filter(n => nombresExistentes.includes(n))
      setDuplicados(dups)
      setPendingRows(rows as ExcelRow[])
      if (dups.length > 0) setShowConfirm(true)
      else await importarProductos(rows as ExcelRow[], false)
    }
    reader.readAsArrayBuffer(file)
  }

  async function importarProductos(rows: ExcelRow[], reemplazar: boolean) {
    setShowConfirm(false)
    setLoading(true)
    const errores: string[] = []

    const { data: atributosDB } = await supabase.from('atributos')
      .select('id, nombre').eq('proyecto_id', proyectoId)
    const { data: valoresDB } = await supabase.from('atributo_valores')
      .select('id, valor, atributo_id')
      .in('atributo_id', (atributosDB || []).map((a: any) => a.id))

    const { count } = await supabase.from('productos')
      .select('*', { count: 'exact', head: true }).eq('proyecto_id', proyectoId)
    let consecutivo = (count || 0) + 1

    for (const row of rows) {
      if (!row.Nombre || !row.Precio) {
        errores.push(`Fila omitida — falta Nombre o Precio: "${row.Nombre || 'sin nombre'}"`)
        continue
      }
      const nombreNorm = normalizar(row.Nombre)
      if (reemplazar) {
        const { data: existing } = await supabase.from('productos')
  .select('id')
  .eq('proyecto_id', proyectoId)
  .ilike('nombre', row.Nombre)
  .limit(1)

if ((existing?.length ?? 0) > 0 && existing?.[0]?.id) {
  await supabase
    .from('productos')
    .update({ activo: false })
    .eq('id', existing[0].id)
}
      } else if (duplicados.includes(nombreNorm)) continue

      const catNombre = categorias.find((c) =>
        normalizar(c.nombre) === normalizar(row.Categoria_Principal || row.Categoria || '')
      )
      if (!catNombre && (row.Categoria_Principal || row.Categoria)) {
        errores.push(`Producto "${row.Nombre}" — categoría no encontrada: "${row.Categoria_Principal || row.Categoria}"`)
      }

      const sku = row.SKU
        ? String(row.SKU)
        : generarSKU(row.Categoria_Principal || row.Categoria || '', row.Nombre, consecutivo)

      const { data: prodInsertado } = await supabase.from('productos').insert({
        proyecto_id: proyectoId,
        nombre: row.Nombre,
        precio: parseFloat(row.Precio) || 0,
        costo: row.Costo ? parseFloat(row.Costo) : null,
        aplica_inventario: String(row.Aplica_inventario).toUpperCase() !== 'NO',
        categoria: catNombre?.nombre || row.Categoria_Principal || row.Categoria || null,
        sku,
      }).select().single()

      if (prodInsertado && atributosDB?.length) {
        for (const attrDB of atributosDB) {
          const colMatch = Object.keys(row).find(
            (k) => k.toLowerCase().trim() === attrDB.nombre.toLowerCase().trim()
          )
          if (!colMatch) continue
          const valorTexto = String(row[colMatch] || '').trim()
          if (!valorTexto) continue

          const valorDB = (valoresDB || []).find((v: any) =>
            v.atributo_id === attrDB.id &&
            normalizar(v.valor).replace(/[^a-z0-9]/g, '') === normalizar(valorTexto).replace(/[^a-z0-9]/g, '')
          )
          if (!valorDB) {
            errores.push(`Producto "${row.Nombre}" — atributo "${attrDB.nombre}": valor "${valorTexto}" no existe`)
            continue
          }
          await supabase.from('producto_atributos').insert({
            producto_id: prodInsertado.id, atributo_id: attrDB.id, valor_id: valorDB.id,
          })
        }
      }
      consecutivo++
    }

    setArchivoFile(null); setPreview([]); setPendingRows([]); setDuplicados([])
    setLoading(false)

    if (errores.length > 0) {
      setErroresImportacion(errores)
      setShowErrores(true)
    }

    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    cargarDatos()
  }

  async function descargarCatalogoExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Catálogo')
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9'
    const fBlanco = { bold:true, color:{argb:'FFFFFFFF'}, size:10, name:'Arial' }
    const fNormal = { color:{argb:'FF1e293b'}, size:10, name:'Arial' }
    const center  = { horizontal:'center' as const, vertical:'middle' as const }
    const left    = { horizontal:'left' as const,   vertical:'middle' as const }
    ws.columns = [
      { header:'SKU',       key:'sku',       width:16 },
      { header:'Nombre',    key:'nombre',    width:32 },
      { header:'Categoría', key:'categoria', width:20 },
      { header:'Precio',    key:'precio',    width:14 },
      { header:'Costo',     key:'costo',     width:14 },
      { header:'Utilidad',  key:'utilidad',  width:14 },
      { header:'Margen %',  key:'margen',    width:12 },
      { header:'Tipo',      key:'tipo',      width:12 },
    ]
    const header = ws.getRow(1)
    header.eachCell((cell: any) => {
      cell.font = fBlanco
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+AZUL_OSC} }
      cell.alignment = center
      cell.border = { bottom:{style:'medium', color:{argb:'FF'+AZUL_MED}} }
    })
    header.height = 22
    productos.forEach((p, i) => {
  const precio = typeof p.precio === 'number' ? p.precio : 0
  const costo = typeof p.costo === 'number' ? p.costo : null

  const utilidad = costo !== null ? precio - costo : null
  const margen = costo !== null && precio > 0
    ? (((precio - costo) / precio) * 100).toFixed(1) + '%'
    : '—'
      const row = ws.addRow([
  p.sku || '—',
  p.nombre,
  p.categoria || '—',
  precio,
  costo !== null ? costo : '—',
  utilidad !== null ? utilidad : '—',
  margen,
  p.aplica_inventario ? 'Producto' : 'Servicio',
])
      row.height = 18
      const fill = { type:'pattern' as const, pattern:'solid' as const, fgColor:{argb: i%2===0 ? 'FF'+AZUL_CLAR : 'FF'+GRIS} }
      row.eachCell({ includeEmpty:true }, (cell: any) => { cell.font = fNormal; cell.fill = fill; cell.alignment = left })
    })
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `catalogo_INTEGRA_${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-gray-400 hover:text-gray-600">← Dashboard</button>
        <span className="text-gray-200">/</span>
        <p className="text-sm font-medium text-gray-900">Catálogo</p>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/ventas')} className="text-xs text-gray-400 hover:text-gray-600">Ventas</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/inventario')} className="text-xs text-gray-400 hover:text-gray-600">inventario</button>
        <span className="text-gray-200">/</span>
        <button onClick={() => router.push('/dashboard/promociones')} className="text-xs text-gray-400 hover:text-gray-600">Promociones</button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Modal errores importación */}
        {showErrores && erroresImportacion.length > 0 && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <p className="text-sm font-semibold text-gray-900">Reporte de importación</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Se importaron los productos pero se detectaron <strong>{erroresImportacion.length}</strong> valores que no coinciden:
              </p>
              <div className="bg-red-50 rounded-lg p-3 mb-4 max-h-64 overflow-y-auto space-y-1">
                {erroresImportacion.map((e, i) => <p key={i} className="text-xs text-red-700">· {e}</p>)}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Consulta la hoja <strong>Referencia</strong> de la plantilla para ver los valores válidos.
              </p>
              <button onClick={() => { setShowErrores(false); setErroresImportacion([]) }}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl">
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Modal duplicados */}
        {showConfirm && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Productos duplicados detectados</p>
              <p className="text-xs text-gray-500 mb-3">Los siguientes productos ya existen en tu catálogo:</p>
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                {duplicados.map(d => <p key={d} className="text-xs text-amber-800 font-medium">· {d}</p>)}
              </div>
              <p className="text-xs text-gray-500 mb-4">¿Deseas reemplazar la información anterior con los nuevos datos?</p>
              <div className="flex gap-3">
                <button onClick={() => importarProductos(pendingRows, true)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 rounded-xl">Sí, reemplazar</button>
                <button onClick={() => importarProductos(pendingRows, false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl">Omitir duplicados</button>
              </div>
              <button onClick={() => { setShowConfirm(false); setArchivoFile(null); setPendingRows([]); setDuplicados([]) }}
                className="w-full text-xs text-gray-400 mt-2 py-1">Cancelar</button>
            </div>
          </div>
        )}

        {/* Tabs principales */}
        <div className="bg-white rounded-xl border border-gray-100 p-2 grid grid-cols-3 gap-2">
          {[
            { id:'manual', label:'✏️ Captura manual' },
            { id:'excel',  label:'📂 Subir archivo' },
            { id:'vista',  label:'📊 Vista catálogo' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setModo(tab.id)}
              className={`py-2 text-xs rounded-lg transition-colors font-medium ${modo === tab.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-400'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {modo === 'manual' && (
          <>
            <div className="flex gap-2 border-b border-gray-100 pb-1">
              {(['categorias','atributos','producto','instrucciones'] as const).map(s => (
                <button key={s} onClick={() => setSeccion(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${seccion === s ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                  {s === 'instrucciones' ? '📖 Instrucciones' : s === 'categorias' ? '🏷 Categoría Principal' : s === 'atributos' ? '🔖 Atributos' : '+ Producto'}
                </button>
              ))}
            </div>

            {seccion === 'instrucciones' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl">📖</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Guía de configuración del catálogo</p>
                    <p className="text-xs text-gray-400">Sigue estos pasos en orden para configurar correctamente tu catálogo</p>
                  </div>
                </div>
                <div className="border border-blue-100 rounded-xl p-4 bg-blue-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                    <p className="text-sm font-semibold text-blue-900">Crea tus Categorías Principales</p>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">Las categorías principales agrupan tus productos en grandes bloques:</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {['Hardware','Periféricos','Almacenamiento','Accesorios y Redes','Servicios'].map(c => (
                      <span key={c} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-full">{c}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">👉 Ve al tab <strong>🏷 Categoría Principal</strong> y agrega cada una.</p>
                </div>
                <div className="border border-purple-100 rounded-xl p-4 bg-purple-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                    <p className="text-sm font-semibold text-purple-900">Crea tus Atributos y sus Valores</p>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">Los atributos describen características de tus productos:</p>
                  <div className="space-y-2 mb-2">
                    {[
                      { attr:'Marca', valores:'HP, Dell, Lenovo, Asus, Apple...' },
                      { attr:'Color', valores:'Negro, Blanco, Plateado, Gris...' },
                      { attr:'Uso',   valores:'Gamer, Oficina, Personal, Escolar...' },
                    ].map(({ attr, valores }) => (
                      <div key={attr} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-purple-800 w-28">{attr}:</span>
                        <span className="text-gray-500">{valores}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">👉 Ve al tab <strong>🔖 Atributos</strong>, crea cada tipo y agrega sus valores.</p>
                </div>
                <div className="border border-emerald-100 rounded-xl p-4 bg-emerald-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                    <p className="text-sm font-semibold text-emerald-900">Agrega tus Productos</p>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-3 border border-emerald-200">
                      <p className="text-xs font-semibold text-gray-800 mb-1">📝 Captura manual</p>
                      <p className="text-xs text-gray-500">Llena el formulario en el tab <strong>+ Producto</strong>. El SKU se genera automáticamente con formato <span className="font-mono bg-gray-100 px-1 rounded">CAT-NOM-001</span>.</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-emerald-200">
                      <p className="text-xs font-semibold text-gray-800 mb-1">📂 Subir Excel / CSV</p>
                      <p className="text-xs text-gray-500">Descarga la plantilla desde <strong>Subir archivo</strong>, llénala y súbela.</p>
                    </div>
                  </div>
                </div>
                <div className="border border-amber-100 rounded-xl p-4 bg-amber-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">4</span>
                    <p className="text-sm font-semibold text-amber-900">Sobre el SKU</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-200 font-mono text-sm text-center text-amber-800 mb-2">HAR-LH-001</div>
                  <div className="space-y-1 text-xs text-gray-600">
                    <p><strong>HAR</strong> → primeras 3 letras de la categoría (Hardware)</p>
                    <p><strong>LH</strong> → iniciales del nombre (Laptop HP)</p>
                    <p><strong>001</strong> → número consecutivo</p>
                  </div>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-gray-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                    <p className="text-sm font-semibold text-gray-900">Registra el inventario por separado</p>
                  </div>
                  <p className="text-xs text-gray-600">Una vez creado tu catálogo, ve a la sección de <strong>Inventario</strong> para registrar las cantidades disponibles, en tránsito y ordenadas de cada producto.</p>
                </div>
                <button onClick={() => setSeccion('categorias')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl text-sm transition-colors">
                  Comenzar → Crear Categorías Principales
                </button>
              </div>
            )}

            {seccion === 'categorias' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-medium text-gray-900">Gestionar categorías principales</p>
                <div style={{display:'flex', gap:'8px'}}>
                  <input value={formCategoria.nombre} onChange={e => setFormCategoria({ nombre: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && guardarCategoria()}
                    placeholder="Ej. Hardware, Periféricos, Servicios..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  <button onClick={guardarCategoria}
                    style={{flexShrink:0, backgroundColor:'#059669', color:'white', fontSize:'14px', fontWeight:500, padding:'8px 20px', borderRadius:'8px', border:'none', cursor:'pointer'}}>
                    Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {categorias.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-4">Aún no hay categorías.</p>
                    : categorias.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                        <button onClick={() => eliminarCategoria(c.id)} className="text-xs text-gray-300 hover:text-red-400">Eliminar</button>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {seccion === 'atributos' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
                <p className="text-sm font-medium text-gray-900">Gestionar atributos personalizados</p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-3">Nuevo tipo de atributo</p>
                  <p className="text-xs text-gray-400 mb-3">Ejemplos: Color, Tamaño, Tipo, Marca, Uso...</p>
                  <div className="flex gap-2">
                    <input value={formAtributo.nombre} onChange={e => setFormAtributo({ nombre: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && guardarAtributo()}
                      placeholder="Ej. Color"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <button onClick={guardarAtributo}
                      style={{flexShrink:0, backgroundColor:'#2563eb', color:'white', fontSize:'14px', fontWeight:'500', padding:'8px 20px', borderRadius:'8px', border:'none', cursor:'pointer'}}>
                      Agregar
                    </button>
                  </div>
                </div>
                {atributos.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">Aún no hay atributos.</p>
                  : atributos.map(attr => (
                    <div key={attr.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">🔖 {attr.nombre}</p>
                        <button onClick={() => eliminarAtributo(attr.id)} className="text-xs text-gray-300 hover:text-red-400">Eliminar</button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={formValor.atributo_id === attr.id ? formValor.valor : ''}
                          onChange={e => setFormValor({ atributo_id: attr.id, valor: e.target.value })}
                          placeholder="Ej. Negro, Blanco, Rojo (separa con comas)"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                        <button onClick={guardarValor}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200">
                          + Agregar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(valoresPorAtributo[attr.id] || []).map(v => (
                          <span key={v.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-100">
                            {v.valor}
                            <button onClick={() => eliminarValor(v.id)} className="text-blue-300 hover:text-red-400 ml-1">×</button>
                          </span>
                        ))}
                        {(valoresPorAtributo[attr.id] || []).length === 0 &&
                          <p className="text-xs text-gray-400">Sin valores aún</p>}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {seccion === 'producto' && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-medium text-gray-900">Agregar producto o servicio</p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <label className="text-xs font-medium text-gray-700">SKU / No. de Producto</label>
                      <p className="text-xs text-gray-400 mt-0.5">Código único. Ejemplo: <span className="font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">HAR-LH-001</span></p>
                    </div>
                    <button onClick={() => setForm({...form, sku_manual: !form.sku_manual})}
                      className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap ml-4">
                      {form.sku_manual ? '← Generar automático' : 'Ingresar manualmente'}
                    </button>
                  </div>
                  {form.sku_manual
                    ? <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                        placeholder="Ej. HAR-LH-001"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 mt-2"/>
                    : <div className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-400 bg-white mt-2 flex items-center gap-2">
                        <span>⚙️</span>
                        <span>Se generará automáticamente al guardar con formato <span className="font-mono">CAT-NOM-001</span></span>
                      </div>
                  }
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                      placeholder="Ej. Laptop HP 15"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Categoría Principal</label>
                    <select value={form.categoria_id} onChange={e => setForm({...form, categoria_id: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Sin categoría</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Precio de venta *</label>
                    <input type="number" value={form.precio} onChange={e => setForm({...form, precio: e.target.value})}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Costo unitario (opcional)</label>
                    <input type="number" value={form.costo} onChange={e => setForm({...form, costo: e.target.value})}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                </div>
                {atributos.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Atributos del producto</p>
                    <div className="grid grid-cols-2 gap-3">
                      {atributos.map(attr => (
                        <div key={attr.id}>
                          <label className="text-xs text-gray-500 block mb-1">{attr.nombre}</label>
                          <select
                            value={form.atributos_seleccionados[attr.id] || ''}
                            onChange={e => setForm({...form, atributos_seleccionados: {...form.atributos_seleccionados, [attr.id]: e.target.value}})}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="">Sin especificar</option>
                            {(valoresPorAtributo[attr.id] || []).map(v => (
                              <option key={v.id} value={v.id}>{v.valor}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm({...form, aplica_inventario: !form.aplica_inventario})}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${form.aplica_inventario ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.aplica_inventario ? 'translate-x-4' : 'translate-x-0'}`}/>
                  </button>
                  <span className="text-sm text-gray-700">¿Aplica inventario?</span>
                  {!form.aplica_inventario && <span className="text-xs text-gray-400">(es un servicio)</span>}
                </div>
                <button onClick={guardarProducto} disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                  {guardado ? '✓ Guardado' : loading ? 'Guardando...' : 'Agregar producto'}
                </button>
              </div>
            )}
          </>
        )}

        {modo === 'excel' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <p className="text-sm font-medium text-gray-900">Subir catálogo desde archivo</p>
            <div className="flex gap-2 border-b border-gray-100 pb-2">
              {[
                { id:'subir', label:'⬆️ Subir archivo' },
                { id:'cats',  label:'🏷 Categorías' },
                { id:'attrs', label:'🔖 Atributos' },
                { id:'prods', label:'📦 Productos' },
              ].map(t => (
                <button key={t.id} onClick={() => setSubModoExcel(t.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${subModoExcel === t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {subModoExcel === 'subir' && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Descarga la plantilla con tus categorías y atributos ya incluidos</p>
                  <button onClick={descargarPlantilla}
                    className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                    ↓ Descargar plantilla
                  </button>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
                  <p className="font-medium">Antes de subir tu archivo asegúrate de:</p>
                  <p>✅ Haber creado tus <strong>Categorías Principales</strong></p>
                  <p>✅ Haber creado tus <strong>Atributos</strong> y sus valores</p>
                  <p className="pt-1 font-medium">Pasos:</p>
                  <p>1. Descarga la plantilla — ya incluye tus categorías y atributos como columnas</p>
                  <p>2. Llena cada fila con los valores exactos que aparecen en la hoja Referencia</p>
                  <p>3. En Categoria_Principal escribe el nombre exacto como lo creaste</p>
                  <p>4. Sube el archivo — el sistema busca automáticamente los IDs internos</p>
                  <p className="pt-1 text-amber-700">⚠️ Consulta la hoja Referencia para ver los valores válidos de cada atributo</p>
                </div>
                <div onClick={() => document.getElementById('file-cat')?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                  <input id="file-cat" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])}/>
                  <p className="text-sm text-gray-500">Arrastra tu archivo o haz clic para seleccionar</p>
                  <p className="text-xs text-gray-400 mt-1">CSV · XLSX · XLS</p>
                </div>
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
                {loading && <p className="text-xs text-emerald-600 text-center">Importando productos...</p>}
                {guardado && <p className="text-xs text-emerald-600 text-center font-medium">✓ Productos importados correctamente</p>}
              </>
            )}
            {subModoExcel === 'cats' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Categorías principales registradas:</p>
                {categorias.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No hay categorías.</p>
                  : categorias.map((c, i) => (
                    <div key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${i%2===0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                      <button onClick={() => eliminarCategoria(c.id)} className="text-xs text-gray-300 hover:text-red-400">Eliminar</button>
                    </div>
                  ))
                }
              </div>
            )}
            {subModoExcel === 'attrs' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Atributos y valores registrados:</p>
                {atributos.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No hay atributos.</p>
                  : atributos.map((attr, i) => (
                    <div key={attr.id} className={`px-3 py-2 rounded-lg ${i%2===0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <p className="text-xs font-semibold text-gray-700 mb-1">🔖 {attr.nombre}</p>
                      <div className="flex flex-wrap gap-1">
                        {(valoresPorAtributo[attr.id] || []).map(v => (
                          <span key={v.id} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">{v.valor}</span>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
            {subModoExcel === 'prods' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Productos actualmente en el catálogo ({productos.length}):</p>
                {productos.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No hay productos cargados aún.</p>
                  : productos.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${i%2===0 ? 'bg-gray-50' : 'bg-white border border-gray-100'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-gray-900">{p.nombre}</p>
                          {p.sku && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{p.sku}</span>}
                        </div>
                        <p className="text-xs text-gray-400">{p.categoria && `${p.categoria} · `}${p.precio}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

{modo === 'vista' && (
  <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">Vista del catálogo</p>
        <p className="text-xs text-gray-400 mt-0.5">{productos.length} productos registrados</p>
      </div>
      <div className="flex gap-2">
        {proyectoId && (
          <BorradoMasivo
            tabla="productos"
            proyectoId={proyectoId}
            productos={productos.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              sku: p.sku ?? undefined,
            }))}
            modoCatalogo={true}
            onBorrado={() => cargarDatos()}
          />
        )}
        <button onClick={descargarCatalogoExcel}
          className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
          ↓ Exportar a Excel
        </button>
      </div>
    </div>
            {productos.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No hay productos en el catálogo.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{background:'#1a2e4a', color:'white'}}>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Nombre</th>
                        <th className="px-3 py-2 text-left">Categoría</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2 text-center">Tipo</th>
                        <th className="px-3 py-2 text-left">Atributos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.map((p, i) => (
                        <tr key={p.id} className={i%2===0 ? 'bg-blue-50' : 'bg-white'}>
                          <td className="px-3 py-2 font-mono text-gray-500">{p.sku || '—'}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{p.nombre}</td>
                          <td className="px-3 py-2 text-gray-500">{p.categoria || '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-900">${p.precio?.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{p.costo ? `$${p.costo?.toLocaleString('es-MX')}` : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span style={{padding:'2px 8px', borderRadius:'9999px', fontSize:'11px', fontWeight:500,
                              background: p.aplica_inventario ? '#dbeafe' : '#dcfce7',
                              color:      p.aplica_inventario ? '#1d4ed8' : '#16a34a'}}>
                              {p.aplica_inventario ? 'Producto' : 'Servicio'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {(p.atributos_asignados?.length ?? 0) > 0
                              ? <div className="flex flex-wrap gap-1">
                                  {p.atributos_asignados?.map((a, idx) => (
                                    <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                      <span className="text-gray-400">{a.nombre}:</span> {a.valor}
                                    </span>
                                  ))}
                                </div>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {/* Lista productos */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-900 mb-4">Productos registrados ({productos.length})</p>
          {productos.length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">Aún no hay productos.</p>
            : productos.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
                    {p.sku && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">{p.sku}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.categoria && `${p.categoria} · `}
                    Precio: ${p.precio}
                    {p.costo && ` · Costo: $${p.costo}`}
                    {!p.aplica_inventario && ' · Servicio'}
                  </p>
                </div>
                <button onClick={() => eliminarProducto(p.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">Eliminar</button>
              </div>
            ))
          }
        </div>

        <button onClick={() => router.push('/dashboard/ventas')}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl text-sm transition-colors">
          Continuar → Registrar ventas
        </button>

      </div>
    </main>
  )
}
