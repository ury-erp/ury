/**
 * E2E tests for URY POS — Dashboard and Reports pages.
 *
 * Tests page rendering, key UI elements, period selection,
 * and report type switching.
 */

import { test, expect } from '@playwright/test';
import { setupMocks, tid, selectors } from './helpers';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('should render dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator(tid(selectors.pageDashboard))).toBeVisible({ timeout: 15_000 });
  });

  test('should display dashboard title', async ({ page }) => {
    await page.goto('/dashboard');
    // The dashboard title should be visible
    const title = page.locator('text=Dashboard').first();
    await expect(title).toBeVisible({ timeout: 15_000 });
  });

  test('should have period selector', async ({ page }) => {
    await page.goto('/dashboard');
    // Look for period-related text like "Today" or period buttons
    const periodSelector = page.locator('text=Today').first();
    await expect(periodSelector).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('should render reports page', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.locator(tid(selectors.pageReports))).toBeVisible({ timeout: 15_000 });
  });

  test('should display reports title', async ({ page }) => {
    await page.goto('/reports');
    const title = page.locator('text=Report').first();
    await expect(title).toBeVisible({ timeout: 15_000 });
  });

  test('should show report type tabs', async ({ page }) => {
    await page.goto('/reports');
    // Sales tab should be visible
    const salesTab = page.locator('text=Sales').first();
    await expect(salesTab).toBeVisible({ timeout: 15_000 });
  });
});
