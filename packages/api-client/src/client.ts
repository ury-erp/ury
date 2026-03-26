import { FrappeApp } from "frappe-js-sdk";

/**
 * Frappe App Client
 * 
 * Creates a singleton instance of the FrappeApp client.
 * Uses VITE_FRAPPE_BASE_URL from environment variables.
 */

const baseUrl = import.meta.env?.VITE_FRAPPE_BASE_URL || 
                (typeof window !== 'undefined' ? window.location.origin : '');

export const frappeApp = new FrappeApp(baseUrl);

// Export individual API clients
export const call = frappeApp.call();
export const db = frappeApp.db();
export const auth = frappeApp.auth();
export const file = frappeApp.file();

// Default export
export default frappeApp;
