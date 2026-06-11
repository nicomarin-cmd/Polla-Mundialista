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
export const TOKEN_CONFIG: Record<string, { address: string; decimals: number }> = {
  USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
  USDT: { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },
  cUSD: { address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
}

export const CELO_RPC = 'https://forno.celo.org'

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
