// Utilidades compartidas para todas las Edge Functions

// ── Env vars ─────────────────────────────────────────────────────────────────
/** Lanza si la variable de entorno no existe. Falla rápido con mensaje claro. */
export function requireEnv(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Variable de entorno faltante: ${key}`)
  return val
}

// ── Validación de addresses ───────────────────────────────────────────────────
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** Valida y normaliza una address Ethereum. Lanza si es inválida. */
export function validateAddress(addr: unknown): string {
  if (typeof addr !== 'string' || !ADDRESS_RE.test(addr)) {
    throw new Error(`Dirección inválida: ${addr}`)
  }
  return addr.toLowerCase()
}

// ── Respuestas JSON con CORS ──────────────────────────────────────────────────
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Configuración de tokens ───────────────────────────────────────────────────
type TokenConfig = Record<string, { address: string; decimals: number }>

const MAINNET_TOKEN_CONFIG: TokenConfig = {
  USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
  USDT: { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },
  cUSD: { address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
}

const SEPOLIA_TOKEN_CONFIG: TokenConfig = {
  USDC: { address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', decimals: 6 },
  USDT: { address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6 },
  cUSD: { address: '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80', decimals: 18 },
}

const NETWORK_CONFIG: Record<number, { tokenConfig: TokenConfig; rpc: string; explorer: string }> = {
  42220: {
    tokenConfig: MAINNET_TOKEN_CONFIG,
    rpc: 'https://forno.celo.org',
    explorer: 'https://celoscan.io',
  },
  11142220: {
    tokenConfig: SEPOLIA_TOKEN_CONFIG,
    rpc: 'https://forno.celo-sepolia.celo-testnet.org',
    explorer: 'https://celo-sepolia.blockscout.com',
  },
}

export function getNetworkConfig(chainId: number) {
  const cfg = NETWORK_CONFIG[chainId]
  if (!cfg) throw new Error(`Chain ID no soportado: ${chainId}. Soportados: 42220 (mainnet), 11142220 (Sepolia)`)
  return cfg
}

// Compatibilidad hacia atrás — mainnet por defecto
export const TOKEN_CONFIG = MAINNET_TOKEN_CONFIG
export const CELO_RPC = 'https://forno.celo.org'

// ── Escrow contract ───────────────────────────────────────────────────────────
export function getEscrowAddress(): string {
  const addr = Deno.env.get('ESCROW_CONTRACT_ADDRESS')
  if (!addr) throw new Error('Variable de entorno faltante: ESCROW_CONTRACT_ADDRESS')
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error(`ESCROW_CONTRACT_ADDRESS inválida: ${addr}`)
  return addr
}

/** pollId (UUID string) → bytes32 usando keccak256, idéntico a ethers.id() */
export function pollIdToBytes32(pollId: string, ethers: any): string {
  return ethers.id(pollId)
}

export const ESCROW_ABI = [
  'function deposit(bytes32 pollId, address token, uint256 amount) external',
  'function distribute(bytes32 pollId, address[] calldata winners, uint256[] calldata winnerBps) external',
  'function cancel(bytes32 pollId) external',
  'function refundFor(bytes32 pollId, address user) external',
  'function refund(bytes32 pollId) external',
  'function getBalance(bytes32 pollId, address user) external view returns (uint256)',
  'function getPoll(bytes32 pollId) external view returns (address token, uint256 total, bool distributed, bool cancelled)',
]

/** Convierte monto en unidades legibles (ej. 10.50) a atomics según decimales del token. */
export function toAtomics(amount: number, decimals: number): bigint {
  // Multiplicar como enteros para evitar errores de punto flotante
  const factor = 10 ** decimals
  return BigInt(Math.round(amount * factor))
}

export function isCryptoMoneda(moneda: string): boolean {
  return moneda === 'USDC-celo' || moneda === 'USDT-celo' || moneda === 'cUSD'
}

export function monedaToTokenSymbol(moneda: string): string {
  if (moneda === 'USDT-celo') return 'USDT'
  if (moneda === 'cUSD') return 'cUSD'
  return 'USDC'
}
