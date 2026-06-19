-- Migración 021: Resultados Jornada 1 — Mundial 2026
-- Aplicar en Supabase SQL Editor después de cada partido.

-- EE. UU. 2-0 Paraguay (Grupo D · Los Ángeles · 12 jun)
update partidos
set resultado_local = 2, resultado_visitante = 0, cerrado = true
where equipo_local = 'EE. UU.' and equipo_visitante = 'Paraguay';
