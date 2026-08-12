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

initPrinting({ signKey: privateKey })
registerServiceWorker()

initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})

  