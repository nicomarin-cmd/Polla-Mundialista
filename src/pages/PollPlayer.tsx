import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { WalletButton } from '../components/WalletButton'
import { PaymentButton } from '../components/PaymentButton'
import { isCryptoMoneda } from '../lib/celoTokens'
import type { Polla, Partido, PollMember, TablaRow, GanadorWithProfile, PollResultado, PollMensaje } from '../types'

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
interface ComparacionRow { user_id: string; nombre: string; pred_local: number | null; pred_visitante: number | null }

function fmt(n: number) { return Number(n).toFixed(2) }

// Convierte un timestamp UTC a hora local de Colombia (UTC-5, sin horario de verano)
function horaCO(utcDate: string | null): string {
  if (!utcDate) return ''
  const d = new Date(new Date(utcDate).getTime() - 5 * 60 * 60 * 1000)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

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

function ComparacionModal({
  match, data, myUserId, onClose
}: {
  match: Partido
  data: ComparacionRow[]
  myUserId: string
  onClose: () => void
}) {
  const betters = data.filter(r => r.pred_local !== null)
  const nobet   = data.filter(r => r.pred_local === null)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Apuestas del grupo</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom:4, fontSize:13, fontWeight:600 }}>
          {match.flag_local} {match.equipo_local} vs {match.equipo_visitante} {match.flag_visitante}
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:12 }}>
          {betters.length} de {data.length} apostaron
        </div>
        {betters.length === 0 && (
          <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'10px 0' }}>
            Nadie ha apostado en este partido todavía.
          </div>
        )}
        {betters.map((row, i) => (
          <div key={row.user_id} style={{
            display:'flex', alignItems:'center', gap:9,
            padding:'7px 10px', borderRadius:8, marginBottom:5,
            background: row.user_id === myUserId ? 'rgba(200,255,60,.08)' : 'rgba(255,255,255,.04)',
            border: row.user_id === myUserId ? '1px solid rgba(200,255,60,.25)' : '1px solid rgba(255,255,255,.06)',
          }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background: AVCOLS[i % AVCOLS.length],
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700, color:'#000', flexShrink:0
            }}>
              {row.nombre[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0, fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {row.nombre}{row.user_id === myUserId ? ' · tú' : ''}
            </div>
            <div style={{ fontFamily:"'Anton',sans-serif", fontSize:17, letterSpacing:1, color:'var(--lime)', minWidth:46, textAlign:'right' }}>
              {row.pred_local}–{row.pred_visitante}
            </div>
          </div>
        ))}
        {nobet.length > 0 && (
          <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5 }}>Sin apuesta</div>
            {nobet.map(row => (
              <div key={row.user_id} style={{ fontSize:11, color:'var(--muted)', padding:'2px 0' }}>{row.nombre}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PollPlayer() {
  const { id: pollId } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const initialLoadDone = useRef(false)
  const dirtyMatchIds = useRef<Set<string>>(new Set())

  const [poll, setPoll] = useState<Polla | null>(null)
  const [matches, setMatches] = useState<Partido[]>([])
  const [myMember, setMyMember] = useState<PollMember | null>(null)
  const [preds, setPreds] = useState<Record<string, { local: number; visitante: number }>>({})
  const [tabla, setTabla] = useState<TablaRow[]>([])
  const [ganadores, setGanadores] = useState<GanadorWithProfile[]>([])
  const [pagadosCount, setPagadosCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'play' | 'results' | 'board' | 'chat'>('play')
  const [mensajes, setMensajes] = useState<PollMensaje[]>([])
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [enviandoMensaje, setEnviandoMensaje] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [toast, setToast] = useState('')

  // Per-match save state
  const [matchSaveState, setMatchSaveState] = useState<Record<string, MatchSave>>({})
  // Admin display name y contacto
  const [adminName, setAdminName] = useState('')
  const [adminContacto, setAdminContacto] = useState<{ email: string | null; telefono: string | null } | null>(null)
  const [showContactoModal, setShowContactoModal] = useState(false)
  // Majority vote data (only for closed matches)
  const [majority, setMajority] = useState<Record<string, MajData>>({})
  const [majorityModal, setMajorityModal] = useState<string | null>(null)
  // Collapsible rules
  const [showRules, setShowRules] = useState(false)
  // Comparar apuestas modal
  const [comparacionModal, setComparacionModal] = useState<string | null>(null)
  const [comparacionData, setComparacionData] = useState<Record<string, ComparacionRow[]>>({})

  const openComparacion = async (matchId: string) => {
    setComparacionModal(matchId)
    if (comparacionData[matchId]) return
    const { data } = await supabase.rpc('fn_comparar_apuestas', { p_poll_id: pollId, p_partido_id: matchId })
    if (data) setComparacionData(prev => ({ ...prev, [matchId]: data as ComparacionRow[] }))
  }

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
    const isFirst = !initialLoadDone.current
    if (isFirst) setLoading(true)
    const userId = session.user.id

    const [
      { data: pollData },
      { data: matchesData },
      { data: memberData },
      { data: predsData },
      { data: membersData },
      { data: resultadosData },
    ] = await Promise.all([
      supabase.from('pollas').select('*').eq('id', pollId).single(),
      supabase.from('partidos').select('*').order('fecha_inicio', { ascending: true, nullsFirst: false }).order('orden'),
      supabase.from('poll_members').select('*').eq('poll_id', pollId).eq('user_id', userId).single(),
      supabase.from('predicciones').select('*').eq('poll_id', pollId).eq('user_id', userId),
      supabase.from('poll_members').select('user_id, pagado').eq('poll_id', pollId),
      supabase.from('poll_resultados').select('*').eq('poll_id', pollId),
    ])

    const p = pollData as Polla | null
    setPoll(p)

    // Mezclar partidos globales con resultados específicos de esta polla
    const resMap: Record<string, PollResultado> = {}
    ;(resultadosData || []).forEach((r: PollResultado) => { resMap[r.partido_id] = r })
    const now = new Date()
    const ms = ((matchesData || []) as Partido[]).map(m => {
      const dbRow      = resMap[m.id]
      const kickoff    = m.fecha_inicio ? new Date(m.fecha_inicio) <= now : false
      // 30 min de gracia: evita que un fecha_fin ligeramente incorrecto cierre el partido antes de tiempo
      const pastFin    = m.fecha_fin ? new Date(new Date(m.fecha_fin).getTime() + 30 * 60 * 1000) <= now : false
      const finalizado = dbRow?.cerrado === true || pastFin                    // fallback si cron tardó
      const enVivo     = kickoff && !finalizado
      return {
        ...m,
        resultado_local:     dbRow?.resultado_local     ?? m.resultado_local     ?? null,
        resultado_visitante: dbRow?.resultado_visitante ?? m.resultado_visitante ?? null,
        cerrado:  finalizado || enVivo,
        en_vivo:  enVivo,
      }
    })
    setMatches(ms)
    setMyMember(memberData as PollMember | null)

    const pagados = ((membersData || []) as { pagado: boolean }[]).filter(m => m.pagado).length
    setPagadosCount(pagados)

    // Solo cargamos predicciones reales del usuario actual — sin pre-inicializar a 0-0.
    // Si un partido no tiene entrada en el mapa → el usuario no ha apostado todavía.
    const predMap: Record<string, { local: number; visitante: number }> = {}
    const savedPredIds = new Set<string>()
    ;((predsData || []) as { partido_id: string; pred_local: number; pred_visitante: number; user_id?: string }[])
      .filter(pr => !pr.user_id || pr.user_id === userId)   // seguridad: solo del usuario actual
      .forEach(pr => {
        predMap[pr.partido_id] = { local: pr.pred_local, visitante: pr.pred_visitante }
        savedPredIds.add(pr.partido_id)
      })
    if (isFirst) {
      setPreds(predMap)
      const initSaveState: Record<string, MatchSave> = {}
      ms.forEach(m => { initSaveState[m.id] = savedPredIds.has(m.id) ? 'saved' : 'idle' })
      setMatchSaveState(initSaveState)
    } else {
      // Refresco de fondo: actualizar solo preds guardadas, preservar inputs no guardados
      setPreds(prev => {
        const next = { ...predMap }
        dirtyMatchIds.current.forEach(id => { if (prev[id] !== undefined) next[id] = prev[id] })
        return next
      })
    }

    // Cargar nombre y contacto del admin
    if (p?.admin_id) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('nombre, contacto_email, contacto_telefono')
        .eq('id', p.admin_id)
        .single()
      const ap = adminProfile as { nombre: string; contacto_email: string | null; contacto_telefono: string | null } | null
      setAdminName(ap?.nombre || '')
      setAdminContacto(ap ? { email: ap.contacto_email, telefono: ap.contacto_telefono } : null)
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
        .from('poll_winners')
        .select('*, profiles(nombre)')
        .eq('poll_id', pollId)
        .order('position')
      setGanadores((gData || []).map((w: any) => ({
        poll_id:  w.poll_id,
        user_id:  w.user_id,
        puesto:   w.position,
        monto:    Number(w.amount_token),
        profiles: w.profiles,
      })) as GanadorWithProfile[])
    }

    if (isFirst) {
      initialLoadDone.current = true
      setLoading(false)
    }
  }, [session, pollId, loadTabla])

  useEffect(() => { loadAll() }, [loadAll])

  // Realtime: reacciona al instante cuando el cron escribe resultados
  // Fallback: 15s si hay partidos en vivo, 60s si no
  useEffect(() => {
    if (!pollId) return
    const channel = supabase
      .channel(`player-rt-${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_resultados', filter: `poll_id=eq.${pollId}` }, () => { loadAll() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, () => { loadAll() })
      .subscribe()
    const interval = matches.some(m => m.en_vivo) ? 15_000 : 60_000
    const fallback = setInterval(() => { loadAll() }, interval)
    return () => { supabase.removeChannel(channel); clearInterval(fallback) }
  }, [pollId, loadAll, matches])

  // Mensajes: carga inicial + Realtime
  const loadMensajes = useCallback(async () => {
    if (!pollId) return
    const { data } = await supabase
      .from('poll_mensajes')
      .select('*, profiles(nombre)')
      .eq('poll_id', pollId)
      .order('created_at', { ascending: true })
    setMensajes((data || []) as PollMensaje[])
  }, [pollId])

  useEffect(() => { loadMensajes() }, [loadMensajes])

  useEffect(() => {
    if (!pollId) return
    const ch = supabase
      .channel(`chat-${pollId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poll_mensajes', filter: `poll_id=eq.${pollId}` },
        () => { loadMensajes() })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poll_mensajes', filter: `poll_id=eq.${pollId}` },
        () => { loadMensajes() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [pollId, loadMensajes])

  useEffect(() => {
    if (activeTab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, activeTab])

  const enviarMensaje = async () => {
    if (!session || !pollId || !nuevoMensaje.trim()) return
    setEnviandoMensaje(true)
    await supabase.from('poll_mensajes').insert({
      poll_id: pollId,
      user_id: session.user.id,
      mensaje: nuevoMensaje.trim(),
    })
    setNuevoMensaje('')
    setEnviandoMensaje(false)
  }

  const borrarMensaje = async (id: string) => {
    await supabase.from('poll_mensajes').delete().eq('id', id)
  }

  const updatePred = (matchId: string, side: 'local' | 'visitante', delta: number) => {
    dirtyMatchIds.current.add(matchId)
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
      dirtyMatchIds.current.delete(matchId)
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

    dirtyMatchIds.current.clear()
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
  const canBet = myMember.pagado

  const scopedMatches = matches
  const openMatches = scopedMatches.filter(m => !m.cerrado && poll.estado === 'abierta')
  const closedMatches = scopedMatches.filter(m => m.cerrado)

  const predLabel = (matchId: string, match: Partido) => {
    const pr = preds[matchId]
    if (!pr) return 'Sin apuesta aún'
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
            <div style={{ display:'flex', gap:6 }}>
              <WalletButton />
              <button className="back-btn" onClick={() => navigate('/pollas')}>← Volver</button>
            </div>
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
            {adminName && (
              <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <span className="admin-chip">🛡️ Organiza: {adminName}</span>
                {(adminContacto?.email || adminContacto?.telefono) && (
                  <button
                    onClick={() => setShowContactoModal(true)}
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:20,
                      border:'1px solid rgba(200,255,60,.3)', background:'rgba(200,255,60,.08)',
                      color:'var(--lime)', cursor:'pointer', fontWeight:700 }}
                  >
                    Contactar
                  </button>
                )}
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
            <div className={`tab ${activeTab === 'chat' ? 'on' : ''}`} onClick={() => setActiveTab('chat')}>
              Mensajes{mensajes.length > 0 && <span style={{ marginLeft:4, fontSize:9, background:'var(--lime)', color:'#000', borderRadius:8, padding:'1px 5px', fontWeight:900 }}>{mensajes.length}</span>}
            </div>
          </div>

          {/* ---- TAB: Apuestas ---- */}
          {activeTab === 'play' && (
            <div>
              {!myMember.pagado && (
                isCryptoMoneda(poll.moneda) ? (
                  <PaymentButton
                    pollId={poll.id}
                    amount={poll.inscripcion}
                    moneda={poll.moneda}
                    onSuccess={() => loadAll()}
                  />
                ) : (
                  <div className="hook warn" style={{ marginBottom:12, textAlign:'left', lineHeight:1.5 }}>
                    🔒 <b>Inscripción pendiente</b> — el admin debe confirmar tu pago antes de que puedas apostar. Contacta al organizador.
                  </div>
                )
              )}

              {scopedMatches.length === 0 ? (
                <div className="acard">
                  <div className="d" style={{ textAlign:'center' }}>
                    {poll.estado === 'cerrada'
                      ? 'La polla está cerrada. Revisa la tabla final.'
                      : 'No hay partidos disponibles todavía.'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Partidos abiertos — con controles de apuesta */}
                  {openMatches.map(m => {
                    const ms = matchSaveState[m.id] || 'idle'
                    return (
                      <div key={m.id} className="match">
                        <div className="when">
                          <span>{m.fecha}{m.fecha_inicio ? ` · ${horaCO(m.fecha_inicio)}` : ''} · {m.fase}</span>
                          <span style={{ fontSize:9, color:'var(--muted)' }}>📌 apuesta</span>
                        </div>
                        <div className="teams">
                          <div className="team">
                            <div className="fl">{m.flag_local}</div>
                            <div className="tn">{m.equipo_local}</div>
                          </div>
                          <div className="step">
                            <button onClick={() => updatePred(m.id, 'local', -1)} disabled={!canBet || (preds[m.id]?.local ?? 0) === 0}>−</button>
                            <div className="sv">{preds[m.id]?.local ?? 0}</div>
                            <button onClick={() => updatePred(m.id, 'local', 1)} disabled={!canBet}>+</button>
                          </div>
                          <div className="midv">:</div>
                          <div className="step">
                            <button onClick={() => updatePred(m.id, 'visitante', -1)} disabled={!canBet || (preds[m.id]?.visitante ?? 0) === 0}>−</button>
                            <div className="sv">{preds[m.id]?.visitante ?? 0}</div>
                            <button onClick={() => updatePred(m.id, 'visitante', 1)} disabled={!canBet}>+</button>
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
                            disabled={!canBet || ms === 'saving'}
                          >
                            {ms === 'saving' ? '…' : ms === 'saved' ? '✓ Confirmada' : 'Confirmar apuesta'}
                          </button>
                        </div>
                        <button
                          onClick={() => openComparacion(m.id)}
                          style={{
                            display:'block', width:'100%', padding:'10px 0', marginTop:12,
                            background:'#c8ff3c', border:'none',
                            borderRadius:8, color:'#000', fontSize:13, fontWeight:900,
                            cursor:'pointer', fontFamily:"'Anton',sans-serif", letterSpacing:1.2,
                            textTransform:'uppercase',
                          }}
                        >
                          👁 Ver apuestas del grupo
                        </button>
                      </div>
                    )
                  })}

                  {openMatches.length > 0 && (
                    <>
                      <button
                        className={`save ${saveState === 'saved' ? 'done' : ''}`}
                        onClick={savePreds}
                        disabled={!canBet || saving}
                        style={{ marginTop:8 }}
                      >
                        {saving ? 'Guardando...' : saveState === 'saved' ? '✓ Todas confirmadas' : 'Confirmar todas las apuestas'}
                      </button>
                      <div className="lockmsg">🔒 Cada apuesta se bloquea automáticamente cuando arranca el partido</div>
                    </>
                  )}

                  {/* Partidos cerrados — solo lectura */}
                  {closedMatches.length > 0 && (
                    <div style={{ marginTop: openMatches.length > 0 ? 18 : 0 }}>
                      <div className="elimhdr" style={{ marginBottom:6 }}>
                        🔒 {openMatches.length > 0 ? 'Partidos ya cerrados' : poll.estado === 'cerrada' ? 'Polla cerrada · sin apuestas' : 'Todos los partidos están cerrados'}
                      </div>
                      {openMatches.length === 0 && (
                        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, textAlign:'center' }}>
                          Los partidos ya arrancaron. Ve a <b>Resultados</b> para ver tus puntos.
                        </div>
                      )}
                      {closedMatches.map(m => {
                        const pr = preds[m.id]
                        const hasResult = m.resultado_local !== null
                        const live = !!m.en_vivo
                        return (
                          <div key={m.id} className="match" style={{
                            borderColor: live ? 'rgba(255,90,95,.4)' : 'rgba(255,255,255,.08)',
                            background: live ? 'rgba(255,90,95,.04)' : undefined,
                          }}>
                            <div className="when">
                              <span style={{ color:'var(--muted)' }}>{m.fecha}{m.fecha_inicio ? ` · ${horaCO(m.fecha_inicio)}` : ''} · {m.fase}</span>
                              {live ? (
                                <span style={{
                                  fontSize:9, fontWeight:700, color:'#fff',
                                  background:'#ff2e2e', borderRadius:5,
                                  padding:'2px 6px', letterSpacing:.5,
                                  animation:'pulse-live 1.4s ease-in-out infinite',
                                }}>⚽ EN VIVO</span>
                              ) : (
                                <span style={{ fontSize:9, color:'var(--muted)', fontWeight:700 }}>✓ Final</span>
                              )}
                            </div>
                            {live && (
                              <div style={{ fontSize:9, color:'rgba(255,90,95,.8)', fontWeight:700,
                                textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                                {hasResult ? 'Marcador actual' : 'Partido en curso'}
                              </div>
                            )}
                            <div className="teams">
                              <div className="team">
                                <div className="fl">{m.flag_local}</div>
                                <div className="tn" style={{ color: live ? undefined : 'var(--muted)' }}>{m.equipo_local}</div>
                              </div>
                              <div style={{ minWidth:60, textAlign:'center' }}>
                                {hasResult ? (
                                  <div style={{
                                    fontFamily:"'Anton',sans-serif",
                                    fontSize: live ? 26 : 20,
                                    color: live ? '#ff2e2e' : 'var(--txt)',
                                    letterSpacing:1,
                                  }}>
                                    {m.resultado_local}–{m.resultado_visitante}
                                  </div>
                                ) : (
                                  <div style={{ fontSize:18, color:'var(--muted)' }}>–</div>
                                )}
                              </div>
                              <div className="team">
                                <div className="fl">{m.flag_visitante}</div>
                                <div className="tn" style={{ color: live ? undefined : 'var(--muted)' }}>{m.equipo_visitante}</div>
                              </div>
                            </div>
                            <div style={{ textAlign:'center', fontSize:10, color:'var(--muted)', marginTop:6 }}>
                              Tu apuesta: <b style={{ color:'var(--txt)' }}>{pr ? `${pr.local}–${pr.visitante}` : 'Sin apuesta'}</b>
                            </div>
                            <button
                              onClick={() => openComparacion(m.id)}
                              style={{
                                display:'block', width:'100%', padding:'10px 0', marginTop:12,
                                background:'#c8ff3c', border:'none',
                                borderRadius:8, color:'#000', fontSize:13, fontWeight:900,
                                cursor:'pointer', fontFamily:"'Anton',sans-serif", letterSpacing:1.2,
                                textTransform:'uppercase',
                              }}
                            >
                              👁 Ver apuestas del grupo
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                  const live = !!m.en_vivo
                  return (
                    <div key={m.id} className="res" style={{
                      flexDirection:'column', alignItems:'stretch', gap:0,
                      borderColor: live ? 'rgba(255,90,95,.4)' : undefined,
                      background: live ? 'rgba(255,90,95,.04)' : undefined,
                    }}>
                      {live && (
                        <div style={{ fontSize:9, fontWeight:700, color:'#ff2e2e',
                          textTransform:'uppercase', letterSpacing:1, marginBottom:6,
                          display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ display:'inline-block', width:7, height:7,
                            borderRadius:'50%', background:'#ff2e2e',
                            animation:'pulse-live 1.4s ease-in-out infinite' }} />
                          En vivo · marcador actual
                        </div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="info">
                          <div className="ln">
                            {m.flag_local} {m.equipo_local}
                            <span className="scorebox" style={{ color: live ? '#ff2e2e' : undefined }}>
                              {m.resultado_local !== null ? `${m.resultado_local}–${m.resultado_visitante}` : '–'}
                            </span>
                            {m.equipo_visitante} {m.flag_visitante}
                          </div>
                          <div className="sub">
                            Tu apuesta: <b>{pr ? `${pr.local}–${pr.visitante}` : '—'}</b>
                          </div>
                        </div>
                        <div className={`pts ${live ? 'pendiente' : x.kind}`}>
                          {live ? '⚽' : `+${x.pts}`}
                          <br /><span style={{ fontSize:8, fontWeight:600 }}>{live ? 'En vivo' : x.tag}</span>
                        </div>
                      </div>
                      <div style={{ marginTop:8, display:'flex', gap:6 }}>
                        {maj && maj.total > 0 && (
                          <button
                            className="match-save-mini"
                            onClick={() => setMajorityModal(m.id)}
                            style={{ flex:1, padding:'5px 0' }}
                          >
                            📊 Consenso
                          </button>
                        )}
                        <button
                          onClick={() => openComparacion(m.id)}
                          style={{
                            flex:1, padding:'8px 0',
                            background:'#c8ff3c', border:'none',
                            borderRadius:8, color:'#000', fontSize:12, fontWeight:900,
                            cursor:'pointer', fontFamily:"'Anton',sans-serif", letterSpacing:1,
                            textTransform:'uppercase',
                          }}
                        >
                          👁 Comparar
                        </button>
                      </div>
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

          {/* ---- TAB: Mensajes ---- */}
          {activeTab === 'chat' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:11, color:'var(--muted)', padding:'4px 0 8px' }}>
                Mensajes del grupo · {mensajes.length} mensaje{mensajes.length !== 1 ? 's' : ''}
              </div>

              {/* Lista de mensajes */}
              {mensajes.length === 0 ? (
                <div className="acard">
                  <div className="d" style={{ textAlign:'center' }}>
                    Sin mensajes todavía. ¡Sé el primero en escribir!
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {mensajes.map(m => {
                    const esAdmin = poll.admin_id === m.user_id
                    const esMio = session?.user.id === m.user_id
                    return (
                      <div key={m.id} style={{
                        padding:'9px 12px', borderRadius:10,
                        background: esAdmin ? 'rgba(200,255,60,.07)' : 'var(--panel-2)',
                        border: esAdmin ? '1px solid rgba(200,255,60,.2)' : '1px solid var(--line)',
                        alignSelf: esMio ? 'flex-end' : 'flex-start',
                        maxWidth:'85%',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ fontSize:11, fontWeight:700, color: esAdmin ? 'var(--lime)' : 'var(--txt)' }}>
                            {m.profiles?.nombre ?? '—'}
                          </span>
                          {esAdmin && <span style={{ fontSize:8, background:'rgba(200,255,60,.15)', color:'var(--lime)',
                            borderRadius:6, padding:'1px 5px', fontWeight:900 }}>ADMIN</span>}
                          <span style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>
                            {new Date(m.created_at).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' })}
                          </span>
                          {(esMio || poll.admin_id === session?.user.id) && (
                            <button onClick={() => borrarMensaje(m.id)}
                              style={{ fontSize:9, color:'var(--muted)', background:'none', border:'none',
                                cursor:'pointer', padding:'0 2px', lineHeight:1 }}>
                              ✕
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize:12, color:'var(--txt)', lineHeight:1.5, wordBreak:'break-word' }}>
                          {m.mensaje}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input para escribir */}
              <div style={{ display:'flex', gap:8, marginTop:4, position:'sticky', bottom:0,
                background:'var(--bg)', paddingBottom:8 }}>
                <input
                  className="inp"
                  style={{ flex:1, margin:0 }}
                  placeholder="Escribe un mensaje…"
                  value={nuevoMensaje}
                  maxLength={500}
                  onChange={e => setNuevoMensaje(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje() } }}
                />
                <button
                  className="save"
                  style={{ margin:0, padding:'0 16px', flexShrink:0 }}
                  onClick={enviarMensaje}
                  disabled={enviandoMensaje || !nuevoMensaje.trim()}
                >
                  Enviar
                </button>
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

      {/* Comparar apuestas modal */}
      {comparacionModal && (() => {
        const cmpMatch = matches.find(m => m.id === comparacionModal)
        if (!cmpMatch) return null
        return (
          <ComparacionModal
            match={cmpMatch}
            data={comparacionData[comparacionModal] ?? []}
            myUserId={session?.user.id ?? ''}
            onClose={() => setComparacionModal(null)}
          />
        )
      })()}

      {/* Modal de contacto del admin */}
      {showContactoModal && adminContacto && (
        <div className="overlay" onClick={() => setShowContactoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">🛡️ Contactar al admin</div>
              <button className="modal-close" onClick={() => setShowContactoModal(false)}>×</button>
            </div>
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
                Organiza esta polla: <b style={{ color:'var(--txt)' }}>{adminName}</b>
              </div>
              {adminContacto.email && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0',
                  borderBottom: adminContacto.telefono ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize:18 }}>✉️</span>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Correo electrónico</div>
                    <a href={`mailto:${adminContacto.email}`}
                      style={{ color:'var(--lime)', fontSize:13, fontWeight:700, textDecoration:'none' }}>
                      {adminContacto.email}
                    </a>
                  </div>
                </div>
              )}
              {adminContacto.telefono && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0' }}>
                  <span style={{ fontSize:18 }}>💬</span>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>WhatsApp / Teléfono</div>
                    <a href={`https://wa.me/${adminContacto.telefono.replace(/\D/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color:'var(--lime)', fontSize:13, fontWeight:700, textDecoration:'none' }}>
                      {adminContacto.telefono}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
