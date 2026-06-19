-- =====================================================================
-- Migración 013: Tabla ganadores (requerida por fn_cerrar_polla)
-- fn_cerrar_polla escribe aquí; la Edge Function cerrar-polla lee de aquí.
-- =====================================================================

-- 1. Tabla ganadores (resultados fiat — la versión cripto usa poll_winners)
create table if not exists ganadores (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references pollas(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  puesto     int  not null check (puesto in (1, 2, 3)),
  monto      numeric(18,6) not null,
  created_at timestamptz not null default now(),
  unique(poll_id, puesto)
);

create index if not exists ganadores_poll_idx on ganadores(poll_id);

alter table ganadores enable row level security;

-- Miembros de la polla pueden ver los ganadores (solo cuando la polla esté cerrada)
create policy "miembros ven ganadores fiat"
  on ganadores for select
  using (
    exists (
      select 1 from poll_members pm
      join pollas p on p.id = pm.poll_id
      where pm.poll_id = ganadores.poll_id
        and pm.user_id = auth.uid()
        and p.estado   = 'cerrada'
    )
  );

-- Edge Functions (service_role) pueden leer y escribir
create policy "service_role gestiona ganadores"
  on ganadores for all
  using  (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Re-aplicar fn_cerrar_polla (asegura versión correcta en la BD)
create or replace function fn_cerrar_polla(p_poll_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_admin_id  uuid;
  v_premios   jsonb;
  v_inscr     numeric;
  v_bote      numeric;
  v_row       record;
  v_i         int;
  v_pct       numeric;
begin
  select admin_id, premios, inscripcion
  into   v_admin_id, v_premios, v_inscr
  from   pollas
  where  id = p_poll_id;

  if not found then
    raise exception 'Polla no encontrada';
  end if;

  if v_admin_id is distinct from auth.uid() then
    raise exception 'No autorizado: solo el admin puede cerrar la polla';
  end if;

  select count(*) * v_inscr
  into   v_bote
  from   poll_members
  where  poll_id = p_poll_id
    and  pagado  = true;

  -- Limpiar ganadores previos (permite recerrar)
  delete from ganadores where poll_id = p_poll_id;

  v_i := 0;
  for v_row in (
    select * from fn_tabla_posiciones(p_poll_id) limit 3
  ) loop
    v_pct := coalesce((v_premios ->> v_i)::numeric, 0);
    if v_pct > 0 then
      insert into ganadores (poll_id, user_id, puesto, monto)
      values (
        p_poll_id,
        v_row.user_id,
        v_i + 1,
        round(v_bote * v_pct / 100.0, 2)
      );
    end if;
    v_i := v_i + 1;
  end loop;

  update pollas
  set    estado = 'cerrada'
  where  id = p_poll_id;
end;
$$;
