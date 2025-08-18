/**
 * Push notification interfaces and types
 */

export interface PushMessage {
  token: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  sound?: string;
  badge?: number;
  clickAction?: string;
  category?: string;
  priority?: 'high' | 'normal';
  timeToLive?: number;
}

export interface PushSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  timestamp: Date;
  failedTokens?: string[];
  successCount?: number;
  failureCount?: number;
}

export interface PushProvider {
  name: string;
  send(message: PushMessage): Promise<PushSendResult>;
  verify(): Promise<boolean>;
}

export interface PushConfig {
  provider: 'firebase' | 'onesignal' | 'apns';
  serviceAccountKey?: string;
  appId?: string;
  apiKey?: string;
  keyId?: string;
  teamId?: string;
  bundleId?: string;
  keyPath?: string;
}