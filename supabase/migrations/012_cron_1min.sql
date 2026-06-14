-- =====================================================================
-- Migración 012: Cron cada 1 minuto para marcadores casi en tiempo real
-- También limpia el job antiguo de 3 minutos.
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Eliminar el job anterior (cada 3 minutos) si existe
select cron.unschedule('sync-world-cup-scores');

-- Re-crear el cron con intervalo de 1 minuto
select cron.schedule(
  'sync-world-cup-scores',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://dmfxqafwihuhfrlmmmqf.supabase.co/functions/v1/sync-scores',
    headers := '{"Content-Type":"application/json","X-Sync-Secret":"lcVdvbHuMCrx61tESkQK5ganwWm4fsP0"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

-- Verificar que quedó activo:
-- select * from cron.job where jobname = 'sync-world-cup-scores';
-- Ver últimas ejecuciones:
-- select * from cron.job_run_details order by start_time desc limit 10;
