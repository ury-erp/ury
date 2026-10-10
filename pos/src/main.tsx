import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n, applyDocumentLocale } from './i18n'
import { initPrinting } from '@ury/core'

initPrinting({ signKey: '' })

initI18n().then(() => {
  // Set <html lang/dir> before the first render so an RTL locale never paints
  // a frame of LTR layout. Direction comes from the locale's `_meta.direction`,
  // which is the single source of truth — adding an RTL locale needs no code change.
  applyDocumentLocale()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

  