/**
 * @ury/api-client - URY API Client
 * 
 * Frappe SDK wrapper with typed API functions for URY applications.
 * Provides consistent API access across POS, QR ordering, online ordering,
 * and kiosk applications.
 */

// Client
export * from './client';

// Types
export * from './types';

// API modules
export * from './menu-api';
export * from './auth-api';

// Default export
export { frappeApp as default } from './client';
