import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyDocumentLocale, initI18n } from './i18n'
import { initPrinting, startDomI18n } from '@ury/core'
import residualRussianTranslations from './i18n/dom.ru.json'

initPrinting({ signKey: '' })

initI18n().then(() => {
  applyDocumentLocale()
  startDomI18n(residualRussianTranslations)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

