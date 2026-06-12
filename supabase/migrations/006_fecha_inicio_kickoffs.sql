-- =====================================================================
-- Migración 006: Poblar fecha_inicio en los partidos conocidos
-- Esto activa el auto-cierre de apuestas cuando arranca cada partido.
-- Horarios en UTC (convertir: CDT = UTC-5, EDT = UTC-4)
-- =====================================================================

-- Jue 11 jun — Grupo A / México (ya jugados)
update partidos set fecha_inicio = '2026-06-11 23:00:00+00' where orden = 1;  -- México vs Sudáfrica · 6 PM CDT
update partidos set fecha_inicio = '2026-06-11 20:00:00+00' where orden = 2;  -- Corea vs Chequia    · 3 PM CDT

-- Vie 12 jun — Grupo B/D
update partidos set fecha_inicio = '2026-06-12 20:00:00+00' where orden = 3;  -- Canadá vs Bosnia
update partidos set fecha_inicio = '2026-06-12 23:00:00+00' where orden = 4;  -- EE.UU. vs Paraguay

-- Sáb 13 jun — Grupo C/D
update partidos set fecha_inicio = '2026-06-13 17:00:00+00' where orden = 5;  -- Brasil vs Marruecos
update partidos set fecha_inicio = '2026-06-13 23:00:00+00' where orden = 6;  -- Australia vs Turquía

-- Dom 14 jun
update partidos set fecha_inicio = '2026-06-14 20:00:00+00' where orden = 7;  -- Alemania vs Curazao

-- Lun 15 jun
update partidos set fecha_inicio = '2026-06-15 20:00:00+00' where orden = 8;  -- España vs Cabo Verde

-- Mar 16 jun
update partidos set fecha_inicio = '2026-06-16 20:00:00+00' where orden = 9;  -- Francia vs Senegal

-- Mié 17 jun — Grupo K/L
update partidos set fecha_inicio = '2026-06-17 17:00:00+00' where orden = 10; -- Portugal vs RD Congo
update partidos set fecha_inicio = '2026-06-17 20:00:00+00' where orden = 11; -- Inglaterra vs Croacia
update partidos set fecha_inicio = '2026-06-17 23:00:00+00' where orden = 12; -- Uzbekistán vs Colombia

-- Jue 18 jun
update partidos set fecha_inicio = '2026-06-18 20:00:00+00' where orden = 13; -- México vs Corea del Sur

-- Vie 19 jun
update partidos set fecha_inicio = '2026-06-19 20:00:00+00' where orden = 14; -- EE.UU. vs Australia

-- Mar 23 jun — Jornada 3 Grupo K
update partidos set fecha_inicio = '2026-06-23 17:00:00+00' where orden = 15; -- Colombia vs RD Congo
update partidos set fecha_inicio = '2026-06-23 17:00:00+00' where orden = 16; -- Portugal vs Uzbekistán

-- Sáb 27 jun — Jornada 3 final Grupo K
update partidos set fecha_inicio = '2026-06-27 20:00:00+00' where orden = 17; -- Colombia vs Portugal
update partidos set fecha_inicio = '2026-06-27 20:00:00+00' where orden = 18; -- RD Congo vs Uzbekistán

-- También actualizar la política RLS de predicciones para que no-pagados puedan apostarse igual
-- (algunos admins no se marcan como pagados pero quieren apostar)
-- Esta política ya la cubrió migration 005; no se cambia aquí.

-- =====================================================================
-- RESULTADO OFICIAL: México 0 - 0 Sudáfrica  (partido orden 1, ya jugado)
-- El admin aún debe registrarlo vía la UI en su polla, pero si quieres
-- pre-cargarlo para testing, descomenta y ajusta el poll_id correcto:
-- =====================================================================
-- INSERT INTO poll_resultados (poll_id, partido_id, resultado_local, resultado_visitante, cerrado)
-- SELECT '<TU_POLL_ID>', p.id, 0, 0, true
-- FROM partidos p WHERE p.orden = 1
-- ON CONFLICT (poll_id, partido_id) DO UPDATE
--   SET resultado_local=0, resultado_visitante=0, cerrado=true;
