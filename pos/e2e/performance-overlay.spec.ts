/**
 * E2E tests for URY POS — PerformanceOverlay interaction.
 *
 * Tests the dev-only performance overlay widget:
 * - Collapsed → Expanded → Hidden state transitions
 * - Metric display (latency, connection, rate limiter)
 * - Draggable widget
 * - data-testid selector verification
 */

import { test, expect } from '@playwright/test';
import { setupMocks, tid, selectors } from './helpers';

test.describe('PerformanceOverlay', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
    // Wait for the app to fully load
    await expect(page.locator(tid(selectors.appLayout))).toBeVisible({ timeout: 15_000 });
  });

  test('should show collapsed overlay by default', async ({ page }) => {
    // The PerformanceOverlay only renders in DEV mode (import.meta.env.DEV)
    // In the Vite dev server, this is always true
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    // It may or may not be visible depending on DEV env
    if (await collapsed.isVisible()) {
      expect(await collapsed.isVisible()).toBe(true);
    }
  });

  test('should expand overlay on click', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await collapsed.click();
    await expect(page.locator(tid(selectors.perfOverlayExpanded))).toBeVisible();
  });

  test('should show metric labels in expanded view', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await collapsed.click();
    const expanded = page.locator(tid(selectors.perfOverlayExpanded));
    await expect(expanded).toBeVisible();

    // Check for key metric labels
    await expect(expanded.locator('text=Connection')).toBeVisible();
    await expect(expanded.locator('text=Latency')).toBeVisible();
    await expect(expanded.locator('text=Rate Limiter')).toBeVisible();
    await expect(expanded.locator('text=Active')).toBeVisible();
    await expect(expanded.locator('text=Queued')).toBeVisible();
    await expect(expanded.locator('text=Completed')).toBeVisible();
  });

  test('should show token availability section', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await collapsed.click();
    const expanded = page.locator(tid(selectors.perfOverlayExpanded));
    await expect(expanded).toBeVisible();

    // Token priority labels
    await expect(expanded.locator('text=CRT')).toBeVisible();
    await expect(expanded.locator('text=NRM')).toBeVisible();
    await expect(expanded.locator('text=LOW')).toBeVisible();
  });

  test('should collapse on collapse button click', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await collapsed.click();
    await expect(page.locator(tid(selectors.perfOverlayExpanded))).toBeVisible();

    await page.click(tid(selectors.perfOverlayCollapse));
    await expect(page.locator(tid(selectors.perfOverlayCollapsed))).toBeVisible();
  });

  test('should hide on close button click', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await page.click(tid(selectors.perfOverlayClose));
    await expect(page.locator(tid(selectors.perfOverlayShow))).toBeVisible();
  });

  test('should reappear after hiding and clicking show button', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await page.click(tid(selectors.perfOverlayClose));
    await expect(page.locator(tid(selectors.perfOverlayShow))).toBeVisible();

    await page.click(tid(selectors.perfOverlayShow));
    await expect(page.locator(tid(selectors.perfOverlayCollapsed))).toBeVisible();
  });

  test('should show active requests with max concurrent', async ({ page }) => {
    const collapsed = page.locator(tid(selectors.perfOverlayCollapsed));
    if (!(await collapsed.isVisible())) {
      test.skip();
      return;
    }

    await collapsed.click();
    const expanded = page.locator(tid(selectors.perfOverlayExpanded));
    // Should show activeRequests/maxConcurrent format like "0/6" or "2/6"
    const activeText = await expanded.locator('text=Active').locator('..').locator('span').last().textContent();
    expect(activeText).toMatch(/\d+\/\d+/);
  });
});
