'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [sesionLista, setSesionLista] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Supabase coloca el token en la URL al abrir el enlace del correo.
    // Detectamos cuando hay una sesión de recuperación activa.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSesionLista(true)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSesionLista(true)
    })
  }, [])

  const actualizarPassword = async () => {
    setError('')
    setMensaje('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(`No se pudo actualizar la contraseña: ${error.message}`)
      return
    }

    setMensaje('Contraseña actualizada correctamente. Redirigiendo al inicio de sesión...')
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-emerald-700 font-semibold text-xs">IE</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">INTEGRA</p>
            <p className="text-xs text-gray-400">Restablecer contraseña</p>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-5">
          Escribe tu nueva contraseña para acceder a la plataforma.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 mt-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        {mensaje && (
          <p className="text-xs text-emerald-700 mt-3 bg-emerald-50 rounded-lg px-3 py-2">{mensaje}</p>
        )}

        <button
          onClick={actualizarPassword}
          disabled={loading || !sesionLista}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 rounded-xl text-sm transition-colors mt-5"
        >
          {loading ? 'Guardando...' : 'Actualizar contraseña'}
        </button>

        {!sesionLista && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Validando enlace de recuperación...
          </p>
        )}
      </div>
    </main>
  )
}