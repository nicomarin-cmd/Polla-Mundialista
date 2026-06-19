-- =====================================================================
-- Migración 008: Realtime + auto-inserción de eliminatorias + cron 1 min
-- =====================================================================

-- 1. Columna api_match_id en partidos (para que el sync no duplique cruces)
alter table partidos add column if not exists api_match_id int;
create unique index if not exists partidos_api_match_id_idx
  on partidos(api_match_id) where api_match_id is not null;

-- 2. Habilitar Realtime para que la app se actualice al instante
--    cuando el cron escribe un nuevo resultado
alter publication supabase_realtime add table poll_resultados;
alter publication supabase_realtime add table partidos;

-- 3. Actualizar cron: de cada 3 min → cada 1 min
--    (con Realtime, 1 min es suficiente: el cron escribe → UI reacciona al segundo)
select cron.unschedule('sync-world-cup-scores');

select cron.schedule(
  'sync-world-cup-scores',
  '* * * * *',
  $$
  select net.http_post(
    url     := '<TU_SUPABASE_URL>/functions/v1/sync-scores',
    headers := '{"Content-Type":"application/json","X-Sync-Secret":"<TU_SYNC_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
