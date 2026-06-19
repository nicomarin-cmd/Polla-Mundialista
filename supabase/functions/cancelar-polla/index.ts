// Edge Function: cancelar-polla
// 1. Llama PollaEscrow.cancel(pollId) on-chain
// 2. Por cada pago confirmado, llama PollaEscrow.refundFor(pollId, wallet)
// 3. Actualiza poll_payments con refund_tx_hash

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  CELO_RPC, isCryptoMoneda,
  getEscrowAddress, pollIdToBytes32, ESCROW_ABI,
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl     = requireEnv('SUPABASE_URL')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')
    const escrowAddress   = getEscrowAddress()

    // ── 1. Auth JWT ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const db = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: authErr } = await db.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    // ── 2. Parsear body ───────────────────────────────────────────────────────
    const { poll_id } = await req.json()
    if (!poll_id) return json({ error: 'Falta poll_id' }, 400)

    // ── 3. Verificar admin ────────────────────────────────────────────────────
    const { data: poll } = await db
      .from('pollas')
      .select('admin_id, estado, moneda, inscripcion')
      .eq('id', poll_id)
      .single()

    if (!poll) return json({ error: 'Polla no encontrada' }, 404)
    if (poll.admin_id !== user.id) return json({ error: 'Solo el admin puede cancelar' }, 403)

    const crypto = isCryptoMoneda(poll.moneda)

    // ── 4. Idempotencia ───────────────────────────────────────────────────────
    if (poll.estado === 'cancelada') {
      const { data: existing } = await db
        .from('poll_payments').select('*').eq('poll_id', poll_id).order('created_at')
      return json({ success: true, already_cancelled: true, refunds: existing ?? [] })
    }

    // Permitir también cancelar pollas "cerradas" con distribución incompleta
    if (poll.estado === 'cerrada' && crypto) {
      const { data: winners } = await db
        .from('poll_winners').select('status').eq('poll_id', poll_id)
      const hasSent = (winners ?? []).some((w: any) => w.status === 'sent')
      if (hasSent) {
        return json({ error: 'No se puede cancelar: ya se distribuyeron fondos a ganadores' }, 400)
      }
      // Sin distribución exitosa → permitir cancelar para reembolsar
    } else if (poll.estado !== 'abierta') {
      return json({ error: `No se puede cancelar una polla en estado '${poll.estado}'` }, 400)
    }

    // ── 5. Marcar cancelada en DB ─────────────────────────────────────────────
    await db.from('pollas').update({ estado: 'cancelada' }).eq('id', poll_id)

    if (!crypto) return json({ success: true, crypto: false })

    // ── 6. Pagos confirmados ──────────────────────────────────────────────────
    const { data: confirmedPayments } = await db
      .from('poll_payments')
      .select('*')
      .eq('poll_id', poll_id)
      .eq('status', 'confirmed')

    if (!confirmedPayments || confirmedPayments.length === 0) {
      return json({ success: true, crypto: true, refunds: [] })
    }

    // ── 7. Signer ─────────────────────────────────────────────────────────────
    const provider      = new ethers.JsonRpcProvider(CELO_RPC)
    const signer        = new ethers.Wallet(operatorPrivKey, provider)
    const escrow        = new ethers.Contract(escrowAddress, ESCROW_ABI, signer)
    const pollIdBytes32 = pollIdToBytes32(poll_id, ethers)

    // ── 8. Cancelar en el contrato ────────────────────────────────────────────
    try {
      const cancelTx = await escrow.cancel(pollIdBytes32)
      await cancelTx.wait(1)
    } catch (e: unknown) {
      // Si ya estaba cancelado en el contrato (reintento), continuar
      const msg = e instanceof Error ? e.message : ''
      if (!msg.includes('Poll ended')) throw e
    }

    // ── 9. Reembolsar en batch ────────────────────────────────────────────────
    const refunds: any[] = []

    for (const payment of confirmedPayments as any[]) {
      try {
        const safeWallet = validateAddress(payment.wallet_address)
        const tx         = await escrow.refundFor(pollIdBytes32, safeWallet)
        const receipt    = await tx.wait(1)
        const txHash: string = receipt.hash

        await db.from('poll_payments')
          .update({ status: 'refunded', refund_tx_hash: txHash })
          .eq('id', payment.id)

        refunds.push({
          user_id: payment.user_id,
          wallet: safeWallet,
          amount: payment.amount,
          refund_tx_hash: txHash,
          celoscan: `https://celoscan.io/tx/${txHash}`,
          status: 'refunded',
        })
      } catch (txErr: unknown) {
        const errMsg = txErr instanceof Error ? txErr.message : 'Error on-chain'
        console.error(`[cancelar-polla] refundFor failed ${payment.user_id}:`, errMsg)
        await db.from('poll_payments').update({ status: 'failed' }).eq('id', payment.id)
        refunds.push({ user_id: payment.user_id, wallet: payment.wallet_address, status: 'failed', error: errMsg })
      }
    }

    return json({ success: true, crypto: true, refunds })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[cancelar-polla]', msg)
    const isUserError = msg.includes('faltante') || msg.includes('inválid') || msg.includes('Solo el admin')
      || msg.includes('cancelar') || msg.includes('distribuir')
    return json({ error: msg }, isUserError ? 400 : 500)
  }
})
