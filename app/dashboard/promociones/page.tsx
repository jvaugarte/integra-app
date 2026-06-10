'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import BorradoMasivo from '../../components/BorradoMasivo'

const normalizar = (s: string) => s.toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const TIPOS_PROMO = ['Descuento %', 'Descuento monto fijo', '2x1', '3x2', 'Regalo con compra', 'Producto cruzado', 'Precio especial', 'Liquidación', 'Otro']
const TIPOS_PUB   = ['Facebook Ads', 'Instagram Ads', 'Google Ads', 'TikTok Ads', 'Influencer', 'Email marketing', 'WhatsApp', 'Volante / impreso', 'Radio', 'Otro']

export default function Promociones() {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [proyectoId, setProyectoId] = useState(null)
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [modo, setModo] = useState('manual')
  const [preview, setPreview] = useState([])
  const [pendingRows, setPendingRows] = useState([])
  const [duplicados, setDuplicados] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [erroresImportacion, setErroresImportacion] = useState<string[]>([])
  const [showErrores, setShowErrores] = useState(false)
  const [progresoCarga, setProgresoCarga] = useState({
    activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '',
  })
  const [filtroTipo, setFiltroTipo] = useState<'todos'|'promo'|'publicidad'>('todos')
  const [form, setForm] = useState({
    nombre: '',
    tipo_registro: 'promo' as 'promo' | 'publicidad',
    alcance_tipo: 'producto' as 'producto' | 'categoria' | 'general',
    producto_id: '',
    producto_cruzado_id: '',
    categoria: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    periodo_tipo: 'dia',
    // Promo
    tipo_promo: '',
    descuento_pct: '',
    monto_descuento: '',
    detalle_promo: '',
    // Publicidad
    tipo_publicidad: '',
    costo_publicidad: '',
    alcance_estimado: '',
    detalle_publicidad: '',
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
    setProyectoId(idProyecto)

    const { data: prods } = await supabase.from('productos').select('id, nombre, sku, categoria')
      .eq('proyecto_id', idProyecto).eq('activo', true).order('nombre')
    setProductos(prods || [])

    const { data: cats } = await supabase.from('categorias').select('id, nombre')
      .eq('proyecto_id', idProyecto).order('nombre')
    setCategorias(cats || [])

    const { data: regs } = await supabase.from('promociones_publicidad')
  .select('*, productos!promociones_publicidad_producto_id_fkey(nombre, sku), productos_cruzado:productos!promociones_publicidad_producto_cruzado_id_fkey(nombre, sku)')
  .eq('proyecto_id', idProyecto)
  .eq('activo', true)
  .order('fecha_inicio', { ascending: false })
      .eq('proyecto_id', idProyecto)
      .eq('activo', true)
      .order('fecha_inicio', { ascending: false })
    setRegistros(regs || [])
  }

  async function guardarRegistro() {
    if (!form.nombre) return alert('El nombre de la campaña es requerido')
    if (!form.fecha_inicio) return alert('La fecha de inicio es requerida')
    if (form.tipo_registro === 'promo' && !form.tipo_promo) return alert('Selecciona el tipo de promoción')
    if (form.tipo_registro === 'publicidad' && !form.tipo_publicidad) return alert('Selecciona el tipo de publicidad')
    if (form.alcance_tipo === 'producto' && !form.producto_id) return alert('Selecciona el producto')
    if (form.alcance_tipo === 'categoria' && !form.categoria) return alert('Selecciona la categoría')
    setLoading(true)

    const { error } = await supabase.from('promociones_publicidad').insert({
      proyecto_id: proyectoId,
      nombre: form.nombre,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      periodo_tipo: form.periodo_tipo,
      alcance_tipo: form.alcance_tipo,
      producto_id: form.alcance_tipo === 'producto' ? form.producto_id : null,
      producto_cruzado_id: form.producto_cruzado_id || null,
      categoria: form.alcance_tipo === 'categoria' ? form.categoria : null,
      // Promo
      tiene_promo: form.tipo_registro === 'promo',
      tipo_promo: form.tipo_registro === 'promo' ? form.tipo_promo : null,
      descuento_pct: form.descuento_pct ? parseFloat(form.descuento_pct) : null,
      monto_descuento: form.monto_descuento ? parseFloat(form.monto_descuento) : null,
      detalle_promo: form.detalle_promo || null,
      // Publicidad
      tiene_publicidad: form.tipo_registro === 'publicidad',
      tipo_publicidad: form.tipo_registro === 'publicidad' ? form.tipo_publicidad : null,
      costo_publicidad: form.costo_publicidad ? parseFloat(form.costo_publicidad) : null,
      alcance_estimado: form.alcance_estimado ? parseInt(form.alcance_estimado) : null,
      detalle_publicidad: form.detalle_publicidad || null,
      activo: true,
    })

    setLoading(false)
    if (error) return alert(`Error al guardar: ${error.message}`)

    setForm({
      nombre: '', tipo_registro: 'promo', alcance_tipo: 'producto',
      producto_id: '', producto_cruzado_id: '', categoria: '',
      fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '', periodo_tipo: 'dia',
      tipo_promo: '', descuento_pct: '', monto_descuento: '', detalle_promo: '',
      tipo_publicidad: '', costo_publicidad: '', alcance_estimado: '', detalle_publicidad: '',
    })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    cargarDatos(proyectoId)
  }

  async function eliminarRegistro(id: string) {
    await supabase.from('promociones_publicidad').update({ activo: false }).eq('id', id)
    cargarDatos(proyectoId)
  }

  function normalizarNumero(valor: any) {
    if (valor === null || valor === undefined || valor === '') return null
    const limpio = String(valor).replace('$', '').replace(/,/g, '').replace(/%/g, '').trim()
    const numero = parseFloat(limpio)
    return Number.isNaN(numero) ? null : numero
  }

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const AZUL_OSC = '1a2e4a', AZUL_MED = '2563eb', AZUL_CLAR = 'dbeafe', GRIS = 'f1f5f9', VERDE_CL = 'dcfce7', AMBER = 'fef3c7', ROSA = 'fce7f3'
    const fAzulOsc = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
    const fAzulMed = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' }
    const fNormal  = { color: { argb: 'FF1e293b' }, size: 10, name: 'Arial' }
    const fNota    = { italic: true, color: { argb: 'FF1e40af' }, size: 9, name: 'Arial' }
    const fillAzulOsc  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_OSC } }
    const fillAzulMed  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_MED } }
    const fillAzulClar = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AZUL_CLAR } }
    const fillGris     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + GRIS } }
    const fillVerdeCl  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + VERDE_CL } }
    const fillAmber    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + AMBER } }
    const fillRosa     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + ROSA } }
    const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
    const left   = { horizontal: 'left' as const,   vertical: 'middle' as const, wrapText: true }

    // ── Hoja Datos ──
    const wsDatos = wb.addWorksheet('Datos')
    wsDatos.columns = [
      { header: 'Nombre_Campaña',   key: 'nombre',       width: 28 },
      { header: 'Tipo_Registro',    key: 'tipo',         width: 14 },
      { header: 'Fecha',            key: 'fecha',        width: 14 },      
      { header: 'Alcance_Tipo',     key: 'alcance',      width: 14 },
      { header: 'SKU_Producto',     key: 'sku',          width: 18 },
      { header: 'Categoria',        key: 'categoria',    width: 20 },
      { header: 'Tipo_Promo',       key: 'tipo_promo',   width: 22 },
      { header: 'Descuento_Pct',    key: 'desc_pct',     width: 14 },
      { header: 'Monto_Descuento',  key: 'desc_monto',   width: 16 },
      { header: 'SKU_Cruzado',      key: 'sku_cruzado',  width: 18 },
      { header: 'Tipo_Publicidad',  key: 'tipo_pub',     width: 22 },
      { header: 'Costo_Publicidad', key: 'costo_pub',    width: 16 },
      { header: 'Alcance_Estimado', key: 'alcance_est',  width: 16 },
      { header: 'Detalle',          key: 'detalle',      width: 40 },
    ]

 
    const hDatos = wsDatos.getRow(1)
    hDatos.eachCell(cell => {
      cell.font = fAzulOsc; cell.fill = fillAzulOsc
      cell.alignment = center
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + AZUL_MED } } }
    })
    hDatos.height = 22

    // Ejemplos pre-llenados
    const ejemplosDatos = [
      ['Descuento Laptop HP Mayo', 'promo',     '2026-05-01', 'producto', 'HAR-LH-001', '', 'Descuento %',    '15',  '',   '',           '',             '',     '', 'Promoción de temporada 15% de descuento'],
      ['Black Friday 2025',        'promo',     '2025-11-28', 'categoria','',            'Hardware', 'Descuento %', '20', '',  '',           '',             '',     '', 'Black Friday en toda la categoría Hardware'],
      ['2x1 Teclados',             'promo',     '2026-04-01', 'producto', 'PER-TR-014',  '', '2x1',           '',    '',   '',           '',             '',     '', '2x1 en teclados mecánicos'],
      ['Facebook Ads Mayo',        'publicidad','2026-05-01', 'general',  '',            '', '',              '',    '',   '',           'Facebook Ads', '5000', '15000', 'Campaña awareness productos gaming'],
      ['Influencer TikTok',        'publicidad','2026-05-10', 'producto', 'PER-MR-017',  '', '',              '',    '',   '',           'Influencer',   '2500', '80000', 'Review mouse gaming con influencer tech'],
    ]
    ejemplosDatos.forEach((fila, i) => {
      const row = wsDatos.addRow(fila)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = fNormal; cell.fill = fill; cell.alignment = left
      })
      row.height = 20
    })

    // ── Hoja Instrucciones ──
    const ws = wb.addWorksheet('Instrucciones')
    ws.columns = [{ width: 24 }, { width: 16 }, { width: 14 }, { width: 38 }, { width: 28 }]
    const addRow = (v: any[], h = 18) => { const row = ws.addRow(v); row.height = h; return row }
    const merge  = (r1, c1, r2, c2) => ws.mergeCells(r1, c1, r2, c2)
    const styleRow = (row, font, fill, align = center) =>
      row.eachCell({ includeEmpty: true }, (cell) => { cell.font = font; cell.fill = fill; cell.alignment = align })
    let r = 1

    const titulo = addRow(['📣  GUÍA DE CARGA DE PROMOCIONES Y PUBLICIDAD — INTEGRA'], 30)
    merge(r,1,r,5); titulo.getCell(1).font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Arial' }
    titulo.getCell(1).fill = fillAzulOsc; titulo.getCell(1).alignment = center; r++
    addRow([],6); r++

    // Sección 1: Promo vs Publicidad
    const s1 = addRow(['  1.  PROMOCIÓN vs PUBLICIDAD — DIFERENCIA CLAVE'], 22)
    merge(r,1,r,5); s1.getCell(1).font = fAzulOsc; s1.getCell(1).fill = fillAzulOsc; s1.getCell(1).alignment = left; r++

    const diff = [
      ['🏷  PROMOCIÓN', 'promo', 'Impacta directamente el MARGEN del producto. El cliente paga menos o recibe más por el mismo precio. Ejemplos: descuento, 2x1, regalo con compra.', 'Descuento 15% en Laptop HP → el margen cae 15%'],
      ['📢  PUBLICIDAD', 'publicidad', 'Es un GASTO INDEPENDIENTE destinado a incentivar ventas. No modifica el precio del producto. Ejemplos: Facebook Ads, Google, influencer, volantes.', 'Facebook Ads $5,000 → el precio del producto no cambia'],
    ]
    diff.forEach((fila, i) => {
      const row = addRow(fila, 44); merge(r,3,r,4)
      const fill = i === 0 ? fillAmber : fillRosa
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF1a2e4a'}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = { ...left, wrapText: true }
      }); r++
    })
    addRow([],6); r++

    // Sección 2: Columnas
    const s2 = addRow(['  2.  COLUMNAS DEL ARCHIVO'], 22)
    merge(r,1,r,5); s2.getCell(1).font = fAzulOsc; s2.getCell(1).fill = fillAzulOsc; s2.getCell(1).alignment = left; r++
    const hCols = addRow(['Columna','Valores válidos','¿Requerido?','Descripción','Ejemplo'], 20)
    styleRow(hCols, fAzulMed, fillAzulMed); r++

    const cols = [
      ['Nombre_Campaña',   'Texto libre',              '✅ Sí', 'Nombre descriptivo de la campaña o promoción',                          'Black Friday 2025'],
      ['Tipo_Registro',    'promo / publicidad',        '✅ Sí', 'Escribe exactamente: promo o publicidad en minúsculas',                 'promo'],
      ['Fecha',            'DD-MM-AAAA',                '✅ Sí', 'Fecha en que ocurrió la promoción o campaña de publicidad',             '28-05-2026'],
      ['Alcance_Tipo',     'producto / categoria / general', '✅ Sí', 'A qué nivel aplica: un producto, una categoría o toda la tienda', 'producto'],
      ['SKU_Producto',     'SKU del catálogo',          '⚠️ *', 'SKU exacto. Requerido si Alcance_Tipo = producto',                      'HAR-LH-001'],
      ['Categoria',        'Nombre de categoría',       '⚠️ *', 'Nombre exacto. Requerido si Alcance_Tipo = categoria',                  'Hardware'],
      ['Tipo_Promo',       'Ver hoja Referencia',       '⚠️ *', 'Tipo de promoción. Requerido si Tipo_Registro = promo',                 'Descuento %'],
      ['Descuento_Pct',    'Número (sin %)',             '⚠️ No', 'Porcentaje de descuento. Ej: 15 = 15%',                                '15'],
      ['Monto_Descuento',  'Número decimal',            '⚠️ No', 'Descuento en pesos fijos',                                             '200.00'],
      ['SKU_Cruzado',      'SKU del catálogo',          '⚠️ No', 'Producto que se regala o combina. Solo para Producto cruzado',         'PER-ML-016'],
      ['Tipo_Publicidad',  'Ver hoja Referencia',       '⚠️ *', 'Canal de publicidad. Requerido si Tipo_Registro = publicidad',          'Facebook Ads'],
      ['Costo_Publicidad', 'Número decimal',            '⚠️ No', 'Presupuesto invertido en la campaña en pesos',                         '5000.00'],
      ['Alcance_Estimado', 'Número entero',             '⚠️ No', 'Personas alcanzadas o impresiones estimadas',                          '15000'],
      ['Detalle',          'Texto libre',               '⚠️ No', 'Notas adicionales sobre la campaña',                                   'Campaña gaming Q2'],
    ]
    cols.forEach((fila, i) => {
      const row = addRow(fila, 22)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty: true }, cell => { cell.font = fNormal; cell.fill = fill; cell.alignment = {...left, wrapText:true} }); r++
    })
    addRow([],6); r++

    // Ajustar altura de filas 9 a 22
for (let rowNum = 9; rowNum <= 22; rowNum++) {
  ws.getRow(rowNum).height = 40
}

    // Sección 3: Reglas
    const s3 = addRow(['  3.  REGLAS IMPORTANTES'], 22)
    merge(r,1,r,5); s3.getCell(1).font = fAzulOsc; s3.getCell(1).fill = fillAzulOsc; s3.getCell(1).alignment = left; r++
    const reglas = [
      ['Tipo_Registro obligatorio',    'Escribe exactamente "promo" o "publicidad". De esto depende cómo se analiza el impacto en tus KPIs.'],
      ['Campos según tipo',            'Si es promo → llena Tipo_Promo. Si es publicidad → llena Tipo_Publicidad. Los demás campos son opcionales.'],
      ['Alcance_Tipo y campos ligados','Si Alcance_Tipo = producto → llena SKU_Producto. Si = categoria → llena Categoria. Si = general → deja ambos vacíos.'],
      ['Fechas',                       'Usa formato YYYY-MM-DD. Fecha_Fin es opcional — si no la tienes deja la celda vacía.'],
      ['Nombres nuevos son válidos',   'Si el tipo de promo o publicidad que usaste no está en la hoja Referencia, escríbelo libremente — el sistema lo registrará.'],
    ]
    reglas.forEach((fila, i) => {
      const row = addRow(fila, 30); merge(r,2,r,5)
      const fill = i % 2 === 0 ? fillVerdeCl : fillGris
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = colNum === 1 ? { bold:true, size:10, color:{argb:'FF'+AZUL_OSC}, name:'Arial' } : fNormal
        cell.fill = fill; cell.alignment = left
      }); r++
    })

    // ── Hoja Referencia ──
    const wsRef = wb.addWorksheet('Referencia')
    wsRef.columns = [{ width: 25 }, { width: 30 }, { width: 25 }, { width: 30 }]
    const addRowRef = (v: any[], h = 18) => { const row = wsRef.addRow(v); row.height = h; return row }
    const mergeRef  = (r1, c1, r2, c2) => wsRef.mergeCells(r1, c1, r2, c2)
    let rr = 1

    const tituloRef = addRowRef(['📋  VALORES VÁLIDOS — PROMOCIONES Y PUBLICIDAD'], 28)
    mergeRef(rr,1,rr,4); tituloRef.getCell(1).font = { bold:true, size:13, color:{argb:'FFFFFFFF'}, name:'Arial' }
    tituloRef.getCell(1).fill = fillAzulOsc; tituloRef.getCell(1).alignment = center; rr++
    addRowRef([],6); rr++

    // Tipos de promo
    const sTipoPromo = addRowRef(['  TIPOS DE PROMOCIÓN (columna Tipo_Promo)', '', '', ''], 22)
    mergeRef(rr,1,rr,4); sTipoPromo.getCell(1).font = fAzulOsc; sTipoPromo.getCell(1).fill = fillAmber
    sTipoPromo.getCell(1).alignment = left; rr++
    const hPromo = addRowRef(['Tipo_Promo', 'Descripción', 'Impacta margen', ''], 20)
    mergeRef(rr,3,rr,4); hPromo.eachCell({ includeEmpty:true }, cell => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    const tiposPromoDesc = [
      ['Descuento %',        'Porcentaje de descuento sobre el precio de lista',  'Sí — reduce ingreso'],
      ['Descuento monto fijo','Descuento en pesos sobre el precio de lista',       'Sí — reduce ingreso'],
      ['2x1',                'Compra 2 y paga 1',                                  'Sí — 50% del ingreso'],
      ['3x2',                'Compra 3 y paga 2',                                  'Sí — 33% del ingreso'],
      ['Regalo con compra',  'Al comprar X, se regala otro producto',              'Sí — costo extra'],
      ['Producto cruzado',   'Combo o paquete de dos productos',                   'Parcial'],
      ['Precio especial',    'Precio diferenciado para un segmento',               'Sí — reduce margen'],
      ['Liquidación',        'Venta a precio de costo o menor',                    'Sí — margen mínimo'],
      ['Otro',               'Cualquier otro tipo de promoción',                   'Variable'],
    ]
    tiposPromoDesc.forEach((fila, i) => {
      const row = addRowRef([fila[0], fila[1], fila[2], ''], 20)
      mergeRef(rr,3,rr,4)
      const fill = i % 2 === 0 ? fillAmber : fillGris
      row.eachCell({ includeEmpty:true }, cell => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); rr++
    })
    addRowRef([],6); rr++

    // Tipos de publicidad
    const sTipoPub = addRowRef(['  TIPOS DE PUBLICIDAD (columna Tipo_Publicidad)', '', '', ''], 22)
    mergeRef(rr,1,rr,4); sTipoPub.getCell(1).font = fAzulOsc; sTipoPub.getCell(1).fill = fillRosa
    sTipoPub.getCell(1).alignment = left; rr++
    const hPub = addRowRef(['Tipo_Publicidad', 'Descripción', 'Tipo de gasto', ''], 20)
    mergeRef(rr,3,rr,4); hPub.eachCell({ includeEmpty:true }, cell => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    const tiposPubDesc = [
      ['Facebook Ads',    'Anuncios pagados en Facebook e Instagram',         'Digital — pago por resultado'],
      ['Instagram Ads',   'Anuncios específicos de Instagram',                'Digital — pago por resultado'],
      ['Google Ads',      'Anuncios en buscador y red de display de Google',  'Digital — pago por clic'],
      ['TikTok Ads',      'Anuncios en TikTok',                               'Digital — pago por resultado'],
      ['Influencer',      'Colaboración con creadores de contenido',          'Fijo o por comisión'],
      ['Email marketing', 'Campañas por correo electrónico',                  'Bajo costo por envío'],
      ['WhatsApp',        'Mensajes directos a clientes o broadcast',         'Bajo costo'],
      ['Volante / impreso','Material físico: volantes, carteles, flyers',     'Costo de impresión'],
      ['Radio',           'Spots en radio local o nacional',                  'Por tiempo al aire'],
      ['Otro',            'Cualquier otro canal de publicidad',               'Variable'],
    ]
    tiposPubDesc.forEach((fila, i) => {
      const row = addRowRef([fila[0], fila[1], fila[2], ''], 20)
      mergeRef(rr,3,rr,4)
      const fill = i % 2 === 0 ? fillRosa : fillGris
      row.eachCell({ includeEmpty:true }, cell => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); rr++
    })
    addRowRef([],6); rr++

    // SKUs válidos
    const sSKU = addRowRef(['  SKUs VÁLIDOS (columna SKU_Producto y SKU_Cruzado)', '', '', ''], 22)
    mergeRef(rr,1,rr,4); sSKU.getCell(1).font = fAzulOsc; sSKU.getCell(1).fill = fillAzulOsc
    sSKU.getCell(1).alignment = left; rr++
    const hSKU = addRowRef(['SKU', 'Nombre del producto', 'Categoría', ''], 20)
    mergeRef(rr,3,rr,4); hSKU.eachCell({ includeEmpty:true }, cell => { cell.font = fAzulMed; cell.fill = fillAzulMed; cell.alignment = center }); rr++
    productos.forEach((p, i) => {
      const row = addRowRef([p.sku || '—', p.nombre, p.categoria || '—', ''], 18)
      mergeRef(rr,3,rr,4)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, cell => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); rr++
    })
    addRowRef([],6); rr++

    // Categorías válidas
    const sCat = addRowRef(['  CATEGORÍAS VÁLIDAS (columna Categoria)', '', '', ''], 22)
    mergeRef(rr,1,rr,4); sCat.getCell(1).font = fAzulOsc; sCat.getCell(1).fill = fillAzulOsc
    sCat.getCell(1).alignment = left; rr++
    categorias.forEach((c, i) => {
      const row = addRowRef([c.nombre, '', '', ''], 18)
      mergeRef(rr,1,rr,4)
      const fill = i % 2 === 0 ? fillAzulClar : fillGris
      row.eachCell({ includeEmpty:true }, cell => { cell.font = fNormal; cell.fill = fill; cell.alignment = left }); rr++
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_promociones_INTEGRA.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function leerArchivo(file) {
    if (!proyectoId) return alert('Espera a que cargue el proyecto.')
    const XLSXModule = await import('xlsx')
    const XLSX = XLSXModule.default || XLSXModule
    const reader = new FileReader()
    reader.onload = async (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const rowsFiltradas = rows.filter((row: any) => {
        const nombre = String(row.Nombre_Campaña || row['Nombre_Campaña'] || '').trim()
        const tipo   = String(row.Tipo_Registro  || '').trim().toLowerCase()
        return nombre && (tipo === 'promo' || tipo === 'publicidad')
      })

      if (!rowsFiltradas.length) {
        return alert('No se encontraron filas válidas. Revisa que tengas Nombre_Campaña y Tipo_Registro (promo o publicidad).')
      }

      setProgresoCarga({ activo: true, total: rowsFiltradas.length, cargadas: 0, porcentaje: 0, mensaje: 'Validando archivo...' })
      setPreview(rowsFiltradas.slice(0, 3))

      const errores: string[] = []
      const rowsValidas: any[] = []

      for (const row of rowsFiltradas) {
        const nombre     = String(row.Nombre_Campaña || '').trim()
        const tipo       = String(row.Tipo_Registro  || '').trim().toLowerCase()
        const alcance    = String(row.Alcance_Tipo   || 'producto').trim().toLowerCase()
        const skuProd    = String(row.SKU_Producto   || '').trim()
        const cat        = String(row.Categoria      || '').trim()
        const tipoPromo  = String(row.Tipo_Promo     || '').trim()
        const tipoPub    = String(row.Tipo_Publicidad|| '').trim()

        if (!['promo','publicidad'].includes(tipo)) {
          errores.push(`Fila "${nombre}": Tipo_Registro debe ser "promo" o "publicidad"`); continue
        }
        if (!['producto','categoria','general'].includes(alcance)) {
          errores.push(`Fila "${nombre}": Alcance_Tipo inválido (${alcance})`); continue
        }
        if (alcance === 'producto' && !skuProd) {
          errores.push(`Fila "${nombre}": SKU_Producto requerido cuando Alcance_Tipo = producto`); continue
        }
        if (alcance === 'producto' && skuProd) {
          const prod = productos.find(p => (p.sku || '').toLowerCase() === skuProd.toLowerCase())
          if (!prod) { errores.push(`Fila "${nombre}": SKU_Producto no encontrado: ${skuProd}`); continue }
        }
        if (alcance === 'categoria' && !cat) {
          errores.push(`Fila "${nombre}": Categoria requerida cuando Alcance_Tipo = categoria`); continue
        }
        if (tipo === 'promo' && !tipoPromo) {
          errores.push(`Fila "${nombre}": Tipo_Promo requerido cuando Tipo_Registro = promo`); continue
        }
        if (tipo === 'publicidad' && !tipoPub) {
          errores.push(`Fila "${nombre}": Tipo_Publicidad requerido cuando Tipo_Registro = publicidad`); continue
        }
        rowsValidas.push(row)
      }

      if (errores.length > 0 && rowsValidas.length === 0) {
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        setErroresImportacion(errores)
        setShowErrores(true)
        return
      }

      setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
      setPendingRows(rowsValidas)
      if (errores.length > 0) setErroresImportacion(errores)
      await importarRegistros(rowsValidas, errores)
    }
    reader.readAsArrayBuffer(file)
  }

  async function importarRegistros(rows, erroresPrevios: string[] = []) {
    setLoading(true)
    setProgresoCarga({ activo: true, total: rows.length, cargadas: 0, porcentaje: 0, mensaje: 'Importando registros...' })

    const registrosInsertar: any[] = []

    for (const row of rows) {
      const nombre    = String(row.Nombre_Campaña || '').trim()
      const tipo      = String(row.Tipo_Registro  || '').trim().toLowerCase()
      const alcance   = String(row.Alcance_Tipo   || 'producto').trim().toLowerCase()
      const skuProd   = String(row.SKU_Producto   || '').trim()
      const skuCruz   = String(row.SKU_Cruzado    || '').trim()
      const cat       = String(row.Categoria      || '').trim()

      const prod      = skuProd ? productos.find(p => (p.sku || '').toLowerCase() === skuProd.toLowerCase()) : null
      const prodCruz  = skuCruz ? productos.find(p => (p.sku || '').toLowerCase() === skuCruz.toLowerCase()) : null

      const normalizarFechaPromo = (valor: any): string => {
  if (!valor) return ''
  const str = String(valor).trim()
  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // YYYY-MM-DD o YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`
  // Serial de Excel (número)
  if (typeof valor === 'number') {
    const date = new Date(Math.round((valor - 25569) * 86400 * 1000))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
  }
  // Si es Date object
  if (valor instanceof Date) {
    return `${valor.getFullYear()}-${String(valor.getMonth()+1).padStart(2,'0')}-${String(valor.getDate()).padStart(2,'0')}`
  }
  return str
}
      const fechaInicio = normalizarFechaPromo(row.Fecha)
      const fechaFin    = null
      registrosInsertar.push({
        proyecto_id:     proyectoId,
        nombre,
        fecha_inicio:    fechaInicio || new Date().toISOString().split('T')[0],
        fecha_fin:       fechaFin || null,
        periodo_tipo:    'dia',
        alcance_tipo:    alcance,
        producto_id:     prod?.id || null,
        producto_cruzado_id: prodCruz?.id || null,
        categoria:       alcance === 'categoria' ? cat : null,
        tiene_promo:     tipo === 'promo',
        tipo_promo:      tipo === 'promo'       ? String(row.Tipo_Promo      || '').trim() : null,
        descuento_pct:   normalizarNumero(row.Descuento_Pct),
        monto_descuento: normalizarNumero(row.Monto_Descuento),
        detalle_promo:   tipo === 'promo'       ? String(row.Detalle || '').trim() || null : null,
        tiene_publicidad:tipo === 'publicidad',
        tipo_publicidad: tipo === 'publicidad'  ? String(row.Tipo_Publicidad || '').trim() : null,
        costo_publicidad:normalizarNumero(row.Costo_Publicidad),
        alcance_estimado:row.Alcance_Estimado ? parseInt(String(row.Alcance_Estimado)) : null,
        detalle_publicidad: tipo === 'publicidad' ? String(row.Detalle || '').trim() || null : null,
        activo: true,
      })
    }

    const tamanoLote = 100
    for (let i = 0; i < registrosInsertar.length; i += tamanoLote) {
      const lote = registrosInsertar.slice(i, i + tamanoLote)
      const cargadasHasta = Math.min(i + tamanoLote, registrosInsertar.length)
      setProgresoCarga({
        activo: true, total: registrosInsertar.length, cargadas: i,
        porcentaje: Math.round((i / registrosInsertar.length) * 100),
        mensaje: `Cargando ${i + 1} a ${cargadasHasta} de ${registrosInsertar.length}...`,
      })
      const { error } = await supabase.from('promociones_publicidad').insert(lote)
      if (error) {
        setLoading(false)
        setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' })
        alert(`Error al insertar: ${error.message}`)
        return
      }
    }

    const todosErrores = [...erroresPrevios]
    if (todosErrores.length > 0) {
      setErroresImportacion(todosErrores)
      setShowErrores(true)
    }

    setPreview([]); setPendingRows([])
    setLoading(false); setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)

    const msg = `✓ ${registrosInsertar.length} registros importados${todosErrores.length > 0 ? ` · ${todosErrores.length} con errores` : ''}`
    setProgresoCarga({ activo: true, total: registrosInsertar.length, cargadas: registrosInsertar.length, porcentaje: 100, mensaje: msg })
    setTimeout(() => setProgresoCarga({ activo: false, total: 0, cargadas: 0, porcentaje: 0, mensaje: '' }), 3000)
    await cargarDatos(proyectoId)
  }

  const registrosFiltrados = registros.filter(r => {
    if (filtroTipo === 'promo')      return r.tiene_promo
    if (filtroTipo === 'publicidad') return r.tiene_publicidad
    return true
  })

  const totalCostoPub   = registros.filter(r => r.tiene_publicidad).reduce((s, r) => s + (r.costo_publicidad || 0), 0)
  const totalPromos     = registros.filter(r => r.tiene_promo).length
  const totalPubs       = registros.filter(r => r.tiene_publicidad).length

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
        <p className="text-sm font-medium text-gray-900">Promociones y Publicidad</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Modal errores */}
        {showErrores && erroresImportacion.length > 0 && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <p className="text-sm font-semibold text-gray-900">Reporte de importación</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Se detectaron <strong>{erroresImportacion.length}</strong> filas con problemas:
              </p>
              <div className="bg-red-50 rounded-lg p-3 mb-4 max-h-64 overflow-y-auto space-y-1">
                {erroresImportacion.map((e, i) => <p key={i} className="text-xs text-red-700">· {e}</p>)}
              </div>
              <p className="text-xs text-gray-400 mb-4">Consulta la hoja <strong>Referencia</strong> de la plantilla para ver los valores válidos.</p>
              <button onClick={() => { setShowErrores(false); setErroresImportacion([]) }}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl">
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Explicación */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">Promoción vs Publicidad</p>
          <p className="text-xs text-gray-400 mb-4">Registra ambos tipos para analizar qué estrategias han funcionado mejor.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏷</span>
                <p className="text-sm font-semibold text-amber-900">PROMOCIÓN</p>
              </div>
              <p className="text-xs text-gray-600 mb-2">Impacta directamente el <strong>margen del producto</strong>. El cliente paga menos o recibe más.</p>
              <div className="flex flex-wrap gap-1">
                {TIPOS_PROMO.slice(0, 5).map(t => (
                  <span key={t} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            <div className="border border-pink-200 bg-pink-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📢</span>
                <p className="text-sm font-semibold text-pink-900">PUBLICIDAD</p>
              </div>
              <p className="text-xs text-gray-600 mb-2">Es un <strong>gasto independiente</strong> para incentivar ventas. No modifica el precio del producto.</p>
              <div className="flex flex-wrap gap-1">
                {TIPOS_PUB.slice(0, 5).map(t => (
                  <span key={t} className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs resumen */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Total promociones</p>
            <p className="text-xl font-bold text-amber-600">{totalPromos}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Total campañas publicidad</p>
            <p className="text-xl font-bold text-pink-600">{totalPubs}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Inversión en publicidad</p>
            <p className="text-xl font-bold text-gray-900">${totalCostoPub.toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
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
          <button onClick={() => setModo('historial')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${modo === 'historial' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-400'}`}>
            📋 Historial
          </button>
        </div>

        {/* Captura manual */}
        {modo === 'manual' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Registrar promoción o publicidad</p>
            <BorradoMasivo tabla="promociones_publicidad" proyectoId={proyectoId} productos={productos} campoFecha="fecha_inicio" onBorrado={() => cargarDatos(proyectoId)}/>
            </div>

            {/* Tipo de registro */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">¿Qué vas a registrar? *</label>
              <div className="flex gap-2">
                <button onClick={() => setForm({...form, tipo_registro: 'promo'})}
                  className={`flex-1 py-3 rounded-xl border-2 transition-colors text-sm font-medium ${form.tipo_registro === 'promo' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-400'}`}>
                  🏷 Promoción <span className="block text-xs font-normal mt-0.5">Afecta el margen del producto</span>
                </button>
                <button onClick={() => setForm({...form, tipo_registro: 'publicidad'})}
                  className={`flex-1 py-3 rounded-xl border-2 transition-colors text-sm font-medium ${form.tipo_registro === 'publicidad' ? 'border-pink-400 bg-pink-50 text-pink-800' : 'border-gray-200 text-gray-400'}`}>
                  📢 Publicidad <span className="block text-xs font-normal mt-0.5">Gasto independiente para incentivar ventas</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Nombre de la campaña *</label>
                <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                  placeholder="Ej. Black Friday 2025, Campaña Facebook Mayo..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha inicio *</label>
                <input type="date" value={form.fecha_inicio} onChange={e => setForm({...form, fecha_inicio: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha fin (opcional)</label>
                <input type="date" value={form.fecha_fin} onChange={e => setForm({...form, fecha_fin: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
              </div>
            </div>

            {/* Alcance */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">¿A qué aplica? *</label>
              <div className="flex gap-2 mb-3">
                {[{id:'producto',label:'Producto específico'},{id:'categoria',label:'Categoría'},{id:'general',label:'Toda la tienda'}].map(op => (
                  <button key={op.id} onClick={() => setForm({...form, alcance_tipo: op.id as any})}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${form.alcance_tipo === op.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                    {op.label}
                  </button>
                ))}
              </div>
              {form.alcance_tipo === 'producto' && (
                <select value={form.producto_id} onChange={e => setForm({...form, producto_id: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecciona un producto</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>)}
                </select>
              )}
              {form.alcance_tipo === 'categoria' && (
                <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecciona una categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              )}
            </div>

            {/* Campos de promoción */}
            {form.tipo_registro === 'promo' && (
              <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                <p className="text-xs font-semibold text-amber-800">Detalles de la promoción</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo de promoción *</label>
                  <select value={form.tipo_promo} onChange={e => setForm({...form, tipo_promo: e.target.value})}
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">Selecciona el tipo</option>
                    {TIPOS_PROMO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Descuento % (opcional)</label>
                    <input type="number" value={form.descuento_pct} onChange={e => setForm({...form, descuento_pct: e.target.value})}
                      placeholder="Ej. 15"
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Descuento monto fijo (opcional)</label>
                    <input type="number" value={form.monto_descuento} onChange={e => setForm({...form, monto_descuento: e.target.value})}
                      placeholder="Ej. 200.00"
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                  </div>
                </div>
                {form.tipo_promo === 'Producto cruzado' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Producto que se regala / combina</label>
                    <select value={form.producto_cruzado_id} onChange={e => setForm({...form, producto_cruzado_id: e.target.value})}
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                      <option value="">Selecciona producto</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Detalle adicional (opcional)</label>
                  <input value={form.detalle_promo} onChange={e => setForm({...form, detalle_promo: e.target.value})}
                    placeholder="Describe la promoción con más detalle..."
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                </div>
              </div>
            )}

            {/* Campos de publicidad */}
            {form.tipo_registro === 'publicidad' && (
              <div className="border border-pink-200 rounded-xl p-4 bg-pink-50 space-y-3">
                <p className="text-xs font-semibold text-pink-800">Detalles de la publicidad</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Canal de publicidad *</label>
                  <select value={form.tipo_publicidad} onChange={e => setForm({...form, tipo_publicidad: e.target.value})}
                    className="w-full border border-pink-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400">
                    <option value="">Selecciona el canal</option>
                    {TIPOS_PUB.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Costo invertido $</label>
                    <input type="number" value={form.costo_publicidad} onChange={e => setForm({...form, costo_publicidad: e.target.value})}
                      placeholder="0.00"
                      className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Alcance estimado (personas)</label>
                    <input type="number" value={form.alcance_estimado} onChange={e => setForm({...form, alcance_estimado: e.target.value})}
                      placeholder="Ej. 15000"
                      className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Detalle adicional (opcional)</label>
                  <input value={form.detalle_publicidad} onChange={e => setForm({...form, detalle_publicidad: e.target.value})}
                    placeholder="Describe la campaña con más detalle..."
                    className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"/>
                </div>
              </div>
            )}

            <button onClick={guardarRegistro} disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-xl text-sm transition-colors">
              {guardado ? '✓ Registrado correctamente' : loading ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        )}

        {/* Subir archivo */}
        {modo === 'excel' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Subir historial desde archivo</p>
              <button onClick={descargarPlantilla}
                className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                ↓ Descargar plantilla
              </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-medium">Instrucciones rápidas:</p>
              <p>1. Descarga la plantilla — incluye ejemplos, instrucciones y referencia de valores válidos</p>
              <p>2. Llena una fila por cada promoción o campaña de publicidad</p>
              <p>3. En <strong>Tipo_Registro</strong> escribe exactamente <strong>promo</strong> o <strong>publicidad</strong></p>
              <p>4. Sube el archivo — el sistema valida y reporta errores automáticamente</p>
              <p className="text-amber-700">⚠️ Si el tipo de campaña no está en la lista, puedes escribirlo libremente — el sistema lo registra igual</p>
            </div>
            <div onClick={() => document.getElementById('file-promo')?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <input id="file-promo" type="file" accept=".csv,.xlsx,.xls" className="hidden"
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
                <p className="text-xs text-gray-500 mb-2">Vista previa ({pendingRows.length} registros detectados):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50">
                      {Object.keys(preview[0]).slice(0,6).map(k => <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium">{k}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {Object.values(r).slice(0,6).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {loading && <p className="text-xs text-emerald-600 text-center">Importando registros...</p>}
            {guardado && <p className="text-xs text-emerald-600 text-center font-medium">✓ Registros importados correctamente</p>}
          </div>
        )}

        {/* Historial */}
        {modo === 'historial' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Historial de promociones y publicidad</p>
              <div className="flex gap-1">
                {[{id:'todos',label:'Todos'},{id:'promo',label:'🏷 Promos'},{id:'publicidad',label:'📢 Publicidad'}].map(f => (
                  <button key={f.id} onClick={() => setFiltroTipo(f.id as any)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filtroTipo === f.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {registrosFiltrados.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No hay registros aún.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{background:'#1a2e4a', color:'white'}}>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Nombre</th>
                        <th className="px-3 py-2 text-left">Detalle</th>
                        <th className="px-3 py-2 text-left">Alcance</th>
                        <th className="px-3 py-2 text-center">Inicio</th>
                        <th className="px-3 py-2 text-center">Fin</th>
                        <th className="px-3 py-2 text-right">Descuento</th>
                        <th className="px-3 py-2 text-right">Costo pub.</th>
                        <th className="px-3 py-2 text-right">Alcance est.</th>
                        <th className="px-3 py-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrosFiltrados.map((reg, i) => (
                        <tr key={reg.id} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reg.tiene_promo ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700'}`}>
                              {reg.tiene_promo ? '🏷 Promo' : '📢 Publicidad'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">{reg.nombre || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {reg.tiene_promo ? reg.tipo_promo : reg.tipo_publicidad}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {reg.alcance_tipo === 'producto'
                              ? reg.productos?.nombre || '—'
                              : reg.alcance_tipo === 'categoria'
                              ? reg.categoria
                              : 'Toda la tienda'
                            }
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">
                            {reg.fecha_inicio ? new Date(reg.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">
                            {reg.fecha_fin ? new Date(reg.fecha_fin + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-700">
                            {reg.descuento_pct ? `${reg.descuento_pct}%` : reg.monto_descuento ? `$${reg.monto_descuento}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-pink-700">
                            {reg.costo_publicidad ? `$${reg.costo_publicidad?.toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {reg.alcance_estimado ? reg.alcance_estimado?.toLocaleString('es-MX') : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => eliminarRegistro(reg.id)} className="text-xs text-gray-300 hover:text-red-400">Eliminar</button>
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

      </div>
    </main>
  )
}
