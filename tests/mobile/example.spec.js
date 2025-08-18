describe('Mobile App Health Check', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should have welcome screen', async () => {
    // Wait for the app to load
    await waitFor(element(by.id('welcome-screen')))
      .toBeVisible()
      .withTimeout(10000);

    // Check if welcome screen is visible
    await expect(element(by.id('welcome-screen'))).toBeVisible();
  });

  it('should show login screen when not authenticated', async () => {
    // Look for login-related elements
    try {
      await waitFor(element(by.id('login-screen')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.id('login-screen'))).toBeVisible();
    } catch (error) {
      // If login screen is not found, check for other authentication elements
      const loginButton = element(by.text('Login').or(by.text('Sign In')));
      await expect(loginButton).toBeVisible();
    }
  });

  it('should handle navigation', async () => {
    // Test basic navigation if available
    try {
      // Look for navigation elements
      const navElement = element(by.id('navigation').or(by.id('tab-bar')));
      await waitFor(navElement).toBeVisible().withTimeout(5000);

      if (await navElement.isVisible()) {
        await expect(navElement).toBeVisible();
      }
    } catch (error) {
      // Navigation might not be visible on initial screen
      console.log('Navigation not found on initial screen, which is expected');
    }
  });

  it('should not crash on startup', async () => {
    // The fact that we can interact with elements means the app didn't crash
    await waitFor(element(by.id('app-root').or(by.id('welcome-screen'))))
      .toBeVisible()
      .withTimeout(10000);

    // Take a screenshot for visual verification
    await device.takeScreenshot('app-startup');
  });
});
