'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  tabla: string
  proyectoId: string
  productos: { id: string, nombre: string, sku?: string }[]
  campoFecha?: string
  onBorrado: () => void
  modoCatalogo?: boolean
}

export default function BorradoMasivo({ tabla, proyectoId, productos, campoFecha = 'fecha', onBorrado, modoCatalogo = false }: Props) {
  const [abierto,    setAbierto]    = useState(false)
  const [modo,       setModo]       = useState<'todo'|'fechas'|'producto'|'sku'>('todo')
  const [desde,      setDesde]      = useState('')
  const [hasta,      setHasta]      = useState('')
  const [productoId, setProductoId] = useState('')
  const [skuTexto,   setSkuTexto]   = useState('')
  const [confirmTxt, setConfirmTxt] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [resultado,  setResultado]  = useState('')

  const PALABRA = 'BORRAR'

  function resetear() {
    setAbierto(false); setModo('todo'); setDesde(''); setHasta('')
    setProductoId(''); setSkuTexto(''); setConfirmTxt(''); setResultado(''); setLoading(false)
  }

  async function ejecutarBorrado() {
    if (confirmTxt !== PALABRA) return
    setLoading(true)
    setResultado('')

    try {
      // Modo SKU — solo para catálogo de productos
      if (modo === 'sku' && modoCatalogo) {
        const skus = skuTexto.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        if (!skus.length) { setLoading(false); return alert('Ingresa al menos un SKU') }

        const prodsABorrar = productos.filter(p => skus.includes((p.sku || '').toLowerCase()))
        if (!prodsABorrar.length) {
          setLoading(false)
          setResultado('❌ No se encontraron productos con esos SKUs')
          return
        }

        const ids = prodsABorrar.map(p => p.id)
        const { error } = await supabase.from('productos')
          .update({ activo: false })
          .in('id', ids)

        if (error) { setLoading(false); setResultado(`❌ Error: ${error.message}`); return }
        setResultado(`✓ ${prodsABorrar.length} producto(s) eliminado(s) del catálogo`)
        setLoading(false)
        setTimeout(() => { resetear(); onBorrado() }, 1500)
        return
      }

      // Modo todo — catálogo
      if (modo === 'todo' && modoCatalogo) {
        const { error } = await supabase.from('productos')
          .update({ activo: false })
          .eq('proyecto_id', proyectoId)
        if (error) { setLoading(false); setResultado(`❌ Error: ${error.message}`); return }
        setResultado('✓ Catálogo eliminado correctamente')
        setLoading(false)
        setTimeout(() => { resetear(); onBorrado() }, 1500)
        return
      }

      // Modo producto — catálogo
      if (modo === 'producto' && modoCatalogo) {
        if (!productoId) { setLoading(false); return alert('Selecciona un producto') }
        const { error } = await supabase.from('productos')
          .update({ activo: false })
          .eq('id', productoId)
        if (error) { setLoading(false); setResultado(`❌ Error: ${error.message}`); return }
        setResultado('✓ Producto eliminado correctamente')
        setLoading(false)
        setTimeout(() => { resetear(); onBorrado() }, 1500)
        return
      }

      // Modos normales (ventas, inventario, precios, etc.)
      let deleteQuery = supabase.from(tabla).delete().eq('proyecto_id', proyectoId)

      if (modo === 'fechas') {
        if (!desde && !hasta) { setLoading(false); return alert('Ingresa al menos una fecha') }
        if (desde) {
          const [d,m,y] = desde.split('-')
          const fechaISO = y && m && d ? `${y}-${m}-${d}` : desde
          deleteQuery = deleteQuery.gte(campoFecha, fechaISO)
        }
        if (hasta) {
          const [d,m,y] = hasta.split('-')
          const fechaISO = y && m && d ? `${y}-${m}-${d}` : hasta
          deleteQuery = deleteQuery.lte(campoFecha, fechaISO)
        }
      }

      if (modo === 'producto') {
        if (!productoId) { setLoading(false); return alert('Selecciona un producto') }
        deleteQuery = deleteQuery.eq('producto_id', productoId)
      }

      const { error: delError } = await deleteQuery
      if (delError) { setLoading(false); setResultado(`❌ Error: ${delError.message}`); return }

      setResultado('✓ Registros eliminados correctamente')
      setLoading(false)
      setTimeout(() => { resetear(); onBorrado() }, 1500)

    } catch (e: any) {
      setLoading(false)
      setResultado(`❌ Error: ${e.message}`)
    }
  }

  const nombreTabla: Record<string, string> = {
    ventas: 'Ventas',
    inventario: 'Inventario disponible',
    inventario_pendiente: 'Inventario pendiente',
    promociones_publicidad: 'Promociones y publicidad',
    historico_precios: 'Histórico de precios',
    productos: 'Catálogo de productos',
  }

  const nombreSeccion = modoCatalogo ? 'Catálogo de productos' : (nombreTabla[tabla] || tabla)

  // Opciones según contexto
  const opciones = modoCatalogo
    ? [
        { id:'todo',     label:'Todo el catálogo',      icon:'🗂' },
        { id:'sku',      label:'Por SKU(s)',             icon:'🔖' },
        { id:'producto', label:'Por producto',           icon:'📦' },
      ]
    : [
        { id:'todo',     label:'Todo el historial',      icon:'🗂' },
        { id:'fechas',   label:'Por rango de fechas',    icon:'📅' },
        { id:'producto', label:'Por producto',           icon:'📦' },
      ]

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors font-medium">
        🗑 Borrar registros
      </button>

      {abierto && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-xl">🗑</div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Borrado masivo</p>
                <p className="text-xs text-gray-400">{nombreSeccion}</p>
              </div>
            </div>

            {/* Advertencia */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
              ⚠️ Esta acción es <strong>irreversible</strong>. Los registros eliminados no se pueden recuperar.
            </div>

            {/* Selector de modo */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">¿Qué quieres borrar?</label>
              <div className="flex flex-col gap-2">
                {opciones.map(op => (
                  <button key={op.id} onClick={() => setModo(op.id as any)}
                    style={{
                      background: modo === op.id ? '#dc2626' : op.id === 'todo' ? '#fef2f2' : 'white',
                      color: modo === op.id ? 'white' : op.id === 'todo' ? '#dc2626' : '#6b7280',
                      border: op.id === 'todo' ? '2px solid #dc2626' : '1px solid #e5e7eb',
                      borderRadius:'12px', padding:'10px 12px', fontSize:'12px', fontWeight:500,
                      textAlign:'left', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer'
                    }}>
                    <span>{op.icon}</span> {op.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Campos según modo */}
            {modo === 'todo' && (
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                Se eliminarán <strong>todos los registros</strong> de {nombreSeccion} para este proyecto.
              </div>
            )}

            {modo === 'fechas' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Desde (DD-MM-AAAA)</label>
                    <input type="text" value={desde} onChange={e => setDesde(e.target.value)}
                      placeholder="01-01-2025"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Hasta (DD-MM-AAAA)</label>
                    <input type="text" value={hasta} onChange={e => setHasta(e.target.value)}
                      placeholder="31-12-2025"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"/>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Puedes dejar uno vacío para borrar desde el inicio o hasta el final.</p>
              </div>
            )}

            {modo === 'producto' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Producto</label>
                <select value={productoId} onChange={e => setProductoId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">Selecciona un producto</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {modoCatalogo ? 'Se eliminará este producto del catálogo.' : 'Se eliminarán todos los registros de este producto.'}
                </p>
              </div>
            )}

            {modo === 'sku' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">SKU(s) a eliminar</label>
                <textarea value={skuTexto} onChange={e => setSkuTexto(e.target.value)}
                  placeholder="Ej: HAR-LH-001, PER-TR-014, ALM-DD-008"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"/>
                <p className="text-xs text-gray-400 mt-1">Separa múltiples SKUs con coma. Un solo SKU también funciona.</p>
                {skuTexto && (
                  <div className="mt-2 bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 mb-1">Productos encontrados:</p>
                    {skuTexto.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).map(sku => {
                      const prod = productos.find(p => (p.sku || '').toLowerCase() === sku)
                      return (
                        <p key={sku} className={`text-xs ${prod ? 'text-emerald-700' : 'text-red-500'}`}>
                          {prod ? `✓ ${prod.nombre} (${prod.sku})` : `✗ SKU no encontrado: ${sku}`}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Confirmación */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Escribe <strong className="text-red-600">{PALABRA}</strong> para confirmar
              </label>
              <input value={confirmTxt} onChange={e => setConfirmTxt(e.target.value)}
                placeholder={PALABRA}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
            </div>

            {resultado && (
              <p className={`text-xs font-medium text-center ${resultado.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {resultado}
              </p>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button onClick={resetear}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={ejecutarBorrado}
                disabled={confirmTxt !== PALABRA || loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-200 disabled:text-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {loading ? 'Borrando...' : 'Confirmar borrado'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
