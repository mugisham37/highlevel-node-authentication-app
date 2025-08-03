/**
 * SMS Service for MFA
 * Implements SMS-based MFA using Twilio
 */

import { Twilio } from 'twilio';
import { Logger } from 'winston';

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

export interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  serviceName?: string;
}

export class SMSService {
  private client: Twilio;
  private fromNumber: string;
  private serviceName: string;

  constructor(
    private config: SMSConfig,
    private logger: Logger
  ) {
    this.client = new Twilio(config.accountSid, config.authToken);
    this.fromNumber = config.fromNumber;
    this.serviceName = config.serviceName || 'Enterprise Auth';
  }

  /**
   * Send MFA code via SMS
   */
  async sendMFACode(
    phoneNumber: string,
    code: string,
    expirationMinutes: number = 5
  ): Promise<SMSResult> {
    try {
      this.logger.info('Sending SMS MFA code', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        codeLength: code.length,
        expirationMinutes,
      });

      // Validate phone number format
      if (!this.isValidPhoneNumber(phoneNumber)) {
        return {
          success: false,
          error: 'Invalid phone number format',
        };
      }

      // Validate code format
      if (!this.isValidCode(code)) {
        return {
          success: false,
          error: 'Invalid code format',
        };
      }

      const message = this.formatMFAMessage(code, expirationMinutes);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      if (result.sid) {
        this.logger.info('SMS MFA code sent successfully', {
          messageId: result.sid,
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          status: result.status,
        });

        return {
          success: true,
          messageId: result.sid,
        };
      } else {
        this.logger.error('SMS sending failed - no message ID returned', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
        });

        return {
          success: false,
          error: 'Failed to send SMS - no message ID returned',
        };
      }
    } catch (error) {
      this.logger.error('SMS MFA code sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        errorDetails: error,
      });

      return {
        success: false,
        error: 'Failed to send SMS',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send account security alert via SMS
   */
  async sendSecurityAlert(
    phoneNumber: string,
    alertType:
      | 'login'
      | 'password_change'
      | 'mfa_disabled'
      | 'suspicious_activity',
    details?: Record<string, any>
  ): Promise<SMSResult> {
    try {
      this.logger.info('Sending SMS security alert', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        alertType,
      });

      const message = this.formatSecurityAlertMessage(alertType, details);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      if (result.sid) {
        this.logger.info('SMS security alert sent successfully', {
          messageId: result.sid,
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          alertType,
        });

        return {
          success: true,
          messageId: result.sid,
        };
      } else {
        return {
          success: false,
          error: 'Failed to send security alert - no message ID returned',
        };
      }
    } catch (error) {
      this.logger.error('SMS security alert sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        alertType,
      });

      return {
        success: false,
        error: 'Failed to send security alert',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify phone number via SMS
   */
  async sendVerificationCode(
    phoneNumber: string,
    code: string
  ): Promise<SMSResult> {
    try {
      this.logger.info('Sending SMS verification code', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
      });

      const message = `Your ${this.serviceName} verification code is: ${code}. This code will expire in 10 minutes. If you didn't request this, please ignore this message.`;

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      if (result.sid) {
        this.logger.info('SMS verification code sent successfully', {
          messageId: result.sid,
          phoneNumber: this.maskPhoneNumber(phoneNumber),
        });

        return {
          success: true,
          messageId: result.sid,
        };
      } else {
        return {
          success: false,
          error: 'Failed to send verification code - no message ID returned',
        };
      }
    } catch (error) {
      this.logger.error('SMS verification code sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phoneNumber: this.maskPhoneNumber(phoneNumber),
      });

      return {
        success: false,
        error: 'Failed to send verification code',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check SMS delivery status
   */
  async checkDeliveryStatus(messageId: string): Promise<{
    status: string;
    delivered: boolean;
    error?: string;
  }> {
    try {
      const message = await this.client.messages(messageId).fetch();

      const delivered = ['delivered', 'received'].includes(message.status);

      this.logger.debug('SMS delivery status checked', {
        messageId,
        status: message.status,
        delivered,
      });

      return {
        status: message.status,
        delivered,
      };
    } catch (error) {
      this.logger.error('Failed to check SMS delivery status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId,
      });

      return {
        status: 'unknown',
        delivered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Validate MFA code format
   */
  private isValidCode(code: string): boolean {
    // Should be 6 digits
    return /^\d{6}$/.test(code);
  }

  /**
   * Format MFA message
   */
  private formatMFAMessage(code: string, expirationMinutes: number): string {
    return `Your ${this.serviceName} verification code is: ${code}. This code will expire in ${expirationMinutes} minutes. If you didn't request this, please contact support immediately.`;
  }

  /**
   * Format security alert message
   */
  private formatSecurityAlertMessage(
    alertType: string,
    details?: Record<string, any>
  ): string {
    const baseMessage = `${this.serviceName} Security Alert: `;

    switch (alertType) {
      case 'login':
        return `${baseMessage}New login detected from ${details?.location || 'unknown location'} at ${details?.timestamp || 'unknown time'}. If this wasn't you, secure your account immediately.`;

      case 'password_change':
        return `${baseMessage}Your password was changed at ${details?.timestamp || 'unknown time'}. If you didn't make this change, contact support immediately.`;

      case 'mfa_disabled':
        return `${baseMessage}Multi-factor authentication was disabled on your account. If you didn't make this change, contact support immediately.`;

      case 'suspicious_activity':
        return `${baseMessage}Suspicious activity detected on your account. Please review your recent activity and contact support if needed.`;

      default:
        return `${baseMessage}Security event detected on your account. Please review your account activity.`;
    }
  }

  /**
   * Mask phone number for logging
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) {
      return '*'.repeat(phoneNumber.length);
    }

    const visibleDigits = 4;
    const maskedPart = '*'.repeat(phoneNumber.length - visibleDigits);
    const visiblePart = phoneNumber.slice(-visibleDigits);

    return maskedPart + visiblePart;
  }

  /**
   * Get SMS service health status
   */
  async getServiceHealth(): Promise<{
    healthy: boolean;
    error?: string;
  }> {
    try {
      // Try to fetch account info to verify connection
      await this.client.api.accounts(this.config.accountSid).fetch();

      return { healthy: true };
    } catch (error) {
      this.logger.error('SMS service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get SMS usage statistics
   */
  async getUsageStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    messagesSent: number;
    messagesDelivered: number;
    messagesFailed: number;
    totalCost?: number;
  }> {
    try {
      const messages = await this.client.messages.list({
        dateSentAfter: startDate,
        dateSentBefore: endDate,
        from: this.fromNumber,
      });

      const stats = {
        messagesSent: messages.length,
        messagesDelivered: messages.filter((m) =>
          ['delivered', 'received'].includes(m.status)
        ).length,
        messagesFailed: messages.filter((m) =>
          ['failed', 'undelivered'].includes(m.status)
        ).length,
      };

      this.logger.info('SMS usage stats retrieved', stats);

      return stats;
    } catch (error) {
      this.logger.error('Failed to get SMS usage stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        messagesSent: 0,
        messagesDelivered: 0,
        messagesFailed: 0,
      };
    }
  }
}
