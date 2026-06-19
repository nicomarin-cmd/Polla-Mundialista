// Edge Function: pay-inscripcion
// Verifica que el usuario transfirió el monto exacto al platform wallet on-chain.
// El usuario paga su propio gas — no se requiere firma del operador.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  getNetworkConfig, toAtomics,
} from '../_shared/utils.ts'

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl     = requireEnv('SUPABASE_URL')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const platformAddress = validateAddress(requireEnv('PLATFORM_OPERATOR_ADDRESS'))

    // ── 1. Auth JWT ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const db = createClient(supabaseUrl, serviceRoleKey)
    const { data: { user }, error: authErr } = await db.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    // ── 2. Parsear body ──────────────────────────────────────────────────────────
    const body = await req.json()
    const { poll_id, token, tx_hash, amount, chain_id } = body

    if (!poll_id || !token || !tx_hash || !amount) {
      return json({ error: 'Faltan parámetros: poll_id, token, tx_hash, amount' }, 400)
    }

    const walletAddress = validateAddress(body.wallet_address)

    // Seleccionar red según chain_id enviado por el cliente (default: mainnet 42220)
    const networkChainId = Number(chain_id ?? 42220)
    const network = getNetworkConfig(networkChainId)
    const tokenCfg = network.tokenConfig[token]
    if (!tokenCfg) return json({ error: `Token no soportado: ${token}` }, 400)

    // ── 3. Idempotencia: pago ya confirmado ──────────────────────────────────────
    const { data: existingPaid } = await db
      .from('poll_payments')
      .select('id, tx_hash, status')
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'distributed'])
      .maybeSingle()

    if (existingPaid) {
      return json({ success: true, tx_hash: existingPaid.tx_hash, already_paid: true })
    }

    // Evitar re-uso del mismo tx_hash en cualquier polla
    const { data: usedTx } = await db
      .from('poll_payments')
      .select('id')
      .eq('tx_hash', tx_hash)
      .maybeSingle()

    if (usedTx) return json({ error: 'Esta transacción ya fue registrada' }, 400)

    // ── 4. Verificar membresía y estado de polla ─────────────────────────────────
    const { data: membership } = await db
      .from('poll_members')
      .select('pagado, pollas(inscripcion, moneda, estado)')
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)
      .single()

    if (!membership) return json({ error: 'No sos miembro de esta polla' }, 403)

    const polla = (membership as any).pollas
    if (polla.estado !== 'abierta') return json({ error: 'La polla ya está cerrada' }, 400)
    if ((membership as any).pagado) return json({ success: true, already_paid: true })

    const pollToken = polla.moneda === 'USDT-celo' ? 'USDT' : polla.moneda === 'cUSD' ? 'cUSD' : 'USDC'
    if (token !== pollToken) {
      return json({ error: `Token incorrecto. Esta polla usa ${pollToken}` }, 400)
    }

    const expectedAtomics = toAtomics(polla.inscripcion, tokenCfg.decimals)
    if (BigInt(amount) !== expectedAtomics) {
      return json({ error: `Monto incorrecto. Esperado: ${expectedAtomics} atomics` }, 400)
    }

    // ── 5. Verificar tx on-chain ─────────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(network.rpc)
    const receipt = await provider.getTransactionReceipt(tx_hash)

    if (!receipt || receipt.status !== 1) {
      return json({ error: 'Transacción no confirmada en Celo' }, 400)
    }

    // Parsear logs buscando Transfer(walletAddress → platformAddress, >= expectedAtomics)
    let transferVerified = false
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenCfg.address.toLowerCase()) continue
      if (log.topics[0] !== TRANSFER_TOPIC) continue
      if (log.topics.length < 3) continue

      const from  = ('0x' + log.topics[1].slice(26)).toLowerCase()
      const to    = ('0x' + log.topics[2].slice(26)).toLowerCase()
      const value = BigInt(log.data)

      if (
        from  === walletAddress.toLowerCase() &&
        to    === platformAddress.toLowerCase() &&
        value >= expectedAtomics
      ) {
        transferVerified = true
        break
      }
    }

    if (!transferVerified) {
      return json({
        error: 'No se encontró una transferencia válida al monto correcto en esa transacción',
      }, 400)
    }

    // ── 6. Registrar pago en DB ──────────────────────────────────────────────────
    const { error: insertErr } = await db.from('poll_payments').insert({
      poll_id,
      user_id:        user.id,
      amount:         polla.inscripcion,
      token,
      chain:          'celo',
      chain_id:       networkChainId,
      wallet_address: walletAddress,
      tx_hash,
      status:         'confirmed',
    })

    if (insertErr) {
      console.error('[pay-inscripcion] Error insertando poll_payments:', insertErr.message)
    }

    await db
      .from('poll_members')
      .update({ pagado: true })
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)

    return json({
      success:  true,
      tx_hash,
      celoscan: `${network.explorer}/tx/${tx_hash}`,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[pay-inscripcion]', msg)
    const isUserError = msg.includes('inválid') || msg.includes('faltante') || msg.includes('incorrecto')
      || msg.includes('miembro') || msg.includes('cerrada') || msg.includes('transacción')
      || msg.includes('Chain ID')
    return json({ error: isUserError ? msg : 'Error al verificar el pago' }, isUserError ? 400 : 500)
  }
})
