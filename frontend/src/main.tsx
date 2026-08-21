import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@ury/ui'
import './i18n/index.ts'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ury">
      <App />
      <ToastProvider />
    </BrowserRouter>
  </StrictMode>,
)
