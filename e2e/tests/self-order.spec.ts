import { test, expect } from '@playwright/test';

/**
 * Golden-path scaffold for the customer self-ordering app (self-order/).
 *
 * Real behavior below comes from reading the source, not guesses:
 *  - self-order/src/App.tsx: a non-device (plain QR/link) visitor always
 *    renders MobileQRLayout, which bootstraps via useOrderingSession()
 *    (self-order/src/hooks/useOrderingSession.ts) — this needs a real QR
 *    session token resolved server-side.
 *  - self-order/src/layouts/MobileQRLayout.tsx: while `loading` it renders
 *    the text "Loading menu…"; if it ends up with `error && !context`
 *    (e.g. no/invalid token) it renders that error message centered on a
 *    blank screen; once a context resolves, the menu screen renders an
 *    <h1> ("Order for Pickup" / "Table {n}" / "Order") plus category tabs,
 *    a search bar, and a MenuGrid of ProductCards
 *    (self-order/src/layouts/shared/{CategoryTabs,SearchBar,MenuGrid,ProductCard}.tsx).
 *  - Cart flow: ProductCard -> addToCart -> CartPanel/CartPage
 *    (self-order/src/layouts/shared/CartPanel.tsx has real aria-labels,
 *    e.g. "Remove one {item}" / "Add one more {item}") -> CheckoutScreen.
 *
 * What this spec can and can't verify without a live seeded bench:
 *  - There is no way to reach the real menu without a valid QR/device
 *    session token minted by the backend (see useOrderingSession /
 *    _verify_qr_token in the Frappe app), so the "browse menu -> add to
 *    cart -> place order" golden path can't be driven end-to-end here.
 *    Hitting the bare app URL with no token is expected to land on the
 *    error branch of MobileQRLayout, not the menu — this spec asserts
 *    that the app shell mounts and shows *some* recognizable state
 *    (loading or error text), and leaves the real cart flow as a TODO.
 */

test.describe('Self-order app', () => {
  test('loads and renders a recognizable app shell', async ({ page }) => {
    await page.goto('/order/');

    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
  });

  // TODO(needs seeded bench + a real QR/device session token): once a
  // valid ordering session can be minted (e.g. by hitting the app with a
  // real ?token=... query param resolved server-side, or a provisioned
  // device credential), extend this to the full golden path:
  //   1. Wait for the menu screen: category tabs (CategoryTabs.tsx),
  //      SearchBar, and a grid of ProductCard tiles (MenuGrid.tsx) render.
  //   2. Click a ProductCard to add it to cart (or open ProductDetail if
  //      `product_detail_enabled` capability is on, then add from there).
  //   3. Open CartPage/CartPanel and verify the item + its aria-labelled
  //      +/- controls ("Remove one {item}" / "Add one more {item}").
  //   4. Proceed to CheckoutScreen and place the order, then assert
  //      OrderStatusScreen renders.
  test.skip('golden path: browse menu -> add to cart -> place order', async ({ page }) => {
    // Intentionally skipped — requires a seeded bench (menu items, a
    // valid QR/device session token). See TODO above for concrete steps
    // once that fixture exists.
  });
});
