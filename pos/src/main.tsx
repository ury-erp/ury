import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n } from './i18n'
import { ErrorBoundary } from './components/ErrorBoundary'

async function bootstrap() {
  // Enable MSW mocking if configured.
  // When MSW is active, the service worker can only intercept same-origin
  // requests. We override VITE_FRAPPE_BASE_URL to empty so that the
  // frappe-js-sdk sends relative API requests (e.g. /api/method/...)
  // instead of cross-origin requests to http://localhost:8000.
  if (import.meta.env.VITE_MSW_ENABLED) {
    // Override the base URL so SDK sends same-origin requests.
    // MSW service worker can only intercept same-origin requests.
    // Using window.location.origin ensures the SDK constructs URLs like
    // http://localhost:5173/api/method/... which the SW can intercept.
    const mswBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    (import.meta as Record<string, Record<string, string>>).env.VITE_FRAPPE_BASE_URL = mswBaseUrl;

    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
    });
    // Signal to E2E tests that MSW is ready
    document.documentElement.setAttribute('data-msw-ready', 'true');
    console.log('[MSW] Service worker active — API requests are being mocked');
  }

  await initI18n();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap app:', err);
  // Fallback: render app anyway
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
});
