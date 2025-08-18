/**
 * SendGrid Email Provider
 */

import { logger } from '@company/logger';
import sgMail from '@sendgrid/mail';
import { EmailMessage, EmailProvider, EmailSendResult } from '../interfaces';

export class SendGridProvider implements EmailProvider {
  public readonly name = 'sendgrid';

  constructor(private apiKey: string, private defaultFrom: string) {
    sgMail.setApiKey(apiKey);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const msg = {
        to: Array.isArray(message.to) ? message.to : [message.to],
        from: message.from || this.defaultFrom,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
        cc: message.cc,
        bcc: message.bcc,
        attachments: message.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          type: att.contentType,
          contentId: att.cid,
        })),
        headers: message.headers,
      };

      const [response] = await sgMail.send(msg);

      logger.info('Email sent via SendGrid', {
        messageId: response.headers['x-message-id'],
        to: message.to,
        subject: message.subject,
      });

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('SendGrid email send failed', {
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
      // SendGrid doesn't have a direct verify endpoint, so we'll try to get API key info
      const response = await fetch('https://api.sendgrid.com/v3/user/account', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      return response.ok;
    } catch (error) {
      logger.error('SendGrid verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}