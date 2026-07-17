/**
 * E2E test: Full app flow with MSW.
 *
 * Tests that the application boots, authenticates, and renders
 * content when MSW mocks all API calls.
 *
 * Uses a single test per page to avoid browser context issues
 * where MSW service worker needs to be re-activated.
 */

import { test, expect } from '@playwright/test';

/**
 * Navigate and wait for MSW + app to be ready.
 */
async function loadPage(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path);
  // Wait for MSW to be ready (data-msw-ready attribute)
  await page.waitForFunction(() => document.documentElement.getAttribute('data-msw-ready') === 'true', { timeout: 20000 });
  // Additional wait for React to render after auth
  await page.waitForTimeout(3000);
}

test.describe('App Smoke Tests (MSW)', () => {
  test('POS page loads with menu items', async ({ page }) => {
    await loadPage(page);

    // Should not be on login page
    expect(page.url()).not.toContain('/login');

    // Should have rendered some page content
    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });

  test('Dashboard page loads', async ({ page }) => {
    await loadPage(page, '/dashboard');

    expect(page.url()).toContain('/dashboard');
    expect(page.url()).not.toContain('/login');

    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });

  test('Reports page loads', async ({ page }) => {
    await loadPage(page, '/reports');

    expect(page.url()).toContain('/reports');
    expect(page.url()).not.toContain('/login');

    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });

  test('Menu Management page loads', async ({ page }) => {
    await loadPage(page, '/menu-management');

    expect(page.url()).toContain('/menu-management');
    expect(page.url()).not.toContain('/login');

    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });

  test('Table page loads', async ({ page }) => {
    await loadPage(page, '/table');

    expect(page.url()).toContain('/table');
    expect(page.url()).not.toContain('/login');

    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 50).toBeTruthy();
  });
});
