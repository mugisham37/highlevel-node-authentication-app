/**
 * Firebase Cloud Messaging (FCM) Push Provider
 */

import { logger } from '@company/logger';
import * as admin from 'firebase-admin';
import { PushMessage, PushProvider, PushSendResult } from '../interfaces';

export class FirebaseProvider implements PushProvider {
  public readonly name = 'firebase';
  private app: admin.app.App;

  constructor(serviceAccountKey: string | object, appName?: string) {
    const credential = typeof serviceAccountKey === 'string' 
      ? admin.credential.cert(JSON.parse(serviceAccountKey))
      : admin.credential.cert(serviceAccountKey as admin.ServiceAccount);

    this.app = admin.initializeApp({
      credential,
    }, appName || 'notifications');
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    try {
      const tokens = Array.isArray(message.token) ? message.token : [message.token];
      
      const fcmMessage = {
        notification: {
          title: message.title,
          body: message.body,
          imageUrl: message.imageUrl,
        },
        data: message.data ? Object.fromEntries(
          Object.entries(message.data).map(([key, value]) => [key, String(value)])
        ) : undefined,
        android: {
          notification: {
            sound: message.sound || 'default',
            clickAction: message.clickAction,
            priority: message.priority === 'high' ? 'high' : 'normal',
          },
          ttl: message.timeToLive ? message.timeToLive * 1000 : undefined,
        },
        apns: {
          payload: {
            aps: {
              sound: message.sound || 'default',
              badge: message.badge,
              category: message.category,
            },
          },
        },
        tokens,
      };

      const response = await admin.messaging(this.app).sendMulticast(fcmMessage);

      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });

      logger.info('Push notification sent via Firebase', {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: tokens.length,
      });

      return {
        success: response.successCount > 0,
        provider: this.name,
        timestamp: new Date(),
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Firebase push notification failed', {
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
      // Try to get the app to verify initialization
      admin.messaging(this.app);
      return true;
    } catch (error) {
      logger.error('Firebase verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}