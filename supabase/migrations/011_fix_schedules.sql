-- =====================================================================
-- Migración 011: Corrección de horarios (versión segura sin índice único)
-- Si la migración 010 falló en CREATE UNIQUE INDEX, este script lo repara.
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- ── 1. Actualizar los 18 partidos existentes (por orden, siempre seguro) ──

update partidos set
  fase='Grupo A · Ciudad de México · Inauguración', fecha='Jue 11 jun',
  fecha_inicio='2026-06-11 19:00:00+00', fecha_fin='2026-06-11 20:50:00+00'
where orden=1;

update partidos set
  fase='Grupo A · Guadalajara', fecha='Jue 11 jun',
  fecha_inicio='2026-06-12 02:00:00+00', fecha_fin='2026-06-12 03:50:00+00'
where orden=2;

update partidos set
  fase='Grupo B · Toronto', fecha='Vie 12 jun',
  fecha_inicio='2026-06-12 19:00:00+00', fecha_fin='2026-06-12 20:50:00+00'
where orden=3;

update partidos set
  fase='Grupo D · Los Ángeles', fecha='Vie 12 jun',
  fecha_inicio='2026-06-13 01:00:00+00', fecha_fin='2026-06-13 02:50:00+00'
where orden=4;

update partidos set
  fase='Grupo C · Nueva York/Nueva Jersey', fecha='Sáb 13 jun',
  fecha_inicio='2026-06-13 22:00:00+00', fecha_fin='2026-06-13 23:50:00+00'
where orden=5;

update partidos set
  fase='Grupo D · Vancouver', fecha='Sáb 13 jun',
  fecha_inicio='2026-06-14 04:00:00+00', fecha_fin='2026-06-14 05:50:00+00'
where orden=6;

update partidos set
  fase='Grupo E · Houston', fecha='Dom 14 jun',
  fecha_inicio='2026-06-14 17:00:00+00', fecha_fin='2026-06-14 18:50:00+00'
where orden=7;

update partidos set
  fase='Grupo H · Atlanta', fecha='Lun 15 jun',
  fecha_inicio='2026-06-15 16:00:00+00', fecha_fin='2026-06-15 17:50:00+00'
where orden=8;

update partidos set
  fase='Grupo I · Nueva York/Nueva Jersey', fecha='Mar 16 jun',
  fecha_inicio='2026-06-16 19:00:00+00', fecha_fin='2026-06-16 20:50:00+00'
where orden=9;

update partidos set
  fase='Grupo K · Houston', fecha='Mié 17 jun',
  fecha_inicio='2026-06-17 17:00:00+00', fecha_fin='2026-06-17 18:50:00+00'
where orden=10;

update partidos set
  fase='Grupo L · Dallas', fecha='Mié 17 jun',
  fecha_inicio='2026-06-17 20:00:00+00', fecha_fin='2026-06-17 21:50:00+00'
where orden=11;

update partidos set
  fase='Grupo K · Ciudad de México', fecha='Mié 17 jun',
  fecha_inicio='2026-06-18 02:00:00+00', fecha_fin='2026-06-18 03:50:00+00'
where orden=12;

update partidos set
  fase='Grupo A · Guadalajara', fecha='Jue 18 jun',
  fecha_inicio='2026-06-19 01:00:00+00', fecha_fin='2026-06-19 02:50:00+00'
where orden=13;

update partidos set
  fase='Grupo D · Seattle', fecha='Vie 19 jun',
  fecha_inicio='2026-06-19 19:00:00+00', fecha_fin='2026-06-19 20:50:00+00'
where orden=14;

update partidos set
  fase='Grupo K · Guadalajara', fecha='Mar 23 jun',
  fecha_inicio='2026-06-24 02:00:00+00', fecha_fin='2026-06-24 03:50:00+00'
where orden=15;

update partidos set
  fase='Grupo K · Houston', fecha='Mar 23 jun',
  fecha_inicio='2026-06-23 17:00:00+00', fecha_fin='2026-06-23 18:50:00+00'
where orden=16;

update partidos set
  fase='Grupo K · Miami', fecha='Sáb 27 jun',
  fecha_inicio='2026-06-27 23:30:00+00', fecha_fin='2026-06-28 01:20:00+00'
where orden=17;

update partidos set
  fase='Grupo K · Atlanta', fecha='Sáb 27 jun',
  fecha_inicio='2026-06-27 23:30:00+00', fecha_fin='2026-06-28 01:20:00+00'
where orden=18;

-- ── 2. Insertar partidos faltantes (WHERE NOT EXISTS — sin índice único) ──

-- GRUPO A
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 112,'Grupo A · Atlanta','Jue 18 jun','2026-06-18 16:00:00+00','2026-06-18 17:50:00+00','Chequia','Sudáfrica','🇨🇿','🇿🇦',false
where not exists (select 1 from partidos where equipo_local='Chequia' and equipo_visitante='Sudáfrica');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 136,'Grupo A · Ciudad de México','Mié 24 jun','2026-06-25 01:00:00+00','2026-06-25 02:50:00+00','Chequia','México','🇨🇿','🇲🇽',false
where not exists (select 1 from partidos where equipo_local='Chequia' and equipo_visitante='México');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 137,'Grupo A · Monterrey','Mié 24 jun','2026-06-25 01:00:00+00','2026-06-25 02:50:00+00','Sudáfrica','Corea del Sur','🇿🇦','🇰🇷',false
where not exists (select 1 from partidos where equipo_local='Sudáfrica' and equipo_visitante='Corea del Sur');

-- GRUPO B
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 100,'Grupo B · Santa Clara','Sáb 13 jun','2026-06-13 19:00:00+00','2026-06-13 20:50:00+00','Catar','Suiza','🇶🇦','🇨🇭',false
where not exists (select 1 from partidos where equipo_local='Catar' and equipo_visitante='Suiza');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 113,'Grupo B · Los Ángeles','Jue 18 jun','2026-06-18 19:00:00+00','2026-06-18 20:50:00+00','Suiza','Bosnia','🇨🇭','🇧🇦',false
where not exists (select 1 from partidos where equipo_local='Suiza' and equipo_visitante='Bosnia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 114,'Grupo B · Vancouver','Jue 18 jun','2026-06-18 22:00:00+00','2026-06-18 23:50:00+00','Canadá','Catar','🇨🇦','🇶🇦',false
where not exists (select 1 from partidos where equipo_local='Canadá' and equipo_visitante='Catar');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 132,'Grupo B · Vancouver','Mié 24 jun','2026-06-24 19:00:00+00','2026-06-24 20:50:00+00','Suiza','Canadá','🇨🇭','🇨🇦',false
where not exists (select 1 from partidos where equipo_local='Suiza' and equipo_visitante='Canadá');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 133,'Grupo B · Seattle','Mié 24 jun','2026-06-24 19:00:00+00','2026-06-24 20:50:00+00','Bosnia','Catar','🇧🇦','🇶🇦',false
where not exists (select 1 from partidos where equipo_local='Bosnia' and equipo_visitante='Catar');

-- GRUPO C
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 101,'Grupo C · Boston','Sáb 13 jun','2026-06-14 01:00:00+00','2026-06-14 02:50:00+00','Haití','Escocia','🇭🇹','🏴󠁧󠁢󠁳󠁣󠁴󠁿',false
where not exists (select 1 from partidos where equipo_local='Haití' and equipo_visitante='Escocia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 115,'Grupo C · Boston','Vie 19 jun','2026-06-19 22:00:00+00','2026-06-19 23:50:00+00','Escocia','Marruecos','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🇲🇦',false
where not exists (select 1 from partidos where equipo_local='Escocia' and equipo_visitante='Marruecos');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 116,'Grupo C · Filadelfia','Vie 19 jun','2026-06-20 01:00:00+00','2026-06-20 02:50:00+00','Brasil','Haití','🇧🇷','🇭🇹',false
where not exists (select 1 from partidos where equipo_local='Brasil' and equipo_visitante='Haití');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 134,'Grupo C · Miami','Mié 24 jun','2026-06-24 22:00:00+00','2026-06-24 23:50:00+00','Escocia','Brasil','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🇧🇷',false
where not exists (select 1 from partidos where equipo_local='Escocia' and equipo_visitante='Brasil');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 135,'Grupo C · Atlanta','Mié 24 jun','2026-06-24 22:00:00+00','2026-06-24 23:50:00+00','Marruecos','Haití','🇲🇦','🇭🇹',false
where not exists (select 1 from partidos where equipo_local='Marruecos' and equipo_visitante='Haití');

-- GRUPO D
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 117,'Grupo D · San Francisco','Vie 19 jun','2026-06-20 04:00:00+00','2026-06-20 05:50:00+00','Turquía','Paraguay','🇹🇷','🇵🇾',false
where not exists (select 1 from partidos where equipo_local='Turquía' and equipo_visitante='Paraguay');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 142,'Grupo D · Los Ángeles','Jue 25 jun','2026-06-26 02:00:00+00','2026-06-26 03:50:00+00','Turquía','EE. UU.','🇹🇷','🇺🇸',false
where not exists (select 1 from partidos where equipo_local='Turquía' and equipo_visitante='EE. UU.');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 143,'Grupo D · San Francisco','Jue 25 jun','2026-06-26 02:00:00+00','2026-06-26 03:50:00+00','Paraguay','Australia','🇵🇾','🇦🇺',false
where not exists (select 1 from partidos where equipo_local='Paraguay' and equipo_visitante='Australia');

-- GRUPO E
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 103,'Grupo E · Filadelfia','Dom 14 jun','2026-06-14 23:00:00+00','2026-06-15 00:50:00+00','Costa de Marfil','Ecuador','🇨🇮','🇪🇨',false
where not exists (select 1 from partidos where equipo_local='Costa de Marfil' and equipo_visitante='Ecuador');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 119,'Grupo E · Toronto','Sáb 20 jun','2026-06-20 20:00:00+00','2026-06-20 21:50:00+00','Alemania','Costa de Marfil','🇩🇪','🇨🇮',false
where not exists (select 1 from partidos where equipo_local='Alemania' and equipo_visitante='Costa de Marfil');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 120,'Grupo E · Kansas City','Sáb 20 jun','2026-06-21 00:00:00+00','2026-06-21 01:50:00+00','Ecuador','Curazao','🇪🇨','🇨🇼',false
where not exists (select 1 from partidos where equipo_local='Ecuador' and equipo_visitante='Curazao');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 138,'Grupo E · Nueva York/Nueva Jersey','Jue 25 jun','2026-06-25 20:00:00+00','2026-06-25 21:50:00+00','Ecuador','Alemania','🇪🇨','🇩🇪',false
where not exists (select 1 from partidos where equipo_local='Ecuador' and equipo_visitante='Alemania');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 139,'Grupo E · Filadelfia','Jue 25 jun','2026-06-25 20:00:00+00','2026-06-25 21:50:00+00','Curazao','Costa de Marfil','🇨🇼','🇨🇮',false
where not exists (select 1 from partidos where equipo_local='Curazao' and equipo_visitante='Costa de Marfil');

-- GRUPO F
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 102,'Grupo F · Dallas','Dom 14 jun','2026-06-14 20:00:00+00','2026-06-14 21:50:00+00','Países Bajos','Japón','🇳🇱','🇯🇵',false
where not exists (select 1 from partidos where equipo_local='Países Bajos' and equipo_visitante='Japón');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 104,'Grupo F · Monterrey','Dom 14 jun','2026-06-15 02:00:00+00','2026-06-15 03:50:00+00','Suecia','Túnez','🇸🇪','🇹🇳',false
where not exists (select 1 from partidos where equipo_local='Suecia' and equipo_visitante='Túnez');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 118,'Grupo F · Houston','Sáb 20 jun','2026-06-20 17:00:00+00','2026-06-20 18:50:00+00','Países Bajos','Suecia','🇳🇱','🇸🇪',false
where not exists (select 1 from partidos where equipo_local='Países Bajos' and equipo_visitante='Suecia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 121,'Grupo F · por confirmar','Sáb 20 jun','2026-06-21 04:00:00+00','2026-06-21 05:50:00+00','Túnez','Japón','🇹🇳','🇯🇵',false
where not exists (select 1 from partidos where equipo_local='Túnez' and equipo_visitante='Japón');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 140,'Grupo F · Dallas','Jue 25 jun','2026-06-25 23:00:00+00','2026-06-26 00:50:00+00','Japón','Suecia','🇯🇵','🇸🇪',false
where not exists (select 1 from partidos where equipo_local='Japón' and equipo_visitante='Suecia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 141,'Grupo F · Kansas City','Jue 25 jun','2026-06-25 23:00:00+00','2026-06-26 00:50:00+00','Túnez','Países Bajos','🇹🇳','🇳🇱',false
where not exists (select 1 from partidos where equipo_local='Túnez' and equipo_visitante='Países Bajos');

-- GRUPO G
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 105,'Grupo G · Seattle','Lun 15 jun','2026-06-15 19:00:00+00','2026-06-15 20:50:00+00','Bélgica','Egipto','🇧🇪','🇪🇬',false
where not exists (select 1 from partidos where equipo_local='Bélgica' and equipo_visitante='Egipto');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 107,'Grupo G · Los Ángeles','Lun 15 jun','2026-06-16 01:00:00+00','2026-06-16 02:50:00+00','Irán','Nueva Zelanda','🇮🇷','🇳🇿',false
where not exists (select 1 from partidos where equipo_local='Irán' and equipo_visitante='Nueva Zelanda');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 123,'Grupo G · Los Ángeles','Dom 21 jun','2026-06-21 19:00:00+00','2026-06-21 20:50:00+00','Bélgica','Irán','🇧🇪','🇮🇷',false
where not exists (select 1 from partidos where equipo_local='Bélgica' and equipo_visitante='Irán');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 125,'Grupo G · Vancouver','Dom 21 jun','2026-06-22 01:00:00+00','2026-06-22 02:50:00+00','Nueva Zelanda','Egipto','🇳🇿','🇪🇬',false
where not exists (select 1 from partidos where equipo_local='Nueva Zelanda' and equipo_visitante='Egipto');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 148,'Grupo G · Seattle','Vie 26 jun','2026-06-27 03:00:00+00','2026-06-27 04:50:00+00','Egipto','Irán','🇪🇬','🇮🇷',false
where not exists (select 1 from partidos where equipo_local='Egipto' and equipo_visitante='Irán');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 149,'Grupo G · Vancouver','Vie 26 jun','2026-06-27 03:00:00+00','2026-06-27 04:50:00+00','Nueva Zelanda','Bélgica','🇳🇿','🇧🇪',false
where not exists (select 1 from partidos where equipo_local='Nueva Zelanda' and equipo_visitante='Bélgica');

-- GRUPO H
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 106,'Grupo H · Miami','Lun 15 jun','2026-06-15 22:00:00+00','2026-06-15 23:50:00+00','Arabia Saudita','Uruguay','🇸🇦','🇺🇾',false
where not exists (select 1 from partidos where equipo_local='Arabia Saudita' and equipo_visitante='Uruguay');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 122,'Grupo H · Atlanta','Dom 21 jun','2026-06-21 16:00:00+00','2026-06-21 17:50:00+00','España','Arabia Saudita','🇪🇸','🇸🇦',false
where not exists (select 1 from partidos where equipo_local='España' and equipo_visitante='Arabia Saudita');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 124,'Grupo H · Miami','Dom 21 jun','2026-06-21 22:00:00+00','2026-06-21 23:50:00+00','Uruguay','Cabo Verde','🇺🇾','🇨🇻',false
where not exists (select 1 from partidos where equipo_local='Uruguay' and equipo_visitante='Cabo Verde');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 146,'Grupo H · Houston','Vie 26 jun','2026-06-27 00:00:00+00','2026-06-27 01:50:00+00','Cabo Verde','Arabia Saudita','🇨🇻','🇸🇦',false
where not exists (select 1 from partidos where equipo_local='Cabo Verde' and equipo_visitante='Arabia Saudita');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 147,'Grupo H · Guadalajara','Vie 26 jun','2026-06-27 00:00:00+00','2026-06-27 01:50:00+00','Uruguay','España','🇺🇾','🇪🇸',false
where not exists (select 1 from partidos where equipo_local='Uruguay' and equipo_visitante='España');

-- GRUPO I
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 108,'Grupo I · Boston','Mar 16 jun','2026-06-16 22:00:00+00','2026-06-16 23:50:00+00','Ganador IC2','Noruega','🏳️','🇳🇴',false
where not exists (select 1 from partidos where equipo_local='Ganador IC2' and equipo_visitante='Noruega');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 127,'Grupo I · Filadelfia','Lun 22 jun','2026-06-22 21:00:00+00','2026-06-22 22:50:00+00','Francia','Ganador IC2','🇫🇷','🏳️',false
where not exists (select 1 from partidos where equipo_local='Francia' and equipo_visitante='Ganador IC2');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 128,'Grupo I · Nueva York/Nueva Jersey','Lun 22 jun','2026-06-23 00:00:00+00','2026-06-23 01:50:00+00','Noruega','Senegal','🇳🇴','🇸🇳',false
where not exists (select 1 from partidos where equipo_local='Noruega' and equipo_visitante='Senegal');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 144,'Grupo I · Boston','Vie 26 jun','2026-06-26 19:00:00+00','2026-06-26 20:50:00+00','Noruega','Francia','🇳🇴','🇫🇷',false
where not exists (select 1 from partidos where equipo_local='Noruega' and equipo_visitante='Francia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 145,'Grupo I · Toronto','Vie 26 jun','2026-06-26 19:00:00+00','2026-06-26 20:50:00+00','Senegal','Ganador IC2','🇸🇳','🏳️',false
where not exists (select 1 from partidos where equipo_local='Senegal' and equipo_visitante='Ganador IC2');

-- GRUPO J
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 109,'Grupo J · Kansas City','Mar 16 jun','2026-06-17 01:00:00+00','2026-06-17 02:50:00+00','Argentina','Argelia','🇦🇷','🇩🇿',false
where not exists (select 1 from partidos where equipo_local='Argentina' and equipo_visitante='Argelia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 110,'Grupo J · San Francisco','Mar 16 jun','2026-06-17 04:00:00+00','2026-06-17 05:50:00+00','Austria','Jordania','🇦🇹','🇯🇴',false
where not exists (select 1 from partidos where equipo_local='Austria' and equipo_visitante='Jordania');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 126,'Grupo J · Dallas','Lun 22 jun','2026-06-22 17:00:00+00','2026-06-22 18:50:00+00','Argentina','Austria','🇦🇷','🇦🇹',false
where not exists (select 1 from partidos where equipo_local='Argentina' and equipo_visitante='Austria');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 129,'Grupo J · San Francisco','Lun 22 jun','2026-06-23 03:00:00+00','2026-06-23 04:50:00+00','Jordania','Argelia','🇯🇴','🇩🇿',false
where not exists (select 1 from partidos where equipo_local='Jordania' and equipo_visitante='Argelia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 152,'Grupo J · Kansas City','Sáb 27 jun','2026-06-28 02:00:00+00','2026-06-28 03:50:00+00','Argelia','Austria','🇩🇿','🇦🇹',false
where not exists (select 1 from partidos where equipo_local='Argelia' and equipo_visitante='Austria');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 153,'Grupo J · Dallas','Sáb 27 jun','2026-06-28 02:00:00+00','2026-06-28 03:50:00+00','Jordania','Argentina','🇯🇴','🇦🇷',false
where not exists (select 1 from partidos where equipo_local='Jordania' and equipo_visitante='Argentina');

-- GRUPO L
insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 111,'Grupo L · Toronto','Mié 17 jun','2026-06-17 23:00:00+00','2026-06-18 00:50:00+00','Ghana','Panamá','🇬🇭','🇵🇦',false
where not exists (select 1 from partidos where equipo_local='Ghana' and equipo_visitante='Panamá');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 130,'Grupo L · Boston','Mar 23 jun','2026-06-23 20:00:00+00','2026-06-23 21:50:00+00','Inglaterra','Ghana','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇬🇭',false
where not exists (select 1 from partidos where equipo_local='Inglaterra' and equipo_visitante='Ghana');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 131,'Grupo L · Toronto','Mar 23 jun','2026-06-23 23:00:00+00','2026-06-24 00:50:00+00','Panamá','Croacia','🇵🇦','🇭🇷',false
where not exists (select 1 from partidos where equipo_local='Panamá' and equipo_visitante='Croacia');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 150,'Grupo L · Nueva York/Nueva Jersey','Sáb 27 jun','2026-06-27 21:00:00+00','2026-06-27 22:50:00+00','Panamá','Inglaterra','🇵🇦','🏴󠁧󠁢󠁥󠁮󠁧󠁿',false
where not exists (select 1 from partidos where equipo_local='Panamá' and equipo_visitante='Inglaterra');

insert into partidos (orden,fase,fecha,fecha_inicio,fecha_fin,equipo_local,equipo_visitante,flag_local,flag_visitante,destacado)
select 151,'Grupo L · Filadelfia','Sáb 27 jun','2026-06-27 21:00:00+00','2026-06-27 22:50:00+00','Croacia','Ghana','🇭🇷','🇬🇭',false
where not exists (select 1 from partidos where equipo_local='Croacia' and equipo_visitante='Ghana');

-- ── 3. Resultados confirmados ─────────────────────────────────────────
-- IMPORTANTE: Reemplaza los valores (X, Y) con los marcadores correctos
-- para cada partido ya jugado antes de ejecutar esta sección.
-- Formato: update partidos set resultado_local=GOL_LOCAL, resultado_visitante=GOL_VISITANTE, cerrado=true where orden=N;
-- Luego el INSERT en poll_resultados aplica el resultado a todas las pollas.

-- México 2-0 Sudáfrica (orden 1) ✅ confirmado
update partidos set resultado_local=2, resultado_visitante=0, cerrado=true where orden=1;
insert into poll_resultados(poll_id,partido_id,resultado_local,resultado_visitante,cerrado)
select p.id,par.id,2,0,true from pollas p cross join partidos par where par.orden=1
on conflict(poll_id,partido_id) do update set resultado_local=2,resultado_visitante=0,cerrado=true;

-- Corea del Sur 2-1 Chequia (orden 2) ✅ confirmado
update partidos set resultado_local=2, resultado_visitante=1, cerrado=true where orden=2;
insert into poll_resultados(poll_id,partido_id,resultado_local,resultado_visitante,cerrado)
select p.id,par.id,2,1,true from pollas p cross join partidos par where par.orden=2
on conflict(poll_id,partido_id) do update set resultado_local=2,resultado_visitante=1,cerrado=true;

-- ⬇ AGREGAR AQUÍ los demás partidos jugados con sus resultados reales:
-- Canadá vs Bosnia (orden 3): update partidos set resultado_local=X, resultado_visitante=Y, cerrado=true where orden=3;
-- EE.UU. vs Paraguay (orden 4): update partidos set resultado_local=X, resultado_visitante=Y, cerrado=true where orden=4;
-- Y los de Catar vs Suiza (orden 100), Brasil vs Marruecos (orden 5), etc.
