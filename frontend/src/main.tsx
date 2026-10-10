import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@ury/ui'
import './index.css'
import App from './App.tsx'
import { initI18n } from './i18n'

// Resolve the locale before the first render: this sets <html lang/dir>, so an
// RTL language never paints a frame of LTR layout, and it points the shared
// currency/time formatters at the active locale before any of them run.
initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename="/ury">
        <App />
        <ToastProvider />
      </BrowserRouter>
    </StrictMode>,
  )
})
