/**
 * Twilio SMS Provider
 */

import { logger } from '@company/logger';
import { Twilio } from 'twilio';
import { SMSMessage, SMSProvider, SMSSendResult } from '../interfaces';

export class TwilioProvider implements SMSProvider {
  public readonly name = 'twilio';
  private client: Twilio;

  constructor(
    private accountSid: string,
    private authToken: string,
    private defaultFrom: string
  ) {
    this.client = new Twilio(accountSid, authToken);
  }

  async send(message: SMSMessage): Promise<SMSSendResult> {
    try {
      const twilioMessage = await this.client.messages.create({
        body: message.body,
        from: message.from || this.defaultFrom,
        to: message.to,
        mediaUrl: message.mediaUrl,
      });

      logger.info('SMS sent via Twilio', {
        messageId: twilioMessage.sid,
        to: message.to,
        status: twilioMessage.status,
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        provider: this.name,
        timestamp: new Date(),
        cost: twilioMessage.price ? parseFloat(twilioMessage.price) : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Twilio SMS send failed', {
        error: errorMessage,
        to: message.to,
        body: message.body.substring(0, 50) + '...',
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
      // Verify by fetching account information
      await this.client.api.accounts(this.accountSid).fetch();
      return true;
    } catch (error) {
      logger.error('Twilio verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}