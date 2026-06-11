import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { celo, celoAlfajores } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Polla Mundial 2026',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [celoAlfajores, celo],
})
