/**
 * Main Notification Service
 * Orchestrates email, SMS, and push notifications with templates, queuing, and tracking
 */

import { logger } from '@company/logger';
import { EmailMessage, EmailProvider, EmailSendResult } from './email/interfaces';
import { PushMessage, PushProvider } from './push/interfaces';
import { NotificationJob, NotificationQueue } from './queue/notification-queue';
import { SMSMessage, SMSProvider, SMSSendResult } from './sms/interfaces';
import { defaultTemplates } from './templates/default-templates';
import { TemplateEngine } from './templates/template-engine';
import { NotificationTracker } from './tracking/notification-tracker';

export interface NotificationConfig {
  email: {
    provider: EmailProvider;
    defaultFrom: string;
  };
  sms: {
    provider: SMSProvider;
    defaultFrom: string;
  };
  push: {
    provider: PushProvider;
  };
  queue?: NotificationQueue;
  tracker?: NotificationTracker;
  enableQueue?: boolean;
  enableTracking?: boolean;
}

export interface SendEmailOptions {
  to: string | string[];
  subject?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  html?: string;
  text?: string;
  from?: string;
  priority?: 'high' | 'normal' | 'low';
  delay?: number;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface SendSMSOptions {
  to: string;
  message?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  from?: string;
  priority?: number;
  delay?: number;
}

export interface SendPushOptions {
  token: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  priority?: 'high' | 'normal';
  delay?: number;
}

export class NotificationService {
  private templateEngine: TemplateEngine;

  constructor(private config: NotificationConfig) {
    this.templateEngine = new TemplateEngine();
    
    // Register default templates
    defaultTemplates.forEach(template => {
      this.templateEngine.registerTemplate(template);
    });

    logger.info('Notification service initialized', {
      emailProvider: config.email.provider.name,
      smsProvider: config.sms.provider.name,
      pushProvider: config.push.provider.name,
      queueEnabled: !!config.queue,
      trackingEnabled: !!config.tracker,
    });
  }

  /**
   * Send email notification
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      let emailMessage: EmailMessage;

      if (options.templateId) {
        // Render template
        const renderResult = this.templateEngine.renderEmail(options.templateId, options.templateData || {});
        
        if (!renderResult.success) {
          throw new Error(`Template rendering failed: ${renderResult.error}`);
        }

        emailMessage = {
          to: options.to,
          from: options.from || this.config.email.defaultFrom,
          subject: options.subject || renderResult.subject!,
          html: renderResult.html,
          text: renderResult.text,
          priority: options.priority,
        };
      } else {
        emailMessage = {
          to: options.to,
          from: options.from || this.config.email.defaultFrom,
          subject: options.subject!,
          html: options.html,
          text: options.text,
          priority: options.priority,
        };
      }

      // Add tracking if enabled
      if (this.config.enableTracking && this.config.tracker) {
        emailMessage = this.addEmailTracking(emailMessage, options);
      }

      // Send via queue or directly
      if (this.config.enableQueue && this.config.queue && options.delay) {
        return this.queueEmail(emailMessage, options);
      } else {
        const result = await this.config.email.provider.send(emailMessage);
        
        // Track send event
        if (this.config.tracker) {
          await this.config.tracker.trackEvent({
            id: `${result.messageId}_sent`,
            notificationId: result.messageId || 'unknown',
            type: result.success ? 'sent' : 'failed',
            recipient: Array.isArray(emailMessage.to) ? emailMessage.to[0] : emailMessage.to,
            channel: 'email',
            provider: result.provider,
            metadata: { subject: emailMessage.subject },
          });
        }

        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Email send failed', {
        error: errorMessage,
        to: options.to,
        templateId: options.templateId,
      });

      return {
        success: false,
        error: errorMessage,
        provider: this.config.email.provider.name,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(options: SendSMSOptions): Promise<SMSSendResult> {
    try {
      let message: string;

      if (options.templateId) {
        // Render template
        const renderResult = this.templateEngine.renderSMS(options.templateId, options.templateData || {});
        
        if (!renderResult.success) {
          throw new Error(`Template rendering failed: ${renderResult.error}`);
        }

        message = renderResult.text!;
      } else {
        message = options.message!;
      }

      const smsMessage: SMSMessage = {
        to: options.to,
        from: options.from || this.config.sms.defaultFrom,
        body: message,
      };

      // Send via queue or directly
      if (this.config.enableQueue && this.config.queue && options.delay) {
        return this.queueSMS(smsMessage, options);
      } else {
        const result = await this.config.sms.provider.send(smsMessage);
        
        // Track send event
        if (this.config.tracker) {
          await this.config.tracker.trackEvent({
            id: `${result.messageId}_sent`,
            notificationId: result.messageId || 'unknown',
            type: result.success ? 'sent' : 'failed',
            recipient: smsMessage.to,
            channel: 'sms',
            provider: result.provider,
            metadata: { messageLength: message.length },
          });
        }

        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('SMS send failed', {
        error: errorMessage,
        to: options.to,
        templateId: options.templateId,
      });

      return {
        success: false,
        error: errorMessage,
        provider: this.config.sms.provider.name,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Send push notification
   */
  async sendPush(options: SendPushOptions): Promise<any> {
    try {
      const pushMessage: PushMessage = {
        token: options.token,
        title: options.title,
        body: options.body,
        data: options.data,
        imageUrl: options.imageUrl,
        priority: options.priority,
      };

      // Send via queue or directly
      if (this.config.enableQueue && this.config.queue && options.delay) {
        return this.queuePush(pushMessage, options);
      } else {
        const result = await this.config.push.provider.send(pushMessage);
        
        // Track send event
        if (this.config.tracker) {
          const tokens = Array.isArray(options.token) ? options.token : [options.token];
          for (const token of tokens) {
            await this.config.tracker.trackEvent({
              id: `${result.messageId}_sent_${token}`,
              notificationId: result.messageId || 'unknown',
              type: result.success ? 'sent' : 'failed',
              recipient: token,
              channel: 'push',
              provider: result.provider,
              metadata: { title: options.title },
            });
          }
        }

        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Push notification send failed', {
        error: errorMessage,
        token: options.token,
        title: options.title,
      });

      return {
        success: false,
        error: errorMessage,
        provider: this.config.push.provider.name,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, data: { firstName: string; email: string; appName: string; loginUrl: string }): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      templateId: 'welcome',
      templateData: data,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(to: string, data: { firstName: string; appName: string; verificationUrl: string; expirationHours: number }): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      templateId: 'email-verification',
      templateData: data,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(to: string, data: { firstName: string; appName: string; resetUrl: string; expirationHours: number }): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      templateId: 'password-reset',
      templateData: data,
    });
  }

  /**
   * Send two-factor authentication code
   */
  async sendTwoFactorCode(to: string, data: { firstName: string; appName: string; verificationCode: string; expirationMinutes: number }): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      templateId: 'two-factor-code',
      templateData: data,
    });
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(to: string, data: { firstName: string; appName: string; alertType: string; eventDescription: string; timestamp: Date; location: string; device: string; securityUrl: string }): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      templateId: 'security-alert',
      templateData: data,
    });
  }

  /**
   * Get notification metrics
   */
  async getMetrics(dateRange?: { start: Date; end: Date }) {
    if (!this.config.tracker) {
      throw new Error('Tracking is not enabled');
    }

    const [emailMetrics, smsMetrics, pushMetrics] = await Promise.all([
      this.config.tracker.getChannelMetrics('email', dateRange),
      this.config.tracker.getChannelMetrics('sms', dateRange),
      this.config.tracker.getChannelMetrics('push', dateRange),
    ]);

    return {
      email: emailMetrics,
      sms: smsMetrics,
      push: pushMetrics,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.config.queue) {
      throw new Error('Queue is not enabled');
    }

    return this.config.queue.getQueueStats();
  }

  /**
   * Add email tracking pixels and link tracking
   */
  private addEmailTracking(message: EmailMessage, options: SendEmailOptions): EmailMessage {
    if (!this.config.tracker) return message;

    const recipient = Array.isArray(message.to) ? message.to[0] : message.to;
    const notificationId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let html = message.html || '';

    // Add tracking pixel for opens
    if (options.trackOpens !== false) {
      const pixelUrl = this.config.tracker.generateTrackingPixelUrl(notificationId, recipient);
      if (pixelUrl) {
        html += `<img src="${pixelUrl}" width="1" height="1" style="display:none;" />`;
      }
    }

    // Add click tracking to links
    if (options.trackClicks !== false && html) {
      html = html.replace(/<a\s+href="([^"]+)"/g, (match, url) => {
        const trackingUrl = this.config.tracker!.generateTrackingUrl(notificationId, recipient, url);
        return `<a href="${trackingUrl}"`;
      });
    }

    return {
      ...message,
      html,
    };
  }

  /**
   * Queue email for later delivery
   */
  private async queueEmail(message: EmailMessage, options: SendEmailOptions): Promise<EmailSendResult> {
    const job: Omit<NotificationJob, 'type'> = {
      id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipient: message.to,
      payload: message,
      priority: options.priority === 'high' ? 10 : options.priority === 'low' ? 1 : 5,
      delay: options.delay,
    };

    await this.config.queue!.addEmailJob(job);

    return {
      success: true,
      messageId: job.id,
      provider: this.config.email.provider.name,
      timestamp: new Date(),
    };
  }

  /**
   * Queue SMS for later delivery
   */
  private async queueSMS(message: SMSMessage, options: SendSMSOptions): Promise<SMSSendResult> {
    const job: Omit<NotificationJob, 'type'> = {
      id: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipient: message.to,
      payload: message,
      priority: options.priority || 5,
      delay: options.delay,
    };

    await this.config.queue!.addSMSJob(job);

    return {
      success: true,
      messageId: job.id,
      provider: this.config.sms.provider.name,
      timestamp: new Date(),
    };
  }

  /**
   * Queue push notification for later delivery
   */
  private async queuePush(message: PushMessage, options: SendPushOptions): Promise<any> {
    const job: Omit<NotificationJob, 'type'> = {
      id: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipient: message.token,
      payload: message,
      priority: options.priority === 'high' ? 10 : 5,
      delay: options.delay,
    };

    await this.config.queue!.addPushJob(job);

    return {
      success: true,
      messageId: job.id,
      provider: this.config.push.provider.name,
      timestamp: new Date(),
    };
  }
}