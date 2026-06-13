// Edge Function: sync-scores
// Corre cada minuto. Hace dos cosas:
//   1. Inserta partidos nuevos de eliminatorias cuando la API los confirma
//   2. Actualiza poll_resultados con scores en vivo / finales para todas las pollas activas

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv, json, corsHeaders } from '../_shared/utils.ts'

const FOOTBALL_API = 'https://api.football-data.org/v4/competitions/WC/matches'

// API (inglés) → BD (español)
const TEAM_MAP: Record<string, string> = {
  'Mexico': 'México', 'South Africa': 'Sudáfrica',
  'Korea Republic': 'Corea del Sur', 'South Korea': 'Corea del Sur',
  'Czechia': 'Chequia', 'Czech Republic': 'Chequia',
  'Canada': 'Canadá',
  'Bosnia and Herzegovina': 'Bosnia', 'Bosnia Herzegovina': 'Bosnia',
  'Bosnia & Herzegovina': 'Bosnia', 'Bosnia-Herzegovina': 'Bosnia', 'BiH': 'Bosnia',
  'Brazil': 'Brasil', 'Morocco': 'Marruecos',
  'United States': 'EE. UU.', 'USA': 'EE. UU.',
  'Paraguay': 'Paraguay', 'Australia': 'Australia',
  'Turkey': 'Turquía', 'Türkiye': 'Turquía',
  'Germany': 'Alemania', 'Curacao': 'Curazao', 'Curaçao': 'Curazao',
  'Spain': 'España', 'Cape Verde': 'Cabo Verde',
  'France': 'Francia', 'Senegal': 'Senegal',
  'Portugal': 'Portugal', 'DR Congo': 'RD Congo', 'Congo DR': 'RD Congo',
  'Democratic Republic of the Congo': 'RD Congo',
  'Uzbekistan': 'Uzbekistán', 'Colombia': 'Colombia',
  'England': 'Inglaterra', 'Croatia': 'Croacia',
  // Resto de equipos que pueden llegar a eliminatorias
  'Argentina': 'Argentina', 'Netherlands': 'Países Bajos', 'Belgium': 'Bélgica',
  'Italy': 'Italia', 'Switzerland': 'Suiza', 'Uruguay': 'Uruguay',
  'Ecuador': 'Ecuador', 'Chile': 'Chile', 'Peru': 'Perú',
  'Venezuela': 'Venezuela', 'Bolivia': 'Bolivia',
  'Japan': 'Japón', 'Saudi Arabia': 'Arabia Saudita', 'Iran': 'Irán',
  'Qatar': 'Catar', 'South Korea': 'Corea del Sur',
  'Nigeria': 'Nigeria', 'Ghana': 'Ghana', 'Cameroon': 'Camerún',
  'Algeria': 'Argelia', 'Egypt': 'Egipto', 'Tunisia': 'Túnez',
  'Ivory Coast': 'Costa de Marfil', "Côte d'Ivoire": 'Costa de Marfil',
  'New Zealand': 'Nueva Zelanda', 'Honduras': 'Honduras',
  'Costa Rica': 'Costa Rica', 'Jamaica': 'Jamaica', 'Panama': 'Panamá',
  'Trinidad and Tobago': 'Trinidad y Tobago', 'Guatemala': 'Guatemala',
  'Wales': 'Gales', 'Scotland': 'Escocia', 'Ukraine': 'Ucrania',
  'Poland': 'Polonia', 'Serbia': 'Serbia', 'Romania': 'Rumania',
  'Hungary': 'Hungría', 'Slovakia': 'Eslovaquia', 'Austria': 'Austria',
  'Denmark': 'Dinamarca', 'Sweden': 'Suecia', 'Norway': 'Noruega',
  'Greece': 'Grecia', 'China PR': 'China', 'China': 'China',
  'Indonesia': 'Indonesia', 'Thailand': 'Tailandia', 'Vietnam': 'Vietnam',
  'Iraq': 'Irak', 'Jordan': 'Jordania', 'Oman': 'Omán', 'Bahrain': 'Baréin',
  'Morocco': 'Marruecos', 'Senegal': 'Senegal',
}

// Emoji de banderas
const FLAG_MAP: Record<string, string> = {
  'México': '🇲🇽', 'Sudáfrica': '🇿🇦', 'Corea del Sur': '🇰🇷', 'Chequia': '🇨🇿',
  'Canadá': '🇨🇦', 'Bosnia': '🇧🇦', 'Brasil': '🇧🇷', 'Marruecos': '🇲🇦',
  'EE. UU.': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turquía': '🇹🇷',
  'Alemania': '🇩🇪', 'Curazao': '🇨🇼', 'España': '🇪🇸', 'Cabo Verde': '🇨🇻',
  'Francia': '🇫🇷', 'Senegal': '🇸🇳', 'Portugal': '🇵🇹', 'RD Congo': '🇨🇩',
  'Uzbekistán': '🇺🇿', 'Colombia': '🇨🇴', 'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croacia': '🇭🇷',
  'Argentina': '🇦🇷', 'Países Bajos': '🇳🇱', 'Bélgica': '🇧🇪', 'Italia': '🇮🇹',
  'Suiza': '🇨🇭', 'Uruguay': '🇺🇾', 'Ecuador': '🇪🇨', 'Chile': '🇨🇱',
  'Perú': '🇵🇪', 'Venezuela': '🇻🇪', 'Bolivia': '🇧🇴', 'Japón': '🇯🇵',
  'Arabia Saudita': '🇸🇦', 'Irán': '🇮🇷', 'Catar': '🇶🇦', 'Nigeria': '🇳🇬',
  'Ghana': '🇬🇭', 'Camerún': '🇨🇲', 'Argelia': '🇩🇿', 'Egipto': '🇪🇬',
  'Túnez': '🇹🇳', 'Costa de Marfil': '🇨🇮', 'Nueva Zelanda': '🇳🇿',
  'Honduras': '🇭🇳', 'Costa Rica': '🇨🇷', 'Jamaica': '🇯🇲', 'Panamá': '🇵🇦',
  'Trinidad y Tobago': '🇹🇹', 'Guatemala': '🇬🇹', 'Gales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Ucrania': '🇺🇦', 'Polonia': '🇵🇱', 'Serbia': '🇷🇸',
  'Rumania': '🇷🇴', 'Hungría': '🇭🇺', 'Eslovaquia': '🇸🇰', 'Austria': '🇦🇹',
  'Dinamarca': '🇩🇰', 'Suecia': '🇸🇪', 'Noruega': '🇳🇴', 'Grecia': '🇬🇷',
  'China': '🇨🇳', 'Indonesia': '🇮🇩', 'Tailandia': '🇹🇭', 'Vietnam': '🇻🇳',
  'Irak': '🇮🇶', 'Jordania': '🇯🇴', 'Omán': '🇴🇲', 'Baréin': '🇧🇭',
}

// Etapas del torneo (API → español)
const STAGE_MAP: Record<string, string> = {
  'GROUP_STAGE':    'Fase de Grupos',
  'LAST_32':        'Ronda de 32',
  'LAST_16':        'Octavos de final',
  'QUARTER_FINALS': 'Cuartos de final',
  'SEMI_FINALS':    'Semifinales',
  'THIRD_PLACE':    'Tercer lugar',
  'FINAL':          'Gran Final',
}

function norm(name: string): string { return TEAM_MAP[name] ?? name }
function flag(spanishName: string): string { return FLAG_MAP[spanishName] ?? '🏳️' }

function formatFecha(utcDate: string): string {
  // Colombia es UTC-5 (sin horario de verano)
  const d = new Date(new Date(utcDate).getTime() - 5 * 60 * 60 * 1000)
  const days  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

// Orden base por etapa (group stage usa orden 1-48; KO empieza en 100+)
const STAGE_ORDER: Record<string, number> = {
  'LAST_32': 100, 'LAST_16': 200, 'QUARTER_FINALS': 300,
  'SEMI_FINALS': 400, 'THIRD_PLACE': 490, 'FINAL': 500,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl    = requireEnv('SUPABASE_URL')
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    // Sanitizar: elimina cualquier carácter fuera del rango ASCII visible
    // (comillas, espacios no-breaking, emojis pegados accidentalmente al copiar el key)
    const footballApiKey = requireEnv('FOOTBALL_DATA_API_KEY').replace(/[^\x20-\x7E]/g, '').trim()
    if (!footballApiKey) return json({ error: 'FOOTBALL_DATA_API_KEY vacío o inválido' }, 500)

    // Sin auth requerida: esta función solo lee de football-data.org y escribe scores.
    // El caller nunca puede inyectar datos — todo viene de la API externa.

    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── 1. Obtener TODOS los partidos del Mundial de la API ──────────────────
    const apiRes = await fetch(FOOTBALL_API, {
      headers: { 'X-Auth-Token': footballApiKey },
    })
    if (!apiRes.ok) {
      const txt = await apiRes.text()
      return json({ error: `API error ${apiRes.status}: ${txt}` }, 502)
    }
    const { matches: apiMatches = [] }: { matches: any[] } = await apiRes.json()

    // ── 2. Partidos en nuestra BD ────────────────────────────────────────────
    const { data: dbPartidos, error: dbErr } = await db
      .from('partidos')
      .select('id, equipo_local, equipo_visitante, api_match_id, orden, fecha_inicio')
    if (dbErr) throw dbErr

    // Índices para búsqueda rápida
    const byApiId   = new Map<number, any>()
    const byTeams   = new Map<string, any>()
    for (const p of dbPartidos ?? []) {
      if (p.api_match_id) byApiId.set(p.api_match_id, p)
      byTeams.set(`${p.equipo_local}|${p.equipo_visitante}`, p)
    }

    // ── 3. Procesar cada partido de la API ───────────────────────────────────
    let inserted = 0
    let synced   = 0
    const now = new Date()

    for (const am of apiMatches) {
      const homeRaw = am.homeTeam?.name ?? ''
      const awayRaw = am.awayTeam?.name ?? ''
      const homeEs  = norm(homeRaw)
      const awayEs  = norm(awayRaw)

      // Ignorar si algún equipo es "TBD" (cruces sin definir)
      if (homeEs === 'TBD' || awayEs === 'TBD' || !homeRaw || !awayRaw) continue
      if (homeRaw.includes('TBD') || awayRaw.includes('TBD')) continue

      // Log para debug: partidos ya iniciados que no se encuentran en la BD
      const kickoffDebug = new Date(am.utcDate)
      if (kickoffDebug <= now) {
        const found = byApiId.has(am.id) || byTeams.has(`${homeEs}|${awayEs}`) || byTeams.has(`${awayEs}|${homeEs}`)
        if (!found) console.log(`NO-MATCH api_id=${am.id} raw="${homeRaw}" vs "${awayRaw}" mapped="${homeEs}" vs "${awayEs}" status=${am.status}`)
      }

      // Buscar partido existente en BD
      let dbPartido = byApiId.get(am.id) ?? byTeams.get(`${homeEs}|${awayEs}`) ?? byTeams.get(`${awayEs}|${homeEs}`)

      if (!dbPartido && am.stage !== 'GROUP_STAGE') {
        // ── Partido de eliminatorias nuevo → insertarlo ──────────────────────
        const stageLabel = STAGE_MAP[am.stage] ?? am.stage
        const orden = (STAGE_ORDER[am.stage] ?? 100) + (am.matchday ?? 0)
        // fecha_fin = kickoff + 150 min (cubre alargue + penaltis en eliminatorias)
        const fechaFin = new Date(new Date(am.utcDate).getTime() + 150 * 60 * 1000).toISOString()
        const { data: newPartido, error: insErr } = await db
          .from('partidos')
          .insert({
            orden,
            fase:             stageLabel,
            fecha:            formatFecha(am.utcDate),
            fecha_inicio:     am.utcDate,
            fecha_fin:        fechaFin,
            equipo_local:     homeEs,
            equipo_visitante: awayEs,
            flag_local:       flag(homeEs),
            flag_visitante:   flag(awayEs),
            destacado:        false,
            api_match_id:     am.id,
          })
          .select('id, equipo_local, equipo_visitante, api_match_id, orden')
          .single()
        if (!insErr && newPartido) {
          dbPartido = newPartido
          byApiId.set(am.id, newPartido)
          inserted++
        }
      }

      // Siempre sincronizar api_match_id y fecha_inicio desde la API (fuente autoritativa).
      // Esto corrige valores precargados en migraciones que puedan estar desajustados.
      if (dbPartido) {
        const updates: Record<string, unknown> = {}
        if (!dbPartido.api_match_id) {
          updates.api_match_id = am.id
          dbPartido.api_match_id = am.id
          byApiId.set(am.id, dbPartido)
        }
        // Actualizar fecha_inicio (y fecha/fecha_fin) si difiere de la API (fuente de verdad UTC)
        const apiDateNorm = new Date(am.utcDate).toISOString()
        const dbDateNorm  = dbPartido.fecha_inicio ? new Date(dbPartido.fecha_inicio).toISOString() : null
        if (dbDateNorm !== apiDateNorm) {
          updates.fecha_inicio = am.utcDate
          updates.fecha        = formatFecha(am.utcDate)   // recalcular display en hora Colombia
          dbPartido.fecha_inicio = am.utcDate
          // Recomputar fecha_fin con el kickoff correcto
          const bufferMin = am.stage === 'GROUP_STAGE' ? 110 : 150
          updates.fecha_fin = new Date(new Date(am.utcDate).getTime() + bufferMin * 60 * 1000).toISOString()
        }
        if (Object.keys(updates).length > 0) {
          await db.from('partidos').update(updates).eq('id', dbPartido.id)
        }
      }

      // Solo actualizamos scores si el partido ya empezó
      if (!dbPartido) continue
      const kickoff = new Date(am.utcDate)
      if (kickoff > now) continue

      const isFinal = ['FINISHED', 'AWARDED'].includes(am.status)

      // Para partidos FINALIZADOS: usar SOLO fullTime para no bloquear con el marcador del 1er tiempo.
      // Si la API aún no tiene fullTime disponible (lag), saltamos este run; el siguiente cron lo corrige.
      // Para partidos EN VIVO: preferir fullTime, fallback a halfTime (muestra progreso parcial).
      let ft: { home: number; away: number } | null = null
      if (isFinal) {
        if (am.score?.fullTime?.home != null && am.score?.fullTime?.away != null) {
          ft = { home: am.score.fullTime.home as number, away: am.score.fullTime.away as number }
        }
      } else {
        if (am.score?.fullTime?.home != null && am.score?.fullTime?.away != null) {
          ft = { home: am.score.fullTime.home as number, away: am.score.fullTime.away as number }
        } else if (am.score?.halfTime?.home != null && am.score?.halfTime?.away != null) {
          ft = { home: am.score.halfTime.home as number, away: am.score.halfTime.away as number }
        }
      }
      if (!ft) continue

      const isHomeLocal  = homeEs === dbPartido.equipo_local
      const golesLocal   = isHomeLocal ? ft.home : ft.away
      const golesVisita  = isHomeLocal ? ft.away : ft.home

      // ── 4. Actualizar poll_resultados para todas las pollas activas ────────
      const { data: pollas } = await db.from('pollas').select('id').eq('estado', 'abierta')
      if (!pollas?.length) continue

      const { data: yaClausulados } = await db
        .from('poll_resultados')
        .select('poll_id')
        .eq('partido_id', dbPartido.id)
        .eq('cerrado', true)

      const closedPollaIds = new Set((yaClausulados ?? []).map((r: any) => r.poll_id))

      // Cuando isFinal=true: siempre actualizar (incluso si ya estaba cerrado) para corregir
      // marcadores que se bloquearon con datos parciales en runs anteriores.
      // Cuando isFinal=false: saltamos registros ya cerrados para no reabrir un partido finalizado.
      // cerrado es monotónico: una vez true, nunca vuelve a false.
      const upserts = pollas
        .filter((p: any) => !closedPollaIds.has(p.id) || isFinal)
        .map((p: any) => ({
          poll_id:             p.id,
          partido_id:          dbPartido.id,
          resultado_local:     golesLocal,
          resultado_visitante: golesVisita,
          cerrado:             isFinal || closedPollaIds.has(p.id),
        }))

      if (upserts.length > 0) {
        await db.from('poll_resultados').upsert(upserts, { onConflict: 'poll_id,partido_id' })
        synced++
      }

      // Cuando el partido finaliza, registrar la hora real de fin en partidos.fecha_fin.
      // Solo actualizamos si fecha_fin está en el futuro (era un estimado, no el real).
      if (isFinal) {
        const nowIso = new Date().toISOString()
        await db.from('partidos')
          .update({ fecha_fin: nowIso })
          .eq('id', dbPartido.id)
          .gt('fecha_fin', nowIso)   // solo si el estimado aún no fue reemplazado
      }
    }

    return json({
      ok: true,
      inserted_matches: inserted,
      synced,
      timestamp: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('sync-scores:', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})
