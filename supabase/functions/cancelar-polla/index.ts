// Edge Function: cancelar-polla
// Cancela una polla abierta y devuelve USDC/USDT/cUSD a cada participante que pagó.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  TOKEN_CONFIG, CELO_RPC, toAtomics, isCryptoMoneda, monedaToTokenSymbol,
} from '../_shared/utils.ts'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Validar env vars al inicio ────────────────────────────────────────────
    const supabaseUrl     = requireEnv('SUPABASE_URL')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')

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
        .from('poll_payments')
        .select('*')
        .eq('poll_id', poll_id)
        .order('created_at')
      return json({ success: true, already_cancelled: true, refunds: existing ?? [] })
    }

    if (poll.estado !== 'abierta') {
      return json({ error: `No se puede cancelar una polla en estado '${poll.estado}'` }, 400)
    }

    // ── 5. Marcar como cancelada ANTES de procesar (evita ejecución doble) ────
    await db.from('pollas').update({ estado: 'cancelada' }).eq('id', poll_id)

    if (!crypto) {
      return json({ success: true, crypto: false })
    }

    // ── 6. Obtener pagos confirmados ──────────────────────────────────────────
    const { data: confirmedPayments } = await db
      .from('poll_payments')
      .select('*')
      .eq('poll_id', poll_id)
      .eq('status', 'confirmed')

    if (!confirmedPayments || confirmedPayments.length === 0) {
      return json({ success: true, crypto: true, refunds: [] })
    }

    // ── 7. Preparar signer ────────────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(CELO_RPC)
    const operatorWallet = new ethers.Wallet(operatorPrivKey, provider)

    const tokenSymbol = monedaToTokenSymbol(poll.moneda)
    const tokenCfg = TOKEN_CONFIG[tokenSymbol]
    const tokenContract = new ethers.Contract(tokenCfg.address, ERC20_ABI, operatorWallet)

    // ── 8. Reembolsar ─────────────────────────────────────────────────────────
    const refunds: any[] = []

    for (const payment of confirmedPayments as any[]) {
      const amountAtomics = toAtomics(payment.amount, tokenCfg.decimals)

      try {
        const safeWallet = validateAddress(payment.wallet_address)
        const tx = await tokenContract.transfer(safeWallet, amountAtomics)
        const receipt = await tx.wait(1)
        const txHash: string = receipt.hash

        await db
          .from('poll_payments')
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
        const errMsg = txErr instanceof Error ? txErr.message : 'Error de transferencia'
        console.error(`[cancelar-polla] Refund failed for ${payment.user_id}:`, errMsg)
        await db
          .from('poll_payments')
          .update({ status: 'failed' })
          .eq('id', payment.id)

        refunds.push({
          user_id: payment.user_id,
          wallet: payment.wallet_address,
          amount: payment.amount,
          status: 'failed',
          error: errMsg,
        })
      }
    }

    return json({ success: true, crypto: true, token: tokenSymbol, refunds })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[cancelar-polla]', msg)
    const isUserError = msg.includes('faltante') || msg.includes('inválid') || msg.includes('Solo el admin')
    return json({ error: isUserError ? msg : 'Error al cancelar la polla' }, isUserError ? 400 : 500)
  }
})
