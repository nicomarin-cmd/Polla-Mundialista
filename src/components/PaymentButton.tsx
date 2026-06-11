import { useState } from 'react'
import { useAccount, useSignTypedData, useChainId, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi'
import { parseUnits } from 'viem'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { CELO_MAINNET, monedaToToken, celoscanTx, tokenPaymentFlow, getTokenDecimals, getTokenAddress } from '../lib/celoTokens'

interface Props {
  pollId: string
  amount: number        // en unidades legibles (ej. 10.00)
  moneda: string        // 'USDC-celo' | 'USDT-celo' | 'cUSD'
  onSuccess: () => void
}

type PayState = 'idle' | 'switching' | 'approving' | 'confirming' | 'signing' | 'processing' | 'done' | 'error'

// Dominios EIP-712 para USDC y USDT (flujo EIP-3009)
const USDC_DOMAIN = {
  name: 'USDC' as const,
  version: '2' as const,
  chainId: CELO_MAINNET.chainId,
  verifyingContract: CELO_MAINNET.tokens.USDC.address,
} as const

const USDT_DOMAIN = {
  name: 'Tether USD' as const,
  version: '1' as const,
  chainId: CELO_MAINNET.chainId,
  verifyingContract: CELO_MAINNET.tokens.USDT.address,
} as const

const RECEIVE_WITH_AUTH_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address'  },
    { name: 'value',       type: 'uint256'  },
    { name: 'validAfter',  type: 'uint256'  },
    { name: 'validBefore', type: 'uint256'  },
    { name: 'nonce',       type: 'bytes32'  },
  ],
} as const

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
] as const

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

export function PaymentButton({ pollId, amount, moneda, onSuccess }: Props) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const { session } = useAuth()

  const [state, setState] = useState<PayState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const token = monedaToToken(moneda)
  const flow = tokenPaymentFlow(token)
  const decimals = getTokenDecimals(token)

  const targetChainId = Number(import.meta.env.VITE_CHAIN_ID ?? CELO_MAINNET.chainId)
  const isWrongChain = isConnected && chainId !== targetChainId

  const platformWallet = import.meta.env.VITE_PLATFORM_WALLET as `0x${string}` | undefined

  // ── Llamada a la Edge Function ────────────────────────────────────────────
  const callEdgeFunction = async (body: Record<string, unknown>) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay-inscripcion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSession?.access_token}`,
        },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Error al procesar el pago')
    return data
  }

  const handlePay = async () => {
    if (!isConnected || !address || !session || !platformWallet) return
    setErrMsg('')

    try {
      // ── Switch de red si es necesario ────────────────────────────────────
      if (isWrongChain) {
        setState('switching')
        await switchChainAsync({ chainId: targetChainId })
      }

      const amountAtomics = parseUnits(String(amount), decimals)

      if (flow === 'eip3009') {
        // ── Flujo EIP-3009: USDC / USDT (gasless, firma off-chain) ───────
        setState('signing')
        const nonce = randomNonce()
        const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600)
        const domain = token === 'USDT' ? USDT_DOMAIN : USDC_DOMAIN

        const signature = await signTypedDataAsync({
          domain,
          types: RECEIVE_WITH_AUTH_TYPES,
          primaryType: 'ReceiveWithAuthorization',
          message: {
            from:        address,
            to:          platformWallet,
            value:       amountAtomics,
            validAfter:  0n,
            validBefore,
            nonce,
          },
        })

        setState('processing')
        const data = await callEdgeFunction({
          poll_id: pollId,
          wallet_address: address,
          token,
          flow: 'eip3009',
          signature,
          nonce,
          valid_before: validBefore.toString(),
          amount: amountAtomics.toString(),
        })

        setTxHash(data.tx_hash)
        setState('done')
        onSuccess()

      } else {
        // ── Flujo approve: cUSD (on-chain approve + Edge Function transferFrom) ─
        setState('approving')
        const approveTx = await writeContractAsync({
          address: getTokenAddress('cUSD'),
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [platformWallet, amountAtomics],
        })

        setState('confirming')
        if (!publicClient) throw new Error('Cliente RPC no disponible')
        await publicClient.waitForTransactionReceipt({ hash: approveTx })

        setState('processing')
        const data = await callEdgeFunction({
          poll_id: pollId,
          wallet_address: address,
          token,
          flow: 'approve',
          approve_tx: approveTx,
          amount: amountAtomics.toString(),
        })

        setTxHash(data.tx_hash)
        setState('done')
        onSuccess()
      }

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

  // ── Sin wallet conectada ──────────────────────────────────────────────────
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

  // ── Pago completado ───────────────────────────────────────────────────────
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
    state === 'switching'   ? 'Cambiando red...'
    : state === 'approving' ? 'Aprobá en tu wallet...'
    : state === 'confirming'? 'Confirmando aprobación...'
    : state === 'signing'   ? 'Firmá en tu wallet...'
    : state === 'processing'? 'Procesando en Celo...'
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
          {flow === 'eip3009'
            ? 'Firma sin gas · tus fondos quedan en custodia hasta el cierre de la polla'
            : 'Aprobación on-chain (gas mínimo en CELO) · fondos en custodia hasta el cierre'}
        </div>
      )}
    </div>
  )
}
