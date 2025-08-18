/**
 * AWS SES Email Provider
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from '@company/logger';
import { EmailMessage, EmailProvider, EmailSendResult } from '../interfaces';

export class SESProvider implements EmailProvider {
  public readonly name = 'ses';
  private client: SESClient;

  constructor(
    private region: string,
    private defaultFrom: string,
    credentials?: { accessKeyId: string; secretAccessKey: string }
  ) {
    this.client = new SESClient({
      region,
      credentials,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const destinations = Array.isArray(message.to) ? message.to : [message.to];
      
      const command = new SendEmailCommand({
        Source: message.from || this.defaultFrom,
        Destination: {
          ToAddresses: destinations,
          CcAddresses: message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]) : undefined,
          BccAddresses: message.bcc ? (Array.isArray(message.bcc) ? message.bcc : [message.bcc]) : undefined,
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: message.text ? {
              Data: message.text,
              Charset: 'UTF-8',
            } : undefined,
            Html: message.html ? {
              Data: message.html,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
      });

      const response = await this.client.send(command);

      logger.info('Email sent via AWS SES', {
        messageId: response.MessageId,
        to: message.to,
        subject: message.subject,
      });

      return {
        success: true,
        messageId: response.MessageId,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('AWS SES email send failed', {
        error: errorMessage,
        to: message.to,
        subject: message.subject,
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
      // Try to get sending quota to verify credentials
      const { GetSendQuotaCommand } = await import('@aws-sdk/client-ses');
      const command = new GetSendQuotaCommand({});
      await this.client.send(command);
      return true;
    } catch (error) {
      logger.error('AWS SES verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}