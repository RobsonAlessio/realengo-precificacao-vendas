import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { Token, User } from '../../types'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: tokenData } = await api.post<Token>('/auth/login', { username, password })
      const { data: userData }  = await api.get<User>('/auth/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      setAuth(tokenData.access_token, userData)
      navigate('/app')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Erro ao conectar ao servidor'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#001e2e] flex items-center justify-center">

      {/* Gradiente de fundo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#001e2e] via-[#002b40] to-[#001018] pointer-events-none" />

      {/* Luz ambiente azul */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Ruído de textura */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="relative bg-[#001e2e]/85 backdrop-blur-3xl border border-white/10 rounded-[34px] shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] px-8 py-10">

          {/* Linha brilhante no topo */}
          <div className="absolute top-0 left-[15%] w-[70%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-[18px] bg-blue-500/10 backdrop-blur-md text-blue-400 font-outfit font-extrabold text-2xl border border-blue-400/20 shadow-[0_6px_20px_rgba(37,99,235,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] mb-4">
              P
            </div>
            <h1 className="text-white font-outfit font-bold text-xl tracking-tight">Precificação de Vendas</h1>
            <p className="text-slate-400 text-sm mt-1 font-sans">Entre com suas credenciais corporativas</p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-xs font-semibold font-sans uppercase tracking-wider px-1">
                Usuário
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nome.sobrenome"
                required
                autoFocus
                className="bg-white/5 border border-white/10 rounded-[16px] px-4 py-3 text-white text-sm font-sans placeholder-slate-500 outline-none focus:border-blue-400/40 focus:bg-white/8 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all duration-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-xs font-semibold font-sans uppercase tracking-wider px-1">
                Senha
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-white/5 border border-white/10 rounded-[16px] px-4 py-3 text-white text-sm font-sans placeholder-slate-500 outline-none focus:border-blue-400/40 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all duration-200"
              />
            </div>

            {/* Erro */}
            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-[12px] px-4 py-2.5 font-sans">
                {error}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-blue-500/80 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-sans font-semibold text-sm rounded-[16px] px-4 py-3 transition-all duration-200 shadow-[0_8px_20px_rgba(37,99,235,0.25)] hover:shadow-[0_8px_24px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>

          </form>

          {/* Rodapé */}
          <p className="text-center text-slate-600 text-xs font-sans mt-6">
            Realengo Alimentos · Uso interno
          </p>

        </div>
      </div>
    </div>
  )
}
