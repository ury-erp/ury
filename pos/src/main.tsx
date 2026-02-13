import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/toast'
import './lib/global-error' // Initialize global error handler with interceptors

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider />
    <App />
  </StrictMode>,
)
