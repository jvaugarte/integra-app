'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
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

        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Bienvenido
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          Accede a tu portal para dar seguimiento a tu proceso de consultoría.
        </p>

        <button 
  onClick={() => window.location.href = '/login'}
  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-colors">
  Iniciar sesión
</button>
        <p className="text-center text-xs text-gray-400 mt-6">
          INTEGRA Inteligencia Integral © 2025
        </p>
      </div>
    </main>
  )
}