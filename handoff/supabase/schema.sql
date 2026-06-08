-- =====================================================================
-- Polla Mundial 2026 · Esquema Supabase (punto de partida del MVP)
-- Aplica esto en el SQL editor de Supabase. Ajusta a tu gusto.
-- =====================================================================

-- ---------- PERFILES (1:1 con auth.users) ----------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text not null,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Crear profile automáticamente al registrarse
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- POLLAS ----------
create table if not exists pollas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  codigo       text unique not null,
  admin_id     uuid not null references profiles(id),
  inscripcion  numeric(10,2) not null default 2.00,
  moneda       text not null default 'cUSD',
  estado       text not null default 'abierta' check (estado in ('abierta','cerrada')),
  reglas       jsonb not null default '{"exacto":5,"resultado":3,"fallo":0}',
  premios      jsonb not null default '[50,30,20]',  -- % para 1°,2°,3°
  created_at   timestamptz default now()
);

-- ---------- FIXTURE GLOBAL (partidos) ----------
-- Resultado oficial a nivel global = una sola fuente de verdad.
create table if not exists partidos (
  id                  uuid primary key default gen_random_uuid(),
  orden               int not null,             -- orden cronológico
  fase                text not null,            -- "Grupo K · Estadio Azteca"
  fecha               text not null,            -- "Mié 17 jun"
  equipo_local        text not null,
  equipo_visitante    text not null,
  flag_local          text,
  flag_visitante      text,
  resultado_local     int,
  resultado_visitante int,
  cerrado             boolean not null default false,
  destacado           boolean not null default false
);

-- ---------- MIEMBROS (membresía + pago) ----------
create table if not exists poll_members (
  poll_id    uuid not null references pollas(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  pagado     boolean not null default false,
  joined_at  timestamptz default now(),
  primary key (poll_id, user_id)
);

-- ---------- PREDICCIONES ----------
create table if not exists predicciones (
  id              uuid primary key default gen_random_uuid(),
  poll_id         uuid not null references pollas(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  partido_id      uuid not null references partidos(id) on delete cascade,
  pred_local      int not null,
  pred_visitante  int not null,
  firmado_at      timestamptz default now(),
  unique (poll_id, user_id, partido_id)
);

-- ---------- GANADORES (se escriben al cerrar) ----------
create table if not exists ganadores (
  poll_id  uuid not null references pollas(id) on delete cascade,
  user_id  uuid not null references profiles(id),
  puesto   int not null,
  monto    numeric(10,2) not null,
  primary key (poll_id, puesto)
);

-- =====================================================================
-- TABLA DE POSICIONES (motor de puntos, server-side)
-- Desempate: puntos → exactos → resultados → joined_at asc
-- =====================================================================
create or replace function fn_tabla_posiciones(p_poll_id uuid)
returns table(user_id uuid, nombre text, puntos int, exactos int, resultados int, posicion bigint)
language sql stable as $$
  with r as (
    select (reglas->>'exacto')::int as e, (reglas->>'resultado')::int as res, (reglas->>'fallo')::int as f
    from pollas where id = p_poll_id
  ),
  base as (
    select pm.user_id,
      coalesce(sum(case
        when pa.resultado_local is null then 0
        when pr.pred_local = pa.resultado_local and pr.pred_visitante = pa.resultado_visitante then (select e from r)
        when sign(pr.pred_local - pr.pred_visitante) = sign(pa.resultado_local - pa.resultado_visitante) then (select res from r)
        else (select f from r)
      end),0) as puntos,
      coalesce(sum(case when pa.resultado_local is not null
        and pr.pred_local = pa.resultado_local and pr.pred_visitante = pa.resultado_visitante
        then 1 else 0 end),0) as exactos,
      coalesce(sum(case when pa.resultado_local is not null
        and not (pr.pred_local = pa.resultado_local and pr.pred_visitante = pa.resultado_visitante)
        and sign(pr.pred_local - pr.pred_visitante) = sign(pa.resultado_local - pa.resultado_visitante)
        then 1 else 0 end),0) as resultados,
      min(pm.joined_at) as joined_at
    from poll_members pm
    left join predicciones pr on pr.poll_id = pm.poll_id and pr.user_id = pm.user_id
    left join partidos pa     on pa.id = pr.partido_id
    where pm.poll_id = p_poll_id and pm.pagado = true
    group by pm.user_id
  )
  select b.user_id, p.nombre, b.puntos, b.exactos, b.resultados,
    row_number() over (order by b.puntos desc, b.exactos desc, b.resultados desc, b.joined_at asc) as posicion
  from base b join profiles p on p.id = b.user_id
  order by posicion;
$$;

-- =====================================================================
-- RLS (Row Level Security) — la parte crítica de la justicia
-- =====================================================================
alter table profiles      enable row level security;
alter table pollas        enable row level security;
alter table partidos      enable row level security;
alter table poll_members  enable row level security;
alter table predicciones  enable row level security;
alter table ganadores     enable row level security;

-- profiles: cualquiera autenticado puede leer nombres (para la tabla); editar solo el propio
create policy "leer perfiles"   on profiles for select to authenticated using (true);
create policy "editar mi perfil" on profiles for update using (id = auth.uid());

-- partidos: lectura para todos los autenticados.
-- (MVP) escritura de resultados: permítela al admin de alguna polla; al escalar, restríngela a service_role.
create policy "leer partidos"   on partidos for select to authenticated using (true);
create policy "editar partidos" on partidos for update to authenticated
  using (exists (select 1 from pollas where admin_id = auth.uid()));

-- pollas: las pueden ver sus miembros (o su admin); crear: cualquiera (queda como admin); editar: solo admin
create policy "ver mis pollas" on pollas for select using (
  admin_id = auth.uid()
  or exists (select 1 from poll_members pm where pm.poll_id = id and pm.user_id = auth.uid())
);
create policy "crear polla"  on pollas for insert with check (admin_id = auth.uid());
create policy "editar polla" on pollas for update using (admin_id = auth.uid());

-- poll_members: ver miembros de mis pollas; unirme yo mismo; el admin gestiona
create policy "ver miembros" on poll_members for select using (
  user_id = auth.uid()
  or exists (select 1 from pollas p where p.id = poll_id and p.admin_id = auth.uid())
  or exists (select 1 from poll_members m2 where m2.poll_id = poll_id and m2.user_id = auth.uid())
);
create policy "unirme" on poll_members for insert with check (user_id = auth.uid());
create policy "admin gestiona miembros" on poll_members for update using (
  exists (select 1 from pollas p where p.id = poll_id and p.admin_id = auth.uid())
);
create policy "admin quita miembros" on poll_members for delete using (
  exists (select 1 from pollas p where p.id = poll_id and p.admin_id = auth.uid())
);

-- predicciones — REGLAS DE JUSTICIA:
-- Ver: las propias siempre; las ajenas SOLO si el partido ya está cerrado.
create policy "ver predicciones" on predicciones for select using (
  user_id = auth.uid()
  or exists (select 1 from partidos pa where pa.id = partido_id and pa.cerrado = true)
);
-- Crear: solo las mías, en una polla donde soy miembro, y solo si el partido NO está cerrado.
create policy "crear prediccion" on predicciones for insert with check (
  user_id = auth.uid()
  and exists (select 1 from poll_members pm where pm.poll_id = predicciones.poll_id and pm.user_id = auth.uid())
  and exists (select 1 from partidos pa where pa.id = partido_id and pa.cerrado = false)
);
-- Editar: solo las mías y solo mientras el partido NO esté cerrado.
create policy "editar prediccion" on predicciones for update
  using (user_id = auth.uid())
  with check (exists (select 1 from partidos pa where pa.id = partido_id and pa.cerrado = false));

-- ganadores: lectura para miembros de la polla; escritura vía service_role / Edge Function al cerrar
create policy "ver ganadores" on ganadores for select using (
  exists (select 1 from poll_members pm where pm.poll_id = poll_id and pm.user_id = auth.uid())
  or exists (select 1 from pollas p where p.id = poll_id and p.admin_id = auth.uid())
);

-- Nota: el reparto al cerrar (insert en ganadores + estado='cerrada') hazlo con una
-- Edge Function que use service_role, o una RPC con security definer validando que quien
-- llama es el admin de la polla.
