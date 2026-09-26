import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Golden-path spec for the captain/cashier POS app (pos/), driven against
 * fixtures resolved and idempotently ensured by fixtures/global-setup.ts
 * (e2e/.cache/fixtures.json) rather than the hardcoded test@erpnext.com /
 * testpass123 login used by earlier rounds of this spec.
 *
 * Real routes/selectors below come from reading the source, not guesses:
 *  - App shell + routing: pos/src/App.tsx — Router basename "/pos", plus a
 *    sibling Captain "Order" module at "/order" (CaptainTables) and
 *    "/order/table/:table" (CaptainOrder), guarded by AuthGuard /
 *    CaptainRouteGuard. Cashier billing lives at "/orders" (Orders.tsx).
 *  - pos/src/captain/pages/CaptainTables.tsx renders an <h1>Tables</h1>
 *    heading and a "Refresh" button; CaptainTableCard.tsx renders a
 *    `<button type="button">` per table with a "Free"/"Occupied" badge.
 *  - pos/src/captain/pages/CaptainOrder.tsx: CustomerSelect must be filled
 *    before Send Order will succeed (sync_order requires `customer`
 *    server-side); "Print bill" (CaptainActionsMenu.tsx, behind the "More
 *    actions" overflow button) sets invoice_printed, which Orders.tsx's
 *    Payment button requires before it will open PaymentDialog.
 *  - pos/src/components/PaymentDialog.tsx: one amount `<input>` per
 *    configured payment mode (label rendered as plain text next to it,
 *    not an accessible <label>), "Pay {amount}" submit button.
 */

interface Fixtures {
  baseURL: string;
  branch: string;
  posProfile: string;
  company: string;
  captainUser: string;
  captainPassword: string;
  menuItem: { item: string; itemName: string; rate: number };
  modeOfPayment: string;
  customerName: string;
}

const fixtures: Fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '.cache', 'fixtures.json'), 'utf8')
);

/**
 * Minimal REST helper (Administrator session) for asserting real backend
 * state from outside the UI — e.g. "a URY KOT actually exists for this
 * invoice" and "the POS Invoice actually submitted and is Paid" — rather
 * than trusting the UI's own success toast.
 */
async function adminApi(request: APIRequestContext): Promise<{
  get: (path: string) => Promise<any>;
}> {
  const adminUser = process.env.URY_E2E_ADMIN_USER!;
  const adminPassword = process.env.URY_E2E_ADMIN_PASSWORD!;
  const loginRes = await request.post(`${fixtures.baseURL}/api/method/login`, {
    form: { usr: adminUser, pwd: adminPassword },
  });
  expect(loginRes.ok(), `admin REST login failed: ${await loginRes.text()}`).toBeTruthy();

  return {
    get: async (p: string) => {
      const res = await request.get(`${fixtures.baseURL}${p}`);
      expect(res.ok(), `GET ${p} failed: ${await res.text()}`).toBeTruthy();
      return res.json();
    },
  };
}

async function getListViaAdmin(request: APIRequestContext, doctype: string, filters: unknown[], fields: string[]) {
  const api = await adminApi(request);
  const qs = new URLSearchParams({
    doctype,
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: '0',
  });
  const json = await api.get(`/api/method/frappe.client.get_list?${qs.toString()}`);
  return json.message as any[];
}

async function getDocViaAdmin(request: APIRequestContext, doctype: string, name: string) {
  const api = await adminApi(request);
  const json = await api.get(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return json.data;
}

async function loginAsCaptain(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login_email', fixtures.captainUser);
  await page.fill('#login_password', fixtures.captainPassword);
  await page.click('.btn-login');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

async function openAFreeTable(page: import('@playwright/test').Page) {
  await page.goto('/pos/order');
  await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible({ timeout: 15000 });

  const freeTable = page.locator('button[type="button"]').filter({ hasText: 'Free' }).first();
  await expect(freeTable).toBeVisible({ timeout: 10000 });
  // CaptainTableCard.tsx puts the table's real name on an inner <span
  // title="...">, not on the <button> itself.
  const tableName = await freeTable.locator('span[title]').first().getAttribute('title');
  await freeTable.click();
  await expect(page).toHaveURL(/\/pos\/order\/table\//, { timeout: 10000 });
  return tableName;
}

test.describe('POS app', () => {
  test('loads and renders a recognizable app shell', async ({ page }) => {
    await page.goto('/pos/order');

    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
  });

  test('captain golden path: login -> tables list -> open a table', async ({ page }) => {
    await loginAsCaptain(page);
    await openAFreeTable(page);
  });

  // Real selectors confirmed by driving a live bench through Playwright and
  // dumping the actual rendered DOM (not guessed from source alone):
  //  1. CaptainOrder.tsx's mobile Menu/Order toggle (~L566-588) is wrapped
  //     `lg:hidden` — Playwright's default 1280x720 viewport is above the
  //     `lg` breakpoint, so this spec uses a phone-sized viewport (390x844)
  //     up front, matching how a real captain actually uses this app.
  //  2. The fixture menu item's name is unique (fixtures/global-setup.ts
  //     ensures exactly one Item named "E2E Captain Test Item" priced on
  //     the POS Profile's price list), so — unlike the old "Appam" seed
  //     data — a plain text locator with `.first()` isn't papering over a
  //     duplicate-seed-data smell; it's just defensive.
  test('captain golden path: add an item to the cart', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsCaptain(page);
    await openAFreeTable(page);

    const menuItem = page.getByText(fixtures.menuItem.itemName, { exact: true }).first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();

    const orderTabButton = page.getByRole('button', { name: /^Order/ });
    await expect(orderTabButton).toBeVisible({ timeout: 5000 });
    await expect(orderTabButton).toContainText('1', { timeout: 5000 });
    await orderTabButton.click();

    await expect(page.getByRole('heading', { name: 'New / Changed' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(`+1 × ${fixtures.menuItem.itemName}`).first()).toBeVisible({ timeout: 5000 });
  });

  // Full golden path: add item -> select customer -> send KOT (verified via
  // REST that a real URY KOT now exists) -> print bill -> cashier payment
  // (verified via REST that the POS Invoice is submitted and Paid).
  test('captain golden path: send KOT -> print bill -> cashier payment', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsCaptain(page);
    const tableName = await openAFreeTable(page);
    expect(tableName).toBeTruthy();

    // Add one item.
    const menuItem = page.getByText(fixtures.menuItem.itemName, { exact: true }).first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();

    const orderTabButton = page.getByRole('button', { name: /^Order/ });
    await expect(orderTabButton).toBeVisible({ timeout: 5000 });
    await orderTabButton.click();

    // sync_order requires a customer server-side — CustomerSelect renders
    // CustomerPicker (packages/ui/src/components/customer-picker.tsx): a
    // search <input type="search">, debounced 300ms, whose matching result
    // renders as a <button> containing the customer's name.
    const customerSearch = page.locator('input[type="search"]').first();
    await expect(customerSearch).toBeVisible({ timeout: 10000 });
    await customerSearch.fill(fixtures.customerName);
    const customerResult = page.getByRole('button', { name: new RegExp(fixtures.customerName) }).first();
    await expect(customerResult).toBeVisible({ timeout: 5000 });
    await customerResult.click();

    // Send Order -> real sync_order call.
    const sendButton = page.getByRole('button', { name: /^Send Order$/ }).first();
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.click();

    // Wait for the send to settle. On success, sync_order clears
    // activeOrders and CaptainOrder re-renders without a "Send Order"
    // button at all (no more unsent lines) — so the button disappearing is
    // itself the success signal. On failure the app surfaces a toast
    // instead (e.g. the real "Please select a customer..." guard), which
    // gives a much clearer failure signal than only the REST assertion
    // below, so check for it if the button is still there.
    const errorToast = page.getByText('Please select a customer before sending the order.');
    await expect(sendButton).toBeHidden({ timeout: 15000 }).catch(async () => {
      await expect(errorToast).not.toBeVisible();
      throw new Error('Send Order button never disappeared after clicking it, and no known error toast appeared.');
    });

    // Real backend assertion: a URY KOT now exists for this table's
    // invoice (not just a UI success toast). CaptainOrder navigates back
    // to a synced state; resolve the invoice for this table via REST.
    await expect(async () => {
      const invoices = await getListViaAdmin(
        request,
        'POS Invoice',
        [
          ['restaurant_table', '=', tableName],
          ['docstatus', '=', 0],
        ],
        ['name']
      );
      expect(invoices.length).toBeGreaterThan(0);
      const kots = await getListViaAdmin(request, 'URY KOT', [['invoice', '=', invoices[0].name]], ['name']);
      expect(kots.length).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    const [invoice] = await getListViaAdmin(
      request,
      'POS Invoice',
      [
        ['restaurant_table', '=', tableName],
        ['docstatus', '=', 0],
      ],
      ['name']
    );

    // A successful send navigates CaptainOrder back to CaptainTables (the
    // table tile now reads "Mine" with a real total, confirmed live) —
    // re-enter the table's order screen to reach the print-bill action.
    await page.goto('/pos/order');
    await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible({ timeout: 15000 });
    const myTable = page.locator('button[type="button"]').filter({ hasText: 'Mine' }).first();
    await expect(myTable).toBeVisible({ timeout: 10000 });
    await myTable.click();
    await expect(page).toHaveURL(/\/pos\/order\/table\//, { timeout: 10000 });

    // Print bill (CaptainActionsMenu, behind the "More actions" overflow
    // button) — Orders.tsx's Payment button refuses to open until
    // invoice_printed is set, exactly like a real cashier would only be
    // able to bill a printed order.
    const moreActions = page.getByRole('button', { name: 'More actions' }).first();
    await expect(moreActions).toBeVisible({ timeout: 10000 });
    await moreActions.click();
    const printBill = page.getByRole('button', { name: 'Print bill' });
    await expect(printBill).toBeVisible({ timeout: 5000 });
    await printBill.click();
    await expect(page.getByText('Printed successfully.')).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      const printed = await getDocViaAdmin(request, 'POS Invoice', invoice.name);
      expect(Number(printed.invoice_printed)).toBe(1);
    }).toPass({ timeout: 10000 });

    // Cashier-side payment: /pos/orders (Orders.tsx) lists this same
    // invoice as a card; open it and pay the full amount in the fixture's
    // configured mode of payment.
    // Orders.tsx (cashier billing) is a desktop-oriented back-office
    // layout, not the captain's mobile one — its order cards render at
    // zero visible size in the 390x844 viewport used for the captain
    // steps above, so switch back to a desktop-sized viewport here.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/orders');
    const orderCard = page.getByText(invoice.name, { exact: true }).first();
    await expect(orderCard).toBeVisible({ timeout: 15000 });
    await orderCard.click();

    const paymentButton = page.getByRole('button', { name: 'Payment' });
    await expect(paymentButton).toBeVisible({ timeout: 10000 });
    await paymentButton.click();

    // PaymentDialog renders one amount <input> per configured payment
    // mode, with the mode's name as a plain sibling <span> (no
    // accessible <label> association) — locate the row by that text and
    // fill its own input.
    const modeRow = page.locator('div', { hasText: fixtures.modeOfPayment }).filter({ has: page.locator('input') }).last();
    const amountInput = modeRow.locator('input').first();
    await expect(amountInput).toBeVisible({ timeout: 10000 });
    await amountInput.fill(String(fixtures.menuItem.rate));

    const payButton = page.getByRole('button', { name: /^Pay ₹/ });
    await expect(payButton).toBeEnabled({ timeout: 5000 });
    await payButton.click();

    // Real backend assertion: the POS Invoice actually submitted
    // (docstatus 1) and its status reflects a completed payment, not just
    // a UI success toast.
    await expect(async () => {
      const paid = await getDocViaAdmin(request, 'POS Invoice', invoice.name);
      expect(Number(paid.docstatus)).toBe(1);
      expect(['Paid', 'Consolidated']).toContain(paid.status);
    }).toPass({ timeout: 20000 });
  });
});
