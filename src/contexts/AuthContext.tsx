import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ session: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    // maybeSingle no lanza error si no existe fila
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setProfile(data as Profile)
      return
    }

    // El trigger on_auth_user_created pudo no haber corrido — intentamos crear el perfil
    const { data: userData } = await supabase.auth.getUser()
    const nombre =
      (userData.user?.user_metadata?.nombre as string | undefined) ||
      (userData.user?.user_metadata?.full_name as string | undefined) ||
      (userData.user?.user_metadata?.name as string | undefined) ||
      userData.user?.email?.split('@')[0] ||
      'Usuario'

    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: userId, nombre })
      .select()
      .maybeSingle()

    setProfile(created as Profile | null)
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        if (session) fetchProfile(session.user.id).finally(() => setLoading(false))
        else setLoading(false)
      })
      .catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
