/**
 * WebSocket Server Tests
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
} from 'vitest';
import { WebSocketServer } from '../../../infrastructure/websocket/websocket-server';
import { WebSocketAuthenticator } from '../../../infrastructure/websocket/websocket-authenticator';
import { WebSocketSessionManager } from '../../../infrastructure/websocket/websocket-session-manager';

// Set up environment variables for testing
beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-websocket-testing';
  process.env.JWT_REFRESH_SECRET =
    'test-jwt-refresh-secret-key-for-websocket-testing';
});

// Mock dependencies
vi.mock('../../../infrastructure/cache/redis-client', () => ({
  getRedisClient: () => ({
    getClient: () => ({
      ping: vi.fn().mockResolvedValue('PONG'),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      on: vi.fn(),
      publish: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      smembers: vi.fn().mockResolvedValue([]),
      sadd: vi.fn(),
      srem: vi.fn(),
      scard: vi.fn().mockResolvedValue(0),
      expire: vi.fn(),
      ttl: vi.fn().mockResolvedValue(3600),
      incr: vi.fn().mockResolvedValue(1),
    }),
  }),
}));

vi.mock('../../../infrastructure/logging/winston-logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../infrastructure/security/jwt-token.service', () => ({
  JWTTokenService: vi.fn().mockImplementation(() => ({
    verifyToken: vi.fn().mockResolvedValue({
      valid: true,
      payload: {
        userId: 'user-123',
        sessionId: 'session-123',
      },
    }),
  })),
}));

describe('WebSocketServer', () => {
  let webSocketServer: WebSocketServer;

  beforeEach(() => {
    webSocketServer = new WebSocketServer();
  });

  afterEach(async () => {
    if (webSocketServer) {
      await webSocketServer.shutdown();
    }
  });

  describe('initialization', () => {
    it('should create WebSocket server instance', () => {
      expect(webSocketServer).toBeDefined();
      expect(webSocketServer).toBeInstanceOf(WebSocketServer);
    });

    it('should have required properties', () => {
      expect(webSocketServer['connections']).toBeDefined();
      expect(webSocketServer['redisClient']).toBeDefined();
      expect(webSocketServer['authenticator']).toBeDefined();
      expect(webSocketServer['sessionManager']).toBeDefined();
      expect(webSocketServer['serverId']).toBeDefined();
    });
  });

  describe('health check', () => {
    it('should return health status', async () => {
      const health = await webSocketServer.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('serverId');
      expect(health).toHaveProperty('connections');
      expect(health).toHaveProperty('redisConnected');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.serverId).toBe('string');
      expect(typeof health.connections).toBe('number');
      expect(typeof health.redisConnected).toBe('boolean');
    });

    it('should report healthy status when Redis is connected', async () => {
      const health = await webSocketServer.healthCheck();
      expect(health.redisConnected).toBe(true);
    });
  });

  describe('event broadcasting', () => {
    it('should broadcast event to matching connections', async () => {
      const event = {
        id: 'test-event-1',
        type: 'test.event',
        data: { message: 'test' },
        timestamp: new Date().toISOString(),
        userId: 'user-123',
        metadata: {
          priority: 'normal' as const,
        },
      };

      // Should not throw error even with no connections
      await expect(
        webSocketServer.broadcastEvent(event)
      ).resolves.not.toThrow();
    });

    it('should handle event broadcasting errors gracefully', async () => {
      const invalidEvent = {
        id: 'invalid-event',
        type: 'invalid.event',
        data: null,
        timestamp: 'invalid-timestamp',
        metadata: {},
      } as any;

      // Should handle invalid events gracefully
      await expect(
        webSocketServer.broadcastEvent(invalidEvent)
      ).resolves.not.toThrow();
    });
  });

  describe('connection management', () => {
    it('should generate unique connection IDs', () => {
      const id1 = webSocketServer['generateConnectionId']();
      const id2 = webSocketServer['generateConnectionId']();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^ws_srv_/);
      expect(id2).toMatch(/^ws_srv_/);
    });

    it('should generate unique server ID', () => {
      const serverId = webSocketServer['generateServerId']();

      expect(serverId).toBeDefined();
      expect(typeof serverId).toBe('string');
      expect(serverId).toMatch(/^srv_/);
    });
  });

  describe('event type validation', () => {
    it('should validate allowed event types for regular users', () => {
      const allowedTypes = [
        'authentication.login',
        'session.created',
        'user.profile.updated',
        'security.alert.low',
        'mfa.challenge',
      ];

      const connection = {
        metadata: { admin: false },
      } as any;

      for (const eventType of allowedTypes) {
        const result = webSocketServer['validateEventTypes'](
          [eventType],
          connection
        );
        expect(result).toContain(eventType);
      }
    });

    it('should allow admin users to subscribe to any event type', () => {
      const eventTypes = [
        'admin.user.created',
        'system.maintenance',
        'security.critical.alert',
      ];

      const adminConnection = {
        metadata: { admin: true },
      } as any;

      const result = webSocketServer['validateEventTypes'](
        eventTypes,
        adminConnection
      );
      expect(result).toEqual(eventTypes);
    });

    it('should filter disallowed event types for regular users', () => {
      const eventTypes = [
        'authentication.login', // allowed
        'admin.user.created', // not allowed
        'session.created', // allowed
        'system.maintenance', // not allowed
      ];

      const connection = {
        metadata: { admin: false },
      } as any;

      const result = webSocketServer['validateEventTypes'](
        eventTypes,
        connection
      );
      expect(result).toContain('authentication.login');
      expect(result).toContain('session.created');
      expect(result).not.toContain('admin.user.created');
      expect(result).not.toContain('system.maintenance');
    });
  });

  describe('message handling', () => {
    it('should handle ping message', async () => {
      const mockSocket = {
        readyState: 1,
        send: vi.fn(),
      };

      const mockConnection = {
        id: 'test-connection',
        userId: 'user-123',
        socket: mockSocket,
        lastActivity: new Date(),
        subscriptions: [],
        authenticated: true,
        serverId: 'test-server',
        metadata: {},
      };

      webSocketServer['connections'].set(
        'test-connection',
        mockConnection as any
      );

      // Should not throw error
      await expect(
        webSocketServer['handlePing']('test-connection')
      ).resolves.not.toThrow();
    });

    it('should handle get subscriptions message', async () => {
      const mockSocket = {
        readyState: 1,
        send: vi.fn(),
      };

      const mockConnection = {
        id: 'test-connection',
        userId: 'user-123',
        socket: mockSocket,
        subscriptions: ['authentication.*', 'session.*'],
        lastActivity: new Date(),
        authenticated: true,
        serverId: 'test-server',
        metadata: {},
      };

      webSocketServer['connections'].set(
        'test-connection',
        mockConnection as any
      );

      // Should not throw error
      await expect(
        webSocketServer['handleGetSubscriptions']('test-connection')
      ).resolves.not.toThrow();
    });
  });

  describe('server statistics', () => {
    it('should return server statistics', () => {
      const stats = webSocketServer['getServerStats']();

      expect(stats).toHaveProperty('serverId');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('connectionsByUser');
      expect(stats).toHaveProperty('subscriptionCounts');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('memory');

      expect(typeof stats.serverId).toBe('string');
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.connectionsByUser).toBe('object');
      expect(typeof stats.subscriptionCounts).toBe('object');
      expect(typeof stats.uptime).toBe('number');
      expect(typeof stats.memory).toBe('object');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(webSocketServer.shutdown()).resolves.not.toThrow();
    });

    it('should set shutdown flag', async () => {
      await webSocketServer.shutdown();
      expect(webSocketServer['isShuttingDown']).toBe(true);
    });
  });
});

describe('WebSocketAuthenticator', () => {
  let authenticator: WebSocketAuthenticator;

  beforeEach(() => {
    authenticator = new WebSocketAuthenticator();
  });

  describe('token extraction', () => {
    it('should extract token from query parameter', () => {
      const mockRequest = {
        query: { token: 'test-token' },
        headers: {},
      } as any;

      const token = authenticator['extractToken'](mockRequest);
      expect(token).toBe('test-token');
    });

    it('should extract token from Authorization header', () => {
      const mockRequest = {
        query: {},
        headers: { authorization: 'Bearer test-token' },
      } as any;

      const token = authenticator['extractToken'](mockRequest);
      expect(token).toBe('test-token');
    });

    it('should return null when no token is found', () => {
      const mockRequest = {
        query: {},
        headers: {},
      } as any;

      const token = authenticator['extractToken'](mockRequest);
      expect(token).toBeNull();
    });
  });

  describe('origin validation', () => {
    it('should validate allowed origins', () => {
      const allowedOrigins = ['https://example.com', 'https://app.example.com'];

      expect(
        authenticator.validateOrigin('https://example.com', allowedOrigins)
      ).toBe(true);
      expect(
        authenticator.validateOrigin('https://app.example.com', allowedOrigins)
      ).toBe(true);
      expect(
        authenticator.validateOrigin('https://malicious.com', allowedOrigins)
      ).toBe(false);
    });

    it('should allow localhost in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const result = authenticator.validateOrigin('http://localhost:3000', []);
      expect(result).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle wildcard origins', () => {
      const result = authenticator.validateOrigin('https://any-domain.com', [
        '*',
      ]);
      expect(result).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should check rate limits', async () => {
      const result = await authenticator.checkRateLimit(
        'user-123',
        '192.168.1.1'
      );

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetTime');
      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remaining).toBe('number');
      expect(result.resetTime).toBeInstanceOf(Date);
    });
  });
});

describe('WebSocketSessionManager', () => {
  let sessionManager: WebSocketSessionManager;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      setex: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      scard: vi.fn().mockResolvedValue(0),
      smembers: vi.fn().mockResolvedValue([]),
      expire: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      publish: vi.fn(),
      ttl: vi.fn().mockResolvedValue(3600),
    };

    sessionManager = new WebSocketSessionManager(mockRedisClient);
  });

  describe('connection registration', () => {
    it('should register connection in Redis', async () => {
      const mockConnection = {
        id: 'test-connection',
        userId: 'user-123',
        subscriptions: ['test.*'],
        serverId: 'server-1',
        lastActivity: new Date(),
        authenticated: true,
        metadata: {},
      } as any;

      await expect(
        sessionManager.registerConnection(mockConnection)
      ).resolves.not.toThrow();

      expect(mockRedisClient.setex).toHaveBeenCalled();
      expect(mockRedisClient.sadd).toHaveBeenCalledTimes(2); // user and server sets
    });

    it('should handle registration errors gracefully', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const mockConnection = {
        id: 'test-connection',
        userId: 'user-123',
        subscriptions: [],
        serverId: 'server-1',
        lastActivity: new Date(),
        authenticated: true,
        metadata: {},
      } as any;

      await expect(
        sessionManager.registerConnection(mockConnection)
      ).rejects.toThrow('Redis error');
    });
  });

  describe('connection unregistration', () => {
    it('should unregister connection from Redis', async () => {
      const connectionData = {
        id: 'test-connection',
        userId: 'user-123',
        serverId: 'server-1',
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(connectionData));

      await expect(
        sessionManager.unregisterConnection('test-connection')
      ).resolves.not.toThrow();

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(mockRedisClient.srem).toHaveBeenCalledTimes(2);
    });

    it('should handle missing connection gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await expect(
        sessionManager.unregisterConnection('non-existent-connection')
      ).resolves.not.toThrow();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('event broadcasting', () => {
    it('should broadcast event via Redis', async () => {
      const event = {
        id: 'test-event',
        type: 'test.event',
        data: { message: 'test' },
        timestamp: new Date().toISOString(),
        userId: 'user-123',
      };

      await expect(sessionManager.broadcastEvent(event)).resolves.not.toThrow();

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'websocket:broadcast',
        JSON.stringify(event)
      );
    });
  });

  describe('global statistics', () => {
    it('should return global statistics', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'websocket:servers:server1:stats',
      ]);
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({
          serverId: 'server1',
          connectionCount: 5,
          uptime: 3600,
          memory: { heapUsed: 1000000 },
        })
      );

      const stats = await sessionManager.getGlobalStats();

      expect(stats).toHaveProperty('totalServers');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('totalSubscriptions');
      expect(stats).toHaveProperty('serverStats');
      expect(Array.isArray(stats.serverStats)).toBe(true);
    });
  });

  describe('connection health', () => {
    it('should return connection health status', async () => {
      const health = await sessionManager.getConnectionHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('totalConnections');
      expect(health).toHaveProperty('activeServers');
      expect(health).toHaveProperty('oldestConnection');
      expect(health).toHaveProperty('newestConnection');
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.totalConnections).toBe('number');
      expect(typeof health.activeServers).toBe('number');
    });
  });

  describe('cleanup operations', () => {
    it('should clean up expired connections', async () => {
      mockRedisClient.keys.mockResolvedValue(['websocket:connections:conn1']);
      mockRedisClient.ttl.mockResolvedValue(-1); // expired
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({
          id: 'conn1',
          userId: 'user1',
          serverId: 'server1',
        })
      );

      const cleanedCount = await sessionManager.cleanupExpiredConnections();

      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
