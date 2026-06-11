import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  rabbyWallet,
  valoraWallet,
  metaMaskWallet,
  coinbaseWallet,
  trustWallet,
  walletConnectWallet,
  rainbowWallet,
  phantomWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { celo, celoAlfajores } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Polla Mundial 2026',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  // Mainnet primero: es la red de producción
  chains: [celo, celoAlfajores],
  wallets: [
    {
      groupName: 'Recomendadas para Celo',
      wallets: [rabbyWallet, valoraWallet, metaMaskWallet, coinbaseWallet],
    },
    {
      groupName: 'Otras',
      wallets: [trustWallet, phantomWallet, rainbowWallet, walletConnectWallet],
    },
  ],
})
