const DetoxCircusEnvironment = require('detox/runners/jest-circus/environment');

class CustomDetoxEnvironment extends DetoxCircusEnvironment {
  constructor(config, context) {
    super(config, context);

    // Initialize the environment
    this.initTimeout = 300000; // 5 minutes
  }

  async setup() {
    console.log('🚀 Setting up mobile test environment...');
    await super.setup();
    console.log('✅ Mobile test environment ready');
  }

  async teardown() {
    console.log('🧹 Tearing down mobile test environment...');
    await super.teardown();
    console.log('✅ Mobile test environment cleaned up');
  }
}

module.exports = CustomDetoxEnvironment;
