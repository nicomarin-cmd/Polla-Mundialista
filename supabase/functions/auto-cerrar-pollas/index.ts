// Edge Function: auto-cerrar-pollas
// Cierra automáticamente todas las pollas abiertas y distribuye los premios
// llamando a PollaEscrow.distribute() on-chain en una tx por polla.
// Llamada desde sync-scores cuando la Gran Final termina.
// Es idempotente: ignora pollas ya cerradas y distribuciones ya realizadas.

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
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')
    const escrowAddress   = getEscrowAddress()

    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── 1. Obtener pollas abiertas ────────────────────────────────────────────
    const { data: pollasAbiertas, error: pollErr } = await db
      .from('pollas')
      .select('id, moneda, inscripcion, premios')
      .eq('estado', 'abierta')

    if (pollErr) throw pollErr
    if (!pollasAbiertas?.length) {
      return json({ ok: true, message: 'Sin pollas abiertas', closed: 0 })
    }

    // ── Signer compartido ─────────────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(CELO_RPC)
    const signer   = new ethers.Wallet(operatorPrivKey, provider)
    const escrow   = new ethers.Contract(escrowAddress, ESCROW_ABI, signer)

    let closedCount = 0
    const results: any[] = []

    for (const polla of pollasAbiertas) {
      // ── 2. Cerrar polla en SQL y calcular ganadores ───────────────────────
      const { error: closeErr } = await db.rpc('fn_cerrar_polla_auto', { p_poll_id: polla.id })
      if (closeErr) {
        console.error(`[auto-cerrar] Error cerrando ${polla.id}:`, closeErr.message)
        results.push({ poll_id: polla.id, error: closeErr.message })
        continue
      }
      closedCount++

      // ── 3. Leer ganadores calculados ──────────────────────────────────────
      const { data: ganadores } = await db
        .from('ganadores')
        .select('user_id, puesto, monto')
        .eq('poll_id', polla.id)
        .order('puesto')

      if (!ganadores?.length) {
        results.push({ poll_id: polla.id, closed: true, note: 'sin ganadores' })
        continue
      }

      if (!isCryptoMoneda(polla.moneda)) {
        results.push({ poll_id: polla.id, closed: true, crypto: false })
        continue
      }

      // ── 4. Idempotencia ───────────────────────────────────────────────────
      const { count: existingWinners } = await db
        .from('poll_winners')
        .select('*', { count: 'exact', head: true })
        .eq('poll_id', polla.id)

      if ((existingWinners ?? 0) > 0) {
        results.push({ poll_id: polla.id, closed: true, crypto: true, already_distributed: true })
        continue
      }

      // ── 5. Wallets de ganadores ───────────────────────────────────────────
      const winnerIds = ganadores.map((g: any) => g.user_id)
      const { data: profiles } = await db
        .from('profiles')
        .select('id, wallet_address')
        .in('id', winnerIds)

      const walletByUser: Record<string, string> = Object.fromEntries(
        (profiles ?? [])
          .filter((p: any) => p.wallet_address)
          .map((p: any) => [p.id, p.wallet_address])
      )

      // Fallback: buscar wallet en poll_payments
      const missingIds = winnerIds.filter((id: string) => !walletByUser[id])
      if (missingIds.length > 0) {
        const { data: payments } = await db
          .from('poll_payments')
          .select('user_id, wallet_address')
          .eq('poll_id', polla.id)
          .in('user_id', missingIds)
          .in('status', ['confirmed', 'distributed'])
        for (const p of (payments ?? []) as any[]) {
          if (p.wallet_address && !walletByUser[p.user_id]) {
            walletByUser[p.user_id] = p.wallet_address
          }
        }
      }

      const tokenSymbol = monedaToTokenSymbol(polla.moneda)
      const premios: number[] = polla.premios ?? []

      // ── 6. Construir args del contrato ────────────────────────────────────
      const winnerAddresses: string[] = []
      const winnerBps: bigint[]       = []

      for (let i = 0; i < ganadores.length; i++) {
        const g = ganadores[i] as any
        const pct = premios[i] ?? 0
        if (pct <= 0) continue
        const wallet: string | undefined = walletByUser[g.user_id]
        winnerAddresses.push(wallet ? validateAddress(wallet) : ethers.ZeroAddress)
        winnerBps.push(BigInt(pct * 100))

        if (!wallet) {
          await db.from('poll_winners').insert({
            poll_id: polla.id, user_id: g.user_id,
            position: g.puesto, amount_token: g.monto,
            token: tokenSymbol, wallet_address: '', tx_hash: null, status: 'pending_wallet',
          })
        }
      }

      if (!winnerAddresses.length) {
        results.push({ poll_id: polla.id, closed: true, crypto: true, note: 'sin premios > 0' })
        continue
      }

      // ── 7. Llamar al escrow ───────────────────────────────────────────────
      const pollIdBytes32 = pollIdToBytes32(polla.id, ethers)
      const distribution: any[] = []

      try {
        const tx      = await escrow.distribute(pollIdBytes32, winnerAddresses, winnerBps)
        const receipt = await tx.wait(1)
        const txHash: string = receipt.hash

        for (let i = 0; i < ganadores.length; i++) {
          const g = ganadores[i] as any
          if (!winnerAddresses[i] || winnerAddresses[i] === ethers.ZeroAddress) continue
          const netMonto = Math.round(g.monto * 0.95 * 1e6) / 1e6
          await db.from('poll_winners').insert({
            poll_id: polla.id, user_id: g.user_id,
            position: g.puesto, amount_token: netMonto,
            token: tokenSymbol, wallet_address: winnerAddresses[i],
            tx_hash: txHash, status: 'sent',
          })
          distribution.push({
            user_id: g.user_id, puesto: g.puesto, monto: netMonto,
            wallet: winnerAddresses[i], tx_hash: txHash, status: 'sent',
          })
        }

        results.push({ poll_id: polla.id, closed: true, crypto: true, tx_hash: txHash, distribution })
      } catch (txErr: unknown) {
        const errMsg = txErr instanceof Error ? txErr.message : 'Error on-chain'
        console.error(`[auto-cerrar] distribute failed poll ${polla.id}:`, errMsg)
        results.push({ poll_id: polla.id, closed: true, crypto: true, error: errMsg })
      }
    }

    return json({ ok: true, closed: closedCount, total: pollasAbiertas.length, results })

  } catch (err: any) {
    console.error('[auto-cerrar-pollas]', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})
