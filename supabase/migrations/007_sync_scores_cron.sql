-- =====================================================================
-- Migración 007: Cron job para auto-sync de scores desde football-data.org
-- Requiere: extensiones pg_cron y pg_net (habilitadas en Supabase por defecto)
-- =====================================================================

-- Habilitar extensiones si no están activas
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cron: cada 3 minutos, llama a la Edge Function sync-scores
select cron.schedule(
  'sync-world-cup-scores',
  '*/3 * * * *',
  $$
  select net.http_post(
    url     := 'https://dmfxqafwihuhfrlmmmqf.supabase.co/functions/v1/sync-scores',
    headers := '{"Content-Type":"application/json","X-Sync-Secret":"lcVdvbHuMCrx61tESkQK5ganwWm4fsP0"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

-- Para ver los jobs activos:   select * from cron.job;
-- Para ver el log de runs:     select * from cron.job_run_details order by start_time desc limit 20;
-- Para desactivar el cron:     select cron.unschedule('sync-world-cup-scores');
