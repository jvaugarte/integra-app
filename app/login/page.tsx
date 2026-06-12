'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-emerald-700 font-semibold text-sm">IE</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">INTEGRA</h1>
            <p className="text-xs text-gray-500">Portal de acompañamiento</p>
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Correo</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-3 px-4 rounded-xl transition-colors"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <button
  onClick={() => router.push('/reset-password')}
  className="w-full mt-3 text-sm text-emerald-700 hover:text-emerald-800 font-medium"
>
  ¿Olvidaste tu contraseña?
</button>

        <p className="text-center text-xs text-gray-400 mt-6">
          INTEGRA Inteligencia Integral © 2025
        </p>
      </div>
    </main>
  )
}