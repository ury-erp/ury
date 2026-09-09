import { test, expect } from '@playwright/test';

/**
 * Golden-path scaffold for the production board app (mosaic/).
 *
 * Real behavior below comes from reading the source, not guesses:
 *  - mosaic/src/router/index.js: history base "/mosaic/", "/" renders
 *    ProductionDashboard.vue, "/:production" renders kot.vue, and
 *    "/login" (mosaic/src/views/Login.vue) is a separate route.
 *  - mosaic/src/components/production/ProductionDashboard.vue: while
 *    `loading` it renders the heading "Loading Production Dashboard...";
 *    once loaded, it renders a grid of ProductionCard tiles (one per
 *    production unit).
 *  - mosaic/index.html sets <title>Mosaic</title>.
 *  - Login.vue (used if the app decides the visitor needs to
 *    authenticate) renders "Username:" / "Password:" labels and a
 *    "Sign in" submit button.
 *
 * What this spec can and can't verify without a live seeded bench:
 *  - Whether "/" actually shows the dashboard or bounces to a login
 *    screen depends on live session/auth state (frappe.session /
 *    $auth, wired up in mosaic/src/main.js) that only a running,
 *    authenticated bench provides. This spec only asserts the app shell
 *    mounts and shows one of the two recognizable screens; the "board
 *    shows real production units" assertion is left as a TODO.
 */

test.describe('Mosaic production board', () => {
  test('loads and renders a recognizable app shell', async ({ page }) => {
    await page.goto('/mosaic/');

    await expect(page).toHaveTitle('Mosaic');

    const root = page.locator('#app');
    await expect(root).not.toBeEmpty();

    // Either the dashboard (loading or loaded) or the login screen is an
    // acceptable "the app actually rendered something real" signal,
    // depending on whether the session is authenticated.
    const dashboardLoading = page.getByText('Loading Production Dashboard...');
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(dashboardLoading.or(signIn).first()).toBeVisible();
  });

  // TODO(needs seeded bench + authenticated session + seeded production
  // units): once a real session and at least one production unit
  // (e.g. Kitchen/Bar) are seeded, extend this to:
  //   1. Assert the loading heading disappears and at least one
  //      ProductionCard tile renders with a real unit title.
  //   2. Click a card to navigate to "/mosaic/:production" (kot.vue) and
  //      assert its KOT board renders.
  test.skip('golden path: dashboard shows production units -> open a board', async ({ page }) => {
    // Intentionally skipped — requires a seeded bench (production units,
    // authenticated session). See TODO above for concrete steps once
    // that fixture exists.
  });
});
