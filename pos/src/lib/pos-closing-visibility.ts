/** UI-only: expected amounts remain available for closing reconciliation. */
export function isBlindCashCount(profile: { custom_blind_cash_count?: number } | null): boolean {
  return profile?.custom_blind_cash_count === 1;
}
