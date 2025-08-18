import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup for E2E tests...');

  // Start browser for setup
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for the application to be ready
    console.log('⏳ Waiting for application to be ready...');
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:3000');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check if the application is responding
    const title = await page.title();
    console.log(`✅ Application is ready. Page title: ${title}`);

    // Setup test data if needed
    console.log('📝 Setting up test data...');

    // You can add database seeding or other setup tasks here
    // For example:
    // await setupTestDatabase();
    // await createTestUsers();

    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
