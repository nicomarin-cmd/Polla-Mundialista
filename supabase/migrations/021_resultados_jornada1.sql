-- Migración 021: Resultados Jornada 1 — Mundial 2026

-- EE. UU. 4-1 Paraguay (Grupo D · Los Ángeles · 12 jun)
update partidos
set resultado_local = 4, resultado_visitante = 1, cerrado = true
where equipo_local = 'EE. UU.' and equipo_visitante = 'Paraguay';

-- EE. UU. 2-0 Australia
update partidos
set resultado_local = 2, resultado_visitante = 0, cerrado = true
where equipo_local = 'EE. UU.' and equipo_visitante = 'Australia';
