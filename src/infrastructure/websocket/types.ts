/**
 * WebSocket Types and Interfaces
 */

import { WebSocket } from '@fastify/websocket';

export interface SocketStream {
  socket: WebSocket;
  [key: string]: any;
}

export interface WebSocketConnection {
  id: string;
  userId: string;
  socket: SocketStream;
  subscriptions: string[];
  lastActivity: Date;
  authenticated: boolean;
  serverId: string;
  metadata?: {
    userAgent?: string;
    ip?: string;
    origin?: string;
    admin?: boolean;
    [key: string]: any;
  };
}

export interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: string;
  correlationId?: string;
}

export interface WebSocketEvent {
  id: string;
  type: string;
  data: Record<string, any>;
  timestamp: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  metadata?: {
    serverId?: string | undefined;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    [key: string]: any;
  } | undefined;
  correlationId?: string | undefined;
}

export interface WebSocketAuthResult {
  success: boolean;
  userId?: string;
  sessionId?: string;
  error?: string;
  permissions?: string[];
}

export interface WebSocketSubscription {
  connectionId: string;
  userId: string;
  eventTypes: string[];
  serverId: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface WebSocketServerStats {
  serverId: string;
  totalConnections: number;
  connectionsByUser: Record<string, number>;
  subscriptionCounts: Record<string, number>;
  uptime: number;
  memory: NodeJS.MemoryUsage;
}

export interface WebSocketGlobalStats {
  totalServers: number;
  totalConnections: number;
  totalSubscriptions: number;
  serverStats: WebSocketServerStats[];
}

export interface SecurityEvent {
  type:
    | 'high_risk_detected'
    | 'rate_limit_exceeded'
    | 'suspicious_activity'
    | 'authentication_failure';
  userId?: string | undefined;
  sessionId?: string | undefined;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  source: string;
}

export interface AuthenticationEvent {
  type:
    | 'login_success'
    | 'login_failure'
    | 'logout'
    | 'token_refresh'
    | 'mfa_challenge'
    | 'password_change';
  userId: string;
  sessionId?: string | undefined;
  details: Record<string, any>;
  timestamp: Date;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface SessionEvent {
  type:
    | 'session_created'
    | 'session_expired'
    | 'session_revoked'
    | 'concurrent_session_limit';
  userId: string;
  sessionId: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface AdminEvent {
  type:
    | 'user_created'
    | 'user_updated'
    | 'user_deleted'
    | 'role_assigned'
    | 'permission_granted';
  adminUserId: string;
  targetUserId?: string;
  details: Record<string, any>;
  timestamp: Date;
}

export type RealTimeEvent =
  | SecurityEvent
  | AuthenticationEvent
  | SessionEvent
  | AdminEvent;

export interface WebSocketNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  userId?: string | undefined;
  data?: Record<string, any> | undefined;
  timestamp: Date;
  expiresAt?: Date | undefined;
  read?: boolean | undefined;
}
