import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n } from './i18n'
import { initPrinting } from '@ury/core'
import { registerServiceWorker } from './pwa'

async function bootPrinting() {
  const envKey = import.meta.env.VITE_QZ_SIGN_KEY
  if (typeof envKey === 'string' && envKey.trim()) {
    initPrinting({ signKey: envKey.trim() })
    return
  }
  try {
    const mod = await import('../privateKey')
    if (mod.privateKey && mod.privateKey.trim()) {
      initPrinting({ signKey: mod.privateKey })
    }
  } catch {
    // QZ stays uninitialized; network/socket print still works. QZ calls error clearly.
  }
}

void registerServiceWorker()
void bootPrinting()

initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
