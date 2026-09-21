import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider, Spinner, Button } from '@ury/ui'
import { useEffect, type ReactNode } from 'react'
import AuthGuard from './components/AuthGuard'
import ServeRouteGuard from './components/ServeRouteGuard'
import TablesPage from './pages/Tables'
import OrderPage from './pages/Order'
import { useServeStore } from './store/serve-store'

function AppBoot({ children }: { children: ReactNode }) {
  const initializeApp = useServeStore((s) => s.initializeApp)
  const isInitializing = useServeStore((s) => s.isInitializing)
  const error = useServeStore((s) => s.error)
  const posProfile = useServeStore((s) => s.posProfile)

  useEffect(() => {
    void initializeApp()
  }, [initializeApp])

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner message="Starting Serve…" />
      </div>
    )
  }

  if (error && !posProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold">Failed to start</h2>
          <p className="text-sm text-gray-600">{error}</p>
          <Button className="mt-4" onClick={() => void initializeApp()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Router basename="/ury/serve">
      <ToastProvider />
      <AuthGuard>
        <ServeRouteGuard>
          <AppBoot>
              <Routes>
                <Route index element={<TablesPage />} />
                <Route path="/table/:table" element={<OrderPage />} />
                <Route path="/takeaway" element={<OrderPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </AppBoot>
        </ServeRouteGuard>
      </AuthGuard>
    </Router>
  )
}
