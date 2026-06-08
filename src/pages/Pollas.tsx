import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Polla } from '../types'

function genCodigo() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function fmt(n: number) { return Number(n).toFixed(2) }

export default function Pollas() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [pollas, setPollas] = useState<Polla[]>([])
  const [loading, setLoading] = useState(true)

  const [showCrear, setShowCrear] = useState(false)
  const [nombre, setNombre] = useState('')
  const [inscripcion, setInscripcion] = useState('2')
  const [creando, setCreando] = useState(false)

  const [showUnirse, setShowUnirse] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [uniendose, setUniendose] = useState(false)
  const [error, setError] = useState('')

  const fetchPollas = async () => {
    if (!session) return
    setLoading(true)
    const { data } = await supabase
      .from('pollas')
      .select('*')
      .order('created_at', { ascending: false })
    setPollas((data || []) as Polla[])
    setLoading(false)
  }

  useEffect(() => { fetchPollas() }, [session?.user.id])

  const crearPolla = async () => {
    if (!session || !nombre.trim()) return
    setCreando(true)
    setError('')
    try {
      // 1. Verificar que el perfil existe (FK requerida por pollas.admin_id)
      const { data: perfil } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!perfil) {
        throw new Error(
          'Tu perfil no está listo todavía. Cierra sesión (botón "Salir") y vuelve a entrar con tu cuenta.'
        )
      }

      // 2. Crear la polla
      const codigoNuevo = genCodigo()
      const inscripcionNum = parseFloat(inscripcion)
      const { data: newPoll, error: errPolla } = await supabase
        .from('pollas')
        .insert({
          nombre: nombre.trim(),
          codigo: codigoNuevo,
          admin_id: session.user.id,
          inscripcion: isNaN(inscripcionNum) ? 2 : inscripcionNum,
        })
        .select('id')
        .single()
      if (errPolla) throw new Error(errPolla.message)

      // 3. Agregar al admin como miembro pagado
      const { error: errMiembro } = await supabase.from('poll_members').insert({
        poll_id: newPoll.id,
        user_id: session.user.id,
        pagado: true,
      })
      if (errMiembro) throw new Error(errMiembro.message)

      setNombre('')
      setInscripcion('2')
      setShowCrear(false)
      await fetchPollas()
      navigate(`/pollas/${newPoll.id}/admin`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido al crear la polla')
    } finally {
      setCreando(false)
    }
  }

  const unirseAPolla = async () => {
    if (!session || !codigo.trim()) return
    setUniendose(true)
    setError('')
    try {
      const { data: polla, error: errPolla } = await supabase
        .from('pollas')
        .select('id')
        .eq('codigo', codigo.trim().toUpperCase())
        .single()
      if (errPolla || !polla) throw new Error('Código no encontrado')

      const { error: errJoin } = await supabase.from('poll_members').insert({
        poll_id: polla.id,
        user_id: session.user.id,
        pagado: false,
      })
      if (errJoin && errJoin.code !== '23505') throw errJoin

      setCodigo('')
      setShowUnirse(false)
      navigate(`/pollas/${polla.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al unirse')
    } finally {
      setUniendose(false)
    }
  }

  const logout = async () => { await supabase.auth.signOut() }

  const isAdmin = (p: Polla) => p.admin_id === session?.user.id

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'18px 12px' }}>
      <div className="phone">
        <div className="bar">
          <div className="brand">
            <div className="glyph">26</div>
            <div>
              <h1 className="brand h1">Polla Mundial</h1>
              <small>{profile?.nombre || session?.user.email}</small>
            </div>
          </div>
          <button className="back-btn" onClick={logout}>Salir</button>
        </div>

        <div className="body">
          <div className="hero">
            <div className="pot" style={{ fontSize:24 }}>Mis Pollas</div>
            <div className="cap">Mundial 2026 · tus grupos</div>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button className="save" style={{ flex:1, margin:0 }} onClick={() => { setShowCrear(true); setError('') }}>
              + Crear polla
            </button>
            <button className="save ghost" style={{ flex:1, margin:0 }} onClick={() => { setShowUnirse(true); setError('') }}>
              Unirme con código
            </button>
          </div>

          {loading && (
            <div style={{ textAlign:'center', color:'var(--muted)', padding:20, fontFamily:"'Anton',sans-serif", letterSpacing:1 }}>
              CARGANDO...
            </div>
          )}

          {!loading && pollas.length === 0 && (
            <div className="acard">
              <div className="d" style={{ textAlign:'center' }}>
                Aún no tienes pollas. ¡Crea una o únete con el código de un amigo!
              </div>
            </div>
          )}

          {pollas.map(p => (
            <div
              key={p.id}
              className="acard"
              style={{ cursor:'pointer' }}
              onClick={() => navigate(isAdmin(p) ? `/pollas/${p.id}/admin` : `/pollas/${p.id}`)}
            >
              <div className="h">
                {p.nombre}
                <span className={`badge ${p.estado === 'abierta' ? 'open' : 'closed'}`}>
                  {p.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <div className="d">
                Código: <b style={{ color:'var(--txt)', fontFamily:"'Anton',sans-serif" }}>{p.codigo}</b>
                {isAdmin(p) && <> · <span style={{ color:'var(--gold)' }}>Tú eres admin</span></>}
                {' '}· {fmt(p.inscripcion)} {p.moneda} inscripción
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCrear && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">Crear polla</div>
              <button className="modal-close" onClick={() => setShowCrear(false)}>×</button>
            </div>
            <div className="field">
              <label>Nombre de la polla</label>
              <input className="inp" value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Parche del barrio · Mundial 2026" />
            </div>
            <div className="field">
              <label>Inscripción (cUSD)</label>
              <input
                className="inp"
                type="number"
                min="0"
                step="any"
                value={inscripcion}
                onChange={e => setInscripcion(e.target.value)}
                placeholder="Ej: 2"
              />
            </div>
            {error && <div className="err-msg">{error}</div>}
            <button className="save gold" onClick={crearPolla} disabled={creando || !nombre.trim()}>
              {creando ? 'Creando...' : 'Crear y entrar como admin'}
            </button>
          </div>
        </div>
      )}

      {showUnirse && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">Unirme a una polla</div>
              <button className="modal-close" onClick={() => setShowUnirse(false)}>×</button>
            </div>
            <div className="field">
              <label>Código de invitación</label>
              <input className="inp" value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ej: MUNDIAL26"
                style={{ textAlign:'center', fontFamily:"'Anton',sans-serif", fontSize:20, letterSpacing:3 }} />
            </div>
            {error && <div className="err-msg">{error}</div>}
            <button className="save" onClick={unirseAPolla} disabled={uniendose || !codigo.trim()}>
              {uniendose ? 'Buscando...' : 'Unirme'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
