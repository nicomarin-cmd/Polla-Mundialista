import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { WalletButton } from '../components/WalletButton'
import { isCryptoMoneda, celoscanTx, monedaToToken } from '../lib/celoTokens'
import type { Polla, Partido, PollMemberWithProfile, TablaRow, Alcance, PollPayment, PollResultado } from '../types'

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

const ALCANCE_OPTS: { id: Alcance; ico: string; title: string; desc: string }[] = [
  { id: 'mundial',       ico: '🌍', title: 'Todo el Mundial',     desc: 'Todos los partidos: grupos + eliminatorias' },
  { id: 'grupos',        ico: '🏟️', title: 'Solo Fase de Grupos', desc: 'Solo los 48 partidos de la fase de grupos' },
  { id: 'eliminatorias', ico: '⚡', title: 'Solo Eliminatorias',   desc: 'Desde los 32avos hasta la gran final' },
  { id: 'seleccion',     ico: '🎯', title: 'Partidos a elegir',    desc: 'Marcá manualmente cuáles partidos entran' },
]

function isGrupo(fase: string) { return /grupo/i.test(fase) }

const EQUIPOS_TOP = new Set([
  'Brasil','Brazil','Argentina','Francia','France','España','Spain',
  'Alemania','Germany','Inglaterra','England','Portugal','México','Mexico',
  'Uruguay','Holanda','Netherlands','Croacia','Croatia','Colombia',
  'Bélgica','Belgium','Italia','Italy','Japón','Japan','Marruecos','Morocco',
])

function isFavorito(m: Partido) {
  return m.destacado || EQUIPOS_TOP.has(m.equipo_local) || EQUIPOS_TOP.has(m.equipo_visitante)
}

type SelCategory = 'todos' | 'colombia' | 'favoritos' | 'grupos' | 'elim'

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

  const [poll, setPoll] = useState<Polla | null>(null)
  const [matches, setMatches] = useState<Partido[]>([])
  const [members, setMembers] = useState<PollMemberWithProfile[]>([])
  const [tabla, setTabla] = useState<TablaRow[]>([])
  const [activeTab, setActiveTab] = useState<'matches' | 'rules' | 'people' | 'close'>('matches')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')


  // Apuestas propias del admin (igual que PollPlayer)
  const [adminPreds, setAdminPreds] = useState<Record<string, { local: number; visitante: number }>>({})
  const [adminSaveState, setAdminSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({})
  const [myMember, setMyMember] = useState<{ pagado: boolean } | null>(null)

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

  // Filtros tab Partidos
  const [matchSearch, setMatchSearch] = useState('')
  const [matchView, setMatchView] = useState<'todos' | 'pendientes' | 'cerrados'>('todos')

  // Filtros selección manual (Reglas)
  const [selSearch, setSelSearch] = useState('')
  const [selCategory, setSelCategory] = useState<SelCategory>('todos')

  const [syncing, setSyncing] = useState(false)
  const [closing, setClosing] = useState(false)
  // Registro manual de resultados (fallback si API no responde)
  const [pendingScores, setPendingScores] = useState<Record<string, { local: number; visitante: number }>>({})
  const [savingScore, setSavingScore] = useState<Record<string, boolean>>({})
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

  const syncScores = async () => {
    setSyncing(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-scores`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${currentSession?.access_token}`,
          },
          body: '{}',
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al sincronizar')
      showToast(`Sync OK · ${data.synced} partido(s) actualizado(s)`)
      await loadAll()
    } catch (err: unknown) {
      showToast('Error sync: ' + (err instanceof Error ? err.message : 'desconocido'))
    } finally {
      setSyncing(false)
    }
  }

  const saveScore = async (matchId: string, final: boolean) => {
    const score = pendingScores[matchId]
    if (score == null || !pollId) return
    setSavingScore(prev => ({ ...prev, [matchId]: true }))
    const { error } = await supabase.from('poll_resultados').upsert({
      poll_id: pollId,
      partido_id: matchId,
      resultado_local:     score.local,
      resultado_visitante: score.visitante,
      cerrado: final,
    }, { onConflict: 'poll_id,partido_id' })
    setSavingScore(prev => ({ ...prev, [matchId]: false }))
    if (error) showToast('Error: ' + error.message)
    else {
      showToast(final ? 'Resultado final registrado ✓' : 'Marcador actualizado ✓')
      await loadAll()
    }
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
    setLoading(true)

    const userId = session.user.id

    const [
      { data: pollData },
      { data: matchesData },
      { data: membersData },
      { data: resultadosData },
      { data: myMemberData },
      { data: adminPredsData },
    ] = await Promise.all([
      supabase.from('pollas').select('*').eq('id', pollId).single(),
      supabase.from('partidos').select('*').order('fecha_inicio', { ascending: true, nullsFirst: false }).order('orden'),
      supabase.from('poll_members').select('*, profiles(nombre)').eq('poll_id', pollId).order('joined_at'),
      supabase.from('poll_resultados').select('*').eq('poll_id', pollId),
      supabase.from('poll_members').select('pagado').eq('poll_id', pollId).eq('user_id', userId).single(),
      supabase.from('predicciones').select('*').eq('poll_id', pollId).eq('user_id', userId),
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
        resultado_local:     dbRow?.resultado_local     ?? null,
        resultado_visitante: dbRow?.resultado_visitante ?? null,
        cerrado:  finalizado || enVivo,
        en_vivo:  enVivo,
      }
    })

    setPoll(p)
    setMatches(ms)
    // Inicializar marcadores manuales con lo que ya hay en la BD
    setPendingScores(prev => {
      const next = { ...prev }
      ms.forEach(m => {
        if (!(m.id in next)) {
          next[m.id] = {
            local:     m.resultado_local     ?? 0,
            visitante: m.resultado_visitante ?? 0,
          }
        }
      })
      return next
    })
    setMembers((membersData || []) as PollMemberWithProfile[])
    setMyMember(myMemberData as { pagado: boolean } | null)

    // Cargar apuestas propias del admin
    const predMap: Record<string, { local: number; visitante: number }> = {}
    const savedPredIds = new Set<string>()
    ;((adminPredsData || []) as { partido_id: string; pred_local: number; pred_visitante: number }[])
      .forEach(pr => {
        predMap[pr.partido_id] = { local: pr.pred_local, visitante: pr.pred_visitante }
        savedPredIds.add(pr.partido_id)
      })
    setAdminPreds(predMap)
    const initSave: Record<string, 'idle' | 'saving' | 'saved'> = {}
    ms.forEach(m => { initSave[m.id] = savedPredIds.has(m.id) ? 'saved' : 'idle' })
    setAdminSaveState(initSave)

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

    setLoading(false)
  }, [session, pollId, loadTabla])

  useEffect(() => { loadAll() }, [loadAll])

  // Realtime: reacciona al instante cuando el cron escribe resultados
  // Fallback: refresca cada 60s por si el canal WebSocket se interrumpe
  useEffect(() => {
    if (!pollId) return
    const channel = supabase
      .channel(`admin-rt-${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_resultados', filter: `poll_id=eq.${pollId}` }, () => { loadAll() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partidos' }, () => { loadAll() })
      .subscribe()
    const fallback = setInterval(() => { loadAll() }, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(fallback) }
  }, [pollId, loadAll])

  useEffect(() => {
    if (!loading && poll && poll.admin_id !== session?.user.id) {
      navigate(`/pollas/${pollId}`)
    }
  }, [loading, poll, session, pollId, navigate])

  const updateAdminPred = (matchId: string, side: 'local' | 'visitante', delta: number) => {
    setAdminPreds(prev => {
      const cur = prev[matchId] || { local: 0, visitante: 0 }
      return { ...prev, [matchId]: { ...cur, [side]: Math.max(0, cur[side] + delta) } }
    })
    setAdminSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
  }

  const saveAdminPred = async (matchId: string) => {
    if (!session || !pollId) return
    setAdminSaveState(prev => ({ ...prev, [matchId]: 'saving' }))
    const pred = adminPreds[matchId] || { local: 0, visitante: 0 }
    const { error } = await supabase.from('predicciones').upsert({
      poll_id: pollId,
      user_id: session.user.id,
      partido_id: matchId,
      pred_local: pred.local,
      pred_visitante: pred.visitante,
    }, { onConflict: 'poll_id,user_id,partido_id' })
    if (error) {
      setAdminSaveState(prev => ({ ...prev, [matchId]: 'idle' }))
      showToast('Error al guardar apuesta: ' + error.message)
    } else {
      setAdminSaveState(prev => ({ ...prev, [matchId]: 'saved' }))
      showToast('Apuesta confirmada ✓')
    }
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
    if (!pollId || !poll) return
    if (!confirm('¿Cerrar la polla y repartir el bote? Esta acción no se puede deshacer fácilmente.')) return
    setClosing(true)

    // Pollas cripto: llamar Edge Function (cierra + distribuye USDC)
    if (isCryptoMoneda(poll.moneda)) {
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
        showToast('¡Polla cerrada! USDC distribuido a ganadores.')
      } catch (err: unknown) {
        showToast('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
      } finally {
        setClosing(false)
      }
    } else {
      // Pollas fiat: flujo original
      const { error } = await supabase.rpc('fn_cerrar_polla', { p_poll_id: pollId })
      setClosing(false)
      if (error) { showToast('Error al cerrar: ' + error.message); return }
      showToast('¡Polla cerrada! Ganadores registrados.')
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
          <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end' }}>
            <div style={{ display:'flex', gap:6 }}>
              <WalletButton />
              <button className="back-btn" onClick={() => navigate('/pollas')}>← Salir</button>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button
                className="back-btn"
                style={{ color:'var(--lime)', borderColor:'rgba(200,255,60,.3)' }}
                onClick={syncScores}
                disabled={syncing}
                title="Sincronizar scores desde football-data.org"
              >
                {syncing ? '⏳' : '⚡ Sync'}
              </button>
              <button className="back-btn" style={{ color:'var(--lime)', borderColor:'rgba(200,255,60,.3)' }}
                onClick={() => navigate(`/pollas/${pollId}`)}>
                Vista jugador
              </button>
            </div>
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

                {visibleMatches.map(m => {
                  const pred = adminPreds[m.id]
                  const ms = adminSaveState[m.id] || 'idle'
                  const predLabel = pred
                    ? pred.local > pred.visitante ? `${m.equipo_local} gana`
                      : pred.visitante > pred.local ? `${m.equipo_visitante} gana`
                      : 'Empate'
                    : 'Sin apuesta aún'
                  return (
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
                            : m.destacado ? <span className="star">⭐ Colombia</span> : null}
                      </div>

                      {/* Sección de apuesta propia (todos apuestan, incluyendo el admin) */}
                      {!m.cerrado ? (
                        <>
                          <div style={{ fontSize:9, color:'var(--lime)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                            Tu apuesta
                          </div>
                          <div className="teams">
                            <div className="team">
                              <div className="fl">{m.flag_local}</div>
                              <div className="tn">{m.equipo_local}</div>
                            </div>
                            <div className="step">
                              <button onClick={() => updateAdminPred(m.id, 'local', -1)} disabled={(pred?.local ?? 0) === 0}>−</button>
                              <div className="sv">{pred?.local ?? 0}</div>
                              <button onClick={() => updateAdminPred(m.id, 'local', 1)}>+</button>
                            </div>
                            <div className="midv">:</div>
                            <div className="step">
                              <button onClick={() => updateAdminPred(m.id, 'visitante', -1)} disabled={(pred?.visitante ?? 0) === 0}>−</button>
                              <div className="sv">{pred?.visitante ?? 0}</div>
                              <button onClick={() => updateAdminPred(m.id, 'visitante', 1)}>+</button>
                            </div>
                            <div className="team">
                              <div className="fl">{m.flag_visitante}</div>
                              <div className="tn">{m.equipo_visitante}</div>
                            </div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8, marginBottom:10 }}>
                            <div className={`pred ${pred ? '' : 'muted'}`} style={{ margin:0, fontSize:11 }}>
                              {predLabel}
                            </div>
                            <button
                              className={`match-save-mini ${ms}`}
                              onClick={() => saveAdminPred(m.id)}
                              disabled={ms === 'saving'}
                            >
                              {ms === 'saving' ? '…' : ms === 'saved' ? '✓ Confirmada' : 'Confirmar apuesta'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {m.en_vivo && (
                            <div style={{ fontSize:9, color:'rgba(255,90,95,.9)', fontWeight:700,
                              textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                              {m.resultado_local !== null ? 'Marcador actual' : 'Partido en curso'}
                            </div>
                          )}
                          {/* Equipos + marcador */}
                          <div className="teams" style={{ marginBottom:6 }}>
                            <div className="team">
                              <div className="fl">{m.flag_local}</div>
                              <div className="tn">{m.equipo_local}</div>
                            </div>
                            <div style={{ minWidth:60, textAlign:'center',
                              fontFamily:"'Anton',sans-serif",
                              fontSize: m.en_vivo ? 26 : 22,
                              color: m.en_vivo ? '#ff2e2e' : 'var(--txt)',
                              letterSpacing:1 }}>
                              {m.resultado_local !== null ? `${m.resultado_local}–${m.resultado_visitante}` : '–'}
                            </div>
                            <div className="team">
                              <div className="fl">{m.flag_visitante}</div>
                              <div className="tn">{m.equipo_visitante}</div>
                            </div>
                          </div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8, textAlign:'center' }}>
                            Tu apuesta: <b style={{ color:'var(--txt)' }}>{pred ? `${pred.local}–${pred.visitante}` : 'Sin apuesta'}</b>
                          </div>

                          {/* Entrada manual de resultado */}
                          <div style={{ display:'flex', gap:6, alignItems:'center', justifyContent:'center', marginBottom:6 }}>
                            <input
                              type="number" min="0" max="30"
                              value={pendingScores[m.id]?.local ?? 0}
                              onChange={e => setPendingScores(prev => ({
                                ...prev,
                                [m.id]: { local: Math.max(0, parseInt(e.target.value) || 0), visitante: prev[m.id]?.visitante ?? 0 }
                              }))}
                              style={{ width:38, textAlign:'center', padding:'4px 2px', borderRadius:6,
                                border:'1px solid var(--line)', background:'var(--panel-2)', color:'var(--txt)',
                                fontFamily:"'Anton',sans-serif", fontSize:16 }}
                            />
                            <span style={{ color:'var(--muted)', fontFamily:"'Anton',sans-serif", fontSize:16 }}>–</span>
                            <input
                              type="number" min="0" max="30"
                              value={pendingScores[m.id]?.visitante ?? 0}
                              onChange={e => setPendingScores(prev => ({
                                ...prev,
                                [m.id]: { local: prev[m.id]?.local ?? 0, visitante: Math.max(0, parseInt(e.target.value) || 0) }
                              }))}
                              style={{ width:38, textAlign:'center', padding:'4px 2px', borderRadius:6,
                                border:'1px solid var(--line)', background:'var(--panel-2)', color:'var(--txt)',
                                fontFamily:"'Anton',sans-serif", fontSize:16 }}
                            />
                            {m.en_vivo ? (
                              <button
                                onClick={() => saveScore(m.id, false)}
                                disabled={savingScore[m.id]}
                                style={{ fontSize:9, padding:'5px 10px', borderRadius:6, border:'1px solid rgba(255,90,95,.4)',
                                  background:'rgba(255,90,95,.08)', color:'#ff5a5f', cursor:'pointer', fontWeight:700 }}
                              >
                                {savingScore[m.id] ? '…' : '↻ Actualizar'}
                              </button>
                            ) : (
                              <button
                                onClick={() => saveScore(m.id, true)}
                                disabled={savingScore[m.id]}
                                style={{ fontSize:9, padding:'5px 10px', borderRadius:6, border:'1px solid rgba(200,255,60,.3)',
                                  background:'rgba(200,255,60,.08)', color:'var(--lime)', cursor:'pointer', fontWeight:700 }}
                              >
                                {savingScore[m.id] ? '…' : '✓ Registrar final'}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {m.en_vivo
                        ? <div className="ofline set" style={{ color:'rgba(255,90,95,.9)', borderColor:'rgba(255,90,95,.3)' }}>⚽ En vivo · score se actualiza por API cada minuto</div>
                        : m.cerrado
                          ? <div className="ofline set">✓ Resultado final</div>
                          : <div className="ofline pend">Apuestas abiertas · se cierran al arrancar el partido</div>}
                    </div>
                  )
                })}
                <div className="lockmsg" style={{ marginTop:8 }}>
                  Las apuestas se bloquean automáticamente cuando arranca el partido. Registra el resultado oficial después del pitazo final.
                </div>
              </div>
            )
          })()}

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
                {alcanceOp === 'seleccion' && (() => {
                  const colombiaMatches = matches.filter(m => m.destacado)
                  const favMatches = matches.filter(m => !m.destacado && isFavorito(m))
                  const grupoMatches = matches.filter(m => isGrupo(m.fase) && !isFavorito(m))
                  const elimMatches = matches.filter(m => !isGrupo(m.fase) && !isFavorito(m))

                  const catCounts: Record<SelCategory, number> = {
                    todos: matches.length,
                    colombia: colombiaMatches.length,
                    favoritos: colombiaMatches.length + favMatches.length,
                    grupos: grupoMatches.length,
                    elim: elimMatches.length,
                  }

                  const sq = selSearch.trim().toLowerCase()
                  const filterBySearch = (ms: Partido[]) =>
                    sq ? ms.filter(m =>
                      m.equipo_local.toLowerCase().includes(sq) ||
                      m.equipo_visitante.toLowerCase().includes(sq)
                    ) : ms

                  let sections: { label: string; ms: Partido[] }[] = []
                  if (selCategory === 'todos') {
                    const col = filterBySearch(colombiaMatches)
                    const fav = filterBySearch(favMatches)
                    const grp = filterBySearch(grupoMatches)
                    const eli = filterBySearch(elimMatches)
                    if (col.length) sections.push({ label:'⭐ Colombia', ms: col })
                    if (fav.length) sections.push({ label:'🔥 Favoritos', ms: fav })
                    if (grp.length) sections.push({ label:'🏟️ Fase de Grupos', ms: grp })
                    if (eli.length) sections.push({ label:'⚡ Eliminatorias', ms: eli })
                  } else if (selCategory === 'colombia') {
                    sections = [{ label:'⭐ Colombia', ms: filterBySearch(colombiaMatches) }]
                  } else if (selCategory === 'favoritos') {
                    const col = filterBySearch(colombiaMatches)
                    const fav = filterBySearch(favMatches)
                    if (col.length) sections.push({ label:'⭐ Colombia', ms: col })
                    if (fav.length) sections.push({ label:'🔥 Otros favoritos', ms: fav })
                  } else if (selCategory === 'grupos') {
                    sections = [{ label:'🏟️ Fase de Grupos', ms: filterBySearch(matches.filter(m => isGrupo(m.fase))) }]
                  } else {
                    sections = [{ label:'⚡ Eliminatorias', ms: filterBySearch(matches.filter(m => !isGrupo(m.fase))) }]
                  }

                  const visibleIds = sections.flatMap(s => s.ms.map(m => m.id))
                  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedMatchIds.includes(id))

                  const selectAllVisible = () => {
                    setSelectedMatchIds(prev => [...new Set([...prev, ...visibleIds])])
                  }
                  const deselectAllVisible = () => {
                    setSelectedMatchIds(prev => prev.filter(id => !visibleIds.includes(id)))
                  }

                  return (
                    <div style={{ marginTop:12 }}>
                      {/* Header + contador */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>
                          {selectedMatchIds.length} seleccionados
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button
                            onClick={allVisibleSelected ? deselectAllVisible : selectAllVisible}
                            style={{ fontSize:9, padding:'3px 8px', borderRadius:6, border:'1px solid var(--line)',
                              background:'var(--panel-2)', color:'var(--muted)', cursor:'pointer' }}
                          >
                            {allVisibleSelected ? 'Quitar todos' : 'Marcar todos'}
                          </button>
                        </div>
                      </div>

                      {/* Búsqueda */}
                      <input
                        className="inp"
                        placeholder="Buscar equipo…"
                        value={selSearch}
                        onChange={e => setSelSearch(e.target.value)}
                        style={{ width:'100%', marginBottom:8, boxSizing:'border-box' }}
                      />

                      {/* Chips de categoría */}
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
                        {([
                          { v:'todos',     label:'Todos' },
                          { v:'colombia',  label:'⭐ Colombia' },
                          { v:'favoritos', label:'🔥 Favoritos' },
                          { v:'grupos',    label:'🏟️ Grupos' },
                          { v:'elim',      label:'⚡ Elim.' },
                        ] as { v: SelCategory; label: string }[]).map(({ v, label }) => (
                          <button
                            key={v}
                            onClick={() => setSelCategory(v)}
                            style={{
                              padding:'4px 10px', borderRadius:20, border:'1px solid', fontSize:10,
                              fontWeight:700, cursor:'pointer',
                              borderColor: selCategory === v ? 'var(--gold)' : 'var(--line)',
                              background: selCategory === v ? 'rgba(255,194,75,.1)' : 'var(--panel-2)',
                              color: selCategory === v ? 'var(--gold)' : 'var(--muted)',
                            }}
                          >
                            {label}
                            <span style={{ marginLeft:4, opacity:.7 }}>({catCounts[v]})</span>
                          </button>
                        ))}
                      </div>

                      {/* Secciones de partidos */}
                      {sections.length === 0 && (
                        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:12 }}>
                          Sin partidos para este filtro.
                        </div>
                      )}
                      {sections.map(({ label, ms }) => (
                        <div key={label} style={{ marginBottom:10 }}>
                          <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                            letterSpacing:1, marginBottom:4 }}>{label}</div>
                          {ms.map(m => (
                            <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                              padding:'7px 8px', borderRadius:8, cursor:'pointer',
                              background: selectedMatchIds.includes(m.id) ? 'rgba(255,194,75,.07)' : 'transparent',
                              border: selectedMatchIds.includes(m.id) ? '1px solid rgba(255,194,75,.2)' : '1px solid transparent',
                              marginBottom:3 }}>
                              <input type="checkbox" checked={selectedMatchIds.includes(m.id)}
                                onChange={() => toggleMatchSelection(m.id)}
                                style={{ accentColor:'var(--gold)', width:14, height:14, flexShrink:0 }} />
                              <span style={{ fontSize:12 }}>{m.flag_local}</span>
                              <span style={{ fontSize:11, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {m.equipo_local} <span style={{ color:'var(--muted)' }}>vs</span> {m.equipo_visitante}
                              </span>
                              <span style={{ fontSize:12 }}>{m.flag_visitante}</span>
                              <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0 }}>{m.fecha}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
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

                  <div className="admin-box" style={{ marginBottom:8 }}>
                    <div className="admin-box-label">🛡️ Acción de admin · irreversible</div>
                    <button className="save gold" onClick={cerrarPolla} disabled={closing || cancelling || pagados.length === 0} style={{ margin:0 }}>
                      {closing
                        ? 'Cerrando...'
                        : isCryptoMoneda(poll.moneda)
                          ? `Cerrar y distribuir ${monedaToToken(poll.moneda)} en Celo`
                          : 'Cerrar polla y repartir el bote'}
                    </button>
                    <div className="lockmsg" style={{ marginTop:6 }}>
                      Cerrar bloquea todas las apuestas y confirma a los ganadores definitivamente.
                    </div>
                  </div>

                  {/* Cancelación */}
                  <div className="admin-box" style={{ marginBottom:8, borderColor:'var(--lose)' }}>
                    <div className="admin-box-label" style={{ color:'var(--lose)' }}>⚠️ Zona de peligro · cancelar polla</div>
                    {!confirmCancel ? (
                      <>
                        <button
                          className="save ghost"
                          onClick={() => setConfirmCancel(true)}
                          disabled={closing || cancelling}
                          style={{ margin:0, borderColor:'var(--lose)', color:'var(--lose)' }}
                        >
                          Cancelar polla
                        </button>
                        <div className="lockmsg" style={{ marginTop:6 }}>
                          {isCryptoMoneda(poll.moneda)
                            ? `Cancela la polla y reembolsa ${fmt(pagados.length * poll.inscripcion)} ${monedaToToken(poll.moneda)} a ${pagados.length} participante(s).`
                            : 'Cancela la polla definitivamente. Los pagos fiat deben gestionarse manualmente.'}
                        </div>
                      </>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <div style={{ fontSize:12, color:'var(--lose)', fontWeight:700 }}>
                          ¿Confirmar cancelación?{isCryptoMoneda(poll.moneda) ? ` Se devolverá ${monedaToToken(poll.moneda)} a cada participante.` : ''}
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button
                            className="save ghost"
                            onClick={() => setConfirmCancel(false)}
                            style={{ margin:0, flex:1 }}
                          >
                            No, volver
                          </button>
                          <button
                            className="save"
                            onClick={cancelarPolla}
                            disabled={cancelling}
                            style={{ margin:0, flex:1, background:'var(--lose)', borderColor:'var(--lose)' }}
                          >
                            {cancelling ? 'Cancelando...' : 'Sí, cancelar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
        </div>

        <Toast msg={toast} />
      </div>
    </div>
  )
}
