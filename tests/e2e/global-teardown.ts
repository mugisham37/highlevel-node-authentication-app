import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown for E2E tests...');

  try {
    // Cleanup test data if needed
    console.log('🗑️ Cleaning up test data...');

    // You can add cleanup tasks here
    // For example:
    // await cleanupTestDatabase();
    // await removeTestFiles();

    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;
