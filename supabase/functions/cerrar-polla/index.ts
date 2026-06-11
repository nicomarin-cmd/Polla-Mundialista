// Edge Function: cerrar-polla
// 1. Llama fn_cerrar_polla (SQL cierra la polla y calcula ganadores)
// 2. Para pollas cripto: transfiere USDC/USDT/cUSD a cada ganador
// 3. Registra en poll_winners con tx_hash por ganador

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
    const anonKey         = requireEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const operatorPrivKey = requireEnv('PLATFORM_OPERATOR_PRIVATE_KEY')

    // ── 1. Auth JWT ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    // userClient: usa token del usuario para fn_cerrar_polla (que depende de auth.uid())
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    // db: service_role para todas las demás operaciones
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
        .from('poll_winners')
        .select('*')
        .eq('poll_id', poll_id)
        .order('position')
      return json({ success: true, already_closed: true, distribution: existing ?? [] })
    }

    if (poll.estado !== 'abierta') {
      return json({ error: `No se puede cerrar una polla en estado '${poll.estado}'` }, 400)
    }

    // ── 5. Cerrar polla y calcular ganadores (SQL) ────────────────────────────
    const { error: closeErr } = await userClient.rpc('fn_cerrar_polla', { p_poll_id: poll_id })
    if (closeErr) return json({ error: 'Error al cerrar: ' + closeErr.message }, 500)

    if (!crypto) {
      return json({ success: true, crypto: false })
    }

    // ── 6. Obtener ganadores con wallets ──────────────────────────────────────
    const { data: ganadores } = await db
      .from('ganadores')
      .select('user_id, puesto, monto')
      .eq('poll_id', poll_id)
      .order('puesto')

    if (!ganadores || ganadores.length === 0) {
      return json({ success: true, crypto: true, distribution: [] })
    }

    const winnerIds = ganadores.map((g: any) => g.user_id)
    const { data: profiles } = await db
      .from('profiles')
      .select('id, wallet_address')
      .in('id', winnerIds)

    const walletByUser = Object.fromEntries(
      (profiles ?? []).map((p: any) => [p.id, p.wallet_address])
    )

    // ── 7. Preparar signer ────────────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(CELO_RPC)
    const operatorWallet = new ethers.Wallet(operatorPrivKey, provider)

    const tokenSymbol = monedaToTokenSymbol(poll.moneda)
    const tokenCfg = TOKEN_CONFIG[tokenSymbol]
    const tokenContract = new ethers.Contract(tokenCfg.address, ERC20_ABI, operatorWallet)

    // ── 8. Distribuir ─────────────────────────────────────────────────────────
    const distribution: any[] = []

    for (const g of ganadores as any[]) {
      const walletAddress: string | undefined = walletByUser[g.user_id]
      const amountAtomics = toAtomics(g.monto, tokenCfg.decimals)

      if (!walletAddress) {
        await db.from('poll_winners').insert({
          poll_id, user_id: g.user_id,
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
          poll_id, user_id: g.user_id,
          position: g.puesto, amount_token: g.monto,
          token: tokenSymbol, wallet_address: safeWallet,
          tx_hash: txHash, status: 'sent',
        })

        distribution.push({
          user_id: g.user_id, puesto: g.puesto, monto: g.monto,
          wallet: safeWallet, tx_hash: txHash,
          celoscan: `https://celoscan.io/tx/${txHash}`,
          status: 'sent',
        })
      } catch (txErr: unknown) {
        const errMsg = txErr instanceof Error ? txErr.message : 'Error de transferencia'
        console.error(`[cerrar-polla] Transfer failed for ${g.user_id}:`, errMsg)
        await db.from('poll_winners').insert({
          poll_id, user_id: g.user_id,
          position: g.puesto, amount_token: g.monto,
          token: tokenSymbol, wallet_address: walletAddress,
          tx_hash: null, status: 'failed',
        })
        distribution.push({ user_id: g.user_id, puesto: g.puesto, monto: g.monto, status: 'failed', error: errMsg })
      }
    }

    return json({ success: true, crypto: true, token: tokenSymbol, distribution })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[cerrar-polla]', msg)
    const isUserError = msg.includes('faltante') || msg.includes('inválid') || msg.includes('Solo el admin')
    return json({ error: isUserError ? msg : 'Error al cerrar la polla' }, isUserError ? 400 : 500)
  }
})
