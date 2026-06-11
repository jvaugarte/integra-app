'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type Cliente = {
  id: string
  empresa: string
  estado?: string | null
  [key: string]: any
}

type Proyecto = {
  id: string
  cliente_id?: string | null
  etapa_actual: number
  semana_actual: number
  total_semanas: number
  avance_pct: number
  fecha_inicio: string
  fecha_estimada_fin?: string | null
  [key: string]: any
}

type PaiAccion = {
  id: string
  accion: string
  responsable?: string | null
  completada: boolean
  [key: string]: any
}

type Kpi = {
  id?: string
  area: string
  nombre: string
  valor_actual: number
  valor_base: number
  meta: number
  [key: string]: any
}

type Entregable = {
  id?: string
  nombre: string
  tipo?: string | null
  fecha_entrega?: string | null
  entregado: boolean
  [key: string]: any
}

type TabInicioProps = {
  proyecto: Proyecto
}

type ProyectoIdProps = {
  proyectoId: string
}

type TabAsistenteProps = {
  proyecto: Proyecto
  cliente: Cliente
}

type TabRedirigirProps = {
  url: string
}

const tabs = ['Inicio', 'Etapas', 'Plan de acción', 'KPIs', 'Entregables', 'Catálogo', 'Ventas', 'inventario', 'Precios', 'Matriz', 'Asistente IA']

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [tab, setTab] = useState('Inicio')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    async function cargarDatos() {
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('*')
        .limit(1)
        .single()
      setCliente((clienteData as Cliente) || null)

      if (clienteData) {
        const { data: proyectoData } = await supabase
          .from('proyectos')
          .select('*')
          .eq('cliente_id', clienteData.id)
          .limit(1)
          .single()
        setProyecto((proyectoData as Proyecto) || null)
      }
    }
    cargarDatos()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user || !cliente || !proyecto) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Cargando...</p>
    </div>
  )

  const etapas = ['Diagnóstico 360°', 'Mapa de brechas y PAI', 'Implementación', 'Seguimiento']
  const etapaActual = etapas[proyecto.etapa_actual - 1]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-emerald-700 font-semibold text-xs">IE</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">INTEGRA</p>
            <p className="text-xs text-gray-400">Portal de acompañamiento</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">
          Cerrar sesión
        </button>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center text-xs font-medium text-emerald-700">
            {cliente.empresa.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{cliente.empresa}</p>
            <p className="text-xs text-gray-400">Semana {proyecto.semana_actual} de {proyecto.total_semanas} · Etapa {proyecto.etapa_actual} — {etapaActual}</p>
          </div>
        </div>
        <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">{cliente.estado}</span>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs py-3 px-4 border-b-2 transition-colors ${tab === t ? 'border-emerald-500 text-gray-900 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {tab === 'Inicio' && <TabInicio proyecto={proyecto} />}
        {tab === 'Etapas' && <TabEtapas />}
        {tab === 'Plan de acción' && <TabPAI proyectoId={proyecto.id} />}
        {tab === 'KPIs' && <TabKPIs proyectoId={proyecto.id} />}
        {tab === 'Entregables' && <TabEntregables proyectoId={proyecto.id} />}
        {tab === 'Catálogo'   && <TabRedirigir url="/dashboard/productos" />}
        {tab === 'Ventas'     && <TabVentas />}
        {tab === 'inventario' && <TabRedirigir url="/dashboard/inventario" />}
        {tab === 'Precios'    && <TabRedirigir url="/dashboard/precios" />}
        {tab === 'Matriz'     && <TabRedirigir url="/dashboard/matriz" />}
        {tab === 'Asistente IA' && <TabAsistente proyecto={proyecto} cliente={cliente} />}
      </div>
    </main>
  )
}

function TabInicio({ proyecto }: TabInicioProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Etapa actual', val: `Etapa ${proyecto.etapa_actual}`, sub: 'de 4 etapas' },
          { label: 'Avance general', val: `${proyecto.avance_pct}%`, sub: `Semana ${proyecto.semana_actual} de ${proyecto.total_semanas}` },
          { label: 'Inicio del proyecto', val: new Date(proyecto.fecha_inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), sub: proyecto.fecha_estimada_fin ? `Fin estimado: ${new Date(proyecto.fecha_estimada_fin).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}` : '' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className="text-lg font-semibold text-gray-900">{m.val}</p>
            <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-sm font-medium text-gray-900 mb-4">Hoja de ruta</p>
        {[
          { n: 1, title: 'Diagnóstico 360°', desc: '6 dimensiones evaluadas · Arquetipo asignado' },
          { n: 2, title: 'Mapa de brechas y PAI', desc: 'Brechas priorizadas · Business case' },
          { n: 3, title: 'Implementación', desc: 'PAI · MCES · Manual PASER · Role Charter' },
          { n: 4, title: 'Seguimiento y mejora continua', desc: 'Juntas · KPIs · COPAC · Rediagnóstico' },
        ].map(s => {
          const status = s.n < proyecto.etapa_actual ? 'done' : s.n === proyecto.etapa_actual ? 'active' : 'pending'
          return (
            <div key={s.n} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${status === 'done' ? 'bg-emerald-100 text-emerald-700' : status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                {status === 'done' ? '✓' : s.n}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${status === 'pending' ? 'text-gray-400' : 'text-gray-900'}`}>{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${status === 'done' ? 'bg-emerald-50 text-emerald-700' : status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'}`}>
                {status === 'done' ? 'Listo' : status === 'active' ? 'En curso' : 'Pendiente'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TabEtapas() {
  const dims = [
    { name: 'Comercial', score: 2.5, color: '#EF9F27' },
    { name: 'Fiscal', score: 3.2, color: '#1D9E75' },
    { name: 'Finanzas', score: 2.8, color: '#EF9F27' },
    { name: 'Operación', score: 1.9, color: '#E24B4A' },
    { name: 'Administración', score: 2.4, color: '#EF9F27' },
    { name: 'Marketing', score: 2.1, color: '#E24B4A' },
  ]
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-medium text-gray-900 mb-4">Resultado del diagnóstico — 6 dimensiones</p>
      <div className="grid grid-cols-2 gap-3">
        {dims.map(d => (
          <div key={d.name} className="border border-gray-100 rounded-xl p-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-gray-900">{d.name}</p>
              <span className="text-xs font-semibold" style={{color: d.color}}>{d.score} / 4</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 rounded-full transition-all" style={{width: `${(d.score/4)*100}%`, background: d.color}}></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">Foco dominante de debilidad: <span className="font-medium text-red-500">Operación</span></p>
    </div>
  )
}

function TabPAI({ proyectoId }: ProyectoIdProps) {
  const [acciones, setAcciones] = useState<PaiAccion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pai_acciones')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('completada', { ascending: true })
      .then(({ data }) => {
        setAcciones((data || []) as PaiAccion[])
        setLoading(false)
      })
  }, [proyectoId])

  const toggle = async (id: string, actual: boolean) => {
    await supabase.from('pai_acciones').update({ completada: !actual }).eq('id', id)
    setAcciones(prev => prev.map(a => a.id === id ? {...a, completada: !actual} : a))
  }

  const done = acciones.filter(a => a.completada).length

  if (loading) return <p className="text-sm text-gray-400">Cargando...</p>

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900">Plan de Acción Inmediata (PAI)</p>
        <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-1 rounded-full">{done} de {acciones.length}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-4">
        <div className="h-1.5 bg-emerald-500 rounded-full transition-all" style={{width: acciones.length ? `${(done/acciones.length)*100}%` : '0%'}}></div>
      </div>
      {acciones.map(a => (
        <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
          <button onClick={() => toggle(a.id, a.completada)}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${a.completada ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200'}`}>
            {a.completada && <span className="text-xs">✓</span>}
          </button>
          <p className={`text-sm flex-1 ${a.completada ? 'line-through text-gray-300' : 'text-gray-700'}`}>{a.accion}</p>
          <span className="text-xs text-gray-400">{a.responsable}</span>
        </div>
      ))}
    </div>
  )
}

function TabKPIs({ proyectoId }: ProyectoIdProps) {
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('kpis')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .then(({ data }) => {
        setKpis((data || []) as Kpi[])
        setLoading(false)
      })
  }, [proyectoId])

  if (loading) return <p className="text-sm text-gray-400">Cargando...</p>

  const rentabilidad = kpis.find(k => k.nombre === 'Rentabilidad neta')

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-medium text-gray-900 mb-4">Indicadores clave de desempeño</p>
      {rentabilidad && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400">Rentabilidad actual</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{rentabilidad.valor_actual}%</p>
            <p className="text-xs text-emerald-600 mt-1">+{(rentabilidad.valor_actual - rentabilidad.valor_base).toFixed(1)} pp desde inicio</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400">Meta INTEGRA</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{rentabilidad.meta}%</p>
            <p className="text-xs text-gray-400 mt-1">Faltan {(rentabilidad.meta - rentabilidad.valor_actual).toFixed(1)} pp</p>
          </div>
        </div>
      )}
      {kpis.map((k, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${k.valor_actual >= k.meta * 0.8 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{k.area}</span>
          <p className="text-sm text-gray-700 flex-1">{k.nombre}</p>
          <p className="text-sm font-semibold text-gray-900">{k.valor_actual}</p>
          <p className="text-xs text-gray-400">meta {k.meta}</p>
        </div>
      ))}
    </div>
  )
}

function TabEntregables({ proyectoId }: ProyectoIdProps) {
  const [items, setItems] = useState<Entregable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('entregables')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('entregado', { ascending: false })
      .then(({ data }) => {
        setItems((data || []) as Entregable[])
        setLoading(false)
      })
  }, [proyectoId])

  if (loading) return <p className="text-sm text-gray-400">Cargando...</p>

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-medium text-gray-900 mb-4">Entregables del proyecto</p>
      {items.map((e, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
          <span className={`text-base ${e.entregado ? 'text-emerald-500' : 'text-gray-200'}`}>{e.entregado ? '✓' : '○'}</span>
          <div className="flex-1">
            <p className={`text-sm ${e.entregado ? 'text-gray-700' : 'text-gray-400'}`}>{e.nombre}</p>
            <p className="text-xs text-gray-300 mt-0.5">{e.tipo} {e.fecha_entrega ? `· ${new Date(e.fecha_entrega).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${e.entregado ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
            {e.entregado ? 'Entregado' : 'Pendiente'}
          </span>
        </div>
      ))}
    </div>
  )
}

function TabAsistente({ proyecto, cliente }: TabAsistenteProps) {
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [loading, setLoading] = useState(false)

  const sugerencias = ['¿Qué es el PAI?', '¿Cómo funciona el COPAC?', '¿Qué sigue en mi proceso?', '¿Qué es el Manual PASER?']

  const preguntar = async (texto?: string) => {
    const q = texto || pregunta
    if (!q.trim()) return
    setLoading(true)
    setRespuesta('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pregunta: q,
          contexto: `El cliente es ${cliente.empresa}, en la etapa ${proyecto.etapa_actual} de 4, semana ${proyecto.semana_actual} de ${proyecto.total_semanas}, con ${proyecto.avance_pct}% de avance.`
        })
      })
      const data = await res.json()
      setRespuesta(data.respuesta)
    } catch (e) {
      setRespuesta('Error al conectar con el asistente.')
    }
    setLoading(false)
    setPregunta('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 text-xs">IA</div>
        <p className="text-sm font-medium text-gray-900">Asistente INTEGRA</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {sugerencias.map(s => (
          <button key={s} onClick={() => preguntar(s)} className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-500 hover:text-gray-700 transition-colors">
            {s}
          </button>
        ))}
      </div>
      {respuesta && <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700 leading-relaxed">{respuesta}</div>}
      {loading && <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-400">Consultando...</div>}
      <div className="flex gap-2">
        <input type="text" value={pregunta} onChange={e => setPregunta(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && preguntar()}
          placeholder="Escribe tu pregunta..."
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button onClick={() => preguntar()} disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          Enviar
        </button>
      </div>
    </div>
  )
}
function TabRedirigir({ url }: TabRedirigirProps) {
  const router = useRouter()
  useEffect(() => { router.push(url) }, [])
  return null
}
function TabVentas() {
  const router = useRouter()
  return (
 <div className="space-y-4">
<div className="grid grid-cols-2 gap-4">
        <div onClick={() => router.push('/dashboard/ventas')}
          className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-colors">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
            <span className="text-blue-700 text-lg">📈</span>
          </div>
          <p className="text-sm font-medium text-gray-900">Registrar ventas</p>
          <p className="text-xs text-gray-400 mt-1">Captura ventas diarias, semanales o mensuales</p>
        </div>
        <div onClick={() => router.push('/dashboard/promociones')}
          className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-amber-200 hover:bg-amber-50 transition-colors">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
            <span className="text-amber-700 text-lg">📣</span>
          </div>
          <p className="text-sm font-medium text-gray-900">Promociones y publicidad</p>
          <p className="text-xs text-gray-400 mt-1">Registra campañas y correlaciona su impacto</p>
        </div>
        <div onClick={() => router.push('/dashboard/ventas?modo=analisis')}
          className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-emerald-200 hover:bg-emerald-50 transition-colors">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
            <span className="text-emerald-700 text-lg">📊</span>
          </div>
          <p className="text-sm font-medium text-gray-900">Análisis de ventas</p>
          <p className="text-xs text-gray-400 mt-1">Gráficas, KPIs y comparativos vs año anterior</p>
        </div>
        <div onClick={() => router.push('/dashboard/precios')}
          className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-purple-200 hover:bg-purple-50 transition-colors">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
            <span className="text-purple-700 text-lg">💰</span>
          </div>
          <p className="text-sm font-medium text-gray-900">Histórico de precios</p>
          <p className="text-xs text-gray-400 mt-1">Trazabilidad de precio, costo y margen por producto</p>
         </div>
      </div>
    </div>
  )
}