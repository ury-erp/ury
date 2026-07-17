/**
 * MSW Node server setup for Vitest unit/integration tests.
 *
 * Lifecycle is managed in src/test/setup.ts:
 *   beforeAll(() => server.listen())
 *   afterEach(() => server.resetHandlers())
 *   afterAll(() => server.close())
 *
 * Use `server.use(http.get(...))` in individual tests to override handlers.
 * When overriding cached endpoints, call `invalidateCache()` from api-dedup.ts
 * before the test to bypass the dedup/cache layer.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
