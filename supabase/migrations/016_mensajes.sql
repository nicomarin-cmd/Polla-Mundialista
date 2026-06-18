-- Mensajes por polla: tablón de comunicación entre miembros y el admin

create table if not exists poll_mensajes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references pollas(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  mensaje    text not null check (char_length(mensaje) between 1 and 500),
  created_at timestamptz default now()
);

create index if not exists idx_poll_mensajes_poll on poll_mensajes(poll_id, created_at);

alter table poll_mensajes enable row level security;

-- Leer: cualquier miembro de la polla
create policy "leer mensajes" on poll_mensajes for select
  using (
    exists (
      select 1 from poll_members pm
      where pm.poll_id = poll_mensajes.poll_id
        and pm.user_id = auth.uid()
    )
  );

-- Escribir: cualquier miembro de la polla
create policy "escribir mensaje" on poll_mensajes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from poll_members pm
      where pm.poll_id = poll_mensajes.poll_id
        and pm.user_id = auth.uid()
    )
  );

-- Borrar: solo el propio mensaje o el admin de la polla
create policy "borrar mensaje" on poll_mensajes for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from pollas p
      where p.id = poll_mensajes.poll_id
        and p.admin_id = auth.uid()
    )
  );

-- Habilitar Realtime para la tabla
alter publication supabase_realtime add table poll_mensajes;
