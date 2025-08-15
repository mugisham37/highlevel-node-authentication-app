/**
 * WebSocket Integration Example
 * Demonstrates how to use the WebSocket real-time features
 */

import { createWebSocketInfrastructure } from '../infrastructure/websocket';
import { WebSocketIntegrationService } from '../application/services/websocket-integration.service';
import { EventPublisherService } from '../application/services/event-publisher.service';
import { logger } from '../infrastructure/logging/winston-logger';

// Mock implementations for the example
class MockWebhookRepository {
  async findActiveWebhooksForEvent() {
    return [];
  }
}

class MockWebhookEventRepository {
  async save(event: any) {
    return event;
  }

  async findById() {
    return null;
  }

  async findWithQuery() {
    return { events: [], total: 0 };
  }

  async deleteOldEvents() {
    return 0;
  }
}

class MockWebhookDeliveryService {
  async deliverEvent() {
    return { success: true, httpStatus: 200, responseTime: 100 };
  }

  async cancelPendingDeliveries() {
    return;
  }

  async getDeliveryAttempts() {
    return { attempts: [] };
  }
}

async function demonstrateWebSocketFeatures() {
  try {
    logger.info('🚀 Starting WebSocket integration example');

    // Create WebSocket infrastructure
    const { webSocketServer, sessionManager, notificationService } =
      createWebSocketInfrastructure();

    // Create event publisher
    const eventPublisher = new EventPublisherService(
      new MockWebhookRepository() as any,
      new MockWebhookEventRepository() as any,
      new MockWebhookDeliveryService() as any
    );

    // Create integration service
    const integrationService = new WebSocketIntegrationService(
      eventPublisher,
      webSocketServer,
      sessionManager,
      notificationService
    );

    logger.info('✅ WebSocket infrastructure initialized');

    // Demonstrate publishing authentication events
    await demonstrateAuthenticationEvents(integrationService);

    // Demonstrate security alerts
    await demonstrateSecurityAlerts(integrationService);

    // Demonstrate user notifications
    await demonstrateUserNotifications(integrationService);

    // Show WebSocket statistics
    await demonstrateStatistics(integrationService);

    // Health check
    await demonstrateHealthCheck(integrationService);

    logger.info('🎉 WebSocket example completed successfully');
  } catch (error) {
    logger.error('❌ Error in WebSocket example:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function demonstrateAuthenticationEvents(
  integrationService: WebSocketIntegrationService
) {
  logger.info('📡 Demonstrating authentication events...');

  // Simulate successful login
  await integrationService.publishAuthenticationEvent(
    'authentication.login.success',
    'user-123',
    'session-456',
    {
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      timestamp: new Date().toISOString(),
    }
  );

  // Simulate MFA challenge
  await integrationService.publishAuthenticationEvent(
    'authentication.mfa.challenge',
    'user-123',
    'session-456',
    {
      method: 'totp',
      timestamp: new Date().toISOString(),
    }
  );

  // Simulate logout
  await integrationService.publishAuthenticationEvent(
    'authentication.logout',
    'user-123',
    'session-456',
    {
      reason: 'user_initiated',
      timestamp: new Date().toISOString(),
    }
  );

  logger.info('✅ Authentication events published');
}

async function demonstrateSecurityAlerts(
  integrationService: WebSocketIntegrationService
) {
  logger.info('🔒 Demonstrating security alerts...');

  // Simulate high-risk activity detection
  await integrationService.publishSecurityEvent(
    'security.high_risk.detected',
    'user-123',
    'session-456',
    {
      riskScore: 85,
      factors: ['unusual_location', 'new_device', 'suspicious_timing'],
      location: 'Unknown Location',
      timestamp: new Date().toISOString(),
    }
  );

  // Simulate rate limit exceeded
  await integrationService.publishSecurityEvent(
    'security.rate_limit.exceeded',
    'user-123',
    undefined,
    {
      endpoint: '/api/auth/login',
      attempts: 10,
      timeWindow: '5 minutes',
      timestamp: new Date().toISOString(),
    }
  );

  logger.info('✅ Security alerts published');
}

async function demonstrateUserNotifications(
  integrationService: WebSocketIntegrationService
) {
  logger.info('📢 Demonstrating user notifications...');

  // Send individual user notification
  await integrationService.sendUserNotification(
    'user-123',
    'info',
    'Account Security Update',
    'Your account security settings have been updated successfully.',
    {
      action: 'security_update',
      timestamp: new Date().toISOString(),
    }
  );

  // Send warning notification
  await integrationService.sendUserNotification(
    'user-123',
    'warning',
    'Unusual Login Detected',
    'We detected a login from a new device. If this was not you, please secure your account.',
    {
      device: 'Unknown Device',
      location: 'New York, NY',
      timestamp: new Date().toISOString(),
    }
  );

  // Send broadcast notification
  await integrationService.sendBroadcastNotification(
    'info',
    'System Maintenance',
    'Scheduled maintenance will occur tonight from 2:00 AM to 4:00 AM EST.',
    {
      maintenanceWindow: {
        start: '2024-01-15T07:00:00Z',
        end: '2024-01-15T09:00:00Z',
      },
      affectedServices: ['authentication', 'user_management'],
    }
  );

  logger.info('✅ User notifications sent');
}

async function demonstrateStatistics(
  integrationService: WebSocketIntegrationService
) {
  logger.info('📊 Demonstrating WebSocket statistics...');

  const stats = await integrationService.getWebSocketStats();

  logger.info('WebSocket Statistics:', {
    server: stats.server,
    global: stats.global,
    notifications: stats.notifications,
  });

  logger.info('✅ Statistics retrieved');
}

async function demonstrateHealthCheck(
  integrationService: WebSocketIntegrationService
) {
  logger.info('🏥 Demonstrating health check...');

  const health = await integrationService.healthCheck();

  logger.info('WebSocket Health Status:', {
    healthy: health.healthy,
    components: health.components,
  });

  if (health.healthy) {
    logger.info('✅ All WebSocket components are healthy');
  } else {
    logger.warn('⚠️ Some WebSocket components are unhealthy');
  }
}


// Example WebSocket client connection simulation
function simulateWebSocketClient() {
  logger.info('🔌 Simulating WebSocket client connection...');

  // This would be the client-side code
  const exampleClientCode = `
    // Client-side WebSocket connection example
    const ws = new WebSocket('ws://localhost:3000/ws/events?token=your-jwt-token');
    
    ws.onopen = function() {
      console.log('Connected to WebSocket server');
      
      // Subscribe to authentication events
      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: {
          eventTypes: ['authentication.*', 'security.*', 'session.*']
        }
      }));
    };
    
    ws.onmessage = function(event) {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        case 'event':
          console.log('Received real-time event:', message.data);
          break;
        case 'notification.user':
          console.log('Received notification:', message.data);
          break;
        case 'connection.established':
          console.log('Connection established:', message.data);
          break;
        default:
          console.log('Received message:', message);
      }
    };
    
    ws.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = function(event) {
      console.log('WebSocket connection closed:', event.code, event.reason);
    };
    
    // Send ping to keep connection alive
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  `;

  logger.info('Example client code:', { exampleClientCode });
}

// Run the example if this file is executed directly
if (require.main === module) {
  demonstrateWebSocketFeatures()
    .then(() => {
      logger.info('Example completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Example failed:', error);
      process.exit(1);
    });
}

export {
  demonstrateWebSocketFeatures,
  demonstrateAuthenticationEvents,
  demonstrateSecurityAlerts,
  demonstrateUserNotifications,
  demonstrateStatistics,
  demonstrateHealthCheck,
  simulateWebSocketClient,
};
