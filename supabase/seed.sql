-- =====================================================================
-- Polla Mundial 2026 · Seed de los 18 partidos del Grupo + Grupo K
-- Corre esto en el SQL Editor de Supabase DESPUÉS del schema.
-- =====================================================================

insert into partidos (orden, fase, fecha, equipo_local, equipo_visitante, flag_local, flag_visitante, destacado)
values
  (1,  'Grupo A · CDMX · Inauguración',         'Jue 11 jun', 'México',        'Sudáfrica',    '🇲🇽', '🇿🇦', false),
  (2,  'Grupo A · Guadalajara',                  'Jue 11 jun', 'Corea del Sur', 'Chequia',      '🇰🇷', '🇨🇿', false),
  (3,  'Grupo B · Toronto',                      'Vie 12 jun', 'Canadá',        'Bosnia',       '🇨🇦', '🇧🇦', false),
  (4,  'Grupo D · Los Ángeles',                  'Vie 12 jun', 'EE. UU.',       'Paraguay',     '🇺🇸', '🇵🇾', false),
  (5,  'Grupo C · Nueva Jersey',                 'Sáb 13 jun', 'Brasil',        'Marruecos',    '🇧🇷', '🇲🇦', false),
  (6,  'Grupo D · Vancouver',                    'Sáb 13 jun', 'Australia',     'Turquía',      '🇦🇺', '🇹🇷', false),
  (7,  'Fase de grupos · Curazao debuta',        'Dom 14 jun', 'Alemania',      'Curazao',      '🇩🇪', '🇨🇼', false),
  (8,  'Fase de grupos · Atlanta',               'Lun 15 jun', 'España',        'Cabo Verde',   '🇪🇸', '🇨🇻', false),
  (9,  'Fase de grupos · Nueva Jersey',          'Mar 16 jun', 'Francia',       'Senegal',      '🇫🇷', '🇸🇳', false),
  (10, 'Grupo K · Houston',                      'Mié 17 jun', 'Portugal',      'RD Congo',     '🇵🇹', '🇨🇩', false),
  (11, 'Grupo L · Dallas',                       'Mié 17 jun', 'Inglaterra',    'Croacia',      '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇭🇷', false),
  (12, 'Grupo K · Estadio Azteca',               'Mié 17 jun', 'Uzbekistán',    'Colombia',     '🇺🇿', '🇨🇴', true),
  (13, 'Grupo A · Guadalajara',                  'Jue 18 jun', 'México',        'Corea del Sur','🇲🇽', '🇰🇷', false),
  (14, 'Grupo D · Seattle',                      'Vie 19 jun', 'EE. UU.',       'Australia',    '🇺🇸', '🇦🇺', false),
  (15, 'Grupo K · Guadalajara',                  'Mar 23 jun', 'Colombia',      'RD Congo',     '🇨🇴', '🇨🇩', true),
  (16, 'Grupo K · Houston',                      'Mar 23 jun', 'Portugal',      'Uzbekistán',   '🇵🇹', '🇺🇿', false),
  (17, 'Grupo K · Miami',                        'Sáb 27 jun', 'Colombia',      'Portugal',     '🇨🇴', '🇵🇹', true),
  (18, 'Grupo K · Atlanta',                      'Sáb 27 jun', 'RD Congo',      'Uzbekistán',   '🇨🇩', '🇺🇿', false)
on conflict do nothing;
