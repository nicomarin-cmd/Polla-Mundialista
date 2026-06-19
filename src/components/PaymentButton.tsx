import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { parseUnits, keccak256, toHex, createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { CELO_MAINNET, monedaToToken, celoscanTx, getTokenDecimals, getTokenAddress } from '../lib/celoTokens'

// Cliente Celo fijo — independiente de qué cadena tenga conectada el wallet
const celoClient = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') })

interface Props {
  pollId:    string
  amount:    number   // en unidades legibles (ej. 10.00)
  moneda:    string   // 'USDC-celo' | 'USDT-celo' | 'cUSD'
  onSuccess: () => void
}

type PayState = 'idle' | 'switching' | 'approving' | 'depositing' | 'processing' | 'done' | 'error'

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const ESCROW_DEPOSIT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [
      { name: 'pollId', type: 'bytes32' },
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

/** UUID de la polla → bytes32 (keccak256 del string, igual a ethers.id()) */
function pollIdToBytes32(pollId: string): `0x${string}` {
  return keccak256(toHex(pollId))
}

export function PaymentButton({ pollId, amount, moneda, onSuccess }: Props) {
  const { address, isConnected }   = useAccount()
  const chainId                    = useChainId()
  const { switchChainAsync }       = useSwitchChain()
  const { writeContractAsync }     = useWriteContract()
  const { session }                = useAuth()

  const [state,  setState]  = useState<PayState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const token        = monedaToToken(moneda)
  const decimals     = getTokenDecimals(token)
  const targetChainId = Number(import.meta.env.VITE_CHAIN_ID ?? CELO_MAINNET.chainId)
  const isWrongChain  = isConnected && chainId !== targetChainId

  const escrowAddress = import.meta.env.VITE_ESCROW_CONTRACT as `0x${string}` | undefined

  const callEdgeFunction = async (body: Record<string, unknown>) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay-inscripcion`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${s?.access_token}`,
        },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Error al procesar el pago')
    return data
  }

  const handlePay = async () => {
    if (!isConnected || !address || !session) return
    if (amount <= 0) {
      // Polla gratuita — solo registrar sin transacción on-chain
      const { data: { session: s } } = await supabase.auth.getSession()
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay-inscripcion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token}` },
        body: JSON.stringify({ poll_id: pollId, wallet_address: address, token, tx_hash: null, amount: '0', chain_id: targetChainId }),
      })
      setState('done')
      onSuccess()
      return
    }
    if (!escrowAddress) {
      setErrMsg('Error de configuración: contrato de escrow no configurado.')
      setState('error')
      return
    }
    setErrMsg('')

    try {
      // ── 1. Cambiar a Celo si es necesario ──────────────────────────────────
      if (isWrongChain) {
        setState('switching')
        await switchChainAsync({ chainId: targetChainId })
      }

      const tokenAddress  = getTokenAddress(token)
      const amountAtomics = parseUnits(String(amount), decimals)
      const pollBytes32   = pollIdToBytes32(pollId)

      // ── 2. Approve solo si el allowance actual no cubre el monto ───────────
      const existingAllowance = await celoClient.readContract({
        address:      tokenAddress,
        abi:          ERC20_APPROVE_ABI,
        functionName: 'allowance',
        args:         [address, escrowAddress],
      }) as bigint

      console.log('[PaymentButton] allowance:', existingAllowance.toString(), 'needed:', amountAtomics.toString())

      if (existingAllowance < amountAtomics) {
        setState('approving')
        const approveHash = await writeContractAsync({
          address:      tokenAddress,
          abi:          ERC20_APPROVE_ABI,
          functionName: 'approve',
          args:         [escrowAddress, amountAtomics],
        })
        await celoClient.waitForTransactionReceipt({ hash: approveHash })
        console.log('[PaymentButton] approve ok:', approveHash)
      } else {
        console.log('[PaymentButton] allowance sufficient, skip approve')
      }

      // ── 3. Deposit: transferir fondos al escrow vinculados a la polla ──────
      console.log('[PaymentButton] deposit args:', { pollBytes32, tokenAddress, amountAtomics: amountAtomics.toString(), escrowAddress })
      setState('depositing')
      const depositHash = await writeContractAsync({
        address:      escrowAddress,
        abi:          ESCROW_DEPOSIT_ABI,
        functionName: 'deposit',
        args:         [pollBytes32, tokenAddress, amountAtomics],
      })

      setState('processing')
      await celoClient.waitForTransactionReceipt({ hash: depositHash })

      // ── 4. Registrar en Supabase ───────────────────────────────────────────
      const data = await callEdgeFunction({
        poll_id:        pollId,
        wallet_address: address,
        token,
        tx_hash:        depositHash,
        amount:         amountAtomics.toString(),
        chain_id:       targetChainId,
      })

      setTxHash(data.tx_hash ?? depositHash)
      setState('done')
      onSuccess()

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
        setState('idle')
        return
      }
      setErrMsg(msg)
      setState('error')
    }
  }

  if (!isConnected) {
    return (
      <div className="hook warn" style={{ marginBottom:12, textAlign:'left', lineHeight:1.6 }}>
        <b>Conectá tu wallet para pagar</b><br />
        <span style={{ fontSize:10, fontWeight:400 }}>
          Esta polla acepta {token} en Celo. Usá el botón "Wallet" arriba.
        </span>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="hook" style={{ marginBottom:12, textAlign:'left', lineHeight:1.6 }}>
        <b>Inscripción pagada ✓</b><br />
        {txHash && (
          <a
            href={celoscanTx(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize:10, color:'var(--lime)', fontWeight:600, wordBreak:'break-all' }}
          >
            Ver en Celoscan →
          </a>
        )}
      </div>
    )
  }

  const isLoading = state !== 'idle' && state !== 'error'
  const loadingLabel =
    state === 'switching'  ? 'Cambiando a Celo...'
    : state === 'approving'  ? 'Aprobando token (1/2)...'
    : state === 'depositing' ? 'Depositando en escrow (2/2)...'
    : state === 'processing' ? 'Verificando en Celo...'
    : null

  return (
    <div style={{ marginBottom:12 }}>
      {isWrongChain && state === 'idle' && (
        <div style={{ fontSize:10, color:'var(--gold)', marginBottom:6, fontWeight:600 }}>
          Estás en una red diferente. Al hacer clic se pedirá cambiar a Celo.
        </div>
      )}

      <button
        className="save"
        style={{ margin:0 }}
        onClick={handlePay}
        disabled={isLoading}
      >
        {isLoading ? loadingLabel : `Pagar ${amount} ${token} en Celo`}
      </button>

      {state === 'error' && errMsg && (
        <div className="err-msg" style={{ marginTop:6 }}>{errMsg}</div>
      )}

      {state === 'idle' && (
        <div className="lockmsg" style={{ marginTop:6 }}>
          Depósito en contrato escrow · puede requerir 1-2 confirmaciones en tu wallet
        </div>
      )}
    </div>
  )
}
