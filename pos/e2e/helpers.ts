/**
 * Shared E2E test utilities and custom Playwright fixtures for URY POS.
 *
 * Provides:
 * - API mocking helpers (setupMocks, mockFrappeAuth, mockFrappeAPI)
 * - Navigation helpers
 * - Common selectors via data-testid
 */

import { type Page, type Route, expect } from '@playwright/test';

// ── Frappe Boot Mock ─────────────────────────────────────────────

const MOCK_BOOT = {
  lang: 'en',
  user: {
    name: 'Administrator',
    full_name: 'Administrator',
    user_image: '',
    roles: [{ role: 'Administrator' }, { role: 'Cashier' }],
  },
  csrf_token: 'test-csrf-token',
  session: { user: 'Administrator' },
  sysdefaults: { currency: 'EUR', country: 'Slovenia' },
  defaults: {},
  roles: ['Administrator', 'Cashier'],
  modules: {},
  user_perms: [],
  desk_page: null,
};

/**
 * Full mock setup: inject frappe.boot + mock all API endpoints.
 *
 * The HTML template contains Jinja syntax like
 * `frappe.boot = JSON.parse({{ boot }})` which is invalid JS
 * when served by Vite dev server (no Jinja interpolation).
 *
 * We fix this by:
 * 1. Using evaluateOnNewDocument to set up window.frappe BEFORE any script runs
 * 2. Overriding JSON.parse so the Jinja template doesn't crash
 * 3. Mocking all API endpoints so the app doesn't need a real backend
 */
export async function setupMocks(page: Page) {
  // Step 1: Inject frappe.boot and fix Jinja template issue
  // The HTML template contains `frappe.boot = JSON.parse({{ boot }})` which is invalid JS.
  // We use addInitScript to run code BEFORE any page script executes.
  // Our script defines window.frappe and patches JSON.parse to handle the invalid template.
  await page.addInitScript((boot) => {
    // Set up frappe object before any script runs
    (window as any).frappe = {
      boot: boot,
      csrf_token: boot.csrf_token,
      user: boot.user,
      session: boot.session,
      call: () => Promise.resolve({ message: {} }),
      db: {
        getDocList: () => Promise.resolve([]),
        getDoc: () => Promise.resolve({}),
        getValue: () => Promise.resolve(''),
        getCount: () => Promise.resolve(0),
      },
      auth: { logged_in: true },
    };

    // Patch JSON.parse to handle the Jinja template `JSON.parse({{ boot }})`
    // When it encounters invalid input, return the boot data instead
    const _originalParse = JSON.parse;
    (window as any).JSON.parse = function(text: any) {
      if (typeof text !== 'string') {
        return boot; // {{ boot }} is not interpolated, so it's not a string
      }
      try {
        return _originalParse.call(JSON, text);
      } catch {
        return boot;
      }
    };
  }, MOCK_BOOT);

  // Step 2: Mock API endpoints
  await mockFrappeAuth(page);
  await mockFrappeAPI(page);
}

// ── API Mocking ──────────────────────────────────────────────────

export async function mockFrappeAuth(page: Page) {
  await page.route('**/api/method/frappe.auth.get_logged_user', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Administrator' }),
    });
  });

  await page.route('**/api/resource/User/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          name: 'Administrator',
          full_name: 'Administrator',
          user_image: '',
          roles: [{ role: 'Administrator' }, { role: 'Cashier' }],
        },
      }),
    });
  });

  await page.route('**/api/resource/POS+Profile**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          name: 'TEST-POS-PROFILE',
          role_allowed_for_billing: [
            { role: 'Administrator' },
            { role: 'Cashier' },
          ],
        }],
      }),
    });
  });

  await page.route('**/api/method/ury.ury.api.open_pos**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: { name: 'POS-OPENING-001' } }),
    });
  });

  await page.route('**/api/method/ury.ury.api.get_pos_profile_data**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: {
          pos_profile: {
            name: 'TEST-POS',
            company: 'Test Company',
            currency: 'EUR',
            write_off_account: '',
            write_off_cost_center: '',
            expenses_included_in_valuation: [],
            selected_applicable_for_discount: '',
          },
          pos_opening_shift: { name: 'SHIFT-001' },
          items: [
            {
              name: 'ITEM-001',
              item_code: 'TEST-PIZZA',
              item_name: 'Test Pizza',
              rate: 12.50,
              price_list_rate: 12.50,
              course: 'Main Course',
              image: '',
              stock_uom: 'Nos',
              in_stock: true,
              is_available: true,
              has_batch_no: false,
              has_serial_no: false,
              has_expiry_date: false,
            },
            {
              name: 'ITEM-002',
              item_code: 'TEST-COLA',
              item_name: 'Test Cola',
              rate: 3.00,
              price_list_rate: 3.00,
              course: 'Beverages',
              image: '',
              stock_uom: 'Nos',
              in_stock: true,
              is_available: true,
              has_batch_no: false,
              has_serial_no: false,
              has_expiry_date: false,
            },
          ],
          customer_groups: [{ name: 'All Customer Groups', customer_group_name: 'All Customer Groups' }],
          territories: [{ name: 'All Territories', territory_name: 'All Territories' }],
          pos_config: {},
        },
      }),
    });
  });

  // Mock getPosProfile (ury.ury_pos.api.getPosProfile) — used by app-slice
  await page.route('**/api/method/ury.ury_pos.api.getPosProfile**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: {
          name: 'TEST-POS',
          company: 'Test Company',
          currency: 'EUR',
          write_off_account: '',
          write_off_cost_center: '',
          expenses_included_in_valuation: [],
          selected_applicable_for_discount: '',
          role_allowed_for_billing: [
            { role: 'Administrator' },
            { role: 'Cashier' },
          ],
        },
      }),
    });
  });

  // Mock menu courses
  await page.route('**/api/method/ury.ury_pos.api.getMenuCourses**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: [
          { name: 'Main Course', label: 'Main Course' },
          { name: 'Beverages', label: 'Beverages' },
        ],
      }),
    });
  });

  // Mock currency
  await page.route('**/api/resource/Currency/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { name: 'EUR', currency_name: 'EUR', symbol: '€' },
      }),
    });
  });

  await page.route('**/api/method/ury.ury.api.get_dashboard_summary**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: {
          total_revenue: 1250.00,
          total_orders: 45,
          avg_order_value: 27.78,
          items_sold: 120,
        },
      }),
    });
  });

  await page.route('**/api/method/ury.ury.api.get_report_data**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: { data: [], summary: {} } }),
    });
  });

  // Mock POS opening check — return 1 (already opened, skip opening dialog)
  await page.route('**/api/method/ury.ury_pos.api.posOpening**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 1 }),
    });
  });

  // Mock payment modes — must return array
  await page.route('**/api/method/ury.ury_pos.api.getModeOfPayment**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: [
          { mode_of_payment: 'Cash', opening_amount: 0 },
          { mode_of_payment: 'Card', opening_amount: 0 },
        ],
      }),
    });
  });

  // Mock POS close validation
  await page.route('**/api/method/ury.ury_pos.api.validate_pos_close**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Validated' }),
    });
  });
}

export async function mockFrappeAPI(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = route.request().url();

    if (
      url.includes('frappe.auth') ||
      url.includes('POS+Profile') ||
      url.includes('open_pos') ||
      url.includes('get_pos_profile_data') ||
      url.includes('getPosProfile') ||
      url.includes('getMenuCourses') ||
      url.includes('Currency/') ||
      url.includes('get_dashboard_summary') ||
      url.includes('get_report_data') ||
      url.includes('User/') ||
      url.includes('posOpening') ||
      url.includes('getModeOfPayment') ||
      url.includes('validate_pos_close')
    ) {
      return;
    }

    // For method calls, return message as empty array (many endpoints expect arrays)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], message: [] }),
    });
  });
}

// ── Selectors ────────────────────────────────────────────────────

export const selectors = {
  appLayout: 'app-layout',
  header: 'header',
  headerLogo: 'header-logo',
  headerSearch: 'header-search',
  headerUserMenu: 'header-user-menu',
  headerUserDropdown: 'header-user-dropdown',
  headerLogout: 'header-logout',

  navPOS: 'nav-pos',
  navTable: 'nav-table',
  navOrders: 'nav-orders',
  navDashboard: 'nav-dashboard',
  navMenuManagement: 'nav-menu-management',
  navReports: 'nav-reports',

  pagePOS: 'page-pos',
  pageOrders: 'page-orders',
  pageTable: 'page-table',
  pageDashboard: 'page-dashboard',
  pageMenuManagement: 'page-menu-management',
  pageReports: 'page-reports',

  sidebar: 'sidebar',
  sidebarAllItems: 'sidebar-all-items',
  menuList: 'menu-list',
  orderPanel: 'order-panel',

  perfOverlayCollapsed: 'perf-overlay-collapsed',
  perfOverlayExpanded: 'perf-overlay-expanded',
  perfOverlayShow: 'perf-overlay-show',
  perfOverlayClose: 'perf-overlay-close',
  perfOverlayCollapse: 'perf-overlay-collapse',
  perfOverlayCloseExpanded: 'perf-overlay-close-expanded',
} as const;

export function tid(id: string): string {
  return `[data-testid="${id}"]`;
}
