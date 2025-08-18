/**
 * WebSocket Infrastructure Exports
 */

export { WebSocketAuthenticator } from './websocket-authenticator';
export { WebSocketServer } from './websocket-server';
export { WebSocketSessionManager } from './websocket-session-manager';

export * from './types';

// Import classes for factory function
import { RealTimeNotificationService } from '@company/notifications';
import { WebSocketServer } from './websocket-server';
import { WebSocketSessionManager } from './websocket-session-manager';

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
