import { beforeEach, describe, expect, it } from 'vitest';
import { FeatureFlag, FeatureFlagManager } from '../features/feature-flags';

describe('FeatureFlagManager', () => {
  let manager: FeatureFlagManager;

  beforeEach(() => {
    manager = new FeatureFlagManager();
  });

  it('should initialize with default flags', () => {
    const flags = manager.getAllFlags();
    expect(flags.length).toBeGreaterThan(0);
    
    // Check for some expected default flags
    expect(manager.getFlag('registration')).toBeDefined();
    expect(manager.getFlag('mfa')).toBeDefined();
    expect(manager.getFlag('oauth')).toBeDefined();
  });

  it('should check if flag is enabled', () => {
    // Test with a flag that should be enabled by default
    expect(manager.isEnabled('registration')).toBe(true);
    
    // Test with a non-existent flag
    expect(manager.isEnabled('non-existent')).toBe(false);
  });

  it('should set and get flags', () => {
    const testFlag: FeatureFlag = {
      name: 'test-feature',
      enabled: true,
      description: 'Test feature flag',
    };

    manager.setFlag('test-feature', testFlag);
    const retrievedFlag = manager.getFlag('test-feature');
    
    expect(retrievedFlag).toEqual(testFlag);
    expect(manager.isEnabled('test-feature')).toBe(true);
  });

  it('should update existing flags', () => {
    const originalFlag = manager.getFlag('registration');
    expect(originalFlag).toBeDefined();

    const success = manager.updateFlag('registration', { enabled: false });
    expect(success).toBe(true);
    expect(manager.isEnabled('registration')).toBe(false);
  });

  it('should handle rollout percentage', () => {
    const testFlag: FeatureFlag = {
      name: 'rollout-test',
      enabled: true,
      rolloutPercentage: 0, // 0% rollout
    };

    manager.setFlag('rollout-test', testFlag);
    
    // With 0% rollout, should always be false
    expect(manager.isEnabled('rollout-test')).toBe(false);
    
    // Update to 100% rollout
    manager.updateFlag('rollout-test', { rolloutPercentage: 100 });
    expect(manager.isEnabled('rollout-test')).toBe(true);
  });

  it('should evaluate conditions', () => {
    const testFlag: FeatureFlag = {
      name: 'conditional-test',
      enabled: true,
      conditions: [
        {
          type: 'environment',
          operator: 'equals',
          value: 'development',
        },
      ],
    };

    manager.setFlag('conditional-test', testFlag);
    
    // Should be enabled in development environment
    expect(manager.isEnabled('conditional-test')).toBe(true);
  });

  it('should remove flags', () => {
    manager.setFlag('temp-flag', {
      name: 'temp-flag',
      enabled: true,
    });

    expect(manager.getFlag('temp-flag')).toBeDefined();
    
    const removed = manager.removeFlag('temp-flag');
    expect(removed).toBe(true);
    expect(manager.getFlag('temp-flag')).toBeUndefined();
  });

  it('should provide utility methods', () => {
    expect(typeof manager.isRegistrationEnabled()).toBe('boolean');
    expect(typeof manager.isMfaEnabled()).toBe('boolean');
    expect(typeof manager.isOAuthEnabled()).toBe('boolean');
    expect(typeof manager.isPasswordResetEnabled()).toBe('boolean');
  });

  it('should handle complex conditions', () => {
    const testFlag: FeatureFlag = {
      name: 'complex-test',
      enabled: true,
      conditions: [
        {
          type: 'user',
          operator: 'in',
          value: ['admin', 'beta-tester'],
        },
      ],
    };

    manager.setFlag('complex-test', testFlag);
    
    // Test with admin user
    const adminContext = { user: 'admin' };
    expect(manager.isEnabled('complex-test', adminContext)).toBe(true);
    
    // Test with regular user
    const userContext = { user: 'regular' };
    expect(manager.isEnabled('complex-test', userContext)).toBe(false);
  });
});