# Plan de trabajo · Polla Mundial 2026

Trabaja por fases. Marca `[x]` al completar cada ítem. No saltes a P1 hasta cerrar P0.

## P0 — Fundaciones (MVP base)
- [ ] Scaffold: Vite + React + TS + Tailwind. Configurar colores y fuentes del prototipo en `tailwind.config`.
- [ ] Crear proyecto Supabase; aplicar `supabase/schema.sql`; cargar el fixture (los 18+ partidos del prototipo o el fixture completo).
- [ ] `src/lib/supabase.ts` con cliente usando `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- [ ] Auth: registro/login con email + sesión persistente; crear `profiles` al registrarse.
- [ ] Layout base + sistema de diseño portado del prototipo (negro/lima, Anton/Archivo, franja superior, "26").

## P1 — Núcleo de la polla
- [ ] Crear polla (genera código, creador = admin) y "unirse con código".
- [ ] Vista Jugador: tabs Por jugar / Resultados / Tabla, leyendo de Supabase.
- [ ] Guardar pronósticos (insert/update en `predicciones`), respetando el bloqueo por RLS.
- [ ] Tabla de posiciones consumiendo `fn_tabla_posiciones(poll_id)`.
- [ ] Realtime: la tabla se actualiza al registrar resultados.

## P2 — Administración y cierre
- [ ] Vista Admin: Partidos (registrar resultado → cerrar partido), Reglas, Gente (pagado/quitar), Cierre.
- [ ] Cerrar polla → calcular y persistir `ganadores`; pantalla de podio con montos.
- [ ] Pulir estados vacíos, errores y validaciones (premios suman 100, etc.).

## P3 — Despliegue
- [ ] Deploy de staging privado (Vercel/Netlify preview o sitio con contraseña).
- [ ] Probar con 3–5 personas reales un ciclo completo.
- [ ] Deploy de producción cuando esté validado.

## Primer prompt sugerido para arrancar
> "Lee CLAUDE.md, docs/ESPECIFICACION.md y supabase/schema.sql. Empieza por P0: scaffold de Vite+React+TS+Tailwind con el sistema de diseño del prototipo, y deja listo el cliente de Supabase y el login con email. No avances a P1 hasta que el login funcione."
