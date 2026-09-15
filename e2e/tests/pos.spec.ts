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
 *    than the Tables screen, so the first spec below asserts on whatever
 *    the app actually renders with no session at all.
 */

test.describe('POS app', () => {
  test('loads and renders a recognizable app shell', async ({ page }) => {
    await page.goto('/pos/order');

    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
  });

  // ROUND 2 (2026-09-15) FINDING: the data-seeding gap from round 1 is
  // resolved, and the actual root cause was NOT what it first looked like.
  // `test@erpnext.com` already had the `URY Captain` role and was already a
  // `POS Profile User` for `Demo Branch` — re-testing with a fresh session
  // still hit "Access Denied", which turned out to come from
  // `ury.ury_pos.api.getPosProfile()` throwing "User is not Associated with
  // any Branch" (captured via a real Playwright network-response listener,
  // not guessed). Root cause: `getBranch()` in `ury/ury_pos/api.py` joins
  // `tabURY User` (a child table on the `Branch` doctype) against
  // `frappe.session.user` — `test@erpnext.com` had a role and a POS Profile
  // assignment, but no `URY User` row on any `Branch` document at all (only
  // `Administrator` did). Fixed by appending a `URY User` child row for
  // `test@erpnext.com` on the `Demo Branch` Branch document (see
  // EXECUTION_LOG.md Phase 5 round 2 for the exact `bench console`
  // command). This is the real, root-caused data-seeding gap — not a role
  // or POS-Profile-membership problem as round 1 assumed.
  test('captain golden path: login -> tables list -> open a table', async ({ page }) => {
    // Real UI login (not an API shortcut) so this exercises the same
    // frappe.boot/csrf_token session-bootstrap path AuthGuard depends on.
    await page.goto('/login');
    await page.fill('#login_email', 'test@erpnext.com');
    await page.fill('#login_password', 'testpass123');
    await page.click('.btn-login');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

    await page.goto('/pos/order');

    // Real assertion: CaptainTables.tsx's own heading, not a generic shell
    // check. This is the exact thing round 1 could not reach.
    await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible({ timeout: 15000 });

    // Tap the first free table tile (CaptainTableCard renders a
    // `<button type="button">` with a `title` equal to the table name and a
    // "Free" status badge — confirmed against this bench's real rendered
    // DOM, not guessed) and confirm navigation to the per-table
    // CaptainOrder screen (route: /order/table/:table).
    const freeTable = page.locator('button[type="button"]').filter({ hasText: 'Free' }).first();
    await expect(freeTable).toBeVisible({ timeout: 10000 });
    await freeTable.click();

    await expect(page).toHaveURL(/\/pos\/order\/table\//, { timeout: 10000 });
  });

  // Still genuinely out of scope for this pass (see EXECUTION_LOG.md Phase 5
  // round 2): KOT send, serve, and POS Closing Entry require driving
  // CaptainMenu item selection (needs real priced menu items resolved
  // through the branch's active Price List/Item Group tree) and then the
  // separate POS Profile billing/close flow, which lives in the cashier
  // side of this same app, not the captain flow. Not faked here.
  test.skip('captain golden path: add items -> KOT -> serve -> POS close', async () => {
    // See TODO in EXECUTION_LOG.md Phase 5 round 2 for the concrete next
    // steps and exact source files (CaptainMenu.tsx, order-api.ts syncOrder,
    // reprintKot, and the cashier Payment screen) once this is picked up.
  });
});
