-- Migración 021: Resultados Jornada 1 — Mundial 2026

-- EE. UU. 4-1 Paraguay (Grupo D · Los Ángeles · 12 jun)
update partidos set resultado_local = 4, resultado_visitante = 1, cerrado = true
where equipo_local = 'EE. UU.' and equipo_visitante = 'Paraguay';

-- EE. UU. 2-0 Australia (19 jun)
do $$ begin
  if exists (select 1 from partidos where equipo_local = 'EE. UU.' and equipo_visitante = 'Australia') then
    update partidos set resultado_local = 2, resultado_visitante = 0, cerrado = true
    where equipo_local = 'EE. UU.' and equipo_visitante = 'Australia';
  else
    insert into partidos (fase, fecha, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado, resultado_local, resultado_visitante, cerrado)
    values ('Grupo D', 'Jue 19 jun', 'EE. UU.', 'Australia', '🇺🇸', '🇦🇺', false, 2, 0, true);
  end if;
end $$;
