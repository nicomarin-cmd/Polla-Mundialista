export const CELO_MAINNET = {
  chainId: 42220,
  rpcUrl: 'https://forno.celo.org',
  explorerUrl: 'https://celoscan.io',
  tokens: {
    USDC: {
      address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as `0x${string}`,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin',
    },
    USDT: {
      address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e' as `0x${string}`,
      decimals: 6,
      symbol: 'USDT',
      name: 'Tether USD',
    },
    cUSD: {
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a' as `0x${string}`,
      decimals: 18,
      symbol: 'cUSD',
      name: 'Celo Dollar',
    },
  },
  escrow: '0xb096A912B8CCa3B6DDD6a845E833e714863a0375' as `0x${string}`,
}

// Celo Sepolia — testnet L2 de Celo (reemplaza Alfajores)
// Faucets: faucet.celo.org/celo-sepolia · cloud.google.com/application/web3/faucet/celo/sepolia
export const CELO_SEPOLIA = {
  chainId: 11142220,
  rpcUrl: 'https://forno.celo-sepolia.celo-testnet.org',
  explorerUrl: 'https://celo-sepolia.blockscout.com',
  tokens: {
    USDC: {
      address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E' as `0x${string}`,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin (testnet)',
    },
    USDT: {
      address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb' as `0x${string}`,
      decimals: 6,
      symbol: 'USDT',
      name: 'Tether USD (testnet)',
    },
    // cUSD en Celo Sepolia = Mento Dollar (USDm)
    cUSD: {
      address: '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80' as `0x${string}`,
      decimals: 18,
      symbol: 'cUSD',
      name: 'Celo Dollar (testnet)',
    },
  },
}

export type CeloToken = 'USDC' | 'USDT' | 'cUSD'

// Devuelve la config activa según VITE_CHAIN_ID
export function getActiveConfig() {
  const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? CELO_MAINNET.chainId)
  return chainId === CELO_SEPOLIA.chainId ? CELO_SEPOLIA : CELO_MAINNET
}

export function isTestnet(): boolean {
  return Number(import.meta.env.VITE_CHAIN_ID) === CELO_SEPOLIA.chainId
}

// Flujo de pago por token:
// - eip3009: firma off-chain ReceiveWithAuthorization (gasless para el usuario)
// - approve: ERC-20 approve on-chain + Edge Function transferFrom
export function tokenPaymentFlow(token: CeloToken): 'eip3009' | 'approve' {
  return token === 'cUSD' ? 'approve' : 'eip3009'
}

export function getTokenAddress(token: CeloToken): `0x${string}` {
  return getActiveConfig().tokens[token].address
}

export function getTokenDecimals(token: CeloToken): number {
  return getActiveConfig().tokens[token].decimals
}

export function isCryptoMoneda(moneda: string): boolean {
  return moneda === 'USDC-celo' || moneda === 'USDT-celo' || moneda === 'cUSD'
}

export function monedaToToken(moneda: string): CeloToken {
  if (moneda === 'USDT-celo') return 'USDT'
  if (moneda === 'cUSD') return 'cUSD'
  return 'USDC'
}

export function celoscanTx(txHash: string): string {
  return `${getActiveConfig().explorerUrl}/tx/${txHash}`
}
