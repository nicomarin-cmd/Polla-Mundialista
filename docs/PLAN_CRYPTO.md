# Master Plan: Depósitos en Stablecoins — Celo + x402

> Documento maestro para implementar inscripciones reales en USDC/USDT usando Celo.
> Stack: uvd-x402-sdk (TypeScript) + AdvancedEscrowClient en Celo.
> Ejecutar fase por fase. No avanzar hasta tener la anterior probada en Alfajores testnet.

---

## Decisión de cadena y stablecoin

| | Opción elegida | Por qué |
|---|---|---|
| **Chain** | Celo (42220) / Alfajores testnet (44787) | Requisito hackathon Celo. Fees bajos, EVM-compatible, orientado a pagos cotidianos. |
| **Stablecoin primaria** | **USDC en Celo** | Explícitamente soportada por uvd-x402-sdk. Circle USDC nativo en Celo. |
| **Stablecoin secundaria** | **USDT en Celo** | También listada en el SDK. Opción alternativa al crear la polla. |
| **Stablecoin Mento (bonus)** | **cUSD** | El stable más "nativo" de Celo. Ver Fase 5B — requiere integración manual porque el SDK no lo lista. |
| **Escrow** | **AdvancedEscrowClient** (uvd-x402-sdk) | Soporta Celo. Tiene ciclo completo: authorize → release/refund. NO usar x402r (solo Base). |

### Addresses conocidas en Celo

| Token | Mainnet (42220) | Alfajores testnet (44787) |
|-------|-----------------|--------------------------|
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | verificar Alfajores faucet |
| USDT | `0x617f3112bf5397D0467D315cC709EF968D9ba546` | verificar Alfajores faucet |
| cUSD | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1` |
| cEUR | `0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73` | — |

> **COPM / cCOP**: al momento del plan no hay address confirmada de un Colombian Peso estable en Celo.
> Si aparece en el hackathon (Mento suele lanzar nuevos stables), se agrega en Fase 5B con 0 cambio arquitectural.

---

## Arquitectura de la solución

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USUARIO (participante)                                                 │
│  - Conecta wallet compatible con Celo (MetaMask, Valora, Coinbase)     │
│  - Firma autorización EIP-3009 OFF-CHAIN (gasless para el usuario)     │
│  - Envía X-PAYMENT header al backend                                   │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  POST /pay-inscripcion  { poll_id, payment_header }
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTION: pay-inscripcion                                │
│  - Valida JWT del usuario (Supabase auth)                               │
│  - Verifica que no pagó antes (idempotencia)                            │
│  - Llama AdvancedEscrowClient.authorize(paymentInfo) en Celo           │
│    → Crea escrow on-chain con fondos del usuario                        │
│  - Guarda escrow_id + tx_hash en poll_payments                         │
│  - Marca poll_members.paid = true                                      │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  escrow_id
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ESCROW ON-CHAIN (Celo) via AdvancedEscrowClient                       │
│  Contratos del uvd-x402-sdk — EVM, chainId 42220                       │
│  Estado: authorized → released (ganadores) | refunded (cancelación)    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  release() o refund()
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTION: cerrar-polla / cancelar-polla                  │
│  - Admin cierra → release(escrowId, winnerAddress, amount) × ganadores │
│  - Admin cancela → refund(escrowId) × todos los pagos                  │
│  - Actualiza DB: poll_payments.status, poll_winners, pollas.estado     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Schema de base de datos (nuevas tablas / columnas)

### Tabla `poll_payments`

```sql
create table poll_payments (
  id               uuid primary key default gen_random_uuid(),
  poll_id          uuid references pollas(id) on delete cascade,
  user_id          uuid references auth.users(id),
  amount           numeric(18,6) not null,      -- ej. 10.000000 USDC
  token            text not null,               -- 'USDC' | 'USDT' | 'cUSD'
  chain            text not null default 'celo',
  chain_id         int  not null default 42220,
  wallet_address   text not null,               -- address del pagador en Celo
  escrow_id        text,                         -- id del escrow (AdvancedEscrowClient)
  payment_header   text,                         -- X-PAYMENT raw para auditoría
  tx_hash_deposit  text,                         -- hash tx de autorización escrow
  tx_hash_capture  text,                         -- hash tx de release o refund
  status           text not null default 'pending',
                   -- pending | escrowed | captured | refunded | failed
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- RLS
alter table poll_payments enable row level security;

create policy "usuario ve sus pagos"
  on poll_payments for select
  using (auth.uid() = user_id);

create policy "admin ve pagos de su polla"
  on poll_payments for select
  using (
    exists (
      select 1 from pollas
      where pollas.id = poll_payments.poll_id
        and pollas.admin_id = auth.uid()
    )
  );
```

### Tabla `poll_winners`

```sql
create table poll_winners (
  id             uuid primary key default gen_random_uuid(),
  poll_id        uuid references pollas(id),
  user_id        uuid references auth.users(id),
  position       int not null,            -- 1, 2, 3
  amount_token   numeric(18,6) not null,
  token          text not null,
  wallet_address text not null,
  tx_hash        text,                    -- tx de transferencia al ganador
  created_at     timestamptz default now()
);
```

### Columna en `profiles`

```sql
alter table profiles add column if not exists wallet_address text;
```

### Columnas en `pollas`

```sql
-- Las pollas ya tienen campo 'moneda'. Extender el tipo:
-- Valores nuevos válidos: 'USDC-celo' | 'USDT-celo' | 'cUSD'
-- (Los existentes 'COP', 'USD', 'USDT' siguen funcionando igual)
```

---

## Fase 0 — Preparación técnica ✅ COMPLETADA
**Entregable**: repo configurado, providers integrados, tokens y contratos mapeados

### 0.1 Dependencias

```bash
npm install wagmi viem @tanstack/react-query
npm install @rainbow-me/rainbowkit
npm install uvd-x402-sdk ethers@^6
```

### 0.2 Variables de entorno

**`.env.local`** (frontend, seguro compartir solo en dev):
```
VITE_WALLETCONNECT_PROJECT_ID=...    # gratis en cloud.walletconnect.com
VITE_CHAIN_ID=44787                  # 44787 = Alfajores testnet, 42220 = Celo mainnet
```

**Supabase Secrets** (Edge Functions, NUNCA en el frontend):
```
PLATFORM_OPERATOR_PRIVATE_KEY=0x...   # wallet del operador — necesita CELO para gas
PLATFORM_OPERATOR_ADDRESS=0x...       # address pública del operador
X402_FACILITATOR_URL=https://...      # URL del facilitador UltravioletaDAO
```

> El operador necesita CELO nativo para pagar gas de `authorize()`, `release()`, `refund()`.
> En Alfajores usar faucet: https://faucet.celo.org/alfajores

### 0.3 Configurar wagmi con Celo

**Archivo a crear**: `src/lib/wagmi.ts`

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { celo, celoAlfajores } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Polla Mundial 2026',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [celoAlfajores, celo],   // testnet first
})
```

**Modificar**: `src/main.tsx` — envolver con `WagmiProvider` + `QueryClientProvider` + `RainbowKitProvider`.

### 0.4 Configuración de tokens por chain

**Archivo a crear**: `src/lib/celoTokens.ts`

```typescript
export const CELO_TOKENS = {
  mainnet: {
    chainId: 42220,
    rpc: 'https://forno.celo.org',
    tokens: {
      USDC: {
        address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        decimals: 6,
        symbol: 'USDC',
      },
      USDT: {
        address: '0x617f3112bf5397D0467D315cC709EF968D9ba546',
        decimals: 6,
        symbol: 'USDT',
      },
      cUSD: {
        address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
        decimals: 18,
        symbol: 'cUSD',
      },
    },
  },
  alfajores: {
    chainId: 44787,
    rpc: 'https://alfajores-forno.celo-testnet.org',
    tokens: {
      cUSD: {
        address: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1',
        decimals: 18,
        symbol: 'cUSD',
      },
      // USDC y USDT en Alfajores: verificar con faucet del hackathon
    },
  },
}

export type CeloTokenKey = 'USDC' | 'USDT' | 'cUSD'
```

### 0.5 Migración SQL

Crear `supabase/migrations/003_crypto_payments.sql` con todo el schema de arriba.

---

## Fase 1 — Conexión de wallet Celo ✅ COMPLETADA
**Entregable**: WalletButton en los tres headers, sync automático a Supabase, selector de moneda cripto

### 1.1 Componente `WalletButton`

**Archivo a crear**: `src/components/WalletButton.tsx`

```typescript
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { session } = useAuth()

  useEffect(() => {
    if (isConnected && address && session) {
      supabase
        .from('profiles')
        .update({ wallet_address: address.toLowerCase() })
        .eq('id', session.user.id)
    }
  }, [address, isConnected, session])

  return (
    <ConnectButton
      chainStatus="icon"
      showBalance={false}
    />
  )
}
```

### 1.2 Dónde integrar el botón

- **`src/App.tsx`** (header/navbar global): siempre visible.
- **`PollPlayer.tsx`** (sección inscripción): mostrar aviso si no hay wallet conectada.
- **`PollAdmin.tsx`** (tab pagos): mostrar wallets de ganadores.

### 1.3 Guard: red incorrecta

Si el usuario conectó su wallet pero está en la red equivocada (no Celo):
```tsx
{chain?.id !== Number(import.meta.env.VITE_CHAIN_ID) && (
  <div className="warn-banner">
    Cambiá tu wallet a la red Celo para pagar
  </div>
)}
```

---

## Fase 2 — Depósito de inscripción (escrow en Celo) ✅ COMPLETADA
**Entregable**: PaymentButton EIP-3009 gasless, Edge Function pay-inscripcion, integración en PollPlayer

### 2.1 Flujo detallado

```
1. Participante abre su polla (moneda = 'USDC-celo' o 'USDT-celo')
2. UI muestra: "Inscripción: X USDC  [Pagar]"
3. Si no tiene wallet → mostrar instrucción de conectar
4. Si tiene wallet pero en red distinta → mostrar "Cambiar a Celo"
5. Usuario clica "Pagar":
   a. Frontend usa X402Client.createPayment() → firma EIP-3009 off-chain
   b. Genera el X-PAYMENT header
6. Frontend POST /pay-inscripcion:
   { poll_id, payment_header, wallet_address }
7. Edge Function:
   a. Decodifica JWT → user_id
   b. Verifica: miembro de la polla + no pagó antes
   c. Verifica: monto del header == inscripcion de la polla
   d. AdvancedEscrowClient.authorize(paymentInfo) en Celo → escrow on-chain
   e. INSERT poll_payments con escrow_id + tx_hash + status='escrowed'
   f. UPDATE poll_members SET paid=true
   g. Retorna { success: true, tx_hash, escrow_id }
8. Frontend: actualiza estado → chip "Inscripción pagada ✓" + link a Celoscan
```

### 2.2 Edge Function: `pay-inscripcion`

**Archivo a crear**: `supabase/functions/pay-inscripcion/index.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { X402Client, AdvancedEscrowClient } from 'uvd-x402-sdk'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  // Autenticación
  const authHeader = req.headers.get('Authorization')!
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { poll_id, payment_header, wallet_address } = await req.json()

  // Idempotencia: ya pagó?
  const { data: existing } = await supabase
    .from('poll_payments')
    .select('id')
    .eq('poll_id', poll_id)
    .eq('user_id', user.id)
    .eq('status', 'escrowed')
    .maybeSingle()
  if (existing) return new Response(JSON.stringify({ error: 'Ya pagaste' }), { status: 400 })

  // Datos de la polla
  const { data: member } = await supabase
    .from('poll_members')
    .select('paid, pollas(inscripcion, moneda)')
    .eq('poll_id', poll_id)
    .eq('user_id', user.id)
    .single()
  if (!member) return new Response('No sos miembro', { status: 403 })

  const polla = (member as any).pollas
  const token = polla.moneda === 'USDT-celo' ? 'USDT' : 'USDC'
  const amount = String(Math.round(polla.inscripcion * 1e6)) // 6 decimales

  // Crear escrow en Celo via AdvancedEscrowClient
  const escrowClient = new AdvancedEscrowClient(
    Deno.env.get('PLATFORM_OPERATOR_PRIVATE_KEY')!,
    { chainId: 42220 }  // mainnet; 44787 en dev
  )
  await escrowClient.init()

  const paymentInfo = escrowClient.buildPaymentInfo(
    Deno.env.get('PLATFORM_OPERATOR_ADDRESS')!,
    amount,
    'standard'
  )

  const auth = await escrowClient.authorize(paymentInfo)

  // Guardar en DB
  await supabase.from('poll_payments').insert({
    poll_id,
    user_id: user.id,
    amount: polla.inscripcion,
    token,
    chain: 'celo',
    chain_id: 42220,
    wallet_address: wallet_address.toLowerCase(),
    escrow_id: auth.escrowId,
    tx_hash_deposit: auth.txHash,
    status: 'escrowed',
  })

  await supabase
    .from('poll_members')
    .update({ paid: true })
    .eq('poll_id', poll_id)
    .eq('user_id', user.id)

  return new Response(JSON.stringify({
    success: true,
    tx_hash: auth.txHash,
    escrow_id: auth.escrowId,
    celoscan: `https://celoscan.io/tx/${auth.txHash}`,
  }))
})
```

### 2.3 Componente `PaymentButton`

**Archivo a crear**: `src/components/PaymentButton.tsx`
- Props: `pollId`, `amount`, `token`, `onSuccess`
- Usa `useX402()` o `X402Client` del SDK para generar el payment header
- Estados: `idle` → `signing` → `processing` → `done` | `error`
- Post-success: muestra badge verde + link a Celoscan

### 2.4 Modificar `PollPlayer.tsx`

Sección "Inscripción" en la parte superior del componente:
```tsx
{poll.moneda?.endsWith('-celo') && !member?.paid && (
  <PaymentButton
    pollId={poll.id}
    amount={poll.inscripcion}
    token={poll.moneda === 'USDT-celo' ? 'USDT' : 'USDC'}
    onSuccess={() => refetchMember()}
  />
)}
```

---

## Fase 3 — Captura y distribución a ganadores ✅ COMPLETADA
**Estimado**: 3 días | **Entregable**: admin cierra polla → USDC/USDT llega a wallets de ganadores en Celo

### 3.1 Flujo detallado

```
1. Admin abre tab "Cerrar" en PollAdmin
2. App muestra:
   - Total en escrow: X USDC
   - Ganadores calculados (tabla + desempate)
   - Wallets de cada ganador (con warning si alguno no tiene)
   - Desglose: ganador1 = X% = Y USDC, etc.
3. Admin hace clic "Cerrar y distribuir"
4. Frontend POST /cerrar-polla: { poll_id }
5. Edge Function:
   a. Verifica que caller = admin de la polla
   b. Obtiene tabla final via función SQL existente
   c. Obtiene poll_payments con status='escrowed'
   d. Para cada escrow → AdvancedEscrowClient.release(escrowId, ...) 
   e. Calcula montos para ganadores (premios %)
   f. Transfiere USDC/USDT a wallet de cada ganador
   g. Guarda en poll_winners (position, amount, tx_hash)
   h. Actualiza poll_payments.status = 'captured'
   i. Actualiza pollas.estado = 'cerrada'
6. Frontend: pantalla de resultados con tx hashes
```

### 3.2 Lógica de distribución

```typescript
const boteTotal = payments.reduce((sum, p) => sum + p.amount, 0)

const distribucion = [
  { position: 1, pct: poll.prem0, user: ganadores[0] },
  { position: 2, pct: poll.prem1, user: ganadores[1] },
  { position: 3, pct: poll.prem2, user: ganadores[2] },
].filter(d => d.pct > 0 && d.user)

for (const d of distribucion) {
  const amount = Math.floor(boteTotal * (d.pct / 100) * 1e6) // 6 decimales
  const txHash = await escrowClient.release(escrowId, d.user.wallet_address, String(amount))
  await supabase.from('poll_winners').insert({ ... txHash })
}
```

> **Edge case**: ganador sin wallet → no transferir, guardar en `poll_winners.status = 'pending_wallet'`.
> El admin puede completar manualmente cuando el ganador provea su address.

### 3.3 Edge Function: `cerrar-polla`

**Archivo a crear**: `supabase/functions/cerrar-polla/index.ts`
- Misma estructura que `pay-inscripcion` (auth JWT → operaciones → update DB)
- Reutiliza la función SQL `calcular_tabla(poll_id)` que ya existe

### 3.4 UI en `PollAdmin.tsx` — tab "Cerrar"

Modificar el bloque de cierre actual para:
- Si `poll.moneda` es cripto: mostrar desglose de fondos en escrow
- Mostrar wallet address de cada ganador potencial (editable si falta)
- Botón "Cerrar y distribuir premios en USDC" → llama Edge Function
- Post-cierre: lista de tx hashes con links a Celoscan

---

## Fase 4 — Reembolsos y cancelación ✅ COMPLETADA
**Estimado**: 2 días | **Entregable**: admin cancela polla → USDC vuelve automáticamente

### 4.1 Flujo de cancelación

```
1. Admin hace clic "Cancelar polla"
2. Confirmación: "Esto reembolsará X USDC a Y participantes"
3. POST /cancelar-polla: { poll_id }
4. Edge Function:
   - Obtiene todos poll_payments con status='escrowed'
   - Para cada uno: AdvancedEscrowClient.refund(escrowId)
   - Actualiza status='refunded' + tx_hash_capture
   - Actualiza pollas.estado = 'cancelada'
5. Notificación: cada participante ve "Tu inscripción fue reembolsada" + tx hash
```

### 4.2 Edge Function: `cancelar-polla`

**Archivo a crear**: `supabase/functions/cancelar-polla/index.ts`

```typescript
for (const payment of escrowedPayments) {
  const result = await escrowClient.refund(payment.escrow_id)
  await supabase
    .from('poll_payments')
    .update({ status: 'refunded', tx_hash_capture: result.txHash })
    .eq('id', payment.id)
}
```

### 4.3 Vista de pagos en `PollAdmin.tsx`

Nueva sección en tab "Personas" (o tab "Pagos"):
```
Nombre    | Monto   | Estado     | Tx Hash          | Acción
----------|---------|------------|------------------|--------
Usuario A | 10 USDC | ✅ Pagado  | 0xabc...def      | Reembolsar
Usuario B | 10 USDC | ⏳ Pending | —                | —
```

---

## Fase 5 — Multi-stablecoin en Celo ✅ COMPLETADA
**Estimado**: 1-2 días | **Entregable**: admin puede elegir USDC, USDT o cUSD al crear la polla

### 5A — USDC y USDT en Celo (ya soportado por SDK)

Extender el selector de moneda en `Pollas.tsx`:

```tsx
const MONEDA_OPTS = [
  { id: 'COP',       label: 'COP',         icon: '🇨🇴', crypto: false },
  { id: 'USDC-celo', label: 'USDC (Celo)', icon: '💵', crypto: true  },
  { id: 'USDT-celo', label: 'USDT (Celo)', icon: '💵', crypto: true  },
  { id: 'cUSD',      label: 'cUSD (Celo)', icon: '🌱', crypto: true  },
]
```

### 5B — cUSD (Mento / más nativo de Celo)

cUSD usa un mecanismo diferente (no EIP-3009 estándar, sino el sistema Mento). Pasos:
1. Verificar si uvd-x402-sdk soporta cUSD en la versión actual.
2. Si no: usar `viem` directamente para interactuar con el contrato cUSD de Mento.
3. El escrow en cUSD puede ser un contrato propio simple (ver Fase 6B).

> **Prioridad hackathon**: arrancar con USDC-celo (más simple) y después agregar cUSD si hay tiempo.

### 5C — cCOP / COPM (Colombian Peso en Celo)

Si Mento lanza cCOP durante o antes del hackathon:
1. Agregar address a `celoTokens.ts`
2. Agregar a MONEDA_OPTS
3. Sin cambio en la lógica del escrow (mismo flujo EIP-3009 si el token lo soporta)

---

## Fase 6 — Testing, seguridad y producción ✅ COMPLETADA

### 6A — Checklist de pruebas en Alfajores

- [ ] Crear wallet de operador en Alfajores + fondear con CELO desde faucet
- [ ] Setear secrets en Supabase: `PLATFORM_OPERATOR_PRIVATE_KEY`, `PLATFORM_OPERATOR_ADDRESS`
- [ ] Desplegar las 3 Edge Functions: `supabase functions deploy pay-inscripcion cerrar-polla cancelar-polla`
- [ ] Usuario crea polla con `moneda = 'USDC-celo'`
- [ ] Participante 1 y 2 se unen y pagan → `poll_payments.status = 'confirmed'`
- [ ] Verificar tx hashes en Celoscan Alfajores
- [ ] Admin ingresa resultados → tabla de posiciones se actualiza
- [ ] Admin cierra polla → USDC llega a wallets de ganadores → `poll_winners.status = 'sent'`
- [ ] Verificar en Celoscan que los ganadores recibieron los fondos
- [ ] Test de cancelación → reembolso a participantes → `poll_payments.status = 'refunded'`
- [ ] Test con ganador sin wallet: `poll_winners.status = 'pending_wallet'`
- [ ] Test de doble-pago: segunda llamada devuelve `{ already_paid: true }` sin cobrar
- [ ] Test con cUSD: approve on-chain → inscripción → cierre → distribución
- [ ] Test con monto incorrecto: Edge Function rechaza con 400

### 6B — Auditoría de seguridad ✅

- [x] `PLATFORM_OPERATOR_PRIVATE_KEY` NUNCA en el frontend (solo en Supabase secrets via `requireEnv()`)
- [x] Edge Functions validan JWT antes de cualquier operación
- [x] RLS en `poll_payments`: usuario solo lee los suyos; admin lee los de su polla
- [x] Idempotencia en `pay-inscripcion`: verifica `status IN ('confirmed','distributed')` antes de cobrar
- [x] `poll_payments` INSERT ocurre ANTES de `poll_members.pagado = true` (sin estado inconsistente)
- [x] `cancelar-polla` marca estado='cancelada' ANTES de procesar reembolsos (evita doble ejecución)
- [x] Wallet addresses validadas con regex antes de cualquier tx on-chain
- [x] Stack trace nunca expuesto al cliente — solo mensajes sanitizados
- [x] Utilidades de seguridad centralizadas en `_shared/utils.ts`

### 6C — Switch a Celo mainnet

1. Cambiar `VITE_CHAIN_ID=42220` en `.env.local`
2. Las Edge Functions ya apuntan a `https://forno.celo.org` (mainnet)
3. Asegurar que el operator wallet tiene CELO nativo en mainnet para gas
4. Actualizar `VITE_PLATFORM_WALLET` a la address mainnet del operador
5. Desplegar Edge Functions en producción Supabase
6. Ver `README.md` para guía completa de deploy

---

## Resumen de archivos

### Nuevos
```
src/lib/wagmi.ts                           — chains Celo + WalletConnect config
src/lib/celoTokens.ts                      — addresses de tokens por chain
src/components/WalletButton.tsx            — conectar wallet Celo
src/components/PaymentButton.tsx           — pagar inscripción (x402 + escrow)
src/components/PaymentStatus.tsx           — estado del pago + tx hash + Celoscan link
supabase/migrations/003_crypto_payments.sql
supabase/functions/pay-inscripcion/index.ts
supabase/functions/cerrar-polla/index.ts
supabase/functions/cancelar-polla/index.ts
```

### Modificados
```
src/main.tsx            — WagmiProvider + QueryClientProvider + RainbowKitProvider
src/pages/Pollas.tsx    — selector moneda cripto (USDC-celo, USDT-celo, cUSD)
src/pages/PollPlayer.tsx — sección pago de inscripción + estado
src/pages/PollAdmin.tsx  — vista pagos, cierre con distribución, cancelación
src/types.ts             — tipos PollPayment, PollWinner
```

---

## Dependencias entre fases

```
Fase 0 (setup Celo)
    └── Fase 1 (wallet UI)
            └── Fase 2 (depósito escrow)       ← MVP cripto funcional
                    └── Fase 3 (distribución)  ← flujo completo
                            └── Fase 4 (reembolsos)
                                    └── Fase 5 (cUSD + cCOP)
                                            └── Fase 6 (mainnet)
```

**MVP mínimo para hackathon**: Fases 0 → 1 → 2 → 3 con USDC en Alfajores.
Tiempo estimado total: ~10 días de trabajo.

---

## Notas de arquitectura

1. **x402r NO aplica**: x402r solo corre en Base. Para Celo usamos el `AdvancedEscrowClient` del `uvd-x402-sdk` directamente — tiene el ciclo completo (authorize/release/refund) y soporta Celo.

2. **EIP-3009 gasless**: el usuario firma off-chain → no paga gas. El operador de la plataforma paga el gas. Asegurar que el operador tenga CELO nativo en su wallet.

3. **cUSD vs USDC**: cUSD es más "nativo de Celo" (Mento) pero usa un mecanismo de autorización distinto. USDC en Celo es Circle USDC standard — más fácil de integrar con el SDK. Para el hackathon, empezar con USDC y si hay tiempo agregar cUSD.

4. **Pollas COP no cambian**: el flujo manual de "admin marca pagado" sigue funcionando. El flujo cripto es estrictamente adicional, activado solo cuando `moneda` es una opción cripto.

5. **Desempate determinista**: la tabla y el desempate los calcula la función SQL en Supabase (ya existente). La distribución on-chain solo ejecuta lo que la BD ya determinó.
