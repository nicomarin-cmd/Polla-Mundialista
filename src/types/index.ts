export interface Profile {
  id: string
  nombre: string
  avatar_url: string | null
  created_at: string
}

export type Alcance = 'mundial' | 'grupos' | 'eliminatorias' | 'seleccion'

export interface Polla {
  id: string
  nombre: string
  codigo: string
  admin_id: string
  inscripcion: number
  moneda: string
  estado: 'abierta' | 'cerrada' | 'cancelada'
  reglas: {
    exacto: number
    resultado: number
    fallo: number
    alcance?: Alcance
    partidos_seleccionados?: string[]
  }
  premios: number[]
  created_at: string
}

export interface Partido {
  id: string
  orden: number
  fase: string
  fecha: string
  equipo_local: string
  equipo_visitante: string
  flag_local: string
  flag_visitante: string
  resultado_local: number | null
  resultado_visitante: number | null
  cerrado: boolean
  destacado: boolean
}

export interface Prediccion {
  id: string
  poll_id: string
  user_id: string
  partido_id: string
  pred_local: number
  pred_visitante: number
}

export interface PollMember {
  poll_id: string
  user_id: string
  pagado: boolean
  joined_at: string
}

export interface PollMemberWithProfile extends PollMember {
  profiles: { nombre: string } | null
}

export interface TablaRow {
  user_id: string
  nombre: string
  puntos: number
  exactos: number
  resultados: number
  posicion: number
}

export interface Ganador {
  poll_id: string
  user_id: string
  puesto: number
  monto: number
}

export interface GanadorWithProfile extends Ganador {
  profiles: { nombre: string } | null
}

export interface PollPayment {
  id: string
  poll_id: string
  user_id: string
  amount: number
  token: string
  chain: string
  chain_id: number
  wallet_address: string
  tx_hash: string | null
  refund_tx_hash: string | null
  status: 'pending' | 'confirmed' | 'distributed' | 'refunded' | 'failed'
  created_at: string
  updated_at: string
}
