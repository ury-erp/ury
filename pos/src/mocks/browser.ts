/**
 * MSW browser worker setup.
 *
 * Used for:
 *   - Development without a Frappe backend: VITE_MSW_ENABLED=true npm run dev
 *   - E2E tests (Playwright) running against a real browser
 *
 * When MSW is active, VITE_FRAPPE_BASE_URL must be empty or point to
 * the same origin so that the service worker can intercept API requests.
 * This is handled in main.tsx which overrides the env var when MSW is on.
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
