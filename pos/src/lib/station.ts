// Station sign-in: a shared POS screen where each waiter signs in with a PIN
// at /station. The backend lives in ury/ury/station.

export interface StationSession {
  station: string;
  idle_seconds: number;
  warning_seconds: number;
  station_page: string;
}

const STATION_PAGE = '/station';
// Set by the /station page once the screen has been set up for a station.
const STATION_CODE_KEY = 'ury_station_code';

/** The station this session was started at, or null for a normal login. */
export function getStationSession(): StationSession | null {
  const boot = (window as { frappe?: { boot?: { ury_station?: StationSession | null } } }).frappe?.boot;
  return boot?.ury_station ?? null;
}

function isStationScreen(): boolean {
  try {
    return Boolean(localStorage.getItem(STATION_CODE_KEY));
  } catch {
    return false;
  }
}

/**
 * Where a signed-out user belongs: the PIN page on a station screen, the
 * normal login page everywhere else.
 */
export function signedOutUrl(): string {
  return getStationSession() || isStationScreen() ? STATION_PAGE : '/login?redirect-to=%2Fpos';
}

/**
 * The POS caches the profile, menu and more per browser tab. On a shared
 * screen the next waiter must not inherit any of it.
 */
export function clearTabCache(): void {
  try {
    sessionStorage.clear();
  } catch {
    // storage unavailable: nothing was cached
  }
}
