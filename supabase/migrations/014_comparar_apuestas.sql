create or replace function fn_comparar_apuestas(p_poll_id uuid, p_partido_id uuid)
returns table (
  user_id uuid,
  nombre text,
  pred_local int,
  pred_visitante int
)
language sql security definer as
'
  select
    pm.user_id,
    prf.nombre,
    pred.pred_local::int,
    pred.pred_visitante::int
  from poll_members pm
  join profiles prf on prf.id = pm.user_id
  left join predicciones pred
    on pred.user_id = pm.user_id
    and pred.poll_id = p_poll_id
    and pred.partido_id = p_partido_id
  where pm.poll_id = p_poll_id
    and exists (
      select 1 from poll_members chk
      where chk.poll_id = p_poll_id
        and chk.user_id = auth.uid()
    )
  order by prf.nombre;
';
