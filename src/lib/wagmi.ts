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
import { celo } from 'wagmi/chains'
import { celoSepolia } from 'viem/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Polla Mundial 2026',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  // Mainnet primero; celoSepolia disponible para testing
  chains: [celo, celoSepolia],
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
