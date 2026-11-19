import { BrowserRouter, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppRoutes } from './routes'

function AppComRotas() {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary pathname={pathname}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppComRotas />
    </BrowserRouter>
  )
}
