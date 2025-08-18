const detox = require('detox');

// Global setup for mobile tests
beforeAll(async () => {
  console.log('🔧 Setting up Detox...');
  await detox.init();
  console.log('✅ Detox initialized');
}, 300000);

beforeEach(async () => {
  // Reload the app before each test
  await device.reloadReactNative();
});

afterAll(async () => {
  console.log('🧹 Cleaning up Detox...');
  await detox.cleanup();
  console.log('✅ Detox cleaned up');
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase timeout for mobile tests
jest.setTimeout(120000);
