import { SeedData, SeedContext } from '../seed-manager';

const seed: SeedData = {
  id: '003_test_webhooks',
  name: 'Create test webhooks',
  description:
    'Creates test webhook configurations for development and testing',
  environment: 'development',
  version: '1.0.0',
  dependencies: ['002_test_users'],

  async execute(context: SeedContext): Promise<void> {
    const { prisma } = context;

    // Get admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    if (!adminUser) {
      throw new Error(
        'Admin user not found. Make sure 002_test_users seed is applied.'
      );
    }

    // Create test webhooks
    const webhooks = [
      {
        name: 'User Events Webhook',
        description: 'Webhook for user-related events',
        url: 'https://api.example.com/webhooks/user-events',
        events: ['user.created', 'user.login', 'user.logout'],
        secret: 'webhook_secret_123',
        headers: {
          'X-API-Key': 'test-api-key',
          'Content-Type': 'application/json',
        },
        retryConfig: {
          maxRetries: 3,
          retryDelay: 1000,
          backoffMultiplier: 2,
        },
      },
      {
        name: 'Security Events Webhook',
        description: 'Webhook for security-related events',
        url: 'https://security.example.com/webhooks/auth-events',
        events: [
          'user.password_changed',
          'user.mfa_enabled',
          'session.expired',
        ],
        secret: 'security_webhook_456',
        headers: {
          Authorization: 'Bearer test-token',
        },
        retryConfig: {
          maxRetries: 5,
          retryDelay: 2000,
          backoffMultiplier: 1.5,
        },
      },
      {
        name: 'All Events Webhook',
        description: 'Webhook that receives all authentication events',
        url: 'https://logs.example.com/webhooks/all-events',
        events: [
          'user.created',
          'user.login',
          'user.logout',
          'user.password_changed',
          'user.mfa_enabled',
          'session.expired',
        ],
        secret: 'all_events_webhook_789',
        headers: {},
        retryConfig: {
          maxRetries: 2,
          retryDelay: 500,
          backoffMultiplier: 2,
        },
      },
    ];

    const createdWebhooks = [];
    for (const webhookData of webhooks) {
      const webhook = await prisma.webhook.create({
        data: {
          userId: adminUser.id,
          name: webhookData.name,
          description: webhookData.description,
          url: webhookData.url,
          secret: webhookData.secret,
          events: webhookData.events,
          headers: webhookData.headers,
          retryConfig: webhookData.retryConfig,
          active: true,
        },
      });
      createdWebhooks.push(webhook);
    }

    // Create some test webhook events
    const testEvents = [
      {
        type: 'user.created',
        data: {
          userId: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
        },
        userId: adminUser.id,
        metadata: {
          source: 'seed_data',
          environment: 'development',
        },
      },
      {
        type: 'user.login',
        data: {
          userId: adminUser.id,
          email: adminUser.email,
          ipAddress: '127.0.0.1',
          userAgent: 'Test User Agent',
        },
        userId: adminUser.id,
        metadata: {
          source: 'seed_data',
          environment: 'development',
        },
      },
    ];

    const createdEvents = [];
    for (const eventData of testEvents) {
      const event = await prisma.webhookEvent.create({
        data: eventData,
      });
      createdEvents.push(event);
    }

    // Create some test delivery attempts
    for (const webhook of createdWebhooks) {
      for (const event of createdEvents) {
        // Only create delivery attempts for events that match webhook events
        if (webhook.events.includes(event.type)) {
          await prisma.webhookDeliveryAttempt.create({
            data: {
              webhookId: webhook.id,
              eventId: event.id,
              attempt: 1,
              status: 'success',
              httpStatus: 200,
              responseBody: '{"status": "received"}',
              deliveredAt: new Date(),
            },
          });
        }
      }
    }

    console.log(
      `Created ${createdWebhooks.length} test webhooks and ${createdEvents.length} test events`
    );
  },

  async rollback(context: SeedContext): Promise<void> {
    const { prisma } = context;

    // Delete in reverse order due to foreign key constraints
    await prisma.webhookDeliveryAttempt.deleteMany();
    await prisma.webhookEvent.deleteMany({
      where: {
        metadata: {
          path: ['source'],
          equals: 'seed_data',
        },
      },
    });
    await prisma.webhook.deleteMany({
      where: {
        name: {
          in: [
            'User Events Webhook',
            'Security Events Webhook',
            'All Events Webhook',
          ],
        },
      },
    });

    console.log('Rolled back test webhooks');
  },
};

export default seed;
