import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setEmailSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  if (emailSent) return (
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
        <div className="body" style={{ textAlign:'center', padding:'24px 18px' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📧</div>
          <div style={{ fontFamily:"'Anton',sans-serif", fontSize:20, letterSpacing:.5, marginBottom:8 }}>
            Revisa tu correo
          </div>
          <div style={{ color:'var(--muted)', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
            Te enviamos un link a{' '}
            <span style={{ color:'var(--lime)', fontWeight:700 }}>{email}</span>.
            <br />Haz clic en él para entrar — no necesitas contraseña.
          </div>
          <button
            className="save"
            style={{ background:'transparent', border:'1px solid var(--line)', color:'var(--muted)', fontSize:13 }}
            onClick={() => { setEmailSent(false); setEmail('') }}
          >
            Usar otro correo
          </button>
        </div>
      </div>
    </div>
  )

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
          <div style={{ marginBottom:24, textAlign:'center' }}>
            <div style={{ fontFamily:"'Anton',sans-serif", fontSize:22, letterSpacing:.5, marginBottom:6 }}>
              Bienvenido
            </div>
            <div style={{ color:'var(--muted)', fontSize:13 }}>
              Entra o crea tu cuenta en segundos
            </div>
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
              gap:10, background:'#fff', color:'#1f1f1f', border:'none', borderRadius:14,
              padding:'13px 18px', fontSize:15, fontWeight:700, cursor:'pointer',
              marginBottom:18, opacity: googleLoading ? .7 : 1,
              fontFamily:"'Archivo',sans-serif",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
            <span style={{ color:'var(--muted)', fontSize:12, fontWeight:600 }}>O</span>
            <div style={{ flex:1, height:1, background:'var(--line)' }} />
          </div>

          {/* Magic link */}
          <form onSubmit={handleMagicLink}>
            <div className="field">
              <label>Tu correo electrónico</label>
              <input
                className="inp"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </div>
            {error && <div className="err-msg">{error}</div>}
            <button className="save" type="submit" disabled={loading}>
              {loading ? 'Enviando link...' : 'Entrar con correo'}
            </button>
          </form>

          <div style={{ textAlign:'center', color:'var(--muted)', fontSize:12, marginTop:14, lineHeight:1.5 }}>
            Te enviamos un link mágico — sin contraseña.
          </div>
        </div>
      </div>
    </div>
  )
}
