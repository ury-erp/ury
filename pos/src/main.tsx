import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initI18n } from './i18n'
import { initPrinting } from '@ury/core'
import { privateKey } from '../privateKey'
import { registerServiceWorker } from './registerServiceWorker'
import { queryClient } from './lib/query-client'

try {
  initPrinting({ signKey: privateKey })
} catch (err) {
  console.warn('initPrinting notice:', err)
}

try {
  registerServiceWorker()
} catch (err) {
  console.warn('registerServiceWorker notice:', err)
}

// Initialize i18n in background without blocking initial React mount
initI18n().catch((err) => {
  console.warn('initI18n notice:', err)
})

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}


  