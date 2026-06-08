# CLAUDE.md — Polla Mundial 2026

> Este archivo es el contexto maestro del proyecto. Claude Code lo lee automáticamente.
> Léelo completo antes de escribir código. Cuando termines una tarea, marca el ítem en `docs/PLAN_DE_TRABAJO.md`.

## Qué es
App web para organizar **pollas (quinielas) del Mundial 2026**: cada grupo de amigos tiene un **administrador**, los participantes pronostican los marcadores, un **motor de puntos justo** calcula la tabla y, al cerrar, se reparte el bote a **1, 2 o 3 ganadores**.

## Estado actual
- ✅ **Prototipo de UI funcional terminado** en `prototipo/polla-mundial-app.html` (HTML/CSS/JS de un solo archivo, estado en memoria). Es la **referencia de diseño y de lógica**: copia de ahí el look (negro + lima eléctrico, tipografía Anton/Archivo, franja superior, "26" de fondo), la estructura de pantallas y el motor de puntos.
- ⏳ **Falta**: convertirlo en app real multiusuario con base de datos, autenticación y persistencia.

## Tu objetivo (MVP)
Portar el prototipo a una app real con:
- Cuentas de usuario (auth).
- Crear/unirse a pollas con código.
- Pronósticos persistentes que se **bloquean** cuando el partido se cierra.
- Motor de puntos y tabla en vivo (server-side, no manipulable por el cliente).
- Rol admin por polla (configurar reglas/premios, gestionar miembros, cerrar y repartir).

El alcance exacto y los criterios de aceptación están en `docs/ESPECIFICACION.md`.
El orden de trabajo está en `docs/PLAN_DE_TRABAJO.md`.

## Stack decidido
- **Frontend**: Vite + React + TypeScript + Tailwind CSS.
- **Backend / DB / Auth / Realtime**: Supabase (Postgres + RLS + Realtime). Esquema en `supabase/schema.sql`.
- **Hosting frontend**: estático (Vercel / Netlify / Cloudflare Pages / Hostinger). No requiere AWS.
- **(Opcional, fase 2)**: capa onchain en Celo para inscripción y reparto del bote. NO es parte del MVP; en el MVP el "bote" y los "pagos" son solo registro (marca de "pagado" por el admin).

## Estructura del repo (objetivo)
```
/
├─ CLAUDE.md                 ← este archivo
├─ README.md                 ← cómo correr el proyecto
├─ docs/
│   ├─ ESPECIFICACION.md     ← PRD: roles, reglas, pantallas, criterios de aceptación
│   └─ PLAN_DE_TRABAJO.md    ← tareas por fases (P0 → P2)
├─ supabase/
│   └─ schema.sql            ← tablas, RLS y función de tabla de posiciones
├─ prototipo/
│   └─ polla-mundial-app.html ← referencia de diseño y lógica (NO es el código final)
└─ src/                      ← app React (la creas tú)
```

## Reglas de dominio (resumen — detalle en ESPECIFICACION.md)
1. **Puntuación** (configurable por polla): marcador exacto = 5, resultado acertado (ganador/empate) = 3, fallo/sin pronóstico = 0.
2. **Justicia** (NO negociable):
   - El cálculo de puntos vive en el servidor (función SQL / Edge Function), nunca en el cliente.
   - Un pronóstico solo se puede crear/editar **mientras el partido no esté cerrado**. Esto se fuerza con RLS, no solo en la UI.
   - Las predicciones ajenas solo son visibles **después** de que el partido se cierra (RLS), para que nadie copie.
   - Solo los miembros **pagados** compiten por el bote.
3. **Desempate** (determinista): más puntos → más marcadores exactos → más resultados acertados → quien se inscribió primero (`joined_at`).
4. **Ganadores**: al cerrar la polla, se ordena la tabla y se reparte el bote según `premios` (ej. 50/30/20). Poner 0% en 2°/3° permite un único ganador.

## Convenciones
- **UI en español** (es-CO). Comentarios de código en español está bien.
- TypeScript estricto. Componentes funcionales + hooks.
- Cliente de Supabase centralizado en `src/lib/supabase.ts`. Nunca expongas la `service_role` key en el frontend (solo `anon`).
- Mantén el sistema de diseño del prototipo: extrae las variables CSS (`--lime:#c8ff3c`, negro, etc.) a `tailwind.config` (theme.extend.colors) y usa las fuentes Anton (display) + Archivo (cuerpo).
- Variables de entorno en `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Nunca las commitees.

## Comandos
```bash
npm install
npm run dev          # desarrollo local
npm run build        # build de producción
npx supabase start   # (si usas Supabase local con Docker)
```

## Definición de "hecho" (MVP)
- Un usuario puede registrarse, crear una polla, compartir el código.
- Otro usuario se une con el código, pronostica, y NO puede editar tras el cierre del partido.
- El admin cierra partidos (o se cargan resultados), la tabla se actualiza sola y refleja el desempate correcto.
- El admin cierra la polla y la app muestra 1/2/3 ganadores con su monto.
- Desplegado en una URL accesible (staging privado primero).
