import { expect, test } from '@playwright/test';

test.describe('Application Health Check', () => {
  test('should load the homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Check that the page loads successfully
    await expect(page).toHaveTitle(/.*/, { timeout: 10000 });

    // Check that the page is not showing an error
    const errorElements = page.locator('text=Error');
    await expect(errorElements).toHaveCount(0);

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'test-results/homepage.png' });
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check if there are any navigation elements
    const navElements = page.locator('nav, [role="navigation"]');
    const navCount = await navElements.count();

    if (navCount > 0) {
      // If navigation exists, it should be visible
      await expect(navElements.first()).toBeVisible();
    }

    console.log(`Found ${navCount} navigation elements`);
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    // Navigate to a non-existent page
    const response = await page.goto('/non-existent-page');

    // Should return 404 status
    expect(response?.status()).toBe(404);

    // Page should still render something (not completely broken)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText?.length).toBeGreaterThan(0);
  });
});

test.describe('API Health Check', () => {
  test('should have working health endpoint', async ({ request }) => {
    // Test the API health endpoint
    const response = await request.get('/api/health');

    // Should return 200 status
    expect(response.status()).toBe(200);

    // Should return JSON response
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');

    // Should have basic health check structure
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
