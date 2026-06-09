import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Polla, Partido, PollMember, TablaRow, GanadorWithProfile } from '../types'

const AVCOLS = ['#ffc24b','#d7ff3e','#37e29a','#ff8a3d','#7aa2ff','#ff5a5f','#b48bff','#4be0d6','#ff9ec4','#9bd35a']
const MEDALS = ['🥇','🥈','🥉']
const ELIM = [
  { ronda:'Ronda de 32', fecha:'28 jun – 3 jul', sede:'USA · México', ico:'🎯' },
  { ronda:'Octavos de final', fecha:'4 – 7 jul', sede:'USA · México', ico:'🗓️' },
  { ronda:'Cuartos de final', fecha:'9 – 11 jul', sede:'USA', ico:'🗓️' },
  { ronda:'Semifinales', fecha:'14 – 15 jul', sede:'Dallas · Atlanta', ico:'🔥' },
  { ronda:'Tercer lugar', fecha:'18 jul', sede:'Miami', ico:'🥉' },
  { ronda:'Final', fecha:'19 jul', sede:'Nueva Jersey', ico:'🏆' },
]

type MatchSave = 'idle' | 'saving' | 'saved'
type MajData = { local: number; draw: number; visitante: number; total: number }

function fmt(n: number) { return Number(n).toFixed(2) }

function calcPoints(
  pred: { local: number; visitante: number } | undefined,
  match: Partido,
  reglas: { exacto: number; resultado: number; fallo: number }
) {
  const rl = match.resultado_local
  const rv = match.resultado_visitante
  if (rl === null || rv === null) return { pts: 0, kind: 'pendiente', tag: 'Pendiente' }
  if (!pred) return { pts: reglas.fallo, kind: 'miss', tag: 'Sin apuesta' }
  if (pred.local === rl && pred.visitante === rv)
    return { pts: reglas.exacto, kind: 'exact', tag: '¡Exacto!' }
  const so = Math.sign(rl - rv)
  const sp = Math.sign(pred.local - pred.visitante)
  if (so === sp) return { pts: reglas.resultado, kind: 'result', tag: 'Resultado ✓' }
  return { pts: reglas.fallo, kind: 'miss', tag: 'Fallaste' }
}

function Toast({ msg }: { msg: string }) {
  return (
    <div className={`toast-wrap ${msg ? 'show' : ''}`}>
      <span className="toast-dot" />
      {msg}
    </div>
  )
}

function MajorityModal({
  match, data, onClose
}: {
  match: Partido
  data: MajData
  onClose: () => void
}) {
  const { local, draw, visitante, total } = data
  const pctLocal = total ? Math.round(local / total * 100) : 0
  const pctDraw = total ? Math.round(draw / total * 100) : 0
  const pctVisit = total ? Math.round(visitante / total * 100) : 0
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Consenso del grupo</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom:6, fontSize:13, fontWeight:600 }}>
          {match.flag_local} {match.equipo_local} vs {match.equipo_visitante} {match.flag_visitante}
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:14 }}>
          {total} participante{total !== 1 ? 's' : ''} registraron apuesta
        </div>

        {[
          { label: `${match.equipo_local} gana`, pct: pctLocal, count: local, color: 'var(--lime)' },
          { label: 'Empate', pct: pctDraw, count: draw, color: 'var(--gold)' },
          { label: `${match.equipo_visitante} gana`, pct: pctVisit, count: visitante, color: 'var(--orange)' },
        ].map(row => (
          <div key={row.label} className="maj-row">
            <div className="maj-row-head">
              <span style={{ fontSize:11 }}>{row.label}</span>
              <span style={{ fontSize:11, color: row.color, fontWeight:700 }}>{row.pct}% ({row.count})</span>
            </div>
            <div className="maj-bar-bg">
              <div className="maj-bar-fill" style={{ width: `${row.pct}%`, background: row.color }} />
            </div>
          </div>
        ))}

        <div style={{ marginTop:14, fontSize:11, color:'var(--muted)', textAlign:'center' }}>
          Resultado oficial: <b style={{ color:'var(--txt)' }}>
            {match.resultado_local}–{match.resultado_visitante}
          </b>
        </div>
      </div>
    </div>
  )
}

export default function PollPlayer() {
  const { id: pollId } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [poll, setPoll] = useState<Polla | null>(null)
  const [matches, setMatches] = useState<Partido[]>([])
  const [myMember, setMyMember] = useState<PollMember | null>(null)
  const [preds, setPreds] = useState<Record<string, { local: number; visitante: number }>>({})
  const [tabla, setTabla] = useState<TablaRow[]>([])
  const [ganadores, setGanadores] = useState<GanadorWithProfile[]>([])
  const [pagadosCount, setPagadosCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'play' | 'results' | 'board'>('play')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [toast, setToast] = useState('')

  // Per-match save state
  const [matchSaveState, setMatchSaveState] = useState<Record<string, MatchSave>>({})
  // Admin display name
  const [adminName, setAdminName] = useState('')
  // Majority vote data (only for closed matches)
  const [majority, setMajority] = useState<Record<string, MajData>>({})
  const [majorityModal, setMajorityModal] = useState<string | null>(null)
  // Collapsible rules
  const [showRules, setShowRules] = useState(false)

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
    const userId = session.user.id

    const [
      { data: pollData },
      { data: matchesData },
      { data: memberData },
      { data: predsData },
      { data: membersData },
    ] = await Promise.all([
      supabase.from('pollas').select('*').eq('id', pollId).single(),
      supabase.from('partidos').select('*').order('orden'),
      supabase.from('poll_members').select('*').eq('poll_id', pollId).eq('user_id', userId).single(),
      supabase.from('predicciones').select('*').eq('poll_id', pollId).eq('user_id', userId),
      supabase.from('poll_members').select('user_id, pagado').eq('poll_id', pollId),
    ])

    const p = pollData as Polla | null
    setPoll(p)
    const ms = (matchesData || []) as Partido[]
    setMatches(ms)
    setMyMember(memberData as PollMember | null)

    const pagados = ((membersData || []) as { pagado: boolean }[]).filter(m => m.pagado).length
    setPagadosCount(pagados)

    // Build prediction map
    const predMap: Record<string, { local: number; visitante: number }> = {}
    ms.forEach(m => { predMap[m.id] = { local: 0, visitante: 0 } })
    const savedPredIds = new Set<string>()
    ;((predsData || []) as { partido_id: string; pred_local: number; pred_visitante: number }[])
      .forEach(pr => {
        predMap[pr.partido_id] = { local: pr.pred_local, visitante: pr.pred_visitante }
        savedPredIds.add(pr.partido_id)
      })
    setPreds(predMap)

    // Init per-match save state: saved if it's already in DB
    const initSaveState: Record<string, MatchSave> = {}
    ms.forEach(m => { initSaveState[m.id] = savedPredIds.has(m.id) ? 'saved' : 'idle' })
    setMatchSaveState(initSaveState)

    // Load admin name
    if (p?.admin_id) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('nombre')
        .eq('id', p.admin_id)
        .single()
      setAdminName((adminProfile as { nombre: string } | null)?.nombre || '')
    }

    await loadTabla()

    // Load majority vote data for closed matches
    const closedIds = ms.filter(m => m.cerrado).map(m => m.id)
    if (closedIds.length > 0) {
      const { data: allPredsData } = await supabase
        .from('predicciones')
        .select('partido_id, pred_local, pred_visitante')
        .eq('poll_id', pollId)
        .in('partido_id', closedIds)

      const majMap: Record<string, MajData> = {}
      closedIds.forEach(cid => {
        const matchPreds = ((allPredsData || []) as { partido_id: string; pred_local: number; pred_visitante: number }[])
          .filter(pr => pr.partido_id === cid)
        let local = 0, draw = 0, visitante = 0
        matchPreds.forEach(pr => {
          if (pr.pred_local > pr.pred_visitante) local++
          else if (pr.pred_local < pr.pred_visitante) visitante++
          else draw++
        })
        majMap[cid] = { local, draw, visitante, total: matchPreds.length }
      })
      setMajority(majMap)
    }

    if (p?.estado === 'cerrada') {
      const { data: gData } = await supabase
        .from('ganadores')
        .select('*, profiles(nombre)')
        .eq('poll_id', pollId)
        .order('puesto')
      setGanadores((gData || []) as GanadorWithProfile[])
    }

    setLoading(false)
  }, [session, pollId, loadTabla])

  useEffect(() => { loadAll() }, [loadAll])

  const updatePred = (matchId: string, side: 'local' | 'visitante', delta: number) => {
    setPreds(prev => {
      const cur = prev[matchId] || { local: 0, visitante: 0 }
      return { ...prev, [matchId]: { ...cur, [side]: Math.max(0, cur[side] + delta) } }
    })
    setMatchSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
    setSaveState('idle')
  }

  const saveSinglePred = async (matchId: string) => {
    if (!session || !pollId) return
    setMatchSaveState(prev => ({ ...prev, [matchId]: 'saving' }))
    const { error } = await supabase
      .from('predicciones')
      .upsert({
        poll_id: pollId,
        user_id: session.user.id,
        partido_id: matchId,
        pred_local: preds[matchId]?.local ?? 0,
        pred_visitante: preds[matchId]?.visitante ?? 0,
      }, { onConflict: 'poll_id,user_id,partido_id' })
    if (error) {
      setMatchSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
      showToast('Error al guardar: ' + error.message)
    } else {
      setMatchSaveState(prev => ({ ...prev, [matchId]: 'saved' }))
      showToast('Apuesta guardada ✓')
    }
  }

  const savePreds = async () => {
    if (!session || !pollId) return
    setSaving(true)
    const openMatches = matches.filter(m => !m.cerrado)
    const upsertData = openMatches.map(m => ({
      poll_id: pollId,
      user_id: session.user.id,
      partido_id: m.id,
      pred_local: preds[m.id]?.local ?? 0,
      pred_visitante: preds[m.id]?.visitante ?? 0,
    }))
    const { error } = await supabase
      .from('predicciones')
      .upsert(upsertData, { onConflict: 'poll_id,user_id,partido_id' })

    if (error) {
      setSaving(false)
      showToast('Error al guardar: ' + error.message)
      return
    }

    // Reload from DB to verify persistence
    const { data: savedData } = await supabase
      .from('predicciones')
      .select('partido_id, pred_local, pred_visitante')
      .eq('poll_id', pollId)
      .eq('user_id', session.user.id)

    if (savedData) {
      const predMap = { ...preds }
      const savedIds = new Set<string>()
      ;(savedData as { partido_id: string; pred_local: number; pred_visitante: number }[]).forEach(pr => {
        predMap[pr.partido_id] = { local: pr.pred_local, visitante: pr.pred_visitante }
        savedIds.add(pr.partido_id)
      })
      setPreds(predMap)
      setMatchSaveState(prev => {
        const next = { ...prev }
        openMatches.forEach(m => { next[m.id] = savedIds.has(m.id) ? 'saved' : 'idle' })
        return next
      })
    }

    setSaving(false)
    setSaveState('saved')
    showToast('Todas las apuestas guardadas ✓')
    setTimeout(() => setSaveState('idle'), 3000)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ color:'var(--muted)', fontFamily:"'Anton',sans-serif", fontSize:14, letterSpacing:1 }}>CARGANDO...</div>
    </div>
  )

  if (!poll || !myMember) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'18px 12px' }}>
        <div className="phone">
          <div className="body">
            <div className="acard">
              <div className="h">Sin acceso</div>
              <div className="d">No eres miembro de esta polla.</div>
              <div className="mt8">
                <button className="save" onClick={() => navigate('/pollas')}>Mis pollas</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const reglas = poll.reglas
  const premios = poll.premios as number[]
  const bote = pagadosCount * poll.inscripcion
  const myRow = tabla.find(r => r.user_id === session?.user.id)
  const myPos = myRow ? Number(myRow.posicion) : -1
  const nPremios = premios.filter(p => p > 0).length
  const isAdmin = poll.admin_id === session?.user.id

  // Filtrar partidos según el alcance configurado
  const alcance = poll.reglas.alcance ?? 'mundial'
  const inScope = (m: Partido): boolean => {
    if (alcance === 'mundial') return true
    if (alcance === 'grupos') return /grupo/i.test(m.fase)
    if (alcance === 'eliminatorias') return !/grupo/i.test(m.fase)
    if (alcance === 'seleccion') return (poll.reglas.partidos_seleccionados ?? []).includes(m.id)
    return true
  }
  const scopedMatches = matches.filter(inScope)
  const openMatches = scopedMatches.filter(m => !m.cerrado && poll.estado === 'abierta')
  const closedMatches = scopedMatches.filter(m => m.cerrado)

  const predLabel = (matchId: string, match: Partido) => {
    const pr = preds[matchId]
    if (!pr) return 'Sin apuesta'
    if (pr.local > pr.visitante) return `${match.equipo_local} gana`
    if (pr.visitante > pr.local) return `${match.equipo_visitante} gana`
    return 'Empate'
  }

  const hookMsg = () => {
    if (poll.estado === 'cerrada') {
      if (myPos > 0 && myPos <= nPremios)
        return { cls: 'hook', txt: `🏆 ¡Quedaste ${myPos}°! Ganaste ${fmt(bote * premios[myPos - 1] / 100)} ${poll.moneda}` }
      return { cls: 'hook lose', txt: 'Polla cerrada. Esta vez no alcanzó el podio.' }
    }
    if (!closedMatches.length)
      return { cls: 'hook', txt: 'El Mundial arranca el 11 de junio. ¡Haz y firma tus apuestas!' }
    if (myPos > 0 && myPos <= nPremios)
      return { cls: 'hook', txt: `Si la polla cerrara hoy, ganarías ${fmt(bote * premios[myPos - 1] / 100)} ${poll.moneda}` }
    if (myPos > 0) {
      const leader = tabla[nPremios - 1]
      const diff = leader ? leader.puntos - (myRow?.puntos ?? 0) + 1 : 1
      return { cls: 'hook warn', txt: `Vas ${myPos}°. Te faltan ${Math.max(1, diff)} pts para entrar al podio.` }
    }
    return { cls: 'hook warn', txt: !myMember.pagado ? 'Paga tu inscripción para competir por el bote.' : 'Sin partidos cerrados aún.' }
  }

  const hook = hookMsg()
  const majorityMatch = majorityModal ? closedMatches.find(m => m.id === majorityModal) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'18px 12px' }}>
      <div className="phone">
        <div className="bar">
          <div className="brand">
            <div className="glyph">26</div>
            <div>
              <h1 className="brand h1">{poll.nombre}</h1>
              <small>Código: {poll.codigo}</small>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end' }}>
            <button className="back-btn" onClick={() => navigate('/pollas')}>← Mis pollas</button>
            {isAdmin && (
              <button className="back-btn" style={{ color:'var(--gold)', borderColor:'rgba(255,194,75,.3)' }}
                onClick={() => navigate(`/pollas/${pollId}/admin`)}>
                Admin →
              </button>
            )}
          </div>
        </div>

        <div className="body">
          <div className="hero">
            <div className="pot"><span>{poll.moneda}</span> <b>{fmt(bote)}</b></div>
            <div className="cap">
              Bote total · {pagadosCount} pagados · {fmt(poll.inscripcion)} {poll.moneda} c/u
            </div>
            {(adminName || alcance !== 'mundial') && (
              <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap' }}>
                {adminName && <span className="admin-chip">🛡️ Organiza: {adminName}</span>}
                {alcance === 'grupos' && <span className="admin-chip" style={{ background:'rgba(43,107,255,.10)', borderColor:'rgba(43,107,255,.25)', color:'var(--blue)' }}>🏟️ Solo grupos</span>}
                {alcance === 'eliminatorias' && <span className="admin-chip" style={{ background:'rgba(255,138,61,.10)', borderColor:'rgba(255,138,61,.25)', color:'var(--orange)' }}>⚡ Solo eliminatorias</span>}
                {alcance === 'seleccion' && <span className="admin-chip" style={{ background:'rgba(255,138,61,.10)', borderColor:'rgba(255,138,61,.25)', color:'var(--orange)' }}>🎯 Partidos elegidos</span>}
              </div>
            )}
            <div className="rowx">
              <div className="pill"><div className="v">{pagadosCount}</div><div className="k">Participan</div></div>
              <div className="pill"><div className="v">{myPos > 0 ? `${myPos}°` : '—'}</div><div className="k">Tu puesto</div></div>
              <div className="pill"><div className="v">{myRow?.puntos ?? 0}</div><div className="k">Tus puntos</div></div>
            </div>
            <div className={hook.cls}>{hook.txt}</div>
          </div>

          {/* Reparto de premios */}
          <div className="split">
            {premios.map((pct, i) => pct > 0 && (
              <div key={i} className="sp">
                <div className="pos">{MEDALS[i]} {i + 1}°</div>
                <div className="amt">{fmt(bote * pct / 100)}</div>
                <div className="pc">{pct}%</div>
              </div>
            ))}
          </div>

          {/* Ganadores (si cerrada) */}
          {poll.estado === 'cerrada' && ganadores.length > 0 && (
            <div className="podium-wrap" style={{ marginBottom:14 }}>
              {ganadores.map(g => (
                <div key={g.puesto} className={`wcard g${g.puesto}`}>
                  <div className="wmedal">{MEDALS[g.puesto - 1]}</div>
                  <div className="winfo">
                    <div className="wname">{g.profiles?.nombre ?? '—'}</div>
                    <div className="wsub">{g.puesto}° lugar</div>
                  </div>
                  <div className="wprize">
                    <div className="pa">{fmt(g.monto)}</div>
                    <div className="pl">{poll.moneda}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="tabs">
            <div className={`tab ${activeTab === 'play' ? 'on' : ''}`} onClick={() => setActiveTab('play')}>Apuestas</div>
            <div className={`tab ${activeTab === 'results' ? 'on' : ''}`} onClick={() => setActiveTab('results')}>Resultados</div>
            <div className={`tab ${activeTab === 'board' ? 'on' : ''}`} onClick={() => setActiveTab('board')}>Tabla</div>
          </div>

          {/* ---- TAB: Apuestas ---- */}
          {activeTab === 'play' && (
            <div>
              {!myMember.pagado ? (
                <div className="acard" style={{ textAlign:'center' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>⏳</div>
                  <div className="h" style={{ justifyContent:'center' }}>Inscripción pendiente</div>
                  <div className="d" style={{ marginTop:6, lineHeight:1.6 }}>
                    El admin debe confirmar tu pago para que puedas registrar apuestas.
                    <br />Una vez que te active, podrás jugar todos los partidos abiertos.
                  </div>
                </div>
              ) : openMatches.length === 0 ? (
                <div className="acard">
                  <div className="d" style={{ textAlign:'center' }}>
                    {poll.estado === 'cerrada'
                      ? 'La polla está cerrada. Revisa la tabla final.'
                      : 'No hay partidos abiertos para apostar.'}
                  </div>
                </div>
              ) : (
                <>
                  {openMatches.map(m => {
                    const ms = matchSaveState[m.id] || 'idle'
                    return (
                      <div key={m.id} className="match">
                        <div className="when">
                          <span>{m.fecha} · {m.fase}</span>
                          {m.destacado
                            ? <span className="star">⭐ Colombia</span>
                            : <span style={{ fontSize:9, color:'var(--muted)' }}>📌 apuesta</span>}
                        </div>
                        <div className="teams">
                          <div className="team">
                            <div className="fl">{m.flag_local}</div>
                            <div className="tn">{m.equipo_local}</div>
                          </div>
                          <div className="step">
                            <button onClick={() => updatePred(m.id, 'local', -1)} disabled={preds[m.id]?.local === 0}>−</button>
                            <div className="sv">{preds[m.id]?.local ?? 0}</div>
                            <button onClick={() => updatePred(m.id, 'local', 1)}>+</button>
                          </div>
                          <div className="midv">:</div>
                          <div className="step">
                            <button onClick={() => updatePred(m.id, 'visitante', -1)} disabled={preds[m.id]?.visitante === 0}>−</button>
                            <div className="sv">{preds[m.id]?.visitante ?? 0}</div>
                            <button onClick={() => updatePred(m.id, 'visitante', 1)}>+</button>
                          </div>
                          <div className="team">
                            <div className="fl">{m.flag_visitante}</div>
                            <div className="tn">{m.equipo_visitante}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
                          <div className={`pred ${preds[m.id] ? '' : 'muted'}`} style={{ margin:0 }}>
                            {predLabel(m.id, m)}
                          </div>
                          <button
                            className={`match-save-mini ${ms}`}
                            onClick={() => saveSinglePred(m.id)}
                            disabled={ms === 'saving'}
                          >
                            {ms === 'saving' ? '…' : ms === 'saved' ? '✓ Guardada' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  <button
                    className={`save ${saveState === 'saved' ? 'done' : ''}`}
                    onClick={savePreds}
                    disabled={saving}
                    style={{ marginTop:8 }}
                  >
                    {saving ? 'Guardando...' : saveState === 'saved' ? '✓ Todas guardadas' : 'Guardar todas las apuestas'}
                  </button>
                  <div className="lockmsg">🔒 Cada apuesta se bloquea cuando el admin registra el resultado del partido</div>
                </>
              )}

              {/* Reglas colapsables */}
              <div style={{ marginTop:14 }}>
                <button
                  onClick={() => setShowRules(v => !v)}
                  style={{ background:'none', border:'none', color:'var(--muted)', fontSize:11, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:5, fontWeight:700, letterSpacing:.5, padding:0, textTransform:'uppercase' }}
                >
                  {showRules ? '▾' : '▸'} Cómo se puntúa
                </button>
                {showRules && (
                  <div className="scoring" style={{ marginTop:8 }}>
                    <span className="ttl">Sistema de puntos</span>
                    ✅ Marcador exacto = <b>{reglas.exacto} pts</b><br />
                    🟡 Resultado acertado = <b>{reglas.resultado} pts</b><br />
                    ⚪ Fallo o sin apuesta = <b>{reglas.fallo} pts</b><br /><br />
                    <b>Empates:</b> más pts → más exactos → más resultados → inscripción más temprana
                  </div>
                )}
              </div>

              {/* Fases eliminatorias */}
              <div className="elimwrap">
                <div className="elimhdr">🔒 Fases eliminatorias · por confirmar</div>
                {ELIM.map(e => (
                  <div key={e.ronda} className="elim">
                    <div className="eico">{e.ico}</div>
                    <div className="er">
                      <div className="ern">{e.ronda}</div>
                      <div className="erd">{e.fecha} · {e.sede}</div>
                    </div>
                    <div className="epill">Por confirmar</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- TAB: Resultados ---- */}
          {activeTab === 'results' && (
            <div>
              {closedMatches.length === 0 ? (
                <div className="acard">
                  <div className="d" style={{ textAlign:'center' }}>Todavía no hay resultados oficiales.</div>
                </div>
              ) : (
                closedMatches.map(m => {
                  const pr = preds[m.id]
                  const x = calcPoints(pr, m, reglas)
                  const maj = majority[m.id]
                  return (
                    <div key={m.id} className="res" style={{ flexDirection:'column', alignItems:'stretch', gap:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="info">
                          <div className="ln">
                            {m.flag_local} {m.equipo_local}
                            <span className="scorebox">{m.resultado_local}–{m.resultado_visitante}</span>
                            {m.equipo_visitante} {m.flag_visitante}
                          </div>
                          <div className="sub">
                            Tu apuesta: <b>{pr ? `${pr.local}–${pr.visitante}` : '—'}</b>
                          </div>
                        </div>
                        <div className={`pts ${x.kind}`}>+{x.pts}<br /><span style={{ fontSize:8, fontWeight:600 }}>{x.tag}</span></div>
                      </div>
                      {maj && maj.total > 0 && (
                        <div style={{ marginTop:8 }}>
                          <button
                            className="match-save-mini"
                            onClick={() => setMajorityModal(m.id)}
                            style={{ width:'100%', padding:'5px 0' }}
                          >
                            📊 Ver cómo apostó el grupo ({maj.total})
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              <div className="scoring">
                <span className="ttl">Cómo se puntúa</span>
                ✅ Marcador exacto = <b>{reglas.exacto} pts</b><br />
                🟡 Resultado acertado = <b>{reglas.resultado} pts</b><br />
                ⚪ Fallo o sin apuesta = <b>{reglas.fallo} pts</b>
              </div>
            </div>
          )}

          {/* ---- TAB: Tabla ---- */}
          {activeTab === 'board' && (
            <div>
              {tabla.length === 0 ? (
                <div className="acard">
                  <div className="d" style={{ textAlign:'center' }}>
                    La tabla se activa cuando hay partidos cerrados y miembros pagados.
                  </div>
                </div>
              ) : (
                <div>
                  {tabla.map((row, i) => {
                    const isMe = row.user_id === session?.user.id
                    const inPodium = i < nPremios
                    return (
                      <div key={row.user_id} className={`lbrow ${isMe ? 'me' : ''} ${inPodium ? 'podium' : ''}`}>
                        <div className={`rk ${i < 3 ? 'top' : ''}`}>{i + 1}</div>
                        <div className="av" style={{ background: AVCOLS[i % AVCOLS.length] }}>
                          {row.nombre[0]?.toUpperCase()}
                        </div>
                        <div className="nm">
                          {row.nombre}{isMe ? ' · tú' : ''}
                          {row.user_id === poll.admin_id && <span className="admin-chip" style={{ fontSize:8, padding:'2px 6px', marginLeft:4 }}>admin</span>}
                          {inPodium && <small>· podio</small>}
                          <small>{row.exactos} exactos · {row.resultados} resultados</small>
                        </div>
                        <div className="pp">{row.puntos} <small>pts</small></div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="scoring" style={{ marginTop:10 }}>
                <span className="ttl">Empates se resuelven así</span>
                1) Más puntos · 2) Más marcadores exactos · 3) Más resultados · 4) Inscripción más temprana
              </div>
            </div>
          )}
        </div>

        <Toast msg={toast} />
      </div>

      {/* Majority vote modal */}
      {majorityModal && majorityMatch && majority[majorityModal] && (
        <MajorityModal
          match={majorityMatch}
          data={majority[majorityModal]}
          onClose={() => setMajorityModal(null)}
        />
      )}
    </div>
  )
}
