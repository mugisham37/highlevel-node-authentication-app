/**
 * WebSocket Infrastructure Exports
 */

export { WebSocketServer } from './websocket-server';
export { WebSocketAuthenticator } from './websocket-authenticator';
export { WebSocketSessionManager } from './websocket-session-manager';
export { RealTimeNotificationService } from './real-time-notification.service';

export * from './types';

// Import classes for factory function
import { WebSocketServer } from './websocket-server';
import { WebSocketSessionManager } from './websocket-session-manager';
import { RealTimeNotificationService } from './real-time-notification.service';

// Factory function to create WebSocket infrastructure
export function createWebSocketInfrastructure() {
  const webSocketServer = new WebSocketServer();
  const sessionManager = new WebSocketSessionManager(
    webSocketServer['redisClient']
  );
  const notificationService = new RealTimeNotificationService(
    webSocketServer,
    sessionManager
  );

  return {
    webSocketServer,
    sessionManager,
    notificationService,
  };
}
