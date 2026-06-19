import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useWalletSync } from './hooks/useWalletSync'
import { useMiniPayAutoConnect } from './hooks/useMiniPay'
import Auth from './pages/Auth'
import Pollas from './pages/Pollas'
import PollPlayer from './pages/PollPlayer'
import PollAdmin from './pages/PollAdmin'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ color:'var(--muted)', fontFamily:"'Anton',sans-serif", fontSize:14, letterSpacing:1 }}>CARGANDO...</div>
    </div>
  )
  if (!session) return <Navigate to="/auth" replace />
  return <>{children}</>
}

// Wrappers con key=id para forzar desmontaje completo al cambiar de polla.
// Sin esto, React reutiliza la misma instancia y el estado de la polla anterior
// (predicciones, tabla, etc.) persiste hasta que la nueva carga termina.
function PlayerWrapper() {
  const { id } = useParams<{ id: string }>()
  return <PollPlayer key={id} />
}
function AdminWrapper() {
  const { id } = useParams<{ id: string }>()
  return <PollAdmin key={id} />
}

function AppRoutes() {
  const { session, loading } = useAuth()
  useWalletSync()
  useMiniPayAutoConnect()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ color:'var(--lime)', fontFamily:"'Anton',sans-serif", fontSize:16, letterSpacing:2 }}>
        CARGANDO...
      </div>
    </div>
  )
  return (
    <Routes>
      <Route path="/auth" element={session ? <Navigate to="/pollas" /> : <Auth />} />
      <Route path="/pollas" element={<PrivateRoute><Pollas /></PrivateRoute>} />
      <Route path="/pollas/:id" element={<PrivateRoute><PlayerWrapper /></PrivateRoute>} />
      <Route path="/pollas/:id/admin" element={<PrivateRoute><AdminWrapper /></PrivateRoute>} />
      <Route path="*" element={<Navigate to={session ? '/pollas' : '/auth'} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
