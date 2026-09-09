import { test, expect } from '@playwright/test';

/**
 * Golden-path scaffold for the captain/cashier POS app (pos/).
 *
 * Real routes/selectors below come from reading the source, not guesses:
 *  - App shell + routing: pos/src/App.tsx — Router basename "/pos", plus a
 *    sibling Captain "Order" module at "/order" (CaptainTables) and
 *    "/order/table/:table" (CaptainOrder), guarded by AuthGuard /
 *    CaptainRouteGuard.
 *  - pos/src/captain/pages/CaptainTables.tsx renders an <h1>Tables</h1>
 *    heading and a "Refresh" button in its header, and — once rooms/tables
 *    load — a grid of CaptainTableCard tiles (pos/src/captain/components/
 *    CaptainTableCard.tsx).
 *
 * What this spec can and can't verify without a live seeded bench:
 *  - AuthGuard and CaptainRouteGuard both require a real authenticated
 *    Frappe session (frappe.boot / csrf_token, injected server-side into
 *    index.html — see pos/index.html). Without one, the app will most
 *    likely redirect to a login flow or show a auth-error state rather
 *    than the Tables screen, so this spec asserts on whatever the app
 *    actually renders (a recognizable POS/Order/login surface), and
 *    leaves the authenticated golden path as a TODO.
 */

test.describe('POS app', () => {
  test('loads and renders a recognizable app shell', async ({ page }) => {
    await page.goto('/pos/order');

    // Whatever state we land in (login redirect, auth error, or the real
    // Tables screen), the React app shell must have actually mounted —
    // i.e. #root is non-empty. This is the one assertion we can make with
    // zero setup.
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
  });

  // TODO(needs seeded bench + authenticated session): once a captain user
  // session and at least one branch/room/table are seeded, extend this to:
  //   1. Navigate to /pos/order and assert the "Tables" heading
  //      (CaptainTables.tsx) is visible:
  //        await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible()
  //   2. Tap a CaptainTableCard tile to navigate to
  //      /pos/order/table/:table (CaptainOrder.tsx) — the "new order" /
  //      KOT / payment golden path lives there and needs real menu items
  //      and a real table row to exercise meaningfully.
  test.skip('captain golden path: tables list -> open table -> add items -> KOT -> payment', async ({ page }) => {
    // Intentionally skipped — requires a seeded bench (branch, room,
    // table, menu items) and an authenticated captain session. See TODO
    // above for the concrete steps once that fixture exists.
  });
});
