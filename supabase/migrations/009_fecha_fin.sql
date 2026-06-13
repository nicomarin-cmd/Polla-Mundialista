-- =====================================================================
-- Migración 009: Agregar fecha_fin a partidos
-- fecha_fin = hora estimada de finalización del partido (útil para display
-- y como fallback si el cron tarda en marcar cerrado=true).
-- Para fase de grupos: kickoff + 110 min (máx con tiempo descuento).
-- Para eliminatorias: kickoff + 150 min (cubre alargue + penaltis).
-- =====================================================================

alter table partidos add column if not exists fecha_fin timestamptz;

-- Poblar estimaciones para todos los partidos que ya tienen fecha_inicio
update partidos
set fecha_fin = case
  when fase ilike '%grupo%' or fase ilike '%group%'
    then fecha_inicio + interval '110 minutes'
  else
    fecha_inicio + interval '150 minutes'
end
where fecha_inicio is not null and fecha_fin is null;
