/**
 * The single rule for what an open invoice amendment blocks.
 *
 * The legacy POS had two navigation surfaces — the bottom tab bar and the
 * order step bar — and they disagreed: the tabs pointed every destination at
 * `#` while an amendment was open, and the steps navigated freely, so the
 * same half-finished amendment was protected on one bar and abandonable on
 * the other (UX-24). Both bars and the router guard in `main.js` now ask this
 * function, so what is dimmed on screen is exactly what the guard refuses.
 *
 * The cart stays reachable because it is where the amendment is finished or
 * discarded, and login stays reachable so an expired session is never trapped
 * behind an amendment the user can no longer submit.
 *
 * @param {boolean} updating - `invoiceData.invoiceUpdating`.
 * @param {string} path - The destination path, as written in the router.
 * @returns {boolean} true when navigation there should be refused.
 */
export function isInvoiceNavigationBlocked(updating, path) {
  return Boolean(updating) && path !== '/Cart' && path !== '/login';
}
