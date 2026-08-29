import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { mountLanguageSwitcher, startDomI18n } from '@ury/core'
import russianTranslations from './i18n/ru.json'

startDomI18n(russianTranslations)
mountLanguageSwitcher()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
