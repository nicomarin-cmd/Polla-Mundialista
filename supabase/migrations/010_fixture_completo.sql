-- =====================================================================
-- Migración 010: Fixture completo de la fase de grupos (72 partidos)
-- Horarios confirmados por el usuario en hora Colombia (UTC-5)
-- CO + 5h = UTC
-- =====================================================================

-- ── 0. Índice único por par de equipos (evita duplicados) ─────────────
create unique index if not exists partidos_equipos_idx
  on partidos (equipo_local, equipo_visitante);

-- ── 1. Corregir fecha_inicio / fecha / fecha_fin de los 18 partidos existentes ──

update partidos set
  fase         = 'Grupo A · Ciudad de México · Inauguración',
  fecha        = 'Jue 11 jun',
  fecha_inicio = '2026-06-11 19:00:00+00',
  fecha_fin    = '2026-06-11 20:50:00+00'
where orden = 1;  -- México 2-0 Sudáfrica

update partidos set
  fase         = 'Grupo A · Guadalajara',
  fecha        = 'Jue 11 jun',
  fecha_inicio = '2026-06-12 02:00:00+00',
  fecha_fin    = '2026-06-12 03:50:00+00'
where orden = 2;  -- Corea del Sur 2-1 Chequia

update partidos set
  fase         = 'Grupo B · Toronto',
  fecha        = 'Vie 12 jun',
  fecha_inicio = '2026-06-12 19:00:00+00',
  fecha_fin    = '2026-06-12 20:50:00+00'
where orden = 3;  -- Canadá vs Bosnia

update partidos set
  fase         = 'Grupo D · Los Ángeles',
  fecha        = 'Vie 12 jun',
  fecha_inicio = '2026-06-13 01:00:00+00',
  fecha_fin    = '2026-06-13 02:50:00+00'
where orden = 4;  -- EE. UU. vs Paraguay  (20:00 CO = 01:00 UTC día siguiente)

update partidos set
  fase         = 'Grupo C · Nueva York/Nueva Jersey',
  fecha        = 'Sáb 13 jun',
  fecha_inicio = '2026-06-13 22:00:00+00',
  fecha_fin    = '2026-06-13 23:50:00+00'
where orden = 5;  -- Brasil vs Marruecos  (17:00 CO)

update partidos set
  fase         = 'Grupo D · Vancouver',
  fecha        = 'Sáb 13 jun',
  fecha_inicio = '2026-06-14 04:00:00+00',
  fecha_fin    = '2026-06-14 05:50:00+00'
where orden = 6;  -- Australia vs Turquía  (23:00 CO)

update partidos set
  fase         = 'Grupo E · Houston',
  fecha        = 'Dom 14 jun',
  fecha_inicio = '2026-06-14 17:00:00+00',
  fecha_fin    = '2026-06-14 18:50:00+00'
where orden = 7;  -- Alemania vs Curazao  (12:00 CO)

update partidos set
  fase         = 'Grupo H · Atlanta',
  fecha        = 'Lun 15 jun',
  fecha_inicio = '2026-06-15 16:00:00+00',
  fecha_fin    = '2026-06-15 17:50:00+00'
where orden = 8;  -- España vs Cabo Verde  (11:00 CO)

update partidos set
  fase         = 'Grupo I · Nueva York/Nueva Jersey',
  fecha        = 'Mar 16 jun',
  fecha_inicio = '2026-06-16 19:00:00+00',
  fecha_fin    = '2026-06-16 20:50:00+00'
where orden = 9;  -- Francia vs Senegal  (14:00 CO)

update partidos set
  fase         = 'Grupo K · Houston',
  fecha        = 'Mié 17 jun',
  fecha_inicio = '2026-06-17 17:00:00+00',
  fecha_fin    = '2026-06-17 18:50:00+00'
where orden = 10; -- Portugal vs RD Congo  (12:00 CO)

update partidos set
  fase         = 'Grupo L · Dallas',
  fecha        = 'Mié 17 jun',
  fecha_inicio = '2026-06-17 20:00:00+00',
  fecha_fin    = '2026-06-17 21:50:00+00'
where orden = 11; -- Inglaterra vs Croacia  (15:00 CO)

update partidos set
  fase         = 'Grupo K · Ciudad de México',
  fecha        = 'Mié 17 jun',
  fecha_inicio = '2026-06-18 02:00:00+00',
  fecha_fin    = '2026-06-18 03:50:00+00'
where orden = 12; -- Uzbekistán vs Colombia  (21:00 CO → UTC día siguiente)

update partidos set
  fase         = 'Grupo A · Guadalajara',
  fecha        = 'Jue 18 jun',
  fecha_inicio = '2026-06-19 01:00:00+00',
  fecha_fin    = '2026-06-19 02:50:00+00'
where orden = 13; -- México vs Corea del Sur  (20:00 CO → UTC día siguiente)

update partidos set
  fase         = 'Grupo D · Seattle',
  fecha        = 'Vie 19 jun',
  fecha_inicio = '2026-06-19 19:00:00+00',
  fecha_fin    = '2026-06-19 20:50:00+00'
where orden = 14; -- EE. UU. vs Australia  (14:00 CO)

update partidos set
  fase         = 'Grupo K · Guadalajara',
  fecha        = 'Mar 23 jun',
  fecha_inicio = '2026-06-24 02:00:00+00',
  fecha_fin    = '2026-06-24 03:50:00+00'
where orden = 15; -- Colombia vs RD Congo  (21:00 CO → UTC día siguiente)

update partidos set
  fase         = 'Grupo K · Houston',
  fecha        = 'Mar 23 jun',
  fecha_inicio = '2026-06-23 17:00:00+00',
  fecha_fin    = '2026-06-23 18:50:00+00'
where orden = 16; -- Portugal vs Uzbekistán  (12:00 CO)

update partidos set
  fase         = 'Grupo K · Miami',
  fecha        = 'Sáb 27 jun',
  fecha_inicio = '2026-06-27 23:30:00+00',
  fecha_fin    = '2026-06-28 01:20:00+00'
where orden = 17; -- Colombia vs Portugal  (18:30 CO)

update partidos set
  fase         = 'Grupo K · Atlanta',
  fecha        = 'Sáb 27 jun',
  fecha_inicio = '2026-06-27 23:30:00+00',
  fecha_fin    = '2026-06-28 01:20:00+00'
where orden = 18; -- RD Congo vs Uzbekistán  (18:30 CO)

-- ── 2. Insertar los 54 partidos restantes ───────────────────────────────
-- Cada uno usa ON CONFLICT (equipo_local, equipo_visitante) DO UPDATE
-- para actualizar tiempos si ya existiera alguno por error previo.

-- ── GRUPO A (jornadas 2 y 3) ─────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (112, 'Grupo A · Atlanta', 'Jue 18 jun', '2026-06-18 16:00:00+00', '2026-06-18 17:50:00+00', 'Chequia', 'Sudáfrica', '🇨🇿', '🇿🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (136, 'Grupo A · Ciudad de México', 'Mié 24 jun', '2026-06-25 01:00:00+00', '2026-06-25 02:50:00+00', 'Chequia', 'México', '🇨🇿', '🇲🇽', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (137, 'Grupo A · Monterrey', 'Mié 24 jun', '2026-06-25 01:00:00+00', '2026-06-25 02:50:00+00', 'Sudáfrica', 'Corea del Sur', '🇿🇦', '🇰🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO B ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (100, 'Grupo B · Santa Clara', 'Sáb 13 jun', '2026-06-13 19:00:00+00', '2026-06-13 20:50:00+00', 'Catar', 'Suiza', '🇶🇦', '🇨🇭', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (113, 'Grupo B · Los Ángeles', 'Jue 18 jun', '2026-06-18 19:00:00+00', '2026-06-18 20:50:00+00', 'Suiza', 'Bosnia', '🇨🇭', '🇧🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (114, 'Grupo B · Vancouver', 'Jue 18 jun', '2026-06-18 22:00:00+00', '2026-06-18 23:50:00+00', 'Canadá', 'Catar', '🇨🇦', '🇶🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (132, 'Grupo B · Vancouver', 'Mié 24 jun', '2026-06-24 19:00:00+00', '2026-06-24 20:50:00+00', 'Suiza', 'Canadá', '🇨🇭', '🇨🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (133, 'Grupo B · Seattle', 'Mié 24 jun', '2026-06-24 19:00:00+00', '2026-06-24 20:50:00+00', 'Bosnia', 'Catar', '🇧🇦', '🇶🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO C ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (101, 'Grupo C · Boston', 'Sáb 13 jun', '2026-06-14 01:00:00+00', '2026-06-14 02:50:00+00', 'Haití', 'Escocia', '🇭🇹', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (115, 'Grupo C · Boston', 'Vie 19 jun', '2026-06-19 22:00:00+00', '2026-06-19 23:50:00+00', 'Escocia', 'Marruecos', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇲🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (116, 'Grupo C · Filadelfia', 'Vie 19 jun', '2026-06-20 01:00:00+00', '2026-06-20 02:50:00+00', 'Brasil', 'Haití', '🇧🇷', '🇭🇹', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (134, 'Grupo C · Miami', 'Mié 24 jun', '2026-06-24 22:00:00+00', '2026-06-24 23:50:00+00', 'Escocia', 'Brasil', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇧🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (135, 'Grupo C · Atlanta', 'Mié 24 jun', '2026-06-24 22:00:00+00', '2026-06-24 23:50:00+00', 'Marruecos', 'Haití', '🇲🇦', '🇭🇹', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO D (nuevos) ──────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (117, 'Grupo D · San Francisco', 'Vie 19 jun', '2026-06-20 04:00:00+00', '2026-06-20 05:50:00+00', 'Turquía', 'Paraguay', '🇹🇷', '🇵🇾', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (142, 'Grupo D · Los Ángeles', 'Jue 25 jun', '2026-06-26 02:00:00+00', '2026-06-26 03:50:00+00', 'Turquía', 'EE. UU.', '🇹🇷', '🇺🇸', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (143, 'Grupo D · San Francisco', 'Jue 25 jun', '2026-06-26 02:00:00+00', '2026-06-26 03:50:00+00', 'Paraguay', 'Australia', '🇵🇾', '🇦🇺', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO E ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (103, 'Grupo E · Filadelfia', 'Dom 14 jun', '2026-06-14 23:00:00+00', '2026-06-15 00:50:00+00', 'Costa de Marfil', 'Ecuador', '🇨🇮', '🇪🇨', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (119, 'Grupo E · Toronto', 'Sáb 20 jun', '2026-06-20 20:00:00+00', '2026-06-20 21:50:00+00', 'Alemania', 'Costa de Marfil', '🇩🇪', '🇨🇮', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (120, 'Grupo E · Kansas City', 'Sáb 20 jun', '2026-06-21 00:00:00+00', '2026-06-21 01:50:00+00', 'Ecuador', 'Curazao', '🇪🇨', '🇨🇼', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (138, 'Grupo E · Nueva York/Nueva Jersey', 'Jue 25 jun', '2026-06-25 20:00:00+00', '2026-06-25 21:50:00+00', 'Ecuador', 'Alemania', '🇪🇨', '🇩🇪', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (139, 'Grupo E · Filadelfia', 'Jue 25 jun', '2026-06-25 20:00:00+00', '2026-06-25 21:50:00+00', 'Curazao', 'Costa de Marfil', '🇨🇼', '🇨🇮', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO F ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (102, 'Grupo F · Dallas', 'Dom 14 jun', '2026-06-14 20:00:00+00', '2026-06-14 21:50:00+00', 'Países Bajos', 'Japón', '🇳🇱', '🇯🇵', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (104, 'Grupo F · Monterrey', 'Dom 14 jun', '2026-06-15 02:00:00+00', '2026-06-15 03:50:00+00', 'Suecia', 'Túnez', '🇸🇪', '🇹🇳', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (118, 'Grupo F · Houston', 'Sáb 20 jun', '2026-06-20 17:00:00+00', '2026-06-20 18:50:00+00', 'Países Bajos', 'Suecia', '🇳🇱', '🇸🇪', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (121, 'Grupo F · por confirmar', 'Sáb 20 jun', '2026-06-21 04:00:00+00', '2026-06-21 05:50:00+00', 'Túnez', 'Japón', '🇹🇳', '🇯🇵', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (140, 'Grupo F · Dallas', 'Jue 25 jun', '2026-06-25 23:00:00+00', '2026-06-26 00:50:00+00', 'Japón', 'Suecia', '🇯🇵', '🇸🇪', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (141, 'Grupo F · Kansas City', 'Jue 25 jun', '2026-06-25 23:00:00+00', '2026-06-26 00:50:00+00', 'Túnez', 'Países Bajos', '🇹🇳', '🇳🇱', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO G ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (105, 'Grupo G · Seattle', 'Lun 15 jun', '2026-06-15 19:00:00+00', '2026-06-15 20:50:00+00', 'Bélgica', 'Egipto', '🇧🇪', '🇪🇬', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (107, 'Grupo G · Los Ángeles', 'Lun 15 jun', '2026-06-16 01:00:00+00', '2026-06-16 02:50:00+00', 'Irán', 'Nueva Zelanda', '🇮🇷', '🇳🇿', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (123, 'Grupo G · Los Ángeles', 'Dom 21 jun', '2026-06-21 19:00:00+00', '2026-06-21 20:50:00+00', 'Bélgica', 'Irán', '🇧🇪', '🇮🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (125, 'Grupo G · Vancouver', 'Dom 21 jun', '2026-06-22 01:00:00+00', '2026-06-22 02:50:00+00', 'Nueva Zelanda', 'Egipto', '🇳🇿', '🇪🇬', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (148, 'Grupo G · Seattle', 'Vie 26 jun', '2026-06-27 03:00:00+00', '2026-06-27 04:50:00+00', 'Egipto', 'Irán', '🇪🇬', '🇮🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (149, 'Grupo G · Vancouver', 'Vie 26 jun', '2026-06-27 03:00:00+00', '2026-06-27 04:50:00+00', 'Nueva Zelanda', 'Bélgica', '🇳🇿', '🇧🇪', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO H (España vs Cabo Verde ya existe en orden 8) ──────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (106, 'Grupo H · Miami', 'Lun 15 jun', '2026-06-15 22:00:00+00', '2026-06-15 23:50:00+00', 'Arabia Saudita', 'Uruguay', '🇸🇦', '🇺🇾', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (122, 'Grupo H · Atlanta', 'Dom 21 jun', '2026-06-21 16:00:00+00', '2026-06-21 17:50:00+00', 'España', 'Arabia Saudita', '🇪🇸', '🇸🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (124, 'Grupo H · Miami', 'Dom 21 jun', '2026-06-21 22:00:00+00', '2026-06-21 23:50:00+00', 'Uruguay', 'Cabo Verde', '🇺🇾', '🇨🇻', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (146, 'Grupo H · Houston', 'Vie 26 jun', '2026-06-27 00:00:00+00', '2026-06-27 01:50:00+00', 'Cabo Verde', 'Arabia Saudita', '🇨🇻', '🇸🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (147, 'Grupo H · Guadalajara', 'Vie 26 jun', '2026-06-27 00:00:00+00', '2026-06-27 01:50:00+00', 'Uruguay', 'España', '🇺🇾', '🇪🇸', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO I (Francia vs Senegal ya existe en orden 9) ────────────────
-- IC2 = equipo del repechaje intercontinental 2 (pendiente de confirmar)
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (108, 'Grupo I · Boston', 'Mar 16 jun', '2026-06-16 22:00:00+00', '2026-06-16 23:50:00+00', 'Ganador IC2', 'Noruega', '🏳️', '🇳🇴', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (127, 'Grupo I · Filadelfia', 'Lun 22 jun', '2026-06-22 21:00:00+00', '2026-06-22 22:50:00+00', 'Francia', 'Ganador IC2', '🇫🇷', '🏳️', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (128, 'Grupo I · Nueva York/Nueva Jersey', 'Lun 22 jun', '2026-06-23 00:00:00+00', '2026-06-23 01:50:00+00', 'Noruega', 'Senegal', '🇳🇴', '🇸🇳', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (144, 'Grupo I · Boston', 'Vie 26 jun', '2026-06-26 19:00:00+00', '2026-06-26 20:50:00+00', 'Noruega', 'Francia', '🇳🇴', '🇫🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (145, 'Grupo I · Toronto', 'Vie 26 jun', '2026-06-26 19:00:00+00', '2026-06-26 20:50:00+00', 'Senegal', 'Ganador IC2', '🇸🇳', '🏳️', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO J ──────────────────────────────────────────────────────────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (109, 'Grupo J · Kansas City', 'Mar 16 jun', '2026-06-17 01:00:00+00', '2026-06-17 02:50:00+00', 'Argentina', 'Argelia', '🇦🇷', '🇩🇿', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (110, 'Grupo J · San Francisco', 'Mar 16 jun', '2026-06-17 04:00:00+00', '2026-06-17 05:50:00+00', 'Austria', 'Jordania', '🇦🇹', '🇯🇴', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (126, 'Grupo J · Dallas', 'Lun 22 jun', '2026-06-22 17:00:00+00', '2026-06-22 18:50:00+00', 'Argentina', 'Austria', '🇦🇷', '🇦🇹', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (129, 'Grupo J · San Francisco', 'Lun 22 jun', '2026-06-23 03:00:00+00', '2026-06-23 04:50:00+00', 'Jordania', 'Argelia', '🇯🇴', '🇩🇿', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (152, 'Grupo J · Kansas City', 'Sáb 27 jun', '2026-06-28 02:00:00+00', '2026-06-28 03:50:00+00', 'Argelia', 'Austria', '🇩🇿', '🇦🇹', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (153, 'Grupo J · Dallas', 'Sáb 27 jun', '2026-06-28 02:00:00+00', '2026-06-28 03:50:00+00', 'Jordania', 'Argentina', '🇯🇴', '🇦🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── GRUPO L (nuevos, Inglaterra vs Croacia ya existe en orden 11) ─────
insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (111, 'Grupo L · Toronto', 'Mié 17 jun', '2026-06-17 23:00:00+00', '2026-06-18 00:50:00+00', 'Ghana', 'Panamá', '🇬🇭', '🇵🇦', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (130, 'Grupo L · Boston', 'Mar 23 jun', '2026-06-23 20:00:00+00', '2026-06-23 21:50:00+00', 'Inglaterra', 'Ghana', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇬🇭', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (131, 'Grupo L · Toronto', 'Mar 23 jun', '2026-06-23 23:00:00+00', '2026-06-24 00:50:00+00', 'Panamá', 'Croacia', '🇵🇦', '🇭🇷', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (150, 'Grupo L · Nueva York/Nueva Jersey', 'Sáb 27 jun', '2026-06-27 21:00:00+00', '2026-06-27 22:50:00+00', 'Panamá', 'Inglaterra', '🇵🇦', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

insert into partidos (orden, fase, fecha, fecha_inicio, fecha_fin, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values (151, 'Grupo L · Filadelfia', 'Sáb 27 jun', '2026-06-27 21:00:00+00', '2026-06-27 22:50:00+00', 'Croacia', 'Ghana', '🇭🇷', '🇬🇭', false)
on conflict (equipo_local, equipo_visitante) do update set
  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, fecha = excluded.fecha, fase = excluded.fase;

-- ── 3. Resultados de partidos ya jugados ────────────────────────────────
-- México 2-0 Sudáfrica (orden 1) — CONFIRMADO
update partidos set resultado_local = 2, resultado_visitante = 0, cerrado = true where orden = 1;

insert into poll_resultados (poll_id, partido_id, resultado_local, resultado_visitante, cerrado)
select p.id, par.id, 2, 0, true
from pollas p cross join partidos par
where par.orden = 1
on conflict (poll_id, partido_id) do update
  set resultado_local = 2, resultado_visitante = 0, cerrado = true;

-- Corea del Sur 2-1 Chequia (orden 2) — CONFIRMADO
update partidos set resultado_local = 2, resultado_visitante = 1, cerrado = true where orden = 2;

insert into poll_resultados (poll_id, partido_id, resultado_local, resultado_visitante, cerrado)
select p.id, par.id, 2, 1, true
from pollas p cross join partidos par
where par.orden = 2
on conflict (poll_id, partido_id) do update
  set resultado_local = 2, resultado_visitante = 1, cerrado = true;
