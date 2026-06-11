# Polla Mundial 2026

App web para organizar quinielas del Mundial 2026 con soporte de pagos on-chain en stablecoins de Celo (USDC, USDT, cUSD).

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend / DB / Auth**: Supabase (Postgres + RLS + Edge Functions)
- **Pagos on-chain**: Celo blockchain — USDC, USDT, cUSD vía EIP-3009 / ERC-20
- **Wallets**: wagmi v2 + RainbowKit v2 (MetaMask, Coinbase Wallet, Valora)

---

## Desarrollo local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key del proyecto (pública, segura en frontend) |
| `VITE_WALLETCONNECT_PROJECT_ID` | ID de proyecto en cloud.walletconnect.com (gratis) |
| `VITE_CHAIN_ID` | `44787` = Alfajores testnet · `42220` = Celo mainnet |
| `VITE_PLATFORM_WALLET` | Address pública del operador (recibe fondos en custodia) |

### 3. Iniciar el servidor de desarrollo

```bash
npm run dev
```

---

## Setup de Supabase

### Migraciones (ejecutar en orden en el SQL Editor)

```
supabase/migrations/003_crypto_payments.sql   — tablas poll_payments, poll_winners, columna wallet_address
supabase/migrations/004_cancel_refund.sql     — columna refund_tx_hash
supabase/rpc_cerrar_polla.sql                 — función SQL fn_cerrar_polla
```

### Edge Functions

Instalar Supabase CLI si no lo tenés:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <tu-project-ref>
```

Desplegar las tres funciones:

```bash
supabase functions deploy pay-inscripcion
supabase functions deploy cerrar-polla
supabase functions deploy cancelar-polla
```

### Secrets de Edge Functions

Las siguientes variables van **solo en Supabase Secrets**, nunca en el frontend:

```bash
supabase secrets set PLATFORM_OPERATOR_PRIVATE_KEY=0x...
supabase secrets set PLATFORM_OPERATOR_ADDRESS=0x...
```

> El operador necesita CELO nativo para pagar gas de las transferencias.
> Faucet Alfajores: https://faucet.celo.org/alfajores

Verificar que los secrets están cargados:

```bash
supabase secrets list
```

---

## Pagos on-chain — Celo

### Tokens soportados

| Moneda | Token | Decimales | Flujo de pago |
|--------|-------|-----------|---------------|
| `USDC-celo` | USDC (Circle) | 6 | EIP-3009 `receiveWithAuthorization` — gasless |
| `USDT-celo` | USDT (Tether) | 6 | EIP-3009 `receiveWithAuthorization` — gasless |
| `cUSD` | Celo Dollar (Mento) | 18 | ERC-20 `approve` + `transferFrom` — requiere CELO para gas |

### Arquitectura de custodia

```
Participante paga → plataforma (wallet del operador)
Admin cierra polla → plataforma transfiere a cada ganador
Admin cancela polla → plataforma reembolsa a cada participante
```

El operador nunca puede mover fondos sin que el admin dispare la acción (cerrar o cancelar). Todo queda registrado en Celoscan con los tx hashes.

### Flujo de inscripción (USDC/USDT)

1. Usuario conecta wallet (MetaMask / Valora / Coinbase)
2. Firma `ReceiveWithAuthorization` off-chain — sin gas
3. Frontend envía la firma a la Edge Function `pay-inscripcion`
4. Edge Function ejecuta `receiveWithAuthorization` on-chain (paga gas el operador)
5. DB registra el pago con `status = 'confirmed'` y el tx hash

### Flujo de inscripción (cUSD)

1. Usuario llama `approve(operatorAddress, amount)` on-chain (requiere CELO para gas)
2. Frontend espera confirmación del approve
3. Llama a `pay-inscripcion` con el hash del approve
4. Edge Function verifica allowance y ejecuta `transferFrom`

---

## Switch a Celo mainnet

1. Cambiar `VITE_CHAIN_ID=42220` en `.env.local`
2. Asegurar que `VITE_PLATFORM_WALLET` es la address mainnet del operador
3. El operador wallet debe tener CELO en mainnet para gas
4. Las Edge Functions ya apuntan a `https://forno.celo.org` (mainnet)

---

## Build de producción

```bash
npm run build
```

El output en `dist/` se puede desplegar en Vercel, Netlify, Cloudflare Pages o Hostinger.

---

## Seguridad

- `PLATFORM_OPERATOR_PRIVATE_KEY` **nunca** en el frontend — solo en Supabase Secrets
- Solo la `anon` key de Supabase va en el frontend
- RLS activo en todas las tablas críticas
- Idempotencia en todas las Edge Functions (evita cobros dobles)
- El monto se valida server-side en cada Edge Function
- Las wallet addresses se validan como hex de 40 chars antes de cualquier tx
- Stack trace nunca expuesto al cliente — solo mensajes de error sanitizados
