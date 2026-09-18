import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@ury/ui'
import { startDomI18n } from '@ury/core'
import './index.css'
import App from './App.tsx'
import russianTranslations from './i18n/ru.json'
import { resolveManagementLanguage } from './i18n/language'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'

const language = resolveManagementLanguage()
document.documentElement.lang = language
document.documentElement.dir = 'ltr'
const stopTranslation = language === 'ru' ? startDomI18n(russianTranslations) : undefined
if (import.meta.hot) import.meta.hot.dispose(() => stopTranslation?.())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ury">
      <App />
      <ToastProvider />
      <LanguageSwitcher />
    </BrowserRouter>
  </StrictMode>,
)
