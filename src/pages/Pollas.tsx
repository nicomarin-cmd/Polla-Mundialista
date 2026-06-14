import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { WalletButton } from '../components/WalletButton'
import { isCryptoMoneda } from '../lib/celoTokens'
import type { Polla, Alcance } from '../types'

function genCodigo() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function fmt(n: number) { return Number(n).toFixed(2) }

const ALCANCE_OPTS: { id: Alcance; ico: string; title: string; desc: string }[] = [
  { id: 'mundial',       ico: '🌍', title: 'Todo el Mundial',     desc: 'Apostás en todos los partidos: grupos + eliminatorias' },
  { id: 'grupos',        ico: '🏟️', title: 'Solo Fase de Grupos', desc: 'Solo los partidos de la fase de grupos (48 partidos)' },
  { id: 'eliminatorias', ico: '⚡', title: 'Solo Eliminatorias',   desc: 'A partir de los 32avos de final hasta la gran final' },
  { id: 'seleccion',     ico: '🎯', title: 'Partidos a elegir',    desc: 'El admin elige manualmente cuáles partidos entran' },
]

function alcanceLabel(a?: Alcance) {
  return ALCANCE_OPTS.find(o => o.id === a)?.title ?? 'Todo el Mundial'
}

function ScopeSelector({ value, onChange }: { value: Alcance; onChange: (v: Alcance) => void }) {
  return (
    <div>
      {ALCANCE_OPTS.map(o => (
        <div key={o.id} className={`scope-opt ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          <div className="sico">{o.ico}</div>
          <div className="sinfo">
            <div className="stitle">{o.title}</div>
            <div className="sdesc">{o.desc}</div>
          </div>
          <div className="scheck" />
        </div>
      ))}
    </div>
  )
}

export default function Pollas() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [pollas, setPollas] = useState<Polla[]>([])
  const [loading, setLoading] = useState(true)

  const [showCrear, setShowCrear] = useState(false)
  const [nombre, setNombre] = useState('')
  const [inscripcion, setInscripcion] = useState('2')
  const [moneda, setMoneda] = useState('USDC-celo')
  const [alcance, setAlcance] = useState<Alcance>('mundial')
  const [creando, setCreando] = useState(false)

  const joinParam = searchParams.get('join')
  const [showUnirse, setShowUnirse] = useState(!!joinParam)
  const [codigo, setCodigo] = useState(joinParam ?? '')
  const [uniendose, setUniendose] = useState(false)
  const [error, setError] = useState('')

  const fetchPollas = async () => {
    if (!session) return
    setLoading(true)
    const { data: memberships } = await supabase
      .from('poll_members')
      .select('poll_id')
      .eq('user_id', session.user.id)
    const pollIds = (memberships || []).map(m => m.poll_id as string)
    if (pollIds.length === 0) {
      setPollas([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('pollas')
      .select('*')
      .in('id', pollIds)
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

      const codigoNuevo = genCodigo()
      const inscripcionNum = parseFloat(inscripcion)
      const { data: newPoll, error: errPolla } = await supabase
        .from('pollas')
        .insert({
          nombre: nombre.trim(),
          codigo: codigoNuevo,
          admin_id: session.user.id,
          inscripcion: isNaN(inscripcionNum) ? 2 : inscripcionNum,
          moneda,
          reglas: { exacto: 5, resultado: 3, fallo: 0, alcance },
        })
        .select('id')
        .single()
      if (errPolla) throw new Error(errPolla.message)

      const { error: errMiembro } = await supabase.from('poll_members').insert({
        poll_id: newPoll.id,
        user_id: session.user.id,
        pagado: true,
      })
      if (errMiembro) throw new Error(errMiembro.message)

      setNombre('')
      setInscripcion('2')
      setMoneda('USDC-celo')
      setAlcance('mundial')
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
        .maybeSingle()
      if (errPolla) throw new Error('Error al buscar la polla: ' + errPolla.message)
      if (!polla) throw new Error('Código no encontrado. Verifica que esté bien escrito.')

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
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <WalletButton />
            <button className="back-btn" onClick={logout}>Salir</button>
          </div>
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

          {pollas.map(p => {
            const alc = p.reglas?.alcance ?? 'mundial'
            const alcOpt = ALCANCE_OPTS.find(o => o.id === alc)
            return (
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
                  {' '}· {fmt(p.inscripcion)} {p.moneda}
                </div>
                {alcOpt && (
                  <div style={{ marginTop:6, fontSize:10, color:'var(--muted)' }}>
                    {alcOpt.ico} {alcOpt.title}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showCrear && (
        <div className="overlay">
          <div className="modal" style={{ maxHeight:'90vh', overflowY:'auto' }}>
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
              <label>Moneda</label>
              <select className="inp" value={moneda} onChange={e => setMoneda(e.target.value)}
                style={{ cursor:'pointer' }}>
                <option value="USDC-celo">USDC — Dólar digital en Celo (recomendado)</option>
                <option value="USDT-celo">USDT — Tether en Celo</option>
                <option value="cUSD">cUSD — Celo Dollar nativo</option>
              </select>
              <div style={{ marginTop:6, fontSize:10, color:'var(--lime)', background:'rgba(200,255,60,.08)',
                border:'1px solid rgba(200,255,60,.2)', borderRadius:8, padding:'7px 9px', lineHeight:1.5 }}>
                {moneda === 'cUSD'
                  ? 'Pago con cUSD en Celo. Requiere un poco de CELO para la aprobación (gas).'
                  : `Pago con ${moneda === 'USDT-celo' ? 'USDT' : 'USDC'} en Celo — sin gas para el jugador.`
                }
                {' '}Los jugadores conectan MetaMask, Coinbase Wallet o Valora.
              </div>
            </div>
            <div className="field">
              <label>Inscripción ({isCryptoMoneda(moneda) ? (moneda === 'USDT-celo' ? 'USDT' : moneda === 'cUSD' ? 'cUSD' : 'USDC') : moneda})</label>
              <input
                className="inp"
                type="number"
                min="0"
                step="any"
                value={inscripcion}
                onChange={e => setInscripcion(e.target.value)}
                placeholder="Ej: 20000"
              />
            </div>
            <div className="field">
              <label>¿Sobre qué partidos van a apostar?</label>
              <div style={{ marginTop:4 }}>
                <ScopeSelector value={alcance} onChange={setAlcance} />
              </div>
              {alcance === 'seleccion' && (
                <div style={{ marginTop:6, fontSize:10, color:'var(--gold)', background:'rgba(255,194,75,.08)',
                  border:'1px solid rgba(255,194,75,.2)', borderRadius:8, padding:'7px 9px', lineHeight:1.5 }}>
                  ⚠ Después de crear la polla, ve a Admin → Reglas para elegir los partidos específicos.
                </div>
              )}
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
