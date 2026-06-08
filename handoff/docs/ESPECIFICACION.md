# Especificación · Polla Mundial 2026 (MVP)

## 1. Roles
- **Administrador de polla**: la persona que crea la polla. Configura reglas y premios, gestiona miembros (marcar pagado / quitar), abre y cierra la polla, y (en el MVP) registra los resultados oficiales de los partidos de su polla.
- **Participante**: se une con un código, paga su inscripción (marca manual del admin en el MVP), pronostica marcadores y compite en la tabla.
- Una misma persona puede ser admin de una polla y participante en otra.

> Nota de diseño: los resultados pueden manejarse de dos formas. (A) **Por polla**: el admin de cada polla registra los resultados (igual que el prototipo, simple para grupos de amigos). (B) **Globales**: una sola fuente de verdad para el fixture real, ideal para escalar. El `schema.sql` soporta resultados a nivel de `partidos` (global). Para el MVP puedes permitir que el admin edite resultados; cuando escales, restringe la escritura de resultados a un rol de plataforma o a una automatización (API deportiva / n8n).

## 2. Pantallas (portar del prototipo)
**Vista Jugador**
- Hero: bote, mi puesto, mis puntos, mensaje de estado.
- Reparto de premios (1°/2°/3°).
- Tab "Por jugar": tarjetas de partido con steppers para el marcador + botón firmar/guardar. Partidos de Colombia destacados con ⭐.
- Tab "Resultados": partidos con resultado oficial y puntos ganados.
- Tab "Tabla": ranking con exactos/resultados y nota de desempate.
- Bloque "Fases eliminatorias · por confirmar" con fechas reales.

**Vista Admin**
- Tarjeta de estado (bote, pagados, partidos con resultado).
- Tab "Partidos": registrar resultado oficial (cierra el partido y reparte puntos).
- Tab "Reglas": puntos por acierto, inscripción, reparto de premios (valida que sume 100%).
- Tab "Gente": miembros, marcar pagado, añadir/quitar.
- Tab "Cierre": vista previa del podio + botón "cerrar y repartir"; tras cerrar, muestra ganadores.

## 3. Motor de puntos (server-side)
Por cada partido con resultado oficial:
- Marcador exacto → `reglas.exacto` (default 5)
- Resultado acertado (mismo ganador o empate) → `reglas.resultado` (default 3)
- Fallo o sin pronóstico → `reglas.fallo` (default 0)

El cálculo NO se hace en el cliente. Usa la función `fn_tabla_posiciones(poll_id)` de `schema.sql` (o una Edge Function equivalente).

## 4. Justicia (requisitos duros)
- **Bloqueo temporal**: un pronóstico solo es editable mientras `partidos.cerrado = false`. Forzado por **RLS**, no solo en la UI.
- **Privacidad de pronósticos**: las predicciones ajenas solo son visibles cuando el partido está cerrado (RLS).
- **Mismas reglas para todos** dentro de una polla.
- **Solo pagados compiten** por el bote.
- **Desempate determinista**: puntos → exactos → resultados → `joined_at` ascendente.

## 5. Ganadores y reparto
Al cerrar la polla:
1. Calcular tabla final con `fn_tabla_posiciones`.
2. Tomar los primeros N puestos según cuántos `premios` sean > 0.
3. `monto = bote * premios[i] / 100`, donde `bote = (# miembros pagados) * inscripcion`.
4. Escribir filas en `ganadores` (puesto, user_id, monto) y poner `pollas.estado = 'cerrada'`.

## 6. Fuera de alcance del MVP (fase 2+)
- Pagos reales / capa onchain en Celo (en el MVP "pagado" es una marca del admin).
- Ingesta automática de resultados desde una API deportiva.
- Bonus (acertar campeón, goleador), pronósticos de fases eliminatorias.
- Notificaciones push, app móvil nativa.

## 7. Criterios de aceptación
- [ ] Registro/login con email (Supabase Auth).
- [ ] Crear polla → se genera código único y el creador queda como admin.
- [ ] Unirse con código → aparece como miembro (pendiente de pago).
- [ ] Pronosticar y guardar; intentar editar un partido cerrado **falla en el backend** (no solo en UI).
- [ ] No puedo ver pronósticos ajenos de un partido abierto (verificar vía API, no solo UI).
- [ ] Registrar resultado → tabla se actualiza (idealmente en realtime).
- [ ] Empates resueltos en el orden correcto.
- [ ] Cerrar polla → se muestran 1/2/3 ganadores con montos correctos.
- [ ] Desplegado en una URL (staging privado).
