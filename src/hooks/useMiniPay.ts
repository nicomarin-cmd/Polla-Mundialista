import { useEffect } from 'react'
import { useConnect, useAccount } from 'wagmi'
import { injected } from 'wagmi/connectors'

/** Detecta si la app corre dentro del browser de MiniPay */
export function isMiniPayBrowser(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum?.isMiniPay
}

/** Auto-conecta la wallet inyectada por MiniPay al montar */
export function useMiniPayAutoConnect() {
  const { isConnected } = useAccount()
  const { connect } = useConnect()

  useEffect(() => {
    if (isMiniPayBrowser() && !isConnected) {
      connect({ connector: injected() })
    }
  }, [isConnected])
}
