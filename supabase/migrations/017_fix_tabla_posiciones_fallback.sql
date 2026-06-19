-- Migración 017: fn_tabla_posiciones con fallback a partidos
-- PROBLEMA: la función usaba solo poll_resultados. Si una polla fue creada después
-- de que el partido terminó (o el cron falló), poll_resultados no tiene filas para
-- ese partido → todos quedan con 0 pts aunque el resultado exista en partidos.
-- SOLUCIÓN: JOIN adicional a partidos; si poll_resultados no tiene el resultado,
-- usar partidos.resultado_local/visitante cuando partidos.cerrado = true.

create or replace function fn_tabla_posiciones(p_poll_id uuid)
returns table(user_id uuid, nombre text, puntos int, exactos int, resultados int, posicion bigint)
language sql stable as $$
  with r as (
    select (reglas->>'exacto')::int    as e,
           (reglas->>'resultado')::int as res,
           (reglas->>'fallo')::int     as f
    from pollas where id = p_poll_id
  ),
  base as (
    select pm.user_id,
      -- Resultado efectivo: poll_resultados tiene prioridad; si no, usar partidos (solo cuando cerrado=true)
      coalesce(sum(case
        when coalesce(
               pr_res.resultado_local,
               case when pt.cerrado then pt.resultado_local else null end
             ) is null then 0
        when pr.pred_local     = coalesce(pr_res.resultado_local, pt.resultado_local)
         and pr.pred_visitante = coalesce(pr_res.resultado_visitante, pt.resultado_visitante)
          then (select e from r)
        when sign(pr.pred_local - pr.pred_visitante)
           = sign(
               coalesce(pr_res.resultado_local, pt.resultado_local)
             - coalesce(pr_res.resultado_visitante, pt.resultado_visitante)
             )
          then (select res from r)
        else (select f from r)
      end), 0) as puntos,
      coalesce(sum(case
        when coalesce(pr_res.resultado_local, case when pt.cerrado then pt.resultado_local else null end) is not null
         and pr.pred_local     = coalesce(pr_res.resultado_local, pt.resultado_local)
         and pr.pred_visitante = coalesce(pr_res.resultado_visitante, pt.resultado_visitante) then 1 else 0
      end), 0) as exactos,
      coalesce(sum(case
        when coalesce(pr_res.resultado_local, case when pt.cerrado then pt.resultado_local else null end) is not null
         and not (
               pr.pred_local     = coalesce(pr_res.resultado_local, pt.resultado_local)
           and pr.pred_visitante = coalesce(pr_res.resultado_visitante, pt.resultado_visitante)
             )
         and sign(pr.pred_local - pr.pred_visitante)
           = sign(
               coalesce(pr_res.resultado_local, pt.resultado_local)
             - coalesce(pr_res.resultado_visitante, pt.resultado_visitante)
             ) then 1 else 0
      end), 0) as resultados,
      min(pm.joined_at) as joined_at
    from poll_members pm
    left join predicciones    pr     on pr.poll_id     = pm.poll_id
                                    and pr.user_id     = pm.user_id
    left join poll_resultados pr_res on pr_res.poll_id    = p_poll_id
                                    and pr_res.partido_id = pr.partido_id
    left join partidos        pt     on pt.id             = pr.partido_id
    where pm.poll_id = p_poll_id and pm.pagado = true
    group by pm.user_id
  )
  select b.user_id, p.nombre, b.puntos::int, b.exactos::int, b.resultados::int,
    row_number() over (
      order by b.puntos desc, b.exactos desc, b.resultados desc, b.joined_at asc
    ) as posicion
  from base b
  join profiles p on p.id = b.user_id
  order by posicion;
$$;
