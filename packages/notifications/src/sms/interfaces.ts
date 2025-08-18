/**
 * SMS notification interfaces and types
 */

export interface SMSMessage {
  to: string;
  from?: string;
  body: string;
  mediaUrl?: string[];
}

export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  timestamp: Date;
  cost?: number;
}

export interface SMSProvider {
  name: string;
  send(message: SMSMessage): Promise<SMSSendResult>;
  verify(): Promise<boolean>;
}

export interface SMSConfig {
  provider: 'twilio' | 'sns';
  accountSid?: string;
  authToken?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  defaultFrom: string;
}