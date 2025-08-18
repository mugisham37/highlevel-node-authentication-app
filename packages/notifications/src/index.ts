/**
 * @company/notifications - Comprehensive notification services
 * 
 * This package provides email, SMS, and push notification capabilities with:
 * - Multiple provider support (SendGrid, AWS SES, SMTP, Twilio, AWS SNS, Firebase, OneSignal)
 * - Template engine with Handlebars and MJML support
 * - Queue system for reliable delivery
 * - Tracking and analytics
 * - Real-time notifications via WebSocket
 */

// Main service
export { NotificationService } from './notification.service';
export type {
    NotificationConfig,
    SendEmailOptions, SendPushOptions, SendSMSOptions
} from './notification.service';

// Email providers and interfaces
export type {
    EmailAttachment, EmailConfig, EmailMessage, EmailProvider, EmailSendResult, EmailTemplate,
    EmailTemplateData
} from './email/interfaces';
export { SendGridProvider } from './email/providers/sendgrid.provider';
export { SESProvider } from './email/providers/ses.provider';
export { SMTPProvider } from './email/providers/smtp.provider';

// SMS providers and interfaces
export type {
    SMSConfig, SMSMessage, SMSProvider, SMSSendResult
} from './sms/interfaces';
export { SNSProvider } from './sms/providers/sns.provider';
export { TwilioProvider } from './sms/providers/twilio.provider';

// Push providers and interfaces
export type {
    PushConfig, PushMessage, PushProvider, PushSendResult
} from './push/interfaces';
export { FirebaseProvider } from './push/providers/firebase.provider';
export { OneSignalProvider } from './push/providers/onesignal.provider';

// Template engine
export { defaultTemplates } from './templates/default-templates';
export { TemplateEngine } from './templates/template-engine';
export type { TemplateRenderResult } from './templates/template-engine';

// Queue system
export { NotificationQueue } from './queue/notification-queue';
export type { NotificationJob, QueueConfig } from './queue/notification-queue';

// Tracking system
export { NotificationTracker } from './tracking/notification-tracker';
export type {
    NotificationEvent,
    NotificationMetrics,
    TrackingConfig
} from './tracking/notification-tracker';

// Real-time notifications (moved from API)
export { RealTimeNotificationService } from './real-time-notification.service';

// Factory function for easy setup
export function createNotificationService(config: {
  email: {
    provider: 'sendgrid' | 'ses' | 'smtp';
    config: any;
    defaultFrom: string;
  };
  sms: {
    provider: 'twilio' | 'sns';
    config: any;
    defaultFrom: string;
  };
  push: {
    provider: 'firebase' | 'onesignal';
    config: any;
  };
  queue?: {
    redis: {
      host: string;
      port: number;
      password?: string;
      db?: number;
    };
  };
  tracking?: {
    enableTracking: boolean;
    trackOpens: boolean;
    trackClicks: boolean;
    retentionDays: number;
  };
}): NotificationService {
  // Create email provider
  let emailProvider;
  switch (config.email.provider) {
    case 'sendgrid':
      emailProvider = new SendGridProvider(config.email.config.apiKey, config.email.defaultFrom);
      break;
    case 'ses':
      emailProvider = new SESProvider(config.email.config.region, config.email.defaultFrom, config.email.config.credentials);
      break;
    case 'smtp':
      emailProvider = new SMTPProvider(config.email.config, config.email.defaultFrom);
      break;
    default:
      throw new Error(`Unsupported email provider: ${config.email.provider}`);
  }

  // Create SMS provider
  let smsProvider;
  switch (config.sms.provider) {
    case 'twilio':
      smsProvider = new TwilioProvider(config.sms.config.accountSid, config.sms.config.authToken, config.sms.defaultFrom);
      break;
    case 'sns':
      smsProvider = new SNSProvider(config.sms.config.region, config.sms.defaultFrom, config.sms.config.credentials);
      break;
    default:
      throw new Error(`Unsupported SMS provider: ${config.sms.provider}`);
  }

  // Create push provider
  let pushProvider;
  switch (config.push.provider) {
    case 'firebase':
      pushProvider = new FirebaseProvider(config.push.config.serviceAccountKey);
      break;
    case 'onesignal':
      pushProvider = new OneSignalProvider(config.push.config.appId, config.push.config.apiKey);
      break;
    default:
      throw new Error(`Unsupported push provider: ${config.push.provider}`);
  }

  // Create optional queue
  let queue;
  if (config.queue) {
    queue = new NotificationQueue({
      redis: config.queue.redis,
    });
  }

  // Create optional tracker
  let tracker;
  if (config.tracking) {
    tracker = new NotificationTracker(config.tracking);
  }

  return new NotificationService({
    email: {
      provider: emailProvider,
      defaultFrom: config.email.defaultFrom,
    },
    sms: {
      provider: smsProvider,
      defaultFrom: config.sms.defaultFrom,
    },
    push: {
      provider: pushProvider,
    },
    queue,
    tracker,
    enableQueue: !!queue,
    enableTracking: !!tracker,
  });
}