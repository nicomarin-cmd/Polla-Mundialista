// Edge Function: sync-scores
// Corre cada 5 minutos. Solo llama football-data.org cuando hay un partido en curso
// o recién terminado (últimos 15 min). Fuera de esas ventanas no gasta llamadas.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv, json, corsHeaders } from '../_shared/utils.ts'

const FOOTBALL_API = 'https://api.football-data.org/v4/competitions/WC/matches'

// Nombres en inglés (API-Football) → español en la BD
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
  'Argentina': 'Argentina', 'Netherlands': 'Países Bajos', 'Belgium': 'Bélgica',
  'Italy': 'Italia', 'Switzerland': 'Suiza', 'Uruguay': 'Uruguay',
  'Ecuador': 'Ecuador', 'Chile': 'Chile', 'Peru': 'Perú',
  'Venezuela': 'Venezuela', 'Bolivia': 'Bolivia',
  'Japan': 'Japón', 'Saudi Arabia': 'Arabia Saudita', 'Iran': 'Irán',
  'Qatar': 'Catar',
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
  'Haiti': 'Haití',
  // API-Football puede usar nombres ligeramente distintos
  'IR Iran': 'Irán', 'Korea DPR': 'Corea del Norte',
  'United Arab Emirates': 'Emiratos Árabes',
  'Cabo Verde': 'Cabo Verde', 'Curaçao': 'Curazao',
}

// Round de API-Football → clave interna de etapa
const ROUND_STAGE: Record<string, string> = {
  'Round of 32':    'LAST_32',
  'Round of 16':    'LAST_16',
  'Quarter-finals': 'QUARTER_FINALS',
  'Semi-finals':    'SEMI_FINALS',
  '3rd Place Final':'THIRD_PLACE',
  'Final':          'FINAL',
}

const STAGE_MAP: Record<string, string> = {
  'GROUP_STAGE':    'Fase de Grupos',
  'LAST_32':        'Ronda de 32',
  'LAST_16':        'Octavos de final',
  'QUARTER_FINALS': 'Cuartos de final',
  'SEMI_FINALS':    'Semifinales',
  'THIRD_PLACE':    'Tercer lugar',
  'FINAL':          'Gran Final',
}

const STAGE_ORDER: Record<string, number> = {
  'LAST_32': 100, 'LAST_16': 200, 'QUARTER_FINALS': 300,
  'SEMI_FINALS': 400, 'THIRD_PLACE': 490, 'FINAL': 500,
}

// Statuses de API-Football que indican partido finalizado
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD'])

function norm(name: string): string { return TEAM_MAP[name] ?? name }

function getStage(round: string): string {
  if (!round) return 'UNKNOWN'
  if (round.startsWith('Group')) return 'GROUP_STAGE'
  return ROUND_STAGE[round] ?? 'UNKNOWN'
}

function formatFecha(utcDate: string): string {
  const d = new Date(new Date(utcDate).getTime() - 5 * 60 * 60 * 1000)
  const days  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl    = requireEnv('SUPABASE_URL')
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const footballApiKey = requireEnv('FOOTBALL_DATA_API_KEY').replace(/[^\x20-\x7E]/g, '').trim()
    if (!footballApiKey) return json({ error: 'FOOTBALL_DATA_API_KEY vacío' }, 500)

    const db  = createClient(supabaseUrl, serviceRoleKey)
    const now = new Date()

    // ── 1. ¿Vale la pena llamar a la API ahora? ──────────────────────────────
    // Llama solo si hay un partido que inició en las últimas 3 horas y aún no
    // tiene resultado. 3h cubre: 90 min normales + tiempo extra + penales + margen.
    // En cuanto el sync graba el resultado, esta query ya no lo devuelve → se detiene.
    const tresHorasAtras = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

    const { data: pendientes } = await db
      .from('partidos')
      .select('id')
      .lte('fecha_inicio', now.toISOString())
      .gte('fecha_inicio', tresHorasAtras)
      .is('resultado_local', null)
      .limit(1)

    if (!pendientes?.length) {
      return json({ ok: true, skipped: true, reason: 'sin partidos activos ni recientes' })
    }

    // ── 2. Llamar API-Football ───────────────────────────────────────────────
    const apiRes = await fetch(FOOTBALL_API, {
      headers: { 'X-Auth-Token': footballApiKey },
    })
    if (!apiRes.ok) {
      const txt = await apiRes.text()
      return json({ error: `API error ${apiRes.status}: ${txt}` }, 502)
    }
    const { matches: apiMatches = [] }: { matches: any[] } = await apiRes.json()

    // ── 3. Partidos en la BD ─────────────────────────────────────────────────
    const { data: dbPartidos, error: dbErr } = await db
      .from('partidos')
      .select('id, equipo_local, equipo_visitante, api_match_id, orden, fecha_inicio, fecha_fin, resultado_local, resultado_visitante')
    if (dbErr) throw dbErr

    const byApiId = new Map<number, any>()
    const byTeams = new Map<string, any>()
    for (const p of dbPartidos ?? []) {
      if (p.api_match_id) byApiId.set(p.api_match_id, p)
      byTeams.set(`${p.equipo_local}|${p.equipo_visitante}`, p)
    }

    // ── 4. Procesar cada partido de la API ───────────────────────────────────
    let inserted = 0
    let synced   = 0

    for (const am of apiMatches) {
      const homeRaw  = am.homeTeam?.name ?? ''
      const awayRaw  = am.awayTeam?.name ?? ''
      const homeEs   = norm(homeRaw)
      const awayEs   = norm(awayRaw)
      const stage    = am.stage ?? ''
      const fixtureId = am.id as number
      const utcDate   = am.utcDate as string

      if (!homeRaw || !awayRaw || !fixtureId || !utcDate) continue
      if (homeRaw.includes('TBD') || awayRaw.includes('TBD')) continue
      if (homeEs === 'TBD' || awayEs === 'TBD') continue

      // Buscar partido en BD
      let dbPartido = byApiId.get(fixtureId)
        ?? byTeams.get(`${homeEs}|${awayEs}`)
        ?? byTeams.get(`${awayEs}|${homeEs}`)

      // Partido de eliminatorias nuevo → insertar
      if (!dbPartido && stage !== 'GROUP_STAGE') {
        const stageLabel = STAGE_MAP[stage] ?? stage
        const orden      = (STAGE_ORDER[stage] ?? 100) + (am.matchday ?? 0)
        const fechaFin   = new Date(new Date(utcDate).getTime() + 150 * 60 * 1000).toISOString()
        const { data: newPartido, error: insErr } = await db
          .from('partidos')
          .insert({
            orden, fase: stageLabel, fecha: formatFecha(utcDate),
            fecha_inicio: utcDate, fecha_fin: fechaFin,
            equipo_local: homeEs, equipo_visitante: awayEs,
            flag_local: '', flag_visitante: '', destacado: false,
            api_match_id: fixtureId,
          })
          .select('id, equipo_local, equipo_visitante, api_match_id, orden, fecha_inicio, fecha_fin, resultado_local, resultado_visitante')
          .single()
        if (!insErr && newPartido) {
          dbPartido = newPartido
          byApiId.set(fixtureId, newPartido)
          inserted++
        }
      }

      if (!dbPartido) continue

      // Actualizar api_match_id si falta
      const metaUpdates: Record<string, unknown> = {}
      if (!dbPartido.api_match_id) {
        metaUpdates.api_match_id = fixtureId
        dbPartido.api_match_id   = fixtureId
        byApiId.set(fixtureId, dbPartido)
      }
      // Para eliminatorias: actualizar fecha desde la API
      if (stage !== 'GROUP_STAGE') {
        const apiDateNorm = new Date(utcDate).toISOString()
        const dbDateNorm  = dbPartido.fecha_inicio ? new Date(dbPartido.fecha_inicio).toISOString() : null
        if (dbDateNorm !== apiDateNorm) {
          metaUpdates.fecha_inicio = utcDate
          metaUpdates.fecha        = formatFecha(utcDate)
          metaUpdates.fecha_fin    = new Date(new Date(utcDate).getTime() + 150 * 60 * 1000).toISOString()
          dbPartido.fecha_inicio   = utcDate
        }
      }
      if (Object.keys(metaUpdates).length > 0) {
        await db.from('partidos').update(metaUpdates).eq('id', dbPartido.id)
      }

      // Fase de grupos: usar fecha_inicio de la BD (más confiable que la API en free tier)
      const kickoff = (stage === 'GROUP_STAGE' && dbPartido.fecha_inicio)
        ? new Date(dbPartido.fecha_inicio)
        : new Date(utcDate)
      if (kickoff > now) continue

      const isFinal    = ['FINISHED', 'AWARDED'].includes(am.status)
      const dbSaysFinal = dbPartido.fecha_fin ? new Date(dbPartido.fecha_fin) < now : false
      const treatFinal  = isFinal || dbSaysFinal

      let ft: { home: number; away: number } | null = null

      if (treatFinal) {
        if (am.score?.fullTime?.home != null && am.score?.fullTime?.away != null) {
          ft = { home: am.score.fullTime.home as number, away: am.score.fullTime.away as number }
        }
        // Fallback: resultado cargado manualmente en partidos
        else if (dbPartido.resultado_local != null && dbPartido.resultado_visitante != null) {
          ft = { home: dbPartido.resultado_local as number, away: dbPartido.resultado_visitante as number }
        }
      } else {
        if (am.score?.fullTime?.home != null && am.score?.fullTime?.away != null) {
          ft = { home: am.score.fullTime.home as number, away: am.score.fullTime.away as number }
        } else if (am.score?.halfTime?.home != null && am.score?.halfTime?.away != null) {
          ft = { home: am.score.halfTime.home as number, away: am.score.halfTime.away as number }
        }
      }

      if (!ft) continue

      const isHomeLocal   = homeEs === dbPartido.equipo_local
      const golesLocal    = isHomeLocal ? ft.home : ft.away
      const golesVisita   = isHomeLocal ? ft.away : ft.home
      const marcarCerrado = treatFinal

      // ── 4a. Actualizar partidos ──────────────────────────────────────────────
      const partidoUpdate: Record<string, unknown> = {
        resultado_local:     golesLocal,
        resultado_visitante: golesVisita,
      }
      if (marcarCerrado) {
        partidoUpdate.cerrado = true
        // Sellar fecha_fin con hora real de cierre
        const nowIso = now.toISOString()
        if (!dbPartido.fecha_fin || new Date(dbPartido.fecha_fin) > now) {
          partidoUpdate.fecha_fin = nowIso
        }
      }
      await db.from('partidos').update(partidoUpdate).eq('id', dbPartido.id)

      // ── 4b. Actualizar poll_resultados para todas las pollas abiertas ────────
      const { data: pollas } = await db.from('pollas').select('id').eq('estado', 'abierta')
      if (!pollas?.length) continue

      const { data: yaClausulados } = await db
        .from('poll_resultados')
        .select('poll_id')
        .eq('partido_id', dbPartido.id)
        .eq('cerrado', true)

      const closedPollaIds = new Set((yaClausulados ?? []).map((r: any) => r.poll_id))

      const upserts = pollas
        .filter((p: any) => !closedPollaIds.has(p.id) || isFinal)
        .map((p: any) => ({
          poll_id:             p.id,
          partido_id:          dbPartido.id,
          resultado_local:     golesLocal,
          resultado_visitante: golesVisita,
          cerrado:             marcarCerrado || closedPollaIds.has(p.id),
        }))

      if (upserts.length > 0) {
        await db.from('poll_resultados').upsert(upserts, { onConflict: 'poll_id,partido_id' })
        synced++
      }
    }

    // ── 5. Auto-cierre si la Gran Final terminó ──────────────────────────────
    // Cuando el partido 'Gran Final' queda cerrado, llamar auto-cerrar-pollas
    // para cerrar todas las pollas abiertas y distribuir premios on-chain.
    const { data: granFinal } = await db
      .from('partidos')
      .select('id')
      .eq('fase', 'Gran Final')
      .eq('cerrado', true)
      .limit(1)

    if (granFinal?.length) {
      try {
        const autoCerrarRes = await fetch(
          `${supabaseUrl}/functions/v1/auto-cerrar-pollas`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
            },
            body: '{}',
          }
        )
        if (!autoCerrarRes.ok) {
          const txt = await autoCerrarRes.text()
          console.error('[sync-scores] auto-cerrar-pollas error:', txt)
        } else {
          const autoCerrarData = await autoCerrarRes.json()
          console.log('[sync-scores] auto-cerrar-pollas:', JSON.stringify(autoCerrarData))
        }
      } catch (autoErr: any) {
        console.error('[sync-scores] Error llamando auto-cerrar-pollas:', autoErr?.message)
      }
    }

    return json({ ok: true, inserted_matches: inserted, synced, timestamp: now.toISOString() })

  } catch (err: any) {
    console.error('sync-scores:', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})
