/**
 * Webhook Service Tests
 * Tests for webhook management functionality
 */

import { describe, it, expect } from 'vitest';
import { Webhook, WebhookConfig } from '../../../domain/entities/webhook';

describe('Webhook Domain Entity', () => {
  describe('shouldReceiveEvent', () => {
    it('should match exact event types', () => {
      // Arrange
      const webhook = new Webhook(
        'webhook123',
        'user123',
        'Test Webhook',
        'Description',
        {
          events: ['authentication.login.success', 'user.created'],
          active: true,
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          retryConfig: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000,
            maxDelay: 300000,
          },
          timeout: 10000,
        } as WebhookConfig,
        new Date(),
        new Date()
      );

      // Act & Assert
      expect(webhook.shouldReceiveEvent('authentication.login.success')).toBe(
        true
      );
      expect(webhook.shouldReceiveEvent('user.created')).toBe(true);
      expect(webhook.shouldReceiveEvent('authentication.login.failure')).toBe(
        false
      );
    });

    it('should match wildcard patterns', () => {
      // Arrange
      const webhook = new Webhook(
        'webhook123',
        'user123',
        'Test Webhook',
        'Description',
        {
          events: ['authentication.*', 'user.*'],
          active: true,
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          retryConfig: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000,
            maxDelay: 300000,
          },
          timeout: 10000,
        } as WebhookConfig,
        new Date(),
        new Date()
      );

      // Act & Assert
      expect(webhook.shouldReceiveEvent('authentication.login.success')).toBe(
        true
      );
      expect(webhook.shouldReceiveEvent('authentication.logout')).toBe(true);
      expect(webhook.shouldReceiveEvent('user.created')).toBe(true);
      expect(webhook.shouldReceiveEvent('security.high_risk.detected')).toBe(
        false
      );
    });

    it('should match global wildcard', () => {
      // Arrange
      const webhook = new Webhook(
        'webhook123',
        'user123',
        'Test Webhook',
        'Description',
        {
          events: ['*'],
          active: true,
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          retryConfig: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000,
            maxDelay: 300000,
          },
          timeout: 10000,
        } as WebhookConfig,
        new Date(),
        new Date()
      );

      // Act & Assert
      expect(webhook.shouldReceiveEvent('authentication.login.success')).toBe(
        true
      );
      expect(webhook.shouldReceiveEvent('user.created')).toBe(true);
      expect(webhook.shouldReceiveEvent('any.event.type')).toBe(true);
    });

    it('should not match events when webhook is inactive', () => {
      // Arrange
      const webhook = new Webhook(
        'webhook123',
        'user123',
        'Test Webhook',
        'Description',
        {
          events: ['*'],
          active: false, // Inactive
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          retryConfig: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000,
            maxDelay: 300000,
          },
          timeout: 10000,
        } as WebhookConfig,
        new Date(),
        new Date()
      );

      // Act & Assert
      expect(webhook.shouldReceiveEvent('authentication.login.success')).toBe(
        false
      );
    });
  });

  describe('validateConfig', () => {
    it('should validate valid webhook configuration', () => {
      // Arrange
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'super-secret-webhook-key-with-enough-length',
        events: ['authentication.login.success'],
        active: true,
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
          maxDelay: 300000,
        },
        timeout: 10000,
      };

      // Act
      const errors = Webhook.validateConfig(config);

      // Assert
      expect(errors).toEqual([]);
    });

    it('should reject invalid URL', () => {
      // Arrange
      const config: WebhookConfig = {
        url: 'invalid-url',
        secret: 'super-secret-webhook-key-with-enough-length',
        events: ['authentication.login.success'],
        active: true,
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
          maxDelay: 300000,
        },
        timeout: 10000,
      };

      // Act
      const errors = Webhook.validateConfig(config);

      // Assert
      expect(errors).toContain('Invalid webhook URL');
    });

    it('should reject short secret', () => {
      // Arrange
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'short',
        events: ['authentication.login.success'],
        active: true,
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
          maxDelay: 300000,
        },
        timeout: 10000,
      };

      // Act
      const errors = Webhook.validateConfig(config);

      // Assert
      expect(errors).toContain('Webhook secret must be at least 16 characters');
    });

    it('should reject empty events array', () => {
      // Arrange
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'super-secret-webhook-key-with-enough-length',
        events: [],
        active: true,
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
          maxDelay: 300000,
        },
        timeout: 10000,
      };

      // Act
      const errors = Webhook.validateConfig(config);

      // Assert
      expect(errors).toContain('At least one event type must be specified');
    });
  });
});
