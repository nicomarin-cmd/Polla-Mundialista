import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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

function AppRoutes() {
  const { session, loading } = useAuth()
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
      <Route path="/pollas/:id" element={<PrivateRoute><PollPlayer /></PrivateRoute>} />
      <Route path="/pollas/:id/admin" element={<PrivateRoute><PollAdmin /></PrivateRoute>} />
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
