import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi'
import { parseUnits } from 'viem'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { CELO_MAINNET, monedaToToken, celoscanTx, getTokenDecimals, getTokenAddress } from '../lib/celoTokens'

interface Props {
  pollId: string
  amount: number        // en unidades legibles (ej. 10.00)
  moneda: string        // 'USDC-celo' | 'USDT-celo' | 'cUSD'
  onSuccess: () => void
}

type PayState = 'idle' | 'switching' | 'confirming' | 'processing' | 'done' | 'error'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export function PaymentButton({ pollId, amount, moneda, onSuccess }: Props) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const { session } = useAuth()

  const [state, setState] = useState<PayState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const token = monedaToToken(moneda)
  const decimals = getTokenDecimals(token)
  const targetChainId = Number(import.meta.env.VITE_CHAIN_ID ?? CELO_MAINNET.chainId)
  const isWrongChain = isConnected && chainId !== targetChainId
  const platformWallet = import.meta.env.VITE_PLATFORM_WALLET as `0x${string}` | undefined

  const callEdgeFunction = async (body: Record<string, unknown>) => {
    const { data: { session: s } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay-inscripcion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token}`,
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
      if (isWrongChain) {
        setState('switching')
        await switchChainAsync({ chainId: targetChainId })
      }

      const amountAtomics = parseUnits(String(amount), decimals)

      // Transferencia directa — el usuario paga su propio gas
      setState('confirming')
      const hash = await writeContractAsync({
        address: getTokenAddress(token),
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [platformWallet, amountAtomics],
      })

      setState('processing')
      if (!publicClient) throw new Error('Cliente RPC no disponible')
      await publicClient.waitForTransactionReceipt({ hash })

      const data = await callEdgeFunction({
        poll_id:        pollId,
        wallet_address: address,
        token,
        tx_hash:        hash,
        amount:         amountAtomics.toString(),
      })

      setTxHash(data.tx_hash)
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
    : state === 'confirming'? 'Confirmá en tu wallet...'
    : state === 'processing'? 'Verificando en Celo...'
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
          Transferencia en Celo · necesitás un mínimo de CELO para gas
        </div>
      )}
    </div>
  )
}
