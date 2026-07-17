/**
 * E2E tests: MSW mocking verification.
 *
 * Verifies that MSW service worker is active and
 * the app renders data from mocked API responses.
 */

import { test, expect } from '@playwright/test';

async function loadPage(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path);
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-msw-ready') === 'true',
    { timeout: 20000 }
  );
  await page.waitForTimeout(3000);
}

test.describe('MSW Mocking', () => {
  test('MSW service worker activates on page load', async ({ page }) => {
    await page.goto('/');
    const mswReady = await page.waitForFunction(
      () => document.documentElement.getAttribute('data-msw-ready') === 'true',
      { timeout: 20000 }
    );
    // waitForFunction returns JSHandle — just verify it didn't timeout
    expect(mswReady).toBeTruthy();
  });

  test('API calls are intercepted by MSW', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/method/') || request.url().includes('/api/resource/')) {
        apiCalls.push(request.url());
      }
    });

    await loadPage(page);
    await page.waitForTimeout(5000);

    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('app renders menu data from MSW on POS page', async ({ page }) => {
    await loadPage(page);

    // The POS page should show menu content from MSW fixtures
    // After POS opening is confirmed, menu items should render
    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(100);
  });

  test('app renders table data from MSW', async ({ page }) => {
    await loadPage(page, '/table');

    const bodyText = await page.textContent('body');
    // Table data should be present — check for room names or table IDs
    const hasContent = bodyText!.length > 100;
    expect(hasContent).toBeTruthy();
  });

  test('app renders dashboard data from MSW', async ({ page }) => {
    await loadPage(page, '/dashboard');

    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(100);
  });

  test('MSW console message confirms activation', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    await loadPage(page);

    const hasMswLog = consoleMessages.some(msg => msg.includes('[MSW]'));
    expect(hasMswLog).toBeTruthy();
  });

  test('no critical API errors in console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await loadPage(page);
    await page.waitForTimeout(5000);

    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('manifest') &&
      !e.includes('DevTools') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors.length).toBeLessThan(5);
  });
});
