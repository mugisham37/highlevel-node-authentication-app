/**
 * Notification Service Tests
 */

import { EmailProvider, EmailSendResult } from '../email/interfaces';
import { NotificationService } from '../notification.service';
import { PushProvider, PushSendResult } from '../push/interfaces';
import { SMSProvider, SMSSendResult } from '../sms/interfaces';

// Mock providers
class MockEmailProvider implements EmailProvider {
  name = 'mock-email';
  
  async send(): Promise<EmailSendResult> {
    return {
      success: true,
      messageId: 'mock-email-id',
      provider: this.name,
      timestamp: new Date(),
    };
  }
  
  async verify(): Promise<boolean> {
    return true;
  }
}

class MockSMSProvider implements SMSProvider {
  name = 'mock-sms';
  
  async send(): Promise<SMSSendResult> {
    return {
      success: true,
      messageId: 'mock-sms-id',
      provider: this.name,
      timestamp: new Date(),
    };
  }
  
  async verify(): Promise<boolean> {
    return true;
  }
}

class MockPushProvider implements PushProvider {
  name = 'mock-push';
  
  async send(): Promise<PushSendResult> {
    return {
      success: true,
      messageId: 'mock-push-id',
      provider: this.name,
      timestamp: new Date(),
    };
  }
  
  async verify(): Promise<boolean> {
    return true;
  }
}

describe('NotificationService', () => {
  let service: NotificationService;
  let mockEmailProvider: MockEmailProvider;
  let mockSMSProvider: MockSMSProvider;
  let mockPushProvider: MockPushProvider;

  beforeEach(() => {
    mockEmailProvider = new MockEmailProvider();
    mockSMSProvider = new MockSMSProvider();
    mockPushProvider = new MockPushProvider();

    service = new NotificationService({
      email: {
        provider: mockEmailProvider,
        defaultFrom: 'test@example.com',
      },
      sms: {
        provider: mockSMSProvider,
        defaultFrom: '+1234567890',
      },
      push: {
        provider: mockPushProvider,
      },
      enableQueue: false,
      enableTracking: false,
    });
  });

  describe('sendEmail', () => {
    it('should send email with custom content', async () => {
      const result = await service.sendEmail({
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        text: 'Test content',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-email-id');
      expect(result.provider).toBe('mock-email');
    });

    it('should send email with template', async () => {
      const result = await service.sendEmail({
        to: 'user@example.com',
        templateId: 'welcome',
        templateData: {
          firstName: 'John',
          appName: 'Test App',
          email: 'user@example.com',
          loginUrl: 'https://example.com/login',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should send welcome email', async () => {
      const result = await service.sendWelcomeEmail('user@example.com', {
        firstName: 'John',
        email: 'user@example.com',
        appName: 'Test App',
        loginUrl: 'https://example.com/login',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendSMS', () => {
    it('should send SMS with custom message', async () => {
      const result = await service.sendSMS({
        to: '+1234567890',
        message: 'Test SMS message',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-sms-id');
      expect(result.provider).toBe('mock-sms');
    });
  });

  describe('sendPush', () => {
    it('should send push notification', async () => {
      const result = await service.sendPush({
        token: 'device-token',
        title: 'Test Notification',
        body: 'Test notification body',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-push-id');
      expect(result.provider).toBe('mock-push');
    });
  });

  describe('template methods', () => {
    it('should send email verification', async () => {
      const result = await service.sendEmailVerification('user@example.com', {
        firstName: 'John',
        appName: 'Test App',
        verificationUrl: 'https://example.com/verify',
        expirationHours: 24,
      });

      expect(result.success).toBe(true);
    });

    it('should send password reset', async () => {
      const result = await service.sendPasswordReset('user@example.com', {
        firstName: 'John',
        appName: 'Test App',
        resetUrl: 'https://example.com/reset',
        expirationHours: 1,
      });

      expect(result.success).toBe(true);
    });

    it('should send two-factor code', async () => {
      const result = await service.sendTwoFactorCode('user@example.com', {
        firstName: 'John',
        appName: 'Test App',
        verificationCode: '123456',
        expirationMinutes: 5,
      });

      expect(result.success).toBe(true);
    });

    it('should send security alert', async () => {
      const result = await service.sendSecurityAlert('user@example.com', {
        firstName: 'John',
        appName: 'Test App',
        alertType: 'suspicious login',
        eventDescription: 'Login from new device',
        timestamp: new Date(),
        location: 'New York, US',
        device: 'Chrome on Windows',
        securityUrl: 'https://example.com/security',
      });

      expect(result.success).toBe(true);
    });
  });
});