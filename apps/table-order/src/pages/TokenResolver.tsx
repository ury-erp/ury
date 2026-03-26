import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTableToken } from '@ury/menu'
import { Spinner, showToast } from '@ury/ui'

export default function TokenResolver() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { context, loading, error } = useTableToken(token || null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (context && !resolved) {
      setResolved(true)
      // Store table context in session
      sessionStorage.setItem('tableContext', JSON.stringify(context))
      sessionStorage.setItem('tableToken', token || '')
      
      showToast.success(`Welcome to ${context.restaurant_name}!`)
      
      // Navigate to menu
      navigate(`/menu/${context.restaurant}?table=${context.table}`, { replace: true })
    }
  }, [context, token, navigate, resolved])

  useEffect(() => {
    if (error) {
      showToast.error(error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        {loading ? (
          <>
            <Spinner message="Loading your table..." />
            <p className="mt-4 text-gray-600">Please wait while we set up your ordering experience</p>
          </>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid QR Code</h2>
            <p className="text-gray-600">{error}</p>
            <p className="mt-4 text-sm text-gray-500">Please ask your server for assistance.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
