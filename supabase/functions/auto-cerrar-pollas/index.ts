// Edge Function: auto-cerrar-pollas
// Cierra automáticamente todas las pollas abiertas y distribuye los premios on-chain.
// Llamada desde sync-scores cuando detecta que la Gran Final terminó.
// Usa service_role — no requiere JWT de admin.
// Es idempotente: ignorar pollas ya cerradas y distribuciones ya realizadas.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  TOKEN_CONFIG, CELO_RPC, toAtomics, isCryptoMoneda, monedaToTokenSymbol,
} from '../_shared/utils.ts'

const PLATFORM_FEE = 0.05

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl     = requireEnv('SUPABASE_URL')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')

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

      // ── 4. Idempotencia — no redistribuir si ya hay poll_winners ─────────
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

      const walletByUser = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, p.wallet_address])
      )

      // ── 6. Signer on-chain ────────────────────────────────────────────────
      const provider = new ethers.JsonRpcProvider(CELO_RPC)
      const operatorWallet = new ethers.Wallet(operatorPrivKey, provider)

      const tokenSymbol = monedaToTokenSymbol(polla.moneda)
      const tokenCfg = TOKEN_CONFIG[tokenSymbol]
      const tokenContract = new ethers.Contract(tokenCfg.address, ERC20_ABI, operatorWallet)

      const distribution: any[] = []

      // ── 7. Transferir a cada ganador ──────────────────────────────────────
      for (const g of ganadores as any[]) {
        const walletAddress: string | undefined = walletByUser[g.user_id]
        const netMonto = Math.round(g.monto * (1 - PLATFORM_FEE) * 1e6) / 1e6
        const amountAtomics = toAtomics(netMonto, tokenCfg.decimals)

        if (!walletAddress) {
          await db.from('poll_winners').insert({
            poll_id: polla.id, user_id: g.user_id,
            position: g.puesto, amount_token: g.monto,
            token: tokenSymbol, wallet_address: '', tx_hash: null, status: 'pending_wallet',
          })
          distribution.push({ user_id: g.user_id, puesto: g.puesto, monto: g.monto, status: 'pending_wallet' })
          continue
        }

        try {
          const safeWallet = validateAddress(walletAddress)
          const tx = await tokenContract.transfer(safeWallet, amountAtomics)
          const receipt = await tx.wait(1)
          const txHash: string = receipt.hash

          await db.from('poll_winners').insert({
            poll_id: polla.id, user_id: g.user_id,
            position: g.puesto, amount_token: netMonto,
            token: tokenSymbol, wallet_address: safeWallet,
            tx_hash: txHash, status: 'sent',
          })

          distribution.push({
            user_id: g.user_id, puesto: g.puesto, monto: netMonto,
            wallet: safeWallet, tx_hash: txHash, status: 'sent',
          })
        } catch (txErr: unknown) {
          const errMsg = txErr instanceof Error ? txErr.message : 'Error de transferencia'
          console.error(`[auto-cerrar] Transfer failed ${g.user_id} poll ${polla.id}:`, errMsg)
          await db.from('poll_winners').insert({
            poll_id: polla.id, user_id: g.user_id,
            position: g.puesto, amount_token: g.monto,
            token: tokenSymbol, wallet_address: walletAddress,
            tx_hash: null, status: 'failed',
          })
          distribution.push({ user_id: g.user_id, puesto: g.puesto, monto: g.monto, status: 'failed', error: errMsg })
        }
      }

      results.push({ poll_id: polla.id, closed: true, crypto: true, distribution })
    }

    return json({ ok: true, closed: closedCount, total: pollasAbiertas.length, results })

  } catch (err: any) {
    console.error('[auto-cerrar-pollas]', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})
