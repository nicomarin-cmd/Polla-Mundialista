-- =====================================================================
-- Migración 005: Resultados por polla (fix aislamiento)
-- Antes: resultados y cerrado vivían en `partidos` (global → un cierre afectaba todas las pollas)
-- Ahora: cada polla tiene sus propios resultados en `poll_resultados`
-- =====================================================================

-- 1. Tabla de resultados por polla
create table if not exists poll_resultados (
  id                  uuid primary key default gen_random_uuid(),
  poll_id             uuid not null references pollas(id) on delete cascade,
  partido_id          uuid not null references partidos(id),
  resultado_local     int,
  resultado_visitante int,
  cerrado             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(poll_id, partido_id)
);

create index if not exists poll_resultados_poll_idx    on poll_resultados(poll_id);
create index if not exists poll_resultados_partido_idx on poll_resultados(partido_id);

-- RLS
alter table poll_resultados enable row level security;

-- Todos los miembros de la polla pueden ver sus resultados
create policy "miembros ven resultados"
  on poll_resultados for select
  using (
    exists (
      select 1 from poll_members
      where poll_members.poll_id = poll_resultados.poll_id
        and poll_members.user_id = auth.uid()
    )
  );

-- El admin de la polla puede gestionar los resultados
create policy "admin gestiona resultados"
  on poll_resultados for all
  using (
    exists (
      select 1 from pollas
      where pollas.id = poll_resultados.poll_id
        and pollas.admin_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from pollas
      where pollas.id = poll_resultados.poll_id
        and pollas.admin_id = auth.uid()
    )
  );

-- Trigger updated_at
create or replace function update_poll_resultados_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists poll_resultados_updated_at on poll_resultados;
create trigger poll_resultados_updated_at
  before update on poll_resultados
  for each row execute function update_poll_resultados_updated_at();

-- 2. Agregar fecha_inicio a partidos (para auto-cierre de apuestas cuando comienza el partido)
alter table partidos add column if not exists fecha_inicio timestamptz;

-- 3. Actualizar RLS de predicciones: bloquear cuando el partido está cerrado EN ESTA POLLA
--    (antes usaba partidos.cerrado que era global)
drop policy if exists "predecir partido abierto"   on predicciones;
drop policy if exists "editar prediccion abierta"  on predicciones;

create policy "predecir partido abierto" on predicciones for insert
  with check (
    -- No está cerrado en esta polla específica
    not exists (
      select 1 from poll_resultados pr
      where pr.poll_id    = predicciones.poll_id
        and pr.partido_id = predicciones.partido_id
        and pr.cerrado    = true
    )
    -- El partido no ha empezado aún (si tiene fecha_inicio configurada)
    and not exists (
      select 1 from partidos p
      where p.id            = predicciones.partido_id
        and p.fecha_inicio  is not null
        and p.fecha_inicio  <= now()
    )
    -- El usuario es miembro pagado de esta polla
    and exists (
      select 1 from poll_members pm
      where pm.poll_id  = predicciones.poll_id
        and pm.user_id  = auth.uid()
        and pm.pagado   = true
    )
  );

create policy "editar prediccion abierta" on predicciones for update
  using (
    user_id = auth.uid()
    and not exists (
      select 1 from poll_resultados pr
      where pr.poll_id    = predicciones.poll_id
        and pr.partido_id = predicciones.partido_id
        and pr.cerrado    = true
    )
    and not exists (
      select 1 from partidos p
      where p.id           = predicciones.partido_id
        and p.fecha_inicio is not null
        and p.fecha_inicio <= now()
    )
  );

-- 4. Actualizar fn_tabla_posiciones para usar poll_resultados en vez de partidos
create or replace function fn_tabla_posiciones(p_poll_id uuid)
returns table(user_id uuid, nombre text, puntos int, exactos int, resultados int, posicion bigint)
language sql stable as $$
  with r as (
    select (reglas->>'exacto')::int  as e,
           (reglas->>'resultado')::int as res,
           (reglas->>'fallo')::int   as f
    from pollas where id = p_poll_id
  ),
  base as (
    select pm.user_id,
      coalesce(sum(case
        when pr_res.resultado_local is null then 0
        when pr.pred_local     = pr_res.resultado_local
         and pr.pred_visitante = pr_res.resultado_visitante then (select e   from r)
        when sign(pr.pred_local - pr.pred_visitante)
           = sign(pr_res.resultado_local - pr_res.resultado_visitante) then (select res from r)
        else (select f from r)
      end), 0) as puntos,
      coalesce(sum(case
        when pr_res.resultado_local is not null
         and pr.pred_local     = pr_res.resultado_local
         and pr.pred_visitante = pr_res.resultado_visitante then 1 else 0
      end), 0) as exactos,
      coalesce(sum(case
        when pr_res.resultado_local is not null
         and not (pr.pred_local = pr_res.resultado_local and pr.pred_visitante = pr_res.resultado_visitante)
         and sign(pr.pred_local - pr.pred_visitante)
           = sign(pr_res.resultado_local - pr_res.resultado_visitante) then 1 else 0
      end), 0) as resultados,
      min(pm.joined_at) as joined_at
    from poll_members pm
    left join predicciones    pr     on pr.poll_id     = pm.poll_id
                                    and pr.user_id     = pm.user_id
    left join poll_resultados pr_res on pr_res.poll_id    = p_poll_id
                                    and pr_res.partido_id = pr.partido_id
    where pm.poll_id = p_poll_id and pm.pagado = true
    group by pm.user_id
  )
  select b.user_id, p.nombre, b.puntos::int, b.exactos::int, b.resultados::int,
    row_number() over (order by b.puntos desc, b.exactos desc, b.resultados desc, b.joined_at asc) as posicion
  from base b join profiles p on p.id = b.user_id
  order by posicion;
$$;
