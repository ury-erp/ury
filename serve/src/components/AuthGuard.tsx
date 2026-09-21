import React, { useEffect, useState } from 'react'
import { useRootStore } from '../store/root-store'
import { Button, Spinner } from '@ury/ui'
import { RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

const AuthGuard: React.FC<Props> = ({ children }) => {
  const {
    checkAuth,
    user,
    isLoading: authLoading,
    error: authError,
    fetchPosProfile,
    posProfile,
    isLoading: configLoading,
    error: configError,
    hasAccess,
    allowedRoles,
  } = useRootStore()

  const [isRechecking, setIsRechecking] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (user) fetchPosProfile()
  }, [user, fetchPosProfile])

  if (authLoading || (user && configLoading) || isRechecking) {
    return (
      <div className="min-h-screen">
        <Spinner message="Loading…" />
      </div>
    )
  }

  if (authError || configError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Access Denied</h2>
          <p className="text-gray-600">{authError || configError}</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  if (!posProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Configuration Error</h2>
          <p className="text-gray-600">POS Profile not found or not configured.</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Permission Required</h2>
          <p className="text-gray-600">You do not have permission to access Serve.</p>
          <p className="mt-2 text-sm text-gray-500">Required roles: {allowedRoles.join(', ')}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={async () => {
              setIsRechecking(true)
              try {
                await fetchPosProfile(true)
              } finally {
                setIsRechecking(false)
              }
            }}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            Recheck Permissions
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default AuthGuard
