/**
 * Email MFA Service
 * Implements email-based MFA as fallback mechanism
 */

import { Logger } from 'winston';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName?: string;
  serviceName?: string;
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export class EmailMFAService {
  private serviceName: string;

  constructor(
    config: EmailConfig,
    private logger: Logger
  ) {
    this.serviceName = config.serviceName || 'Enterprise Auth';
  }

  /**
   * Send MFA code via email
   */
  async sendMFACode(
    email: string,
    code: string,
    expirationMinutes: number = 10
  ): Promise<EmailResult> {
    try {
      this.logger.info('Sending email MFA code', {
        email: this.maskEmail(email),
        codeLength: code.length,
        expirationMinutes,
      });

      // Validate email format
      if (!this.isValidEmail(email)) {
        return {
          success: false,
          error: 'Invalid email format',
        };
      }

      // Validate code format
      if (!this.isValidCode(code)) {
        return {
          success: false,
          error: 'Invalid code format',
        };
      }

      const template = this.getMFACodeTemplate(code, expirationMinutes);

      const result = await this.sendEmail({
        to: email,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        this.logger.info('Email MFA code sent successfully', {
          messageId: result.messageId,
          email: this.maskEmail(email),
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Email MFA code sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: this.maskEmail(email),
      });

      return {
        success: false,
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send security alert via email
   */
  async sendSecurityAlert(
    email: string,
    alertType:
      | 'login'
      | 'password_change'
      | 'mfa_disabled'
      | 'suspicious_activity',
    details?: Record<string, any>
  ): Promise<EmailResult> {
    try {
      this.logger.info('Sending email security alert', {
        email: this.maskEmail(email),
        alertType,
      });

      const template = this.getSecurityAlertTemplate(alertType, details);

      const result = await this.sendEmail({
        to: email,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        this.logger.info('Email security alert sent successfully', {
          messageId: result.messageId,
          email: this.maskEmail(email),
          alertType,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Email security alert sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: this.maskEmail(email),
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
   * Send email verification code
   */
  async sendVerificationCode(
    email: string,
    code: string
  ): Promise<EmailResult> {
    try {
      this.logger.info('Sending email verification code', {
        email: this.maskEmail(email),
      });

      const template = this.getVerificationCodeTemplate(code);

      const result = await this.sendEmail({
        to: email,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        this.logger.info('Email verification code sent successfully', {
          messageId: result.messageId,
          email: this.maskEmail(email),
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Email verification code sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: this.maskEmail(email),
      });

      return {
        success: false,
        error: 'Failed to send verification code',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send magic link for passwordless authentication
   */
  async sendMagicLink(
    email: string,
    magicLinkUrl: string,
    expiresAt: Date
  ): Promise<EmailResult> {
    try {
      this.logger.info('Sending magic link email', {
        email: this.maskEmail(email),
        expiresAt,
      });

      // Validate email format
      if (!this.isValidEmail(email)) {
        return {
          success: false,
          error: 'Invalid email format',
        };
      }

      // Validate magic link URL
      if (!this.isValidUrl(magicLinkUrl)) {
        return {
          success: false,
          error: 'Invalid magic link URL',
        };
      }

      const template = this.getMagicLinkTemplate(magicLinkUrl, expiresAt);

      const result = await this.sendEmail({
        to: email,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        this.logger.info('Magic link email sent successfully', {
          messageId: result.messageId,
          email: this.maskEmail(email),
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Magic link email sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: this.maskEmail(email),
      });

      return {
        success: false,
        error: 'Failed to send magic link',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send generic email
   */
  private async sendEmail(params: {
    to: string;
    subject: string;
    htmlBody: string;
    textBody: string;
  }): Promise<EmailResult> {
    try {
      // In a real implementation, you would use a proper email service like:
      // - Nodemailer with SMTP
      // - AWS SES
      // - SendGrid
      // - Mailgun
      // etc.

      // For this implementation, we'll simulate email sending
      // In production, replace this with actual email service integration

      const messageId = this.generateMessageId();

      // Simulate email sending delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate success/failure based on email validity
      if (this.isValidEmail(params.to)) {
        this.logger.info('Email sent successfully (simulated)', {
          to: this.maskEmail(params.to),
          subject: params.subject,
          messageId,
        });

        return {
          success: true,
          messageId,
        };
      } else {
        return {
          success: false,
          error: 'Invalid email address',
        };
      }
    } catch (error) {
      this.logger.error('Email sending failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        to: this.maskEmail(params.to),
      });

      return {
        success: false,
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get MFA code email template
   */
  private getMFACodeTemplate(
    code: string,
    expirationMinutes: number
  ): EmailTemplate {
    const subject = `${this.serviceName} - Verification Code`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
          .code { font-size: 32px; font-weight: bold; color: #007bff; text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; letter-spacing: 4px; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${this.serviceName}</h1>
            <h2>Verification Code</h2>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested a verification code for your ${this.serviceName} account. Please use the code below to complete your authentication:</p>
            <div class="code">${code}</div>
            <p><strong>This code will expire in ${expirationMinutes} minutes.</strong></p>
            <div class="warning">
              <strong>Security Notice:</strong> If you didn't request this code, please ignore this email and consider changing your password. Never share this code with anyone.
            </div>
            <p>If you're having trouble, please contact our support team.</p>
            <p>Best regards,<br>The ${this.serviceName} Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
${this.serviceName} - Verification Code

Hello,

You requested a verification code for your ${this.serviceName} account. Please use the code below to complete your authentication:

Verification Code: ${code}

This code will expire in ${expirationMinutes} minutes.

SECURITY NOTICE: If you didn't request this code, please ignore this email and consider changing your password. Never share this code with anyone.

If you're having trouble, please contact our support team.

Best regards,
The ${this.serviceName} Team

This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.
    `;

    return { subject, htmlBody, textBody };
  }

  /**
   * Get security alert email template
   */
  private getSecurityAlertTemplate(
    alertType: string,
    details?: Record<string, any>
  ): EmailTemplate {
    const subject = `${this.serviceName} - Security Alert`;

    let alertMessage = '';
    let alertTitle = '';

    switch (alertType) {
      case 'login':
        alertTitle = 'New Login Detected';
        alertMessage = `A new login was detected on your account from ${details?.['location'] || 'unknown location'} at ${details?.['timestamp'] || 'unknown time'}.`;
        break;
      case 'password_change':
        alertTitle = 'Password Changed';
        alertMessage = `Your password was changed at ${details?.['timestamp'] || 'unknown time'}.`;
        break;
      case 'mfa_disabled':
        alertTitle = 'Multi-Factor Authentication Disabled';
        alertMessage =
          'Multi-factor authentication was disabled on your account.';
        break;
      case 'suspicious_activity':
        alertTitle = 'Suspicious Activity Detected';
        alertMessage = 'Suspicious activity was detected on your account.';
        break;
      default:
        alertTitle = 'Security Event';
        alertMessage = 'A security event was detected on your account.';
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
          .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${this.serviceName}</h1>
            <h2>🔒 Security Alert</h2>
          </div>
          <div class="content">
            <h3>${alertTitle}</h3>
            <div class="alert">
              <strong>Alert:</strong> ${alertMessage}
            </div>
            <p>If you made this change, you can safely ignore this email.</p>
            <p><strong>If you didn't make this change:</strong></p>
            <ul>
              <li>Change your password immediately</li>
              <li>Review your account activity</li>
              <li>Contact our support team</li>
              <li>Consider enabling additional security measures</li>
            </ul>
            <p>Best regards,<br>The ${this.serviceName} Security Team</p>
          </div>
          <div class="footer">
            <p>This is an automated security alert. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
${this.serviceName} - Security Alert

${alertTitle}

Alert: ${alertMessage}

If you made this change, you can safely ignore this email.

If you didn't make this change:
- Change your password immediately
- Review your account activity
- Contact our support team
- Consider enabling additional security measures

Best regards,
The ${this.serviceName} Security Team

This is an automated security alert. Please do not reply to this email.
© ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.
    `;

    return { subject, htmlBody, textBody };
  }

  /**
   * Get verification code email template
   */
  private getVerificationCodeTemplate(code: string): EmailTemplate {
    const subject = `${this.serviceName} - Email Verification`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
          .code { font-size: 32px; font-weight: bold; color: #28a745; text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; letter-spacing: 4px; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${this.serviceName}</h1>
            <h2>Email Verification</h2>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Please use the verification code below to verify your email address:</p>
            <div class="code">${code}</div>
            <p><strong>This code will expire in 10 minutes.</strong></p>
            <p>If you didn't request this verification, please ignore this email.</p>
            <p>Best regards,<br>The ${this.serviceName} Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
${this.serviceName} - Email Verification

Hello,

Please use the verification code below to verify your email address:

Verification Code: ${code}

This code will expire in 10 minutes.

If you didn't request this verification, please ignore this email.

Best regards,
The ${this.serviceName} Team

This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.
    `;

    return { subject, htmlBody, textBody };
  }

  /**
   * Get magic link email template
   */
  private getMagicLinkTemplate(
    magicLinkUrl: string,
    expiresAt: Date
  ): EmailTemplate {
    const subject = `${this.serviceName} - Sign in with Magic Link`;
    const expirationMinutes = Math.ceil(
      (expiresAt.getTime() - Date.now()) / (1000 * 60)
    );

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #6f42c1; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
          .button { display: inline-block; padding: 15px 30px; background-color: #6f42c1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; text-align: center; }
          .button:hover { background-color: #5a2d91; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .link-text { word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${this.serviceName}</h1>
            <h2>🔗 Magic Link Sign In</h2>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested to sign in to your ${this.serviceName} account. Click the button below to sign in instantly:</p>
            <div style="text-align: center;">
              <a href="${magicLinkUrl}" class="button">Sign In Now</a>
            </div>
            <p><strong>This link will expire in ${expirationMinutes} minutes.</strong></p>
            <div class="warning">
              <strong>Security Notice:</strong> If you didn't request this sign-in link, please ignore this email. This link can only be used once and will expire automatically.
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <div class="link-text">${magicLinkUrl}</div>
            <p>For your security, this link will only work from the same device and browser where you requested it.</p>
            <p>Best regards,<br>The ${this.serviceName} Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
${this.serviceName} - Sign in with Magic Link

Hello,

You requested to sign in to your ${this.serviceName} account. Click the link below to sign in instantly:

${magicLinkUrl}

This link will expire in ${expirationMinutes} minutes.

SECURITY NOTICE: If you didn't request this sign-in link, please ignore this email. This link can only be used once and will expire automatically.

For your security, this link will only work from the same device and browser where you requested it.

Best regards,
The ${this.serviceName} Team

This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} ${this.serviceName}. All rights reserved.
    `;

    return { subject, htmlBody, textBody };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate MFA code format
   */
  private isValidCode(code: string): boolean {
    // Should be 6 digits
    return /^\d{6}$/.test(code);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mask email for logging
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain || !localPart) return email;

    const maskedLocal =
      localPart.length > 2
        ? localPart[0] +
          '*'.repeat(localPart.length - 2) +
          localPart[localPart.length - 1]
        : '*'.repeat(localPart.length);

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get email service health status
   */
  async getServiceHealth(): Promise<{
    healthy: boolean;
    error?: string;
  }> {
    try {
      // In a real implementation, you would test the SMTP connection
      // For now, we'll just return healthy
      return { healthy: true };
    } catch (error) {
      this.logger.error('Email service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
