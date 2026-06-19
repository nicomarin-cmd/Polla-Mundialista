-- Migración 020: fn_eliminar_polla
-- Borra permanentemente una polla sin actividad (sin pagos confirmados).
-- Solo el admin puede llamarla. Cascadea a poll_members, predicciones,
-- poll_payments, poll_resultados, ganadores, poll_winners, poll_mensajes.

create or replace function fn_eliminar_polla(p_poll_id uuid)
returns void
language plpgsql security definer as $$
begin
  -- Verificar que existe y que quien llama es el admin
  if not exists (
    select 1 from pollas
    where id = p_poll_id and admin_id = auth.uid()
  ) then
    raise exception 'No autorizado: solo el admin puede eliminar esta polla';
  end if;

  -- Bloquear si ya hay pagos confirmados (usar Cancelar polla en ese caso)
  if exists (
    select 1 from poll_payments
    where poll_id = p_poll_id and status = 'confirmed'
  ) then
    raise exception 'Hay pagos confirmados. Usa Cancelar polla para hacer reembolsos.';
  end if;

  -- Borrar — CASCADE elimina todo lo dependiente
  delete from pollas where id = p_poll_id;
end;
$$;

grant execute on function fn_eliminar_polla(uuid) to authenticated;
