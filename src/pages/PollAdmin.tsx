import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Polla, Partido, PollMemberWithProfile, TablaRow, Alcance } from '../types'

const ALCANCE_OPTS: { id: Alcance; ico: string; title: string; desc: string }[] = [
  { id: 'mundial',       ico: '🌍', title: 'Todo el Mundial',     desc: 'Todos los partidos: grupos + eliminatorias' },
  { id: 'grupos',        ico: '🏟️', title: 'Solo Fase de Grupos', desc: 'Solo los 48 partidos de la fase de grupos' },
  { id: 'eliminatorias', ico: '⚡', title: 'Solo Eliminatorias',   desc: 'Desde los 32avos hasta la gran final' },
  { id: 'seleccion',     ico: '🎯', title: 'Partidos a elegir',    desc: 'Marcá manualmente cuáles partidos entran' },
]

function isGrupo(fase: string) { return /grupo/i.test(fase) }

const AVCOLS = ['#ffc24b','#d7ff3e','#37e29a','#ff8a3d','#7aa2ff','#ff5a5f','#b48bff','#4be0d6','#ff9ec4','#9bd35a']
const MEDALS = ['🥇','🥈','🥉']

function fmt(n: number) { return Number(n).toFixed(2) }

function Toast({ msg }: { msg: string }) {
  return (
    <div className={`toast-wrap ${msg ? 'show' : ''}`}>
      <span className="toast-dot" />
      {msg}
    </div>
  )
}

export default function PollAdmin() {
  const { id: pollId } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [poll, setPoll] = useState<Polla | null>(null)
  const [matches, setMatches] = useState<Partido[]>([])
  const [members, setMembers] = useState<PollMemberWithProfile[]>([])
  const [tabla, setTabla] = useState<TablaRow[]>([])
  const [activeTab, setActiveTab] = useState<'matches' | 'rules' | 'people' | 'close'>('matches')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const [matchScores, setMatchScores] = useState<Record<string, { local: number; visitante: number }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const [exacto, setExacto] = useState(5)
  const [resultado, setResultado] = useState(3)
  const [fallo, setFallo] = useState(0)
  const [prem0, setPrem0] = useState(50)
  const [prem1, setPrem1] = useState(30)
  const [prem2, setPrem2] = useState(20)
  const [inscFee, setInscFee] = useState(2)
  const [alcanceOp, setAlcanceOp] = useState<Alcance>('mundial')
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [savingRules, setSavingRules] = useState(false)

  const [closing, setClosing] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }

  const loadTabla = useCallback(async () => {
    if (!pollId) return
    const { data } = await supabase.rpc('fn_tabla_posiciones', { p_poll_id: pollId })
    setTabla((data || []) as TablaRow[])
  }, [pollId])

  const loadAll = useCallback(async () => {
    if (!session || !pollId) return
    setLoading(true)

    const [
      { data: pollData },
      { data: matchesData },
      { data: membersData },
    ] = await Promise.all([
      supabase.from('pollas').select('*').eq('id', pollId).single(),
      supabase.from('partidos').select('*').order('orden'),
      supabase.from('poll_members').select('*, profiles(nombre)').eq('poll_id', pollId).order('joined_at'),
    ])

    const p = pollData as Polla | null
    const ms = (matchesData || []) as Partido[]
    setPoll(p)
    setMatches(ms)
    setMembers((membersData || []) as PollMemberWithProfile[])

    const scores: Record<string, { local: number; visitante: number }> = {}
    ms.forEach(m => {
      scores[m.id] = {
        local: m.resultado_local ?? 0,
        visitante: m.resultado_visitante ?? 0,
      }
    })
    setMatchScores(scores)

    if (p) {
      setExacto(p.reglas.exacto)
      setResultado(p.reglas.resultado)
      setFallo(p.reglas.fallo)
      const premios = p.premios as number[]
      setPrem0(premios[0] ?? 50)
      setPrem1(premios[1] ?? 30)
      setPrem2(premios[2] ?? 20)
      setInscFee(p.inscripcion)
      setAlcanceOp(p.reglas.alcance ?? 'mundial')
      setSelectedMatchIds(p.reglas.partidos_seleccionados ?? [])
    }

    await loadTabla()
    setLoading(false)
  }, [session, pollId, loadTabla])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!loading && poll && poll.admin_id !== session?.user.id) {
      navigate(`/pollas/${pollId}`)
    }
  }, [loading, poll, session, pollId, navigate])

  const updateScore = (matchId: string, side: 'local' | 'visitante', delta: number) => {
    setMatchScores(prev => {
      const cur = prev[matchId] || { local: 0, visitante: 0 }
      return { ...prev, [matchId]: { ...cur, [side]: Math.max(0, cur[side] + delta) } }
    })
  }

  const submitResult = async (match: Partido) => {
    const score = matchScores[match.id]
    if (!score) return
    setSubmitting(match.id)
    const { error } = await supabase.from('partidos').update({
      resultado_local: score.local,
      resultado_visitante: score.visitante,
      cerrado: true,
    }).eq('id', match.id)
    setSubmitting(null)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${match.equipo_local} ${score.local}–${score.visitante} ${match.equipo_visitante} · cerrado`)
    await loadAll()
  }

  const reopenMatch = async (matchId: string) => {
    const { error } = await supabase.from('partidos').update({
      resultado_local: null,
      resultado_visitante: null,
      cerrado: false,
    }).eq('id', matchId)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Partido reabierto')
    await loadAll()
  }

  const togglePagado = async (member: PollMemberWithProfile) => {
    const { error } = await supabase.from('poll_members')
      .update({ pagado: !member.pagado })
      .eq('poll_id', pollId!)
      .eq('user_id', member.user_id)
    if (error) { showToast('Error: ' + error.message); return }
    setMembers(prev => prev.map(m =>
      m.user_id === member.user_id ? { ...m, pagado: !m.pagado } : m
    ))
    await loadTabla()
  }

  const saveRules = async () => {
    if (!pollId) return
    setSavingRules(true)
    const { error } = await supabase.from('pollas').update({
      reglas: {
        exacto, resultado, fallo,
        alcance: alcanceOp,
        partidos_seleccionados: alcanceOp === 'seleccion' ? selectedMatchIds : [],
      },
      premios: [prem0, prem1, prem2],
      inscripcion: inscFee,
    }).eq('id', pollId)
    setSavingRules(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Reglas guardadas ✓')
    await loadAll()
  }

  const toggleMatchSelection = (matchId: string) => {
    setSelectedMatchIds(prev =>
      prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId]
    )
  }

  const cerrarPolla = async () => {
    if (!pollId) return
    if (!confirm('¿Cerrar la polla y repartir el bote? Esta acción no se puede deshacer fácilmente.')) return
    setClosing(true)
    const { error } = await supabase.rpc('fn_cerrar_polla', { p_poll_id: pollId })
    setClosing(false)
    if (error) { showToast('Error al cerrar: ' + error.message); return }
    showToast('¡Polla cerrada! Ganadores registrados.')
    await loadAll()
    setActiveTab('close')
  }

  const reabrirPolla = async () => {
    if (!pollId) return
    const { error } = await supabase.from('pollas').update({ estado: 'abierta' }).eq('id', pollId)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Polla reabierta')
    await loadAll()
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ color:'var(--muted)', fontFamily:"'Anton',sans-serif", fontSize:14, letterSpacing:1 }}>CARGANDO...</div>
    </div>
  )

  if (!poll) return null

  const premios = poll.premios as number[]
  const pagados = members.filter(m => m.pagado)
  const bote = pagados.length * poll.inscripcion
  const nPremios = premios.filter(p => p > 0).length
  const closedCount = matches.filter(m => m.cerrado).length
  const sumaP = prem0 + prem1 + prem2

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'18px 12px' }}>
      <div className="phone">
        <div className="bar">
          <div className="brand">
            <div className="glyph admin">🛡️</div>
            <div>
              <h1 className="brand h1">{poll.nombre}</h1>
              <small>Admin · #{poll.codigo}</small>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end' }}>
            <button className="back-btn" onClick={() => navigate('/pollas')}>← Salir</button>
            <button className="back-btn" style={{ color:'var(--lime)', borderColor:'rgba(200,255,60,.3)' }}
              onClick={() => navigate(`/pollas/${pollId}`)}>
              Vista jugador
            </button>
          </div>
        </div>

        <div className="body">
          {/* Header card */}
          <div className="acard" style={{ borderColor:'rgba(255,194,75,.25)', background:'rgba(255,194,75,.04)' }}>
            <div className="h">
              {poll.nombre}
              <span className={`badge ${poll.estado === 'abierta' ? 'open' : 'closed'}`}>
                {poll.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
            <div className="d">
              Código: <b style={{ color:'var(--txt)', fontFamily:"'Anton',sans-serif", letterSpacing:2 }}>{poll.codigo}</b>
              {' '}· inscripción {fmt(poll.inscripcion)} {poll.moneda}
              {' '}· premios {premios.filter(p => p > 0).join('/')}%
            </div>
            <div className="statgrid">
              <div className="pill"><div className="v">{fmt(bote)}</div><div className="k">Bote {poll.moneda}</div></div>
              <div className="pill"><div className="v">{pagados.length}</div><div className="k">Pagados</div></div>
              <div className="pill"><div className="v">{closedCount}/{matches.length}</div><div className="k">Partidos OK</div></div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs admin">
            <div className={`tab ${activeTab === 'matches' ? 'on' : ''}`} onClick={() => setActiveTab('matches')}>Partidos</div>
            <div className={`tab ${activeTab === 'rules' ? 'on' : ''}`} onClick={() => setActiveTab('rules')}>Reglas</div>
            <div className={`tab ${activeTab === 'people' ? 'on' : ''}`} onClick={() => setActiveTab('people')}>Gente</div>
            <div className={`tab ${activeTab === 'close' ? 'on' : ''}`} onClick={() => setActiveTab('close')}>Cierre</div>
          </div>

          {/* ---- TAB: Partidos ---- */}
          {activeTab === 'matches' && (
            <div>
              {matches.map(m => {
                const score = matchScores[m.id] || { local: 0, visitante: 0 }
                const isSubmitting = submitting === m.id
                return (
                  <div key={m.id} className={`match ${m.cerrado ? 'locked' : ''}`}>
                    <div className="when">
                      <span>{m.fecha} · {m.fase}</span>
                      {m.cerrado
                        ? <span className="lockchip">🔒 cerrado</span>
                        : m.destacado ? <span className="star">⭐ Colombia</span> : null}
                    </div>
                    <div className="teams">
                      <div className="team">
                        <div className="fl">{m.flag_local}</div>
                        <div className="tn">{m.equipo_local}</div>
                      </div>
                      <div className="step">
                        <button onClick={() => updateScore(m.id, 'local', -1)} disabled={m.cerrado || score.local === 0}>−</button>
                        <div className="sv">{score.local}</div>
                        <button onClick={() => updateScore(m.id, 'local', 1)} disabled={m.cerrado}>+</button>
                      </div>
                      <div className="midv">:</div>
                      <div className="step">
                        <button onClick={() => updateScore(m.id, 'visitante', -1)} disabled={m.cerrado || score.visitante === 0}>−</button>
                        <div className="sv">{score.visitante}</div>
                        <button onClick={() => updateScore(m.id, 'visitante', 1)} disabled={m.cerrado}>+</button>
                      </div>
                      <div className="team">
                        <div className="fl">{m.flag_visitante}</div>
                        <div className="tn">{m.equipo_visitante}</div>
                      </div>
                    </div>
                    {m.cerrado
                      ? <div className="ofline set">Resultado oficial: {m.resultado_local}–{m.resultado_visitante}</div>
                      : <div className="ofline pend">Sin resultado oficial</div>}

                    {/* Admin-only action box */}
                    <div className="admin-box">
                      <div className="admin-box-label">🛡️ Acción de admin</div>
                      <div className="of-set" style={{ margin:0 }}>
                        {m.cerrado ? (
                          <button className="btnmini" onClick={() => reopenMatch(m.id)}>Reabrir partido</button>
                        ) : (
                          <button className="btnmini gold" onClick={() => submitResult(m)} disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Registrar resultado oficial'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="lockmsg" style={{ marginTop:8 }}>
                Al registrar el resultado, el partido se cierra y se calculan los puntos automáticamente.
              </div>
            </div>
          )}

          {/* ---- TAB: Reglas ---- */}
          {activeTab === 'rules' && (
            <div>
              {/* Alcance de la polla */}
              <div className="acard">
                <div className="h">Alcance de la polla</div>
                <div className="d" style={{ marginBottom:10 }}>
                  Define sobre qué partidos del Mundial aplica esta polla. Se puede cambiar mientras esté abierta.
                </div>
                {ALCANCE_OPTS.map(o => (
                  <div key={o.id} className={`scope-opt ${alcanceOp === o.id ? 'on' : ''}`}
                    onClick={() => setAlcanceOp(o.id)}>
                    <div className="sico">{o.ico}</div>
                    <div className="sinfo">
                      <div className="stitle">{o.title}</div>
                      <div className="sdesc">{o.desc}</div>
                    </div>
                    <div className="scheck" />
                  </div>
                ))}

                {/* Selección manual de partidos */}
                {alcanceOp === 'seleccion' && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase',
                      letterSpacing:1, marginBottom:8 }}>
                      Elegí los partidos ({selectedMatchIds.length} seleccionados)
                    </div>
                    {/* Group stage */}
                    {matches.some(m => isGrupo(m.fase)) && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:1, marginBottom:4 }}>Fase de Grupos</div>
                        {matches.filter(m => isGrupo(m.fase)).map(m => (
                          <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'6px 8px', borderRadius:8, cursor:'pointer',
                            background: selectedMatchIds.includes(m.id) ? 'rgba(255,194,75,.07)' : 'transparent',
                            marginBottom:2 }}>
                            <input type="checkbox" checked={selectedMatchIds.includes(m.id)}
                              onChange={() => toggleMatchSelection(m.id)}
                              style={{ accentColor:'var(--gold)', width:14, height:14 }} />
                            <span style={{ fontSize:11 }}>
                              {m.flag_local} {m.equipo_local} vs {m.equipo_visitante} {m.flag_visitante}
                            </span>
                            <span style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>{m.fecha}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {/* Knockout */}
                    {matches.some(m => !isGrupo(m.fase)) && (
                      <div>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:1, marginBottom:4 }}>Eliminatorias</div>
                        {matches.filter(m => !isGrupo(m.fase)).map(m => (
                          <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'6px 8px', borderRadius:8, cursor:'pointer',
                            background: selectedMatchIds.includes(m.id) ? 'rgba(255,194,75,.07)' : 'transparent',
                            marginBottom:2 }}>
                            <input type="checkbox" checked={selectedMatchIds.includes(m.id)}
                              onChange={() => toggleMatchSelection(m.id)}
                              style={{ accentColor:'var(--gold)', width:14, height:14 }} />
                            <span style={{ fontSize:11 }}>
                              {m.flag_local} {m.equipo_local} vs {m.equipo_visitante} {m.flag_visitante}
                            </span>
                            <span style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>{m.fecha}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {matches.length === 0 && (
                      <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:12 }}>
                        Los partidos se cargan cuando estén disponibles.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="acard">
                <div className="h">Puntuación</div>
                <div className="d">Cuántos puntos vale cada acierto. Visible para todos los miembros.</div>
                <div className="rulegrid" style={{ marginTop:12 }}>
                  <div className="field">
                    <label>Exacto</label>
                    <input className="inp" type="number" min="0" value={exacto}
                      onChange={e => setExacto(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Resultado</label>
                    <input className="inp" type="number" min="0" value={resultado}
                      onChange={e => setResultado(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Fallo</label>
                    <input className="inp" type="number" min="0" value={fallo}
                      onChange={e => setFallo(+e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="acard">
                <div className="h">Inscripción y premios</div>
                <div className="d">Pon 0% en 2° o 3° si quieres un único ganador.</div>
                <div className="field" style={{ marginTop:12 }}>
                  <label>Inscripción ({poll.moneda})</label>
                  <input className="inp" type="number" min="0" step="0.5" value={inscFee}
                    onChange={e => setInscFee(+e.target.value)} />
                </div>
                <div className="rulegrid">
                  <div className="field">
                    <label>1° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem0}
                      onChange={e => setPrem0(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>2° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem1}
                      onChange={e => setPrem1(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>3° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem2}
                      onChange={e => setPrem2(+e.target.value)} />
                  </div>
                </div>
                {sumaP !== 100 && (
                  <div className="splitwarn">⚠ Los porcentajes suman {sumaP}%. Deben sumar 100%.</div>
                )}
              </div>

              <div className="admin-box" style={{ marginBottom:12 }}>
                <div className="admin-box-label">🛡️ Acción de admin</div>
                <button className="save gold" onClick={saveRules} disabled={savingRules || sumaP !== 100} style={{ margin:0 }}>
                  {savingRules ? 'Guardando...' : 'Guardar reglas'}
                </button>
              </div>
            </div>
          )}

          {/* ---- TAB: Gente ---- */}
          {activeTab === 'people' && (
            <div>
              <div className="acard">
                <div className="h">
                  Participantes
                  <span className="badge open">{members.length} total</span>
                </div>
                <div className="d">
                  Solo los que pagaron compiten por el bote ({pagados.length} pagados · {members.length - pagados.length} pendientes).
                </div>
                <div style={{ marginTop:8 }}>
                  {members.map((m, i) => {
                    const isAdminUser = m.user_id === poll.admin_id
                    const tableRow = tabla.find(r => r.user_id === m.user_id)
                    return (
                      <div key={m.user_id} className="prow">
                        <div className="av" style={{ background: AVCOLS[i % AVCOLS.length] }}>
                          {(m.profiles?.nombre?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="pinfo">
                          <div className="pn" style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            {m.profiles?.nombre || '—'}
                            {m.user_id === session?.user.id ? <span style={{ color:'var(--muted)', fontSize:10 }}>· tú</span> : ''}
                            {isAdminUser && <span className="admin-chip" style={{ fontSize:8, padding:'2px 6px' }}>admin</span>}
                          </div>
                          <div className="pmeta">
                            {tableRow?.puntos ?? 0} pts · se unió {new Date(m.joined_at).toLocaleDateString('es-CO')}
                          </div>
                        </div>
                        <div className="admin-box" style={{ margin:0, padding:'4px 8px', display:'flex', alignItems:'center' }}>
                          <button
                            className={`toggle ${m.pagado ? 'paid' : 'unpaid'}`}
                            onClick={() => togglePagado(m)}
                          >
                            {m.pagado ? 'Pagó ✓' : 'Pendiente'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="scoring">
                <span className="ttl">Código de invitación</span>
                Comparte este código para que otros se unan:{' '}
                <b style={{ fontFamily:"'Anton',sans-serif", fontSize:16, letterSpacing:3 }}>{poll.codigo}</b>
              </div>

              {/* Activity summary */}
              <div className="acard" style={{ marginTop:10 }}>
                <div className="h">Resumen de actividad</div>
                <div style={{ marginTop:8 }}>
                  {members.map((m, i) => (
                    <div key={m.user_id} style={{ display:'flex', justifyContent:'space-between',
                      padding:'6px 0', borderBottom:'1px solid var(--line)', fontSize:11 }}>
                      <span style={{ color:'var(--muted)' }}>
                        {(m.profiles?.nombre?.[0] || '?').toUpperCase()}{' '}
                        <b style={{ color:'var(--txt)' }}>{m.profiles?.nombre || '—'}</b>
                      </span>
                      <span style={{ color: m.pagado ? 'var(--win)' : 'var(--lose)', fontWeight:700 }}>
                        {m.pagado ? '✓ Pagó' : '⏳ Pendiente'}
                        {' · '}
                        <span style={{ color:'var(--muted)', fontWeight:400 }}>
                          {new Date(m.joined_at).toLocaleDateString('es-CO', { day:'numeric', month:'short' })}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- TAB: Cierre ---- */}
          {activeTab === 'close' && (
            <div>
              {poll.estado === 'abierta' ? (
                <>
                  <div className="acard">
                    <div className="h">Vista previa del podio</div>
                    <div className="d">
                      Si cerraras ahora, el bote de <b style={{ color:'var(--gold)' }}>{fmt(bote)} {poll.moneda}</b> se repartiría así.
                      {matches.filter(m => !m.cerrado).length > 0 && (
                        <> Quedan <b style={{ color:'var(--gold)' }}>{matches.filter(m => !m.cerrado).length}</b> partido(s) sin resultado.</>
                      )}
                    </div>
                  </div>

                  {tabla.length > 0 && (
                    <div className="podium-wrap">
                      {tabla.slice(0, nPremios).map((row, i) => (
                        <div key={row.user_id} className={`wcard g${i + 1}`}>
                          <div className="wmedal">{MEDALS[i]}</div>
                          <div className="winfo">
                            <div className="wname">{row.nombre}</div>
                            <div className="wsub">{row.puntos} pts · {row.exactos} exactos</div>
                          </div>
                          <div className="wprize">
                            <div className="pa">{fmt(bote * premios[i] / 100)}</div>
                            <div className="pl">{poll.moneda}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {tabla.length === 0 && (
                    <div className="acard">
                      <div className="d" style={{ textAlign:'center' }}>
                        No hay miembros pagados con partidos cerrados aún.
                      </div>
                    </div>
                  )}

                  <div className="admin-box" style={{ marginBottom:8 }}>
                    <div className="admin-box-label">🛡️ Acción de admin · irreversible</div>
                    <button className="save gold" onClick={cerrarPolla} disabled={closing || pagados.length === 0} style={{ margin:0 }}>
                      {closing ? 'Cerrando...' : 'Cerrar polla y repartir el bote'}
                    </button>
                    <div className="lockmsg" style={{ marginTop:6 }}>
                      Cerrar bloquea todas las apuestas y confirma a los ganadores definitivamente.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="acard">
                    <div className="h">🏆 Polla cerrada <span className="badge closed">final</span></div>
                    <div className="d">
                      Bote repartido: <b style={{ color:'var(--gold)' }}>{fmt(bote)} {poll.moneda}</b>.
                    </div>
                  </div>

                  <div className="podium-wrap">
                    {tabla.slice(0, nPremios).map((row, i) => (
                      <div key={row.user_id} className={`wcard g${i + 1}`}>
                        <div className="wmedal">{MEDALS[i]}</div>
                        <div className="winfo">
                          <div className="wname">{row.nombre}</div>
                          <div className="wsub">{row.puntos} pts · {row.exactos} exactos</div>
                        </div>
                        <div className="wprize">
                          <div className="pa">{fmt(bote * premios[i] / 100)}</div>
                          <div className="pl">{poll.moneda}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-box" style={{ marginBottom:8 }}>
                    <div className="admin-box-label">🛡️ Acción de admin</div>
                    <button className="save ghost" onClick={reabrirPolla} style={{ margin:0 }}>Reabrir polla</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <Toast msg={toast} />
      </div>
    </div>
  )
}
