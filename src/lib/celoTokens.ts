// Addresses de tokens en Celo — extraídas del uvd-x402-sdk (SUPPORTED_CHAINS.celo)
// y de los contratos de escrow (ESCROW_CONTRACTS[42220])

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
    // cUSD: Mento stablecoin nativo de Celo, 18 decimales
    // Usa approve+transferFrom (no EIP-3009) porque el dominio EIP-712 varía entre versiones del contrato
    cUSD: {
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a' as `0x${string}`,
      decimals: 18,
      symbol: 'cUSD',
      name: 'Celo Dollar',
    },
  },
  escrow: {
    operator:        '0x32d6AC59BCe8DFB3026F10BcaDB8D00AB218f5b6' as `0x${string}`,
    escrow:          '0x320a3c35F131E5D2Fb36af56345726B298936037' as `0x${string}`,
    tokenCollector:  '0x230fd3A171750FA45db2976121376b7F47Cba308' as `0x${string}`,
    protocolFee:     '0xD979dBfBdA5f4b16AAF60Eaab32A44f352076838' as `0x${string}`,
    refundRequest:   '0xc1256Bb30bd0cdDa07D8C8Cf67a59105f2EA1b98' as `0x${string}`,
  },
  facilitatorUrl: 'https://facilitator.ultravioletadao.xyz',
}

export const CELO_TESTNET = {
  chainId: 44787,
  rpcUrl: 'https://alfajores-forno.celo-testnet.org',
  explorerUrl: 'https://alfajores.celoscan.io',
  tokens: {
    // USDC/USDT en Alfajores no son oficiales — usar mainnet para pruebas con fondos reales
    cUSD: {
      address: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1' as `0x${string}`,
      decimals: 18,
      symbol: 'cUSD',
      name: 'Celo Dollar (testnet)',
    },
  },
}

export type CeloToken = 'USDC' | 'USDT' | 'cUSD'

// Flujo de pago por token:
// - eip3009: firma off-chain ReceiveWithAuthorization (gasless para el usuario)
// - approve: ERC-20 approve on-chain + Edge Function transferFrom
export function tokenPaymentFlow(token: CeloToken): 'eip3009' | 'approve' {
  return token === 'cUSD' ? 'approve' : 'eip3009'
}

export function getTokenAddress(token: CeloToken): `0x${string}` {
  return CELO_MAINNET.tokens[token].address
}

export function getTokenDecimals(token: CeloToken): number {
  return CELO_MAINNET.tokens[token].decimals
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
  return `${CELO_MAINNET.explorerUrl}/tx/${txHash}`
}
