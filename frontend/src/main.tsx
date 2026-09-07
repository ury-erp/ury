import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@ury/ui'
import { mountLanguageSwitcher, startDomI18n } from '@ury/core'
import './index.css'
import App from './App.tsx'
import russianTranslations from './i18n/ru.json'
import kazakhTranslations from './i18n/kk.json'

startDomI18n({ ru: russianTranslations, kk: kazakhTranslations })
mountLanguageSwitcher()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ury">
      <App />
      <ToastProvider />
    </BrowserRouter>
  </StrictMode>,
)
