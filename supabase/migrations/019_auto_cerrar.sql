-- Migración 019: fn_cerrar_polla_auto
-- Variante de fn_cerrar_polla sin auth.uid() para cierre automático
-- desde service_role (Edge Function auto-cerrar-pollas).

create or replace function fn_cerrar_polla_auto(p_poll_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_premios jsonb;
  v_inscr   numeric;
  v_bote    numeric;
  v_row     record;
  v_i       int;
  v_pct     numeric;
begin
  -- Solo actúa si la polla está abierta (hace la función idempotente)
  select premios, inscripcion
  into   v_premios, v_inscr
  from   pollas
  where  id = p_poll_id and estado = 'abierta';

  if not found then return; end if;

  select coalesce(count(*), 0) * v_inscr
  into   v_bote
  from   poll_members
  where  poll_id = p_poll_id and pagado = true;

  delete from ganadores where poll_id = p_poll_id;

  v_i := 0;
  for v_row in (
    select * from fn_tabla_posiciones(p_poll_id) limit 3
  ) loop
    v_pct := coalesce((v_premios ->> v_i)::numeric, 0);
    if v_pct > 0 then
      insert into ganadores (poll_id, user_id, puesto, monto)
      values (p_poll_id, v_row.user_id, v_i + 1, round(v_bote * v_pct / 100.0, 2));
    end if;
    v_i := v_i + 1;
  end loop;

  update pollas set estado = 'cerrada' where id = p_poll_id;
end;
$$;

grant execute on function fn_cerrar_polla_auto(uuid) to service_role;
