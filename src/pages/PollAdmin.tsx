import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { WalletButton } from '../components/WalletButton'
import { PaymentButton } from '../components/PaymentButton'
import { isCryptoMoneda, celoscanTx, monedaToToken } from '../lib/celoTokens'
import { teamCode } from '../lib/teamCodes'
import type { Polla, Partido, PollMemberWithProfile, TablaRow, PollPayment, PollResultado, PollMensaje } from '../types'

type MatchSave = 'idle' | 'saving' | 'saved'

interface WinnerDist {
  user_id: string
  puesto: number
  monto: number
  wallet?: string
  tx_hash?: string
  celoscan?: string
  status: 'sent' | 'pending_wallet' | 'failed'
  error?: string
}

interface RefundResult {
  user_id: string
  wallet: string
  amount: number
  refund_tx_hash?: string
  celoscan?: string
  status: 'refunded' | 'failed'
  error?: string
}


const AVCOLS = ['#ffc24b','#d7ff3e','#37e29a','#ff8a3d','#7aa2ff','#ff5a5f','#b48bff','#4be0d6','#ff9ec4','#9bd35a']
const MEDALS = ['🥇','🥈','🥉']

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
  const [searchParams] = useSearchParams()

  const initialLoadDone = useRef(false)

  const [poll, setPoll] = useState<Polla | null>(null)
  const [matches, setMatches] = useState<Partido[]>([])
  const [members, setMembers] = useState<PollMemberWithProfile[]>([])
  const [tabla, setTabla] = useState<TablaRow[]>([])
  const [activeTab, setActiveTab] = useState<'matches' | 'rules' | 'people' | 'close' | 'jugar'>(
    searchParams.get('tab') === 'jugar' ? 'jugar' : 'matches'
  )
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Estado del admin como jugador
  const [adminPagado, setAdminPagado] = useState(false)
  const [myPreds, setMyPreds] = useState<Record<string, { local: number; visitante: number }>>({})
  const [myMatchSaveState, setMyMatchSaveState] = useState<Record<string, MatchSave>>({})

  const [exacto, setExacto] = useState(5)
  const [resultado, setResultado] = useState(3)
  const [fallo, setFallo] = useState(0)
  const [prem0, setPrem0] = useState(50)
  const [prem1, setPrem1] = useState(30)
  const [prem2, setPrem2] = useState(20)
  const [inscFee, setInscFee] = useState(2)
  const [savingRules, setSavingRules] = useState(false)
  // Apuestas registradas — cuando hay > 0 las reglas se bloquean
  const [totalApuestas, setTotalApuestas] = useState(0)
  const [rulesUnlocked, setRulesUnlocked] = useState(false)
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)

  // Contacto del admin (visible para todos los jugadores)
  const [contactoEmail, setContactoEmail] = useState('')
  const [contactoTel, setContactoTel] = useState('')
  const [savingContacto, setSavingContacto] = useState(false)

  // Filtros tab Partidos
  const [matchSearch, setMatchSearch] = useState('')
  const [matchView, setMatchView] = useState<'todos' | 'pendientes' | 'cerrados'>('todos')

  const [closing, setClosing] = useState(false)
  // Wallets de los potenciales ganadores (cargadas cuando moneda es cripto)
  const [winnerWallets, setWinnerWallets] = useState<Record<string, string | null>>({})
  // Resultado de la distribución cripto (post-cierre)
  const [distResult, setDistResult] = useState<WinnerDist[]>([])
  // Cancelación / reembolsos
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelResult, setCancelResult] = useState<RefundResult[]>([])
  // Pagos cripto registrados (para tabla en Personas)
  const [payments, setPayments] = useState<PollPayment[]>([])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }

  const loadTabla = useCallback(async () => {
    if (!pollId) return
    const { data } = await supabase.rpc('fn_tabla_posiciones', { p_poll_id: pollId })
    const rows = (data || []) as TablaRow[]
    setTabla(rows)

    // Cargar wallets de los top-3 cuando la polla es cripto
    const topIds = rows.slice(0, 3).map(r => r.user_id)
    if (topIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, wallet_address')
        .in('id', topIds)
      const map: Record<string, string | null> = {}
      ;(profiles ?? []).forEach((p: any) => { map[p.id] = p.wallet_address ?? null })
      setWinnerWallets(map)
    }
  }, [pollId])

  const loadAll = useCallback(async () => {
    if (!session || !pollId) return
    const isFirst = !initialLoadDone.current
    if (isFirst) setLoading(true)

    const userId = session.user.id

    const [
      { data: pollData },
      { data: matchesData },
      { data: membersData },
      { data: resultadosData },
    ] = await Promise.all([
      supabase.from('pollas').select('*').eq('id', pollId).single(),
      supabase.from('partidos').select('*').order('fecha_inicio', { ascending: true, nullsFirst: false }).order('orden'),
      supabase.from('poll_members').select('*, profiles(nombre)').eq('poll_id', pollId).order('joined_at'),
      supabase.from('poll_resultados').select('*').eq('poll_id', pollId),
    ])

    const p = pollData as Polla | null

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

    setPoll(p)
    setMatches(ms)
    const membersArr = (membersData || []) as PollMemberWithProfile[]
    setMembers(membersArr)

    // Estado del admin como jugador
    const adminMember = membersArr.find(m => m.user_id === userId)
    const isPagado = adminMember?.pagado ?? false
    setAdminPagado(isPagado)

    // Cargar predicciones del admin siempre que haya pagado
    if (isPagado) {
      const { data: predsData } = await supabase
        .from('predicciones')
        .select('*')
        .eq('poll_id', pollId)
        .eq('user_id', userId)
      const predMap: Record<string, { local: number; visitante: number }> = {}
      const savedIds = new Set<string>()
      ;((predsData || []) as any[]).forEach(pr => {
        predMap[pr.partido_id] = { local: pr.pred_local, visitante: pr.pred_visitante }
        savedIds.add(pr.partido_id)
      })
      setMyPreds(predMap)
      const initSave: Record<string, MatchSave> = {}
      ms.forEach(m => { initSave[m.id] = savedIds.has(m.id) ? 'saved' : 'idle' })
      setMyMatchSaveState(initSave)
    }

    if (p) {
      setExacto(p.reglas.exacto)
      setResultado(p.reglas.resultado)
      setFallo(p.reglas.fallo)
      const premios = p.premios as number[]
      setPrem0(premios[0] ?? 50)
      setPrem1(premios[1] ?? 30)
      setPrem2(premios[2] ?? 20)
      setInscFee(p.inscripcion)
    }

    // Contar apuestas únicas (usuarios que ya apostaron en esta polla)
    const { count } = await supabase
      .from('predicciones')
      .select('user_id', { count: 'exact', head: true })
      .eq('poll_id', pollId)
    setTotalApuestas(count ?? 0)

    // Cargar datos de contacto del admin (solo en primera carga)
    if (isFirst && session) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('contacto_email, contacto_telefono')
        .eq('id', session.user.id)
        .single()
      if (profileData) {
        setContactoEmail((profileData as any).contacto_email ?? '')
        setContactoTel((profileData as any).contacto_telefono ?? '')
      }
    }

    await loadTabla()

    // Si la polla ya estaba cerrada y es cripto, cargar distribución previa
    if (p && p.estado === 'cerrada' && isCryptoMoneda(p.moneda)) {
      const { data: winners } = await supabase
        .from('poll_winners')
        .select('*')
        .eq('poll_id', pollId)
        .order('position')
      if (winners && winners.length > 0) {
        setDistResult(winners.map((w: any) => ({
          user_id: w.user_id,
          puesto: w.position,
          monto: Number(w.amount_token),
          wallet: w.wallet_address || undefined,
          tx_hash: w.tx_hash || undefined,
          celoscan: w.tx_hash ? celoscanTx(w.tx_hash) : undefined,
          status: w.status as WinnerDist['status'],
        })))
      }
    }

    // Cargar pagos cripto (tabla en Personas + reembolsos si cancelada)
    if (p && isCryptoMoneda(p.moneda)) {
      const { data: paymentsData } = await supabase
        .from('poll_payments')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at')
      setPayments((paymentsData || []) as PollPayment[])

      // Si ya está cancelada, reconstruir cancelResult desde los pagos
      if (p.estado === 'cancelada' && paymentsData) {
        setCancelResult(paymentsData
          .filter((pp: any) => pp.status === 'refunded' || pp.status === 'failed')
          .map((pp: any) => ({
            user_id: pp.user_id,
            wallet: pp.wallet_address,
            amount: Number(pp.amount),
            refund_tx_hash: pp.refund_tx_hash || undefined,
            celoscan: pp.refund_tx_hash ? celoscanTx(pp.refund_tx_hash) : undefined,
            status: pp.status as RefundResult['status'],
          }))
        )
      }
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
      .channel(`admin-rt-${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_resultados', filter: `poll_id=eq.${pollId}` }, () => { loadAll() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, () => { loadAll() })
      .subscribe()
    const interval = matches.some(m => m.en_vivo) ? 15_000 : 60_000
    const fallback = setInterval(() => { loadAll() }, interval)
    return () => { supabase.removeChannel(channel); clearInterval(fallback) }
  }, [pollId, loadAll, matches])

  useEffect(() => {
    if (!loading && poll && poll.admin_id !== session?.user.id) {
      navigate(`/pollas/${pollId}`)
    }
  }, [loading, poll, session, pollId, navigate])


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
      reglas: { exacto, resultado, fallo },
      premios: [prem0, prem1, prem2],
      inscripcion: inscFee,
    }).eq('id', pollId)
    setSavingRules(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Reglas guardadas ✓')
    await loadAll()
  }

  const saveContacto = async () => {
    if (!session) return
    setSavingContacto(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        contacto_email: contactoEmail.trim() || null,
        contacto_telefono: contactoTel.trim() || null,
      })
      .eq('id', session.user.id)
    setSavingContacto(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Contacto guardado ✓')
  }

  const cerrarPolla = async () => {
    if (!pollId || !poll) return
    if (!confirm('¿Cerrar la polla y repartir el bote? Esta acción no se puede deshacer fácilmente.')) return
    setClosing(true)

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cerrar-polla`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentSession?.access_token}`,
          },
          body: JSON.stringify({ poll_id: pollId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cerrar')
      if (data.distribution) setDistResult(data.distribution)
      showToast(isCryptoMoneda(poll.moneda) ? '¡Polla cerrada! Cripto distribuida a ganadores.' : '¡Polla cerrada! Ganadores registrados.')
    } catch (err: unknown) {
      showToast('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setClosing(false)
    }

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

  const cancelarPolla = async () => {
    if (!pollId || !poll) return
    setCancelling(true)
    setConfirmCancel(false)
    try {
      if (isCryptoMoneda(poll.moneda)) {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancelar-polla`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentSession?.access_token}`,
            },
            body: JSON.stringify({ poll_id: pollId }),
          }
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al cancelar')
        if (data.refunds) setCancelResult(data.refunds)
        showToast('Polla cancelada. Reembolsos enviados.')
      } else {
        await supabase.from('pollas').update({ estado: 'cancelada' }).eq('id', pollId)
        showToast('Polla cancelada.')
      }
      await loadAll()
    } catch (err: unknown) {
      showToast('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setCancelling(false)
    }
  }

  const expulsarMiembro = async (member: PollMemberWithProfile) => {
    if (!confirm(`¿Quitar a ${member.profiles?.nombre ?? 'este participante'} de la polla?`)) return
    const { error } = await supabase.from('poll_members')
      .delete()
      .eq('poll_id', pollId!)
      .eq('user_id', member.user_id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${member.profiles?.nombre ?? 'Participante'} eliminado`)
    await loadAll()
  }

  const updateAdminPred = (matchId: string, side: 'local' | 'visitante', delta: number) => {
    setMyPreds(prev => {
      const cur = prev[matchId] || { local: 0, visitante: 0 }
      return { ...prev, [matchId]: { ...cur, [side]: Math.max(0, cur[side] + delta) } }
    })
    setMyMatchSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
  }

  const saveAdminPred = async (matchId: string) => {
    if (!session || !pollId) return
    setMyMatchSaveState(prev => ({ ...prev, [matchId]: 'saving' }))
    const { error } = await supabase.from('predicciones').upsert({
      poll_id: pollId,
      user_id: session.user.id,
      partido_id: matchId,
      pred_local: myPreds[matchId]?.local ?? 0,
      pred_visitante: myPreds[matchId]?.visitante ?? 0,
    }, { onConflict: 'poll_id,user_id,partido_id' })
    if (error) {
      setMyMatchSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
      showToast('Error: ' + error.message)
    } else {
      setMyMatchSaveState(prev => ({ ...prev, [matchId]: 'saved' }))
      showToast('Apuesta guardada ✓')
    }
  }

  const copiarCodigo = () => {
    const url = `${window.location.origin}/pollas?join=${poll?.codigo}`
    navigator.clipboard.writeText(url).then(
      () => showToast('¡Link copiado!'),
      () => {
        navigator.clipboard.writeText(poll?.codigo ?? '')
        showToast('Código copiado: ' + poll?.codigo)
      }
    )
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
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <WalletButton />
            <button className="back-btn" onClick={() => navigate('/pollas')}>← Salir</button>
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
            <div className={`tab ${activeTab === 'jugar' ? 'on' : ''}`} onClick={() => setActiveTab('jugar')}
              style={{ color: adminPagado ? 'var(--lime)' : undefined }}>
              {adminPagado ? '⚽ Jugar' : '🔒 Jugar'}
            </div>
          </div>

          {/* ---- TAB: Partidos ---- */}
          {activeTab === 'matches' && (() => {
            const q = matchSearch.trim().toLowerCase()
            const visibleMatches = matches.filter(m => {
              const passesStatus =
                matchView === 'todos' ? true :
                matchView === 'pendientes' ? !m.cerrado :
                m.cerrado
              const passesSearch = !q ||
                m.equipo_local.toLowerCase().includes(q) ||
                m.equipo_visitante.toLowerCase().includes(q) ||
                m.fase.toLowerCase().includes(q)
              return passesStatus && passesSearch
            })
            const pendCount = matches.filter(m => !m.cerrado).length
            const cerCount = matches.filter(m => m.cerrado).length
            return (
              <div>
                {/* Barra de búsqueda y filtros */}
                <div style={{ marginBottom:10 }}>
                  <input
                    className="inp"
                    placeholder="Buscar equipo o fase…"
                    value={matchSearch}
                    onChange={e => setMatchSearch(e.target.value)}
                    style={{ width:'100%', marginBottom:8, boxSizing:'border-box' }}
                  />
                  <div style={{ display:'flex', gap:6 }}>
                    {([
                      { v:'todos',     label:`Todos (${matches.length})` },
                      { v:'pendientes',label:`Pendientes (${pendCount})` },
                      { v:'cerrados',  label:`Cerrados (${cerCount})` },
                    ] as const).map(({ v, label }) => (
                      <button
                        key={v}
                        onClick={() => setMatchView(v)}
                        style={{
                          flex:1, padding:'5px 0', borderRadius:8, border:'1px solid',
                          fontSize:10, fontWeight:700, cursor:'pointer',
                          borderColor: matchView === v ? 'var(--gold)' : 'var(--line)',
                          background: matchView === v ? 'rgba(255,194,75,.1)' : 'var(--panel-2)',
                          color: matchView === v ? 'var(--gold)' : 'var(--muted)',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {visibleMatches.length === 0 && (
                  <div style={{ textAlign:'center', color:'var(--muted)', fontSize:12, padding:16 }}>
                    Sin partidos para este filtro
                  </div>
                )}

                {visibleMatches.map(m => (
                  <div key={m.id} className={`match ${m.cerrado ? 'locked' : ''}`} style={{
                    borderColor: m.en_vivo ? 'rgba(255,90,95,.4)' : undefined,
                    background: m.en_vivo ? 'rgba(255,90,95,.04)' : undefined,
                  }}>
                    <div className="when">
                      <span>{m.fecha}{m.fecha_inicio ? ` · ${horaCO(m.fecha_inicio)}` : ''} · {m.fase}</span>
                      {m.en_vivo
                        ? <span style={{ fontSize:9, fontWeight:700, color:'#fff',
                            background:'#ff2e2e', borderRadius:5,
                            padding:'2px 6px', letterSpacing:.5,
                            animation:'pulse-live 1.4s ease-in-out infinite' }}>⚽ EN VIVO</span>
                        : m.cerrado
                          ? <span className="lockchip">✓ Final</span>
                          : null}
                    </div>

                    {m.en_vivo && (
                      <div style={{ fontSize:9, color:'rgba(255,90,95,.9)', fontWeight:700,
                        textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                        {m.resultado_local !== null ? 'Marcador actual' : 'Partido en curso'}
                      </div>
                    )}
                    <div className="teams" style={{ marginBottom: m.cerrado ? 6 : 0 }}>
                      <div className="team">
                        <div className="code">{teamCode(m.equipo_local)}</div>
                        <div className="tn" style={{ color: m.cerrado && !m.en_vivo ? 'var(--muted)' : undefined }}>{m.equipo_local}</div>
                      </div>
                      <div style={{ minWidth:60, textAlign:'center',
                        fontFamily:"'Anton',sans-serif",
                        fontSize: m.en_vivo ? 26 : m.cerrado ? 22 : 16,
                        color: m.en_vivo ? '#ff2e2e' : m.cerrado ? 'var(--txt)' : 'var(--muted)',
                        letterSpacing:1 }}>
                        {m.cerrado && m.resultado_local !== null
                          ? `${m.resultado_local}–${m.resultado_visitante}`
                          : m.cerrado ? '–' : 'vs'}
                      </div>
                      <div className="team">
                        <div className="code">{teamCode(m.equipo_visitante)}</div>
                        <div className="tn" style={{ color: m.cerrado && !m.en_vivo ? 'var(--muted)' : undefined }}>{m.equipo_visitante}</div>
                      </div>
                    </div>

                    {m.en_vivo
                      ? <div className="ofline set" style={{ color:'rgba(255,90,95,.9)', borderColor:'rgba(255,90,95,.3)' }}>⚽ En vivo · score se actualiza automáticamente</div>
                      : m.cerrado
                        ? <div className="ofline set">✓ Resultado final sincronizado</div>
                        : <div className="ofline pend">Apuestas abiertas · se cierran al arrancar el partido</div>}
                  </div>
                ))}
                <div className="lockmsg" style={{ marginTop:8 }}>
                  Las apuestas se bloquean automáticamente cuando arranca el partido. El resultado se sincroniza solo al terminar.
                </div>
              </div>
            )
          })()}

          {/* ---- TAB: Reglas ---- */}
          {activeTab === 'rules' && (() => {
            const locked = totalApuestas > 0 && !rulesUnlocked
            const inpStyle = locked ? { opacity:.5, pointerEvents:'none' as const } : {}
            return (
            <div>
              {/* Banner de bloqueo */}
              {totalApuestas > 0 && (
                <div style={{ padding:'10px 12px', borderRadius:10, marginBottom:10,
                  background: rulesUnlocked ? 'rgba(255,138,61,.08)' : 'rgba(200,255,60,.06)',
                  border: `1px solid ${rulesUnlocked ? 'rgba(255,138,61,.3)' : 'rgba(200,255,60,.2)'}` }}>
                  {rulesUnlocked ? (
                    <div style={{ fontSize:11, color:'var(--orange)', fontWeight:700 }}>
                      ⚠ Modo edición activo — hay {totalApuestas} apuesta(s) registrada(s).
                      Guardar cambiará los puntos de todos los participantes.
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <div style={{ fontSize:11, color:'var(--lime)' }}>
                        🔒 Reglas bloqueadas · {totalApuestas} apuesta(s) en curso
                      </div>
                      <button
                        onClick={() => setShowUnlockConfirm(true)}
                        style={{ fontSize:10, padding:'4px 12px', borderRadius:8, border:'1px solid rgba(255,138,61,.4)',
                          background:'rgba(255,138,61,.08)', color:'var(--orange)', cursor:'pointer',
                          fontWeight:700, flexShrink:0 }}
                      >
                        Modificar
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="acard" style={inpStyle}>
                <div className="h">Puntuación</div>
                <div className="d">Cuántos puntos vale cada acierto. Visible para todos los miembros.</div>
                <div className="rulegrid" style={{ marginTop:12 }}>
                  <div className="field">
                    <label>Exacto</label>
                    <input className="inp" type="number" min="0" value={exacto}
                      disabled={locked} onChange={e => setExacto(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Resultado</label>
                    <input className="inp" type="number" min="0" value={resultado}
                      disabled={locked} onChange={e => setResultado(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Fallo</label>
                    <input className="inp" type="number" min="0" value={fallo}
                      disabled={locked} onChange={e => setFallo(+e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="acard" style={inpStyle}>
                <div className="h">Inscripción y premios</div>
                <div className="d">Pon 0% en 2° o 3° si quieres un único ganador.</div>
                <div className="field" style={{ marginTop:12 }}>
                  <label>
                    Inscripción ({poll.moneda})
                    {pagados.length > 0 && <span style={{ marginLeft:6, fontSize:9, color:'var(--muted)' }}>· bloqueada ({pagados.length} pagaron)</span>}
                  </label>
                  <input className="inp" type="number" min="0" step="0.5" value={inscFee}
                    disabled={locked || pagados.length > 0}
                    onChange={e => setInscFee(+e.target.value)} />
                </div>
                <div className="rulegrid">
                  <div className="field">
                    <label>1° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem0}
                      disabled={locked} onChange={e => setPrem0(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>2° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem1}
                      disabled={locked} onChange={e => setPrem1(+e.target.value)} />
                  </div>
                  <div className="field">
                    <label>3° %</label>
                    <input className="inp" type="number" min="0" max="100" value={prem2}
                      disabled={locked} onChange={e => setPrem2(+e.target.value)} />
                  </div>
                </div>
                {sumaP !== 100 && (
                  <div className="splitwarn">⚠ Los porcentajes suman {sumaP}%. Deben sumar 100%.</div>
                )}
              </div>

              <div className="acard" style={{ border:'1px solid rgba(200,255,60,.35)' }}>
                <div className="h" style={{ color:'var(--lime)' }}>📋 Tu info de contacto · visible públicamente</div>
                <div style={{ fontSize:11, color:'var(--muted)', background:'rgba(200,255,60,.07)',
                  border:'1px solid rgba(200,255,60,.2)', borderRadius:8, padding:'8px 10px',
                  marginBottom:12, lineHeight:1.6 }}>
                  <b style={{ color:'var(--lime)' }}>Obligatorio:</b> los jugadores ven esta información en la polla para saber quién eres y cómo contactarte. Sin estos datos, nadie puede localizarte si tiene dudas con el pago o las reglas.
                </div>
                <div className="field">
                  <label>Correo electrónico</label>
                  <input className="inp" type="email" value={contactoEmail}
                    onChange={e => setContactoEmail(e.target.value)}
                    placeholder="tu@correo.com" />
                </div>
                <div className="field">
                  <label>WhatsApp / Teléfono</label>
                  <input className="inp" type="tel" value={contactoTel}
                    onChange={e => setContactoTel(e.target.value)}
                    placeholder="+57 300 000 0000" />
                </div>
                <button className="save" onClick={saveContacto} disabled={savingContacto} style={{ margin:'8px 0 0' }}>
                  {savingContacto ? 'Guardando...' : 'Guardar contacto'}
                </button>
              </div>

              {!locked && (
                <div className="admin-box" style={{ marginBottom:12 }}>
                  <div className="admin-box-label">🛡️ Acción de admin</div>
                  <button className="save gold" onClick={async () => { await saveRules(); setRulesUnlocked(false) }}
                    disabled={savingRules || sumaP !== 100} style={{ margin:0 }}>
                    {savingRules ? 'Guardando...' : 'Guardar reglas'}
                  </button>
                  {rulesUnlocked && (
                    <button onClick={() => setRulesUnlocked(false)}
                      style={{ marginTop:6, fontSize:11, padding:'6px 14px', borderRadius:8,
                        border:'1px solid var(--line)', background:'var(--panel-2)',
                        color:'var(--muted)', cursor:'pointer', display:'block', width:'100%' }}>
                      Cancelar edición
                    </button>
                  )}
                </div>
              )}
            </div>
            )
          })()}

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
                        <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end', flexShrink:0 }}>
                          <button
                            className={`toggle ${m.pagado ? 'paid' : 'unpaid'}`}
                            onClick={() => togglePagado(m)}
                          >
                            {m.pagado ? 'Pagó ✓' : 'Pendiente'}
                          </button>
                          {!isAdminUser && (
                            <button
                              onClick={() => expulsarMiembro(m)}
                              style={{ fontSize:9, padding:'2px 7px', borderRadius:6,
                                border:'1px solid rgba(255,90,95,.3)', background:'rgba(255,90,95,.07)',
                                color:'var(--lose)', cursor:'pointer' }}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="scoring">
                <span className="ttl">Código de invitación</span>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:6 }}>
                  <b style={{ fontFamily:"'Anton',sans-serif", fontSize:20, letterSpacing:4 }}>{poll.codigo}</b>
                  <button
                    onClick={copiarCodigo}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--lime)',
                      background:'rgba(200,255,60,.08)', color:'var(--lime)', fontSize:11,
                      fontWeight:700, cursor:'pointer', letterSpacing:.5, flexShrink:0 }}
                  >
                    Copiar link
                  </button>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                  Comparte este código o el link directo para que otros se unan.
                </div>
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

              {/* Pagos on-chain (solo pollas cripto) */}
              {isCryptoMoneda(poll.moneda) && payments.length > 0 && (
                <div className="acard" style={{ marginTop:10 }}>
                  <div className="h">Pagos on-chain · {monedaToToken(poll.moneda)}</div>
                  <div style={{ marginTop:8 }}>
                    {payments.map((p, i) => {
                      const member = members.find(m => m.user_id === p.user_id)
                      return (
                        <div key={p.id} style={{ padding:'7px 0',
                          borderBottom: i < payments.length - 1 ? '1px solid var(--line)' : 'none' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                            <b style={{ color:'var(--txt)' }}>{member?.profiles?.nombre ?? p.user_id.slice(0,8)}</b>
                            <span style={{
                              color: p.status === 'confirmed' ? 'var(--win)'
                                : p.status === 'refunded' ? 'var(--gold)'
                                : p.status === 'failed' ? 'var(--lose)'
                                : 'var(--muted)',
                              fontWeight:700, fontSize:10
                            }}>
                              {p.status === 'confirmed' ? `✓ ${fmt(p.amount)} ${p.token}`
                                : p.status === 'refunded' ? `↩ Reembolsado`
                                : p.status === 'failed' ? `✗ Error`
                                : `⏳ Pendiente`}
                            </span>
                          </div>
                          <div style={{ fontSize:9, color:'var(--muted)', marginTop:2, fontFamily:'monospace', wordBreak:'break-all' }}>
                            {p.wallet_address.slice(0,6)}…{p.wallet_address.slice(-4)}
                            {p.tx_hash && (
                              <> ·{' '}
                                <a href={celoscanTx(p.tx_hash)} target="_blank" rel="noopener noreferrer"
                                  style={{ color:'var(--lime)' }}>
                                  dep: {p.tx_hash.slice(0,8)}…
                                </a>
                              </>
                            )}
                            {p.refund_tx_hash && (
                              <> ·{' '}
                                <a href={celoscanTx(p.refund_tx_hash)} target="_blank" rel="noopener noreferrer"
                                  style={{ color:'var(--gold)' }}>
                                  ref: {p.refund_tx_hash.slice(0,8)}…
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

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
                      {tabla.slice(0, nPremios).map((row, i) => {
                        const wallet = winnerWallets[row.user_id]
                        const isCrypto = isCryptoMoneda(poll.moneda)
                        return (
                          <div key={row.user_id} className={`wcard g${i + 1}`}>
                            <div className="wmedal">{MEDALS[i]}</div>
                            <div className="winfo">
                              <div className="wname">{row.nombre}</div>
                              <div className="wsub">{row.puntos} pts · {row.exactos} exactos</div>
                              {isCrypto && (
                                wallet
                                  ? <div style={{ fontSize:9, color:'var(--lime)', marginTop:2, wordBreak:'break-all', fontFamily:'monospace' }}>
                                      {wallet.slice(0,6)}...{wallet.slice(-4)}
                                    </div>
                                  : <div style={{ fontSize:9, color:'var(--gold)', marginTop:2, fontWeight:700 }}>
                                      Sin wallet · no recibirá cripto
                                    </div>
                              )}
                            </div>
                            <div className="wprize">
                              <div className="pa">{fmt(bote * premios[i] / 100)}</div>
                              <div className="pl">{poll.moneda}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {isCryptoMoneda(poll.moneda) && tabla.slice(0, nPremios).some(r => !winnerWallets[r.user_id]) && (
                    <div className="hook warn" style={{ marginBottom:8, lineHeight:1.5 }}>
                      Uno o más ganadores no tienen wallet conectada. El pago quedará pendiente hasta que conecten su wallet.
                    </div>
                  )}

                  {tabla.length === 0 && (
                    <div className="acard">
                      <div className="d" style={{ textAlign:'center' }}>
                        No hay miembros pagados con partidos cerrados aún.
                      </div>
                    </div>
                  )}

                </>
              ) : poll.estado === 'cancelada' ? (
                <>
                  <div className="acard">
                    <div className="h">❌ Polla cancelada <span className="badge closed">cancelada</span></div>
                    <div className="d">
                      {isCryptoMoneda(poll.moneda)
                        ? `Se reembolsaron ${monedaToToken(poll.moneda)} a los participantes que habían pagado.`
                        : 'La polla fue cancelada.'}
                    </div>
                  </div>

                  {isCryptoMoneda(poll.moneda) && cancelResult.length > 0 && (
                    <div className="acard" style={{ marginTop:10 }}>
                      <div className="h">Reembolsos on-chain</div>
                      {cancelResult.map((r, i) => (
                        <div key={r.user_id} style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', padding:'6px 0',
                          borderBottom: i < cancelResult.length - 1 ? '1px solid var(--line)' : 'none', fontSize:11 }}>
                          <span style={{ color:'var(--muted)', fontFamily:'monospace', fontSize:10 }}>
                            {r.wallet.slice(0,6)}…{r.wallet.slice(-4)}
                            <b style={{ color:'var(--txt)', fontFamily:'inherit', marginLeft:6 }}>
                              {fmt(r.amount)} {monedaToToken(poll.moneda)}
                            </b>
                          </span>
                          {r.status === 'refunded' && r.refund_tx_hash ? (
                            <a
                              href={celoscanTx(r.refund_tx_hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize:10, color:'var(--gold)', fontWeight:700 }}
                            >
                              {r.refund_tx_hash.slice(0,8)}… →
                            </a>
                          ) : (
                            <span style={{ fontSize:10, color:'var(--lose)', fontWeight:600 }}>Falló</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                    {tabla.slice(0, nPremios).map((row, i) => {
                      const dist = distResult.find(d => d.user_id === row.user_id)
                      const isCrypto = isCryptoMoneda(poll.moneda)
                      return (
                        <div key={row.user_id} className={`wcard g${i + 1}`}>
                          <div className="wmedal">{MEDALS[i]}</div>
                          <div className="winfo">
                            <div className="wname">{row.nombre}</div>
                            <div className="wsub">{row.puntos} pts · {row.exactos} exactos</div>
                            {isCrypto && dist && (
                              dist.status === 'sent' && dist.tx_hash
                                ? <a
                                    href={celoscanTx(dist.tx_hash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize:9, color:'var(--lime)', fontWeight:700, marginTop:2, display:'block' }}
                                  >
                                    Enviado · ver en Celoscan →
                                  </a>
                                : dist.status === 'pending_wallet'
                                  ? <div style={{ fontSize:9, color:'var(--gold)', marginTop:2, fontWeight:700 }}>
                                      Pendiente · sin wallet
                                    </div>
                                  : <div style={{ fontSize:9, color:'var(--lose)', marginTop:2, fontWeight:700 }}>
                                      Error en transferencia
                                    </div>
                            )}
                          </div>
                          <div className="wprize">
                            <div className="pa">{fmt(bote * premios[i] / 100)}</div>
                            <div className="pl">{poll.moneda}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {isCryptoMoneda(poll.moneda) && distResult.length > 0 && (
                    <div className="acard" style={{ marginTop:10 }}>
                      <div className="h">Distribución on-chain</div>
                      {distResult.map((d, i) => (
                        <div key={d.user_id} style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', padding:'6px 0',
                          borderBottom: i < distResult.length - 1 ? '1px solid var(--line)' : 'none', fontSize:11 }}>
                          <span style={{ color:'var(--muted)' }}>
                            {MEDALS[d.puesto - 1]} <b style={{ color:'var(--txt)' }}>{fmt(d.monto)} {monedaToToken(poll.moneda)}</b>
                          </span>
                          {d.status === 'sent' && d.tx_hash ? (
                            <a
                              href={celoscanTx(d.tx_hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize:10, color:'var(--lime)', fontWeight:700 }}
                            >
                              {d.tx_hash.slice(0,8)}… →
                            </a>
                          ) : d.status === 'pending_wallet' ? (
                            <span style={{ fontSize:10, color:'var(--gold)', fontWeight:600 }}>Pendiente wallet</span>
                          ) : (
                            <span style={{ fontSize:10, color:'var(--lose)', fontWeight:600 }}>Falló</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="admin-box" style={{ marginBottom:8 }}>
                    <div className="admin-box-label">🛡️ Acción de admin</div>
                    <button className="save ghost" onClick={reabrirPolla} style={{ margin:0 }}>Reabrir polla</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---- TAB: Jugar ---- */}
          {activeTab === 'jugar' && (() => {
            const openMatches = matches.filter(m => !m.cerrado && poll.estado === 'abierta')
            const closedMatches = matches.filter(m => m.cerrado)
            return (
              <div>
                {!adminPagado ? (
                  <div>
                    <div className="acard" style={{ borderColor:'rgba(255,194,75,.25)', background:'rgba(255,194,75,.04)', marginBottom:12 }}>
                      <div className="h" style={{ color:'var(--gold)' }}>🔒 Habilitar como jugador</div>
                      <div className="d" style={{ lineHeight:1.7 }}>
                        Eres el organizador, pero <b>no has pagado la inscripción</b> todavía.
                        Para poder hacer pronósticos y competir por el bote, debes pagar igual que cualquier jugador.
                      </div>
                    </div>

                    {isCryptoMoneda(poll.moneda) ? (
                      <PaymentButton
                        pollId={poll.id}
                        amount={poll.inscripcion}
                        moneda={poll.moneda}
                        onSuccess={async () => {
                          setAdminPagado(true)
                          await loadAll()
                          showToast('¡Pago confirmado! Ya puedes hacer tus pronósticos.')
                        }}
                      />
                    ) : (
                      <div className="hook warn" style={{ textAlign:'left', lineHeight:1.5 }}>
                        💰 Polla en efectivo — pide a otro admin que marque tu pago en la pestaña <b>Gente</b>.
                      </div>
                    )}

                    <div className="lockmsg" style={{ marginTop:10 }}>
                      Mientras no pagues, todas las funciones de apuesta estarán bloqueadas para ti.
                    </div>
                  </div>
                ) : (
                  <div>
                    {openMatches.length === 0 && closedMatches.length === 0 && (
                      <div className="acard">
                        <div className="d" style={{ textAlign:'center' }}>No hay partidos disponibles.</div>
                      </div>
                    )}

                    {openMatches.length > 0 && (
                      <>
                        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>
                          Pronósticos antes de que arranquen los partidos.
                        </div>
                        {openMatches.map(m => {
                          const ms = myMatchSaveState[m.id] || 'idle'
                          return (
                            <div key={m.id} className="match">
                              <div className="when">
                                <span>{m.fecha}{m.fecha_inicio ? ` · ${horaCO(m.fecha_inicio)}` : ''} · {m.fase}</span>
                                <span style={{ fontSize:9, color:'var(--muted)' }}>📌 apuesta</span>
                              </div>
                              <div className="teams">
                                <div className="team">
                                  <div className="code">{teamCode(m.equipo_local)}</div>
                                  <div className="tn">{m.equipo_local}</div>
                                </div>
                                <div className="step">
                                  <button onClick={() => updateAdminPred(m.id, 'local', -1)} disabled={(myPreds[m.id]?.local ?? 0) === 0}>−</button>
                                  <div className="sv">{myPreds[m.id]?.local ?? 0}</div>
                                  <button onClick={() => updateAdminPred(m.id, 'local', 1)}>+</button>
                                </div>
                                <div className="midv">:</div>
                                <div className="step">
                                  <button onClick={() => updateAdminPred(m.id, 'visitante', -1)} disabled={(myPreds[m.id]?.visitante ?? 0) === 0}>−</button>
                                  <div className="sv">{myPreds[m.id]?.visitante ?? 0}</div>
                                  <button onClick={() => updateAdminPred(m.id, 'visitante', 1)}>+</button>
                                </div>
                                <div className="team">
                                  <div className="code">{teamCode(m.equipo_visitante)}</div>
                                  <div className="tn">{m.equipo_visitante}</div>
                                </div>
                              </div>
                              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
                                <button
                                  className={`match-save-mini ${ms}`}
                                  onClick={() => saveAdminPred(m.id)}
                                  disabled={ms === 'saving'}
                                >
                                  {ms === 'saving' ? '…' : ms === 'saved' ? '✓ Confirmada' : 'Confirmar apuesta'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        <div className="lockmsg">🔒 Cada apuesta se bloquea automáticamente cuando arranca el partido</div>
                      </>
                    )}

                    {closedMatches.length > 0 && (
                      <div style={{ marginTop: openMatches.length > 0 ? 18 : 0 }}>
                        <div className="elimhdr" style={{ marginBottom:8 }}>
                          🔒 {openMatches.length > 0 ? 'Partidos ya cerrados' : 'Todos los partidos cerrados'}
                        </div>
                        {closedMatches.map(m => {
                          const pr = myPreds[m.id]
                          const hasResult = m.resultado_local !== null
                          return (
                            <div key={m.id} className="match" style={{
                              borderColor: m.en_vivo ? 'rgba(255,90,95,.4)' : 'rgba(255,255,255,.08)',
                              background: m.en_vivo ? 'rgba(255,90,95,.04)' : undefined,
                            }}>
                              <div className="when">
                                <span style={{ color:'var(--muted)' }}>{m.fecha} · {m.fase}</span>
                                {m.en_vivo
                                  ? <span style={{ fontSize:9, fontWeight:700, color:'#fff', background:'#ff2e2e', borderRadius:5, padding:'2px 6px', letterSpacing:.5, animation:'pulse-live 1.4s ease-in-out infinite' }}>⚽ EN VIVO</span>
                                  : <span style={{ fontSize:9, color:'var(--muted)', fontWeight:700 }}>✓ Final</span>
                                }
                              </div>
                              <div className="teams">
                                <div className="team">
                                  <div className="code">{teamCode(m.equipo_local)}</div>
                                  <div className="tn" style={{ color:'var(--muted)' }}>{m.equipo_local}</div>
                                </div>
                                <div style={{ minWidth:60, textAlign:'center', fontFamily:"'Anton',sans-serif", fontSize:20, color: m.en_vivo ? '#ff2e2e' : 'var(--txt)', letterSpacing:1 }}>
                                  {hasResult ? `${m.resultado_local}–${m.resultado_visitante}` : '–'}
                                </div>
                                <div className="team">
                                  <div className="code">{teamCode(m.equipo_visitante)}</div>
                                  <div className="tn" style={{ color:'var(--muted)' }}>{m.equipo_visitante}</div>
                                </div>
                              </div>
                              <div style={{ textAlign:'center', fontSize:10, color:'var(--muted)', marginTop:6 }}>
                                Tu apuesta: <b style={{ color:'var(--txt)' }}>{pr ? `${pr.local}–${pr.visitante}` : 'Sin apuesta'}</b>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {tabla.length > 0 && (
                      <div className="acard" style={{ marginTop:14 }}>
                        <div className="h">Tabla de posiciones</div>
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
                                {inPodium && <small>· podio</small>}
                                <small>{row.exactos} exactos · {row.resultados} resultados</small>
                              </div>
                              <div className="pp">{row.puntos} <small>pts</small></div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

        </div>

        <Toast msg={toast} />
      </div>

      {/* Modal de confirmación para desbloquear reglas */}
      {showUnlockConfirm && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">⚠ Modificar reglas</div>
              <button className="modal-close" onClick={() => setShowUnlockConfirm(false)}>×</button>
            </div>
            <div style={{ fontSize:13, color:'var(--txt)', lineHeight:1.6, marginBottom:16 }}>
              Hay <b style={{ color:'var(--gold)' }}>{totalApuestas} apuesta(s)</b> registrada(s) en esta polla.
              <br /><br />
              Cambiar los puntos o premios afectará la tabla de posiciones de todos los participantes.
              <b style={{ color:'var(--orange)' }}> Esta acción no se puede deshacer.</b>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
              Si los jugadores ya acordaron las reglas, considera hacer una votación antes de cambiarlas.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                className="save gold"
                style={{ flex:1, margin:0 }}
                onClick={() => { setRulesUnlocked(true); setShowUnlockConfirm(false); setActiveTab('rules') }}
              >
                Entiendo, modificar igual
              </button>
              <button
                onClick={() => setShowUnlockConfirm(false)}
                style={{ flex:1, padding:'10px', borderRadius:10, border:'1px solid var(--line)',
                  background:'var(--panel-2)', color:'var(--muted)', cursor:'pointer', fontSize:13 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}