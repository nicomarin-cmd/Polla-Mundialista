// Edge Function: pay-inscripcion
// Flujo EIP-3009 (USDC/USDT, gasless) o approve+transferFrom (cUSD).
// Registra el pago en poll_payments y marca poll_members.pagado = true.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'
import {
  requireEnv, validateAddress, json, corsHeaders,
  TOKEN_CONFIG, CELO_RPC, toAtomics,
} from '../_shared/utils.ts'

const ERC3009_ABI = [
  'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
]

const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Validar env vars al inicio ────────────────────────────────────────────
    const supabaseUrl      = requireEnv('SUPABASE_URL')
    const serviceRoleKey   = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey  = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')
    const platformAddress  = validateAddress(requireEnv('PLATFORM_OPERATOR_ADDRESS'))

    // ── 1. Auth JWT ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const db = createClient(supabaseUrl, serviceRoleKey)

    const { data: { user }, error: authErr } = await db.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    // ── 2. Parsear y validar body ─────────────────────────────────────────────
    const body = await req.json()
    const { poll_id, token, flow, amount } = body

    if (!poll_id || !token || !flow || !amount) {
      return json({ error: 'Faltan parámetros: poll_id, token, flow, amount' }, 400)
    }

    const walletAddress = validateAddress(body.wallet_address)

    const tokenCfg = TOKEN_CONFIG[token]
    if (!tokenCfg) return json({ error: `Token no soportado: ${token}` }, 400)

    if (flow !== 'eip3009' && flow !== 'approve') {
      return json({ error: `Flujo inválido: ${flow}` }, 400)
    }

    // ── 3. Idempotencia ───────────────────────────────────────────────────────
    const { data: existing } = await db
      .from('poll_payments')
      .select('id, tx_hash, status')
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'distributed'])
      .maybeSingle()

    if (existing) {
      return json({ success: true, tx_hash: existing.tx_hash, already_paid: true })
    }

    // ── 4. Verificar membresía y estado de polla ──────────────────────────────
    const { data: membership } = await db
      .from('poll_members')
      .select('pagado, pollas(inscripcion, moneda, estado)')
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)
      .single()

    if (!membership) return json({ error: 'No sos miembro de esta polla' }, 403)

    const polla = (membership as any).pollas
    if (polla.estado !== 'abierta') return json({ error: 'La polla ya está cerrada' }, 400)

    // Verificar que el token del request coincide con el de la polla
    const pollToken = polla.moneda === 'USDT-celo' ? 'USDT' : polla.moneda === 'cUSD' ? 'cUSD' : 'USDC'
    if (token !== pollToken) {
      return json({ error: `Token incorrecto. Esta polla usa ${pollToken}` }, 400)
    }

    // Verificar monto exacto (evita underpayments)
    const expectedAtomics = toAtomics(polla.inscripcion, tokenCfg.decimals)
    if (BigInt(amount) !== expectedAtomics) {
      return json({ error: `Monto incorrecto. Esperado: ${expectedAtomics}` }, 400)
    }

    // ── 5. Preparar signer del operador ───────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(CELO_RPC)
    const operatorWallet = new ethers.Wallet(operatorPrivKey, provider)

    let txHash: string

    if (flow === 'eip3009') {
      // ── 6A. USDC / USDT: receiveWithAuthorization (gasless) ──────────────
      const { signature, nonce, valid_before } = body
      if (!signature || !nonce || !valid_before) {
        return json({ error: 'Faltan parámetros de firma EIP-3009: signature, nonce, valid_before' }, 400)
      }

      const sig = (signature as string).startsWith('0x') ? signature.slice(2) : signature
      const r = `0x${sig.slice(0, 64)}`
      const s = `0x${sig.slice(64, 128)}`
      let v = parseInt(sig.slice(128, 130), 16)
      if (v < 27) v += 27 // Algunos wallets devuelven v=0/1

      const contract = new ethers.Contract(tokenCfg.address, ERC3009_ABI, operatorWallet)
      const tx = await contract.receiveWithAuthorization(
        walletAddress, platformAddress,
        BigInt(amount), 0n, BigInt(valid_before),
        nonce, v, r, s
      )
      const receipt = await tx.wait(1)
      txHash = receipt.hash

    } else {
      // ── 6B. cUSD: transferFrom (usuario aprobó on-chain previamente) ──────
      const contract = new ethers.Contract(tokenCfg.address, ERC20_ABI, operatorWallet)

      const allowance: bigint = await contract.allowance(walletAddress, platformAddress)
      if (allowance < BigInt(amount)) {
        return json({
          error: `Allowance insuficiente (${allowance} wei < ${amount} wei). Aprobá primero en tu wallet.`,
        }, 400)
      }

      const tx = await contract.transferFrom(walletAddress, platformAddress, BigInt(amount))
      const receipt = await tx.wait(1)
      txHash = receipt.hash
    }

    // ── 7. Registrar en DB (insert ANTES de marcar pagado) ───────────────────
    const { error: insertErr } = await db.from('poll_payments').insert({
      poll_id,
      user_id:        user.id,
      amount:         polla.inscripcion,
      token,
      chain:          'celo',
      chain_id:       42220,
      wallet_address: walletAddress,
      tx_hash:        txHash,
      status:         'confirmed',
    })

    if (insertErr) {
      console.error('[pay-inscripcion] Error insertando poll_payments:', insertErr.message)
      // tx ya ocurrió on-chain; registrar igualmente para no perder el hash
    }

    await db
      .from('poll_members')
      .update({ pagado: true })
      .eq('poll_id', poll_id)
      .eq('user_id', user.id)

    return json({
      success:  true,
      tx_hash:  txHash,
      celoscan: `https://celoscan.io/tx/${txHash}`,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[pay-inscripcion]', msg)
    // No exponer stack trace al cliente
    const isUserError = msg.includes('inválid') || msg.includes('faltante') || msg.includes('incorrecto')
      || msg.includes('miembro') || msg.includes('cerrada') || msg.includes('Allowance')
    return json({ error: isUserError ? msg : 'Error al procesar el pago' }, isUserError ? 400 : 500)
  }
})
