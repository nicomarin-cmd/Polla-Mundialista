-- =====================================================================
-- fn_cerrar_polla — RPC con security definer para cerrar la polla
-- Solo el admin de la polla puede llamar esta función.
-- Calcula el bote, inserta los ganadores y marca la polla como cerrada.
-- Aplica esto en el SQL Editor de Supabase.
-- =====================================================================

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
  -- Verificar que la polla existe y obtener datos
  select admin_id, premios, inscripcion
  into   v_admin_id, v_premios, v_inscr
  from   pollas
  where  id = p_poll_id;

  if not found then
    raise exception 'Polla no encontrada';
  end if;

  -- Solo el admin puede cerrar
  if v_admin_id is distinct from auth.uid() then
    raise exception 'No autorizado: solo el admin puede cerrar la polla';
  end if;

  -- Calcular bote = inscripcion × miembros pagados
  select count(*) * v_inscr
  into   v_bote
  from   poll_members
  where  poll_id = p_poll_id
    and  pagado  = true;

  -- Limpiar ganadores previos (permite recerrar)
  delete from ganadores where poll_id = p_poll_id;

  -- Insertar top 3 según la tabla de posiciones
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

  -- Marcar la polla como cerrada
  update pollas
  set    estado = 'cerrada'
  where  id = p_poll_id;
end;
$$;
