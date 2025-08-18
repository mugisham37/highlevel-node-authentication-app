/**
 * OneSignal Push Provider
 */

import { logger } from '@company/logger';
import { PushMessage, PushProvider, PushSendResult } from '../interfaces';

export class OneSignalProvider implements PushProvider {
  public readonly name = 'onesignal';
  private readonly baseUrl = 'https://onesignal.com/api/v1';

  constructor(
    private appId: string,
    private apiKey: string
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    try {
      const tokens = Array.isArray(message.token) ? message.token : [message.token];
      
      const payload = {
        app_id: this.appId,
        include_player_ids: tokens,
        headings: { en: message.title },
        contents: { en: message.body },
        data: message.data,
        big_picture: message.imageUrl,
        android_sound: message.sound,
        ios_sound: message.sound,
        ios_badgeType: 'SetTo',
        ios_badgeCount: message.badge,
        priority: message.priority === 'high' ? 10 : 5,
        ttl: message.timeToLive,
        url: message.clickAction,
      };

      const response = await fetch(`${this.baseUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.errors?.[0] || 'OneSignal API error');
      }

      logger.info('Push notification sent via OneSignal', {
        notificationId: result.id,
        recipients: result.recipients,
      });

      return {
        success: true,
        messageId: result.id,
        provider: this.name,
        timestamp: new Date(),
        successCount: result.recipients,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('OneSignal push notification failed', {
        error: errorMessage,
        title: message.title,
        tokenCount: Array.isArray(message.token) ? message.token.length : 1,
      });

      return {
        success: false,
        error: errorMessage,
        provider: this.name,
        timestamp: new Date(),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/apps/${this.appId}`, {
        headers: {
          'Authorization': `Basic ${this.apiKey}`,
        },
      });
      
      return response.ok;
    } catch (error) {
      logger.error('OneSignal verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}