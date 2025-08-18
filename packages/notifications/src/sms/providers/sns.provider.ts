/**
 * AWS SNS SMS Provider
 */

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { logger } from '@company/logger';
import { SMSMessage, SMSProvider, SMSSendResult } from '../interfaces';

export class SNSProvider implements SMSProvider {
  public readonly name = 'sns';
  private client: SNSClient;

  constructor(
    private region: string,
    private defaultFrom: string,
    credentials?: { accessKeyId: string; secretAccessKey: string }
  ) {
    this.client = new SNSClient({
      region,
      credentials,
    });
  }

  async send(message: SMSMessage): Promise<SMSSendResult> {
    try {
      const command = new PublishCommand({
        PhoneNumber: message.to,
        Message: message.body,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: message.from || this.defaultFrom,
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      });

      const response = await this.client.send(command);

      logger.info('SMS sent via AWS SNS', {
        messageId: response.MessageId,
        to: message.to,
      });

      return {
        success: true,
        messageId: response.MessageId,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('AWS SNS SMS send failed', {
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
      // Try to get SMS attributes to verify credentials
      const { GetSMSAttributesCommand } = await import('@aws-sdk/client-sns');
      const command = new GetSMSAttributesCommand({});
      await this.client.send(command);
      return true;
    } catch (error) {
      logger.error('AWS SNS verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}