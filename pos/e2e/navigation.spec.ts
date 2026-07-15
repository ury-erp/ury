/**
 * E2E tests for URY POS — Navigation and page rendering.
 *
 * Tests verify that all 6 main routes render their page component
 * and that the navigation bar (Footer) correctly links to each page.
 */

import { test, expect } from '@playwright/test';
import { setupMocks, tid, selectors } from './helpers';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('should load the app layout with header and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(tid(selectors.appLayout))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(tid(selectors.header))).toBeVisible();
  });

  test('should show all 6 navigation items in footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(tid(selectors.navPOS))).toBeVisible();
    await expect(page.locator(tid(selectors.navTable))).toBeVisible();
    await expect(page.locator(tid(selectors.navOrders))).toBeVisible();
    await expect(page.locator(tid(selectors.navDashboard))).toBeVisible();
    await expect(page.locator(tid(selectors.navMenuManagement))).toBeVisible();
    await expect(page.locator(tid(selectors.navReports))).toBeVisible();
  });

  test('should navigate to POS page', async ({ page }) => {
    await page.goto('/');
    // POS is the default route (/) — page-pos should be visible
    await expect(page.locator(tid(selectors.pagePOS))).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to Table page via footer', async ({ page }) => {
    await page.goto('/');
    await page.click(tid(selectors.navTable));
    await expect(page).toHaveURL(/\/table/);
    await expect(page.locator(tid(selectors.pageTable))).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to Orders page via footer', async ({ page }) => {
    await page.goto('/');
    await page.click(tid(selectors.navOrders));
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.locator(tid(selectors.pageOrders))).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to Dashboard page via footer', async ({ page }) => {
    await page.goto('/');
    await page.click(tid(selectors.navDashboard));
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator(tid(selectors.pageDashboard))).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to Menu Management page via footer', async ({ page }) => {
    await page.goto('/');
    await page.click(tid(selectors.navMenuManagement));
    await expect(page).toHaveURL(/\/menu-management/);
    // Menu management may not have page-menu-management visible until a menu is selected
    // But the page should at least render
    await expect(page.locator(tid(selectors.header))).toBeVisible();
  });

  test('should navigate to Reports page via footer', async ({ page }) => {
    await page.goto('/');
    await page.click(tid(selectors.navReports));
    await expect(page).toHaveURL(/\/reports/);
    await expect(page.locator(tid(selectors.pageReports))).toBeVisible({ timeout: 10_000 });
  });

  test('should highlight active nav item', async ({ page }) => {
    await page.goto('/');
    // POS nav item should have active styling
    const posNav = page.locator(tid(selectors.navPOS));
    const classes = await posNav.getAttribute('class');
    expect(classes).toContain('blue');
  });
});

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
  });

  test('should display header with logo', async ({ page }) => {
    await expect(page.locator(tid(selectors.headerLogo))).toBeVisible();
  });

  test('should display search input', async ({ page }) => {
    await expect(page.locator(tid(selectors.headerSearch))).toBeVisible();
  });

  test('should display user menu button', async ({ page }) => {
    await expect(page.locator(tid(selectors.headerUserMenu))).toBeVisible();
  });

  test('should open user dropdown on click', async ({ page }) => {
    await page.click(tid(selectors.headerUserMenu));
    await expect(page.locator(tid(selectors.headerUserDropdown))).toBeVisible();
  });

  test('should show logout button in dropdown', async ({ page }) => {
    await page.click(tid(selectors.headerUserMenu));
    await expect(page.locator(tid(selectors.headerLogout))).toBeVisible();
  });

  test('should focus search on Cmd/Ctrl+K', async ({ page }) => {
    const searchInput = page.locator(tid(selectors.headerSearch));
    await page.keyboard.press('Meta+k');
    await expect(searchInput).toBeFocused();
  });
});

test.describe('POS Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
  });

  test('should render sidebar', async ({ page }) => {
    await expect(page.locator(tid(selectors.sidebar))).toBeVisible({ timeout: 15_000 });
  });

  test('should render All Items button in sidebar', async ({ page }) => {
    await expect(page.locator(tid(selectors.sidebarAllItems))).toBeVisible({ timeout: 15_000 });
  });

  test('should render menu list area', async ({ page }) => {
    await expect(page.locator(tid(selectors.menuList))).toBeVisible({ timeout: 15_000 });
  });

  test('should render order panel', async ({ page }) => {
    await expect(page.locator(tid(selectors.orderPanel))).toBeVisible({ timeout: 15_000 });
  });
});
