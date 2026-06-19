// Edge Function: cerrar-polla
// 1. Llama fn_cerrar_polla (SQL cierra la polla y calcula ganadores)
// 2. Para pollas cripto: llama PollaEscrow.distribute() on-chain en una sola tx
// 3. Registra en poll_winners con tx_hash por ganador

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  TOKEN_CONFIG, CELO_RPC, isCryptoMoneda, monedaToTokenSymbol,
  getEscrowAddress, pollIdToBytes32, ESCROW_ABI,
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl     = requireEnv('SUPABASE_URL')
    const anonKey         = requireEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')
    const escrowAddress   = getEscrowAddress()

    // ── 1. Auth JWT ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const db = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    // ── 2. Parsear body ───────────────────────────────────────────────────────
    const { poll_id } = await req.json()
    if (!poll_id) return json({ error: 'Falta poll_id' }, 400)

    // ── 3. Verificar admin ────────────────────────────────────────────────────
    const { data: poll } = await db
      .from('pollas')
      .select('admin_id, estado, moneda, inscripcion, premios')
      .eq('id', poll_id)
      .single()

    if (!poll) return json({ error: 'Polla no encontrada' }, 404)
    if (poll.admin_id !== user.id) return json({ error: 'Solo el admin puede cerrar' }, 403)

    const crypto = isCryptoMoneda(poll.moneda)

    // ── 4. Idempotencia ───────────────────────────────────────────────────────
    if (poll.estado === 'cerrada') {
      const { data: existing } = await db
        .from('poll_winners').select('*').eq('poll_id', poll_id).order('position')
      return json({ success: true, already_closed: true, distribution: existing ?? [] })
    }
    if (poll.estado !== 'abierta') {
      return json({ error: `No se puede cerrar una polla en estado '${poll.estado}'` }, 400)
    }

    // ── 5. Cerrar polla y calcular ganadores (SQL) ────────────────────────────
    const { error: closeErr } = await userClient.rpc('fn_cerrar_polla', { p_poll_id: poll_id })
    if (closeErr) return json({ error: 'Error al cerrar: ' + closeErr.message }, 500)

    if (!crypto) return json({ success: true, crypto: false })

    // ── 6. Obtener ganadores ──────────────────────────────────────────────────
    const { data: ganadores } = await db
      .from('ganadores')
      .select('user_id, puesto, monto')
      .eq('poll_id', poll_id)
      .order('puesto')

    if (!ganadores || ganadores.length === 0) {
      return json({ success: true, crypto: true, distribution: [] })
    }

    // ── 7. Wallets de ganadores ───────────────────────────────────────────────
    const winnerIds = ganadores.map((g: any) => g.user_id)
    const { data: profiles } = await db
      .from('profiles')
      .select('id, wallet_address')
      .in('id', winnerIds)

    const walletByUser = Object.fromEntries(
      (profiles ?? []).map((p: any) => [p.id, p.wallet_address])
    )

    const tokenSymbol = monedaToTokenSymbol(poll.moneda)

    // ── 8. Calcular winners y BPS para el contrato ────────────────────────────
    // premios es [50, 30, 20] → BPS [5000, 3000, 2000]
    const premios: number[] = poll.premios ?? []
    const winnerAddresses: string[] = []
    const winnerBps: bigint[] = []
    const distribution: any[] = []

    for (let i = 0; i < ganadores.length; i++) {
      const g = ganadores[i] as any
      const pct = premios[i] ?? 0
      if (pct <= 0) continue

      const walletAddress: string | undefined = walletByUser[g.user_id]
      winnerAddresses.push(walletAddress ? validateAddress(walletAddress) : ethers.ZeroAddress)
      winnerBps.push(BigInt(pct * 100)) // 50 → 5000 BPS

      if (!walletAddress) {
        await db.from('poll_winners').insert({
          poll_id, user_id: g.user_id,
          position: g.puesto, amount_token: g.monto,
          token: tokenSymbol, wallet_address: '', tx_hash: null, status: 'pending_wallet',
        })
        distribution.push({ user_id: g.user_id, puesto: g.puesto, monto: g.monto, status: 'pending_wallet' })
      }
    }

    // ── 9. Llamar al contrato ─────────────────────────────────────────────────
    const provider      = new ethers.JsonRpcProvider(CELO_RPC)
    const signer        = new ethers.Wallet(operatorPrivKey, provider)
    const escrow        = new ethers.Contract(escrowAddress, ESCROW_ABI, signer)
    const pollIdBytes32 = pollIdToBytes32(poll_id, ethers)

    // Sólo los ganadores sin pending_wallet van al contrato
    const txAddresses = winnerAddresses
    const txBps       = winnerBps

    let txHash: string | null = null
    try {
      const tx      = await escrow.distribute(pollIdBytes32, txAddresses, txBps)
      const receipt = await tx.wait(1)
      txHash = receipt.hash

      for (let i = 0; i < ganadores.length; i++) {
        const g = ganadores[i] as any
        const addr = winnerAddresses[i]
        if (addr === ethers.ZeroAddress) continue // ya insertado como pending_wallet
        const netMonto = Math.round(g.monto * 0.95 * 1e6) / 1e6
        await db.from('poll_winners').insert({
          poll_id, user_id: g.user_id,
          position: g.puesto, amount_token: netMonto,
          token: tokenSymbol, wallet_address: addr,
          tx_hash: txHash, status: 'sent',
        })
        distribution.push({
          user_id: g.user_id, puesto: g.puesto, monto: netMonto,
          wallet: addr, tx_hash: txHash,
          celoscan: `https://celoscan.io/tx/${txHash}`,
          status: 'sent',
        })
      }
    } catch (txErr: unknown) {
      const errMsg = txErr instanceof Error ? txErr.message : 'Error on-chain'
      console.error('[cerrar-polla] distribute failed:', errMsg)
      return json({ error: 'Error al distribuir on-chain: ' + errMsg }, 500)
    }

    return json({ success: true, crypto: true, token: tokenSymbol, tx_hash: txHash, distribution })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[cerrar-polla]', msg)
    const isUserError = msg.includes('faltante') || msg.includes('inválid') || msg.includes('Solo el admin')
    return json({ error: isUserError ? msg : 'Error al cerrar la polla' }, isUserError ? 400 : 500)
  }
})
