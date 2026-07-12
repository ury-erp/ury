import { DOCTYPES } from '../data/doctypes';
import { db } from './frappe-sdk';

export interface WebsiteBranding {
  /** App Logo configured in Website Settings (e.g. "/files/logo.png"), or null. */
  appLogo: string | null;
  /** Favicon configured in Website Settings (browser-tab icon), or null. */
  favicon: string | null;
}

// Website Settings is a Single that rarely changes during a session, so cache the
// request and reuse it (Header can remount on navigation → avoid refetching).
let brandingPromise: Promise<WebsiteBranding> | null = null;

/**
 * Fetch the branding (app logo + favicon) configured in Website Settings.
 * Both fields are read from the single Website Settings doc in one request.
 * Never rejects — on failure it logs and returns nulls so callers can fall
 * back to the bundled defaults.
 */
export function getWebsiteBranding(): Promise<WebsiteBranding> {
  if (!brandingPromise) {
    brandingPromise = db
      .getDoc<{ app_logo?: string; favicon?: string }>(
        DOCTYPES.WEBSITE_SETTINGS,
        DOCTYPES.WEBSITE_SETTINGS,
      )
      .then((doc) => ({
        appLogo: doc?.app_logo || null,
        favicon: doc?.favicon || null,
      }))
      .catch((error) => {
        console.error('Failed to load Website Settings branding:', error);
        brandingPromise = null; // allow a retry on the next call
        return { appLogo: null, favicon: null };
      });
  }
  return brandingPromise;
}
