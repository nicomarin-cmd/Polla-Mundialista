import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nombre: nombre.trim() || email.split('@')[0] } },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minHeight:'100vh', padding:'18px 12px', justifyContent:'center' }}>
      <div className="phone" style={{ maxWidth:392 }}>
        <div className="bar">
          <div className="brand">
            <div className="glyph">26</div>
            <div>
              <h1 className="brand h1">Polla Mundial</h1>
              <small>Mundial 2026</small>
            </div>
          </div>
        </div>

        <div className="body">
          <div className="hero" style={{ marginBottom:20 }}>
            <div className="pot" style={{ fontSize:22 }}>Bienvenido</div>
            <div className="cap">Crea tu polla o entra a la que ya tienes</div>
          </div>

          <div className="roleswitch" style={{ maxWidth:'100%' }}>
            <button className={`rs ${mode === 'login' ? 'on' : ''}`} onClick={() => { setMode('login'); setError('') }}>
              Entrar
            </button>
            <button className={`rs ${mode === 'register' ? 'on' : ''}`} onClick={() => { setMode('register'); setError('') }}>
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="field">
                <label>Tu nombre</label>
                <input
                  className="inp"
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Mateo García"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input
                className="inp"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input
                className="inp"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && <div className="err-msg">{error}</div>}

            <button className="save" type="submit" disabled={loading}>
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar a mi polla' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
