# @company/notifications

Comprehensive notification services for email, SMS, and push notifications with template support, queuing, and tracking.

## Features

- **Multi-Provider Support**: SendGrid, AWS SES, SMTP for email; Twilio, AWS SNS for SMS; Firebase, OneSignal for push
- **Template Engine**: Handlebars with MJML support for responsive emails
- **Queue System**: Bull-based queuing for reliable delivery
- **Tracking & Analytics**: Open/click tracking and delivery metrics
- **Real-time Notifications**: WebSocket integration for live updates

## Installation

```bash
npm install @company/notifications
```

## Quick Start

```typescript
import { createNotificationService } from '@company/notifications';

const notificationService = createNotificationService({
  email: {
    provider: 'sendgrid',
    config: { apiKey: 'your-sendgrid-api-key' },
    defaultFrom: 'noreply@yourapp.com',
  },
  sms: {
    provider: 'twilio',
    config: { 
      accountSid: 'your-twilio-sid',
      authToken: 'your-twilio-token'
    },
    defaultFrom: '+1234567890',
  },
  push: {
    provider: 'firebase',
    config: { serviceAccountKey: 'path/to/service-account.json' },
  },
});

// Send welcome email
await notificationService.sendWelcomeEmail('user@example.com', {
  firstName: 'John',
  email: 'user@example.com',
  appName: 'Your App',
  loginUrl: 'https://yourapp.com/login',
});
```

## Email Providers

### SendGrid

```typescript
import { SendGridProvider } from '@company/notifications';

const provider = new SendGridProvider('your-api-key', 'from@example.com');
```

### AWS SES

```typescript
import { SESProvider } from '@company/notifications';

const provider = new SESProvider('us-east-1', 'from@example.com', {
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
});
```

### SMTP

```typescript
import { SMTPProvider } from '@company/notifications';

const provider = new SMTPProvider({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-password',
  },
}, 'from@example.com');
```

## SMS Providers

### Twilio

```typescript
import { TwilioProvider } from '@company/notifications';

const provider = new TwilioProvider(
  'your-account-sid',
  'your-auth-token',
  '+1234567890'
);
```

### AWS SNS

```typescript
import { SNSProvider } from '@company/notifications';

const provider = new SNSProvider('us-east-1', '+1234567890', {
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
});
```

## Push Providers

### Firebase

```typescript
import { FirebaseProvider } from '@company/notifications';

const provider = new FirebaseProvider({
  type: 'service_account',
  project_id: 'your-project-id',
  private_key_id: 'your-private-key-id',
  private_key: 'your-private-key',
  client_email: 'your-client-email',
  client_id: 'your-client-id',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
```

### OneSignal

```typescript
import { OneSignalProvider } from '@company/notifications';

const provider = new OneSignalProvider('your-app-id', 'your-api-key');
```

## Templates

The package includes default templates for common authentication scenarios:

- `welcome` - Welcome email for new users
- `email-verification` - Email address verification
- `password-reset` - Password reset instructions
- `two-factor-code` - 2FA verification codes
- `security-alert` - Security notifications

### Custom Templates

```typescript
import { TemplateEngine } from '@company/notifications';

const templateEngine = new TemplateEngine();

templateEngine.registerTemplate({
  id: 'custom-template',
  name: 'Custom Template',
  subject: 'Hello {{name}}!',
  htmlTemplate: `
    <mjml>
      <mj-body>
        <mj-section>
          <mj-column>
            <mj-text>Hello {{name}}!</mj-text>
            <mj-text>{{message}}</mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `,
  textTemplate: 'Hello {{name}}! {{message}}',
  variables: ['name', 'message'],
});
```

## Queue System

Enable queuing for reliable delivery and retry mechanisms:

```typescript
import { NotificationQueue } from '@company/notifications';

const queue = new NotificationQueue({
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'your-redis-password',
  },
});

// Send with delay
await notificationService.sendEmail({
  to: 'user@example.com',
  subject: 'Delayed Email',
  html: '<p>This email was delayed</p>',
  delay: 60000, // 1 minute delay
});
```

## Tracking & Analytics

Enable tracking to monitor delivery, opens, and clicks:

```typescript
import { NotificationTracker } from '@company/notifications';

const tracker = new NotificationTracker({
  enableTracking: true,
  trackOpens: true,
  trackClicks: true,
  retentionDays: 30,
});

// Get metrics
const metrics = await notificationService.getMetrics({
  start: new Date('2023-01-01'),
  end: new Date('2023-12-31'),
});

console.log('Email metrics:', metrics.email);
console.log('SMS metrics:', metrics.sms);
console.log('Push metrics:', metrics.push);
```

## Real-time Notifications

Integrate with WebSocket for real-time notifications:

```typescript
import { RealTimeNotificationService } from '@company/notifications';

const realTimeService = new RealTimeNotificationService(
  webSocketServer,
  sessionManager
);

// Send real-time security alert
await realTimeService.sendSecurityAlert({
  type: 'login_attempt',
  userId: 'user-123',
  details: { location: 'New York', device: 'Chrome' },
  timestamp: new Date(),
});
```

## API Reference

### NotificationService

#### Methods

- `sendEmail(options)` - Send email notification
- `sendSMS(options)` - Send SMS notification
- `sendPush(options)` - Send push notification
- `sendWelcomeEmail(to, data)` - Send welcome email
- `sendEmailVerification(to, data)` - Send email verification
- `sendPasswordReset(to, data)` - Send password reset
- `sendTwoFactorCode(to, data)` - Send 2FA code
- `sendSecurityAlert(to, data)` - Send security alert
- `getMetrics(dateRange?)` - Get notification metrics
- `getQueueStats()` - Get queue statistics

### Template Variables

#### Welcome Email
- `firstName` - User's first name
- `email` - User's email address
- `appName` - Application name
- `loginUrl` - Login URL

#### Email Verification
- `firstName` - User's first name
- `appName` - Application name
- `verificationUrl` - Verification URL
- `expirationHours` - Hours until expiration

#### Password Reset
- `firstName` - User's first name
- `appName` - Application name
- `resetUrl` - Password reset URL
- `expirationHours` - Hours until expiration

#### Two-Factor Code
- `firstName` - User's first name
- `appName` - Application name
- `verificationCode` - 6-digit code
- `expirationMinutes` - Minutes until expiration

#### Security Alert
- `firstName` - User's first name
- `appName` - Application name
- `alertType` - Type of security alert
- `eventDescription` - Description of the event
- `timestamp` - When the event occurred
- `location` - Geographic location
- `device` - Device information
- `securityUrl` - Security settings URL

## Environment Variables

```bash
# Tracking
TRACKING_BASE_URL=https://api.yourapp.com

# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key

# AWS
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token

# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY=path/to/service-account.json

# OneSignal
ONESIGNAL_APP_ID=your-app-id
ONESIGNAL_API_KEY=your-api-key

# Redis (for queuing)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

## License

MIT