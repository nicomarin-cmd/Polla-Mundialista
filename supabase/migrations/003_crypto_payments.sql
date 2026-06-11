-- =====================================================================
-- Migración 003: Pagos en stablecoins (Celo / USDC / USDT)
-- Ejecutar en Supabase SQL Editor DESPUÉS del schema principal.
-- =====================================================================

-- 1. Wallet address en profiles
alter table profiles
  add column if not exists wallet_address text;

-- 2. Tabla de pagos cripto
create table if not exists poll_payments (
  id               uuid primary key default gen_random_uuid(),
  poll_id          uuid not null references pollas(id) on delete cascade,
  user_id          uuid not null references auth.users(id),
  amount           numeric(18,6) not null,
  token            text not null,                        -- 'USDC' | 'USDT'
  chain            text not null default 'celo',
  chain_id         int  not null default 42220,
  wallet_address   text not null,
  tx_hash          text,                                 -- hash de la tx on-chain
  status           text not null default 'pending',
                   -- pending | confirmed | distributed | refunded | failed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists poll_payments_poll_idx  on poll_payments(poll_id);
create index if not exists poll_payments_user_idx  on poll_payments(user_id);
create index if not exists poll_payments_status_idx on poll_payments(status);

-- RLS
alter table poll_payments enable row level security;

-- Usuario solo ve sus propios pagos
create policy "usuario ve sus pagos"
  on poll_payments for select
  using (auth.uid() = user_id);

-- Admin ve todos los pagos de su polla
create policy "admin ve pagos de su polla"
  on poll_payments for select
  using (
    exists (
      select 1 from pollas
      where pollas.id = poll_payments.poll_id
        and pollas.admin_id = auth.uid()
    )
  );

-- Solo Edge Functions (service_role) pueden insertar/actualizar
create policy "service_role manage payments"
  on poll_payments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Tabla de ganadores
create table if not exists poll_winners (
  id             uuid primary key default gen_random_uuid(),
  poll_id        uuid not null references pollas(id) on delete cascade,
  user_id        uuid not null references auth.users(id),
  position       int  not null check (position in (1, 2, 3)),
  amount_token   numeric(18,6) not null,
  token          text not null,
  wallet_address text not null,
  tx_hash        text,
  status         text not null default 'pending',       -- pending | sent | failed
  created_at     timestamptz not null default now()
);

alter table poll_winners enable row level security;

-- Cualquier miembro de la polla puede ver los ganadores
create policy "miembros ven ganadores"
  on poll_winners for select
  using (
    exists (
      select 1 from poll_members
      where poll_members.poll_id = poll_winners.poll_id
        and poll_members.user_id = auth.uid()
    )
  );

create policy "service_role manage winners"
  on poll_winners for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 4. Trigger: updated_at en poll_payments
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists poll_payments_updated_at on poll_payments;
create trigger poll_payments_updated_at
  before update on poll_payments
  for each row execute function update_updated_at();
