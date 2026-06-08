# Polla Mundial 2026

App para organizar pollas (quinielas) del Mundial 2026 con tabla de puntos justa y reparto del bote a 1–3 ganadores.

## Cómo continuar con Claude Code
1. Pon esta carpeta como un repo (git init) y ábrela con Claude Code.
2. Claude Code leerá `CLAUDE.md` automáticamente. Si no, pídele: *"Lee CLAUDE.md y docs/ESPECIFICACION.md antes de empezar."*
3. Sigue `docs/PLAN_DE_TRABAJO.md` por fases (P0 → P3).

## Mapa de archivos
- `CLAUDE.md` — contexto maestro (stack, reglas, convenciones, definición de hecho).
- `docs/ESPECIFICACION.md` — qué construir y criterios de aceptación.
- `docs/PLAN_DE_TRABAJO.md` — tareas por fases + primer prompt sugerido.
- `supabase/schema.sql` — tablas, RLS (incluye el bloqueo de pronósticos) y la función de tabla.
- `prototipo/polla-mundial-app.html` — referencia de diseño y lógica (no es el código final).

## Variables de entorno
Crea `.env.local` (NO lo subas a git):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Hosting (resumen)
- Backend: **Supabase** (gestionado). No necesitas AWS.
- Frontend: estático en **Vercel / Netlify / Cloudflare Pages / Hostinger**.
- Pre-lanzamiento: usa un **staging privado** (preview deploy con contraseña) antes de hacerlo público.
