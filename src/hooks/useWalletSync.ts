import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Guarda la wallet address del usuario en Supabase cada vez que conecta
export function useWalletSync() {
  const { address, isConnected } = useAccount()
  const { session } = useAuth()

  useEffect(() => {
    if (!isConnected || !address || !session) return
    supabase
      .from('profiles')
      .update({ wallet_address: address.toLowerCase() })
      .eq('id', session.user.id)
  }, [address, isConnected, session?.user.id])
}
