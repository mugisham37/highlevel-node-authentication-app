/**
 * SMTP Email Provider using Nodemailer
 */

import { logger } from '@company/logger';
import nodemailer, { Transporter } from 'nodemailer';
import { EmailMessage, EmailProvider, EmailSendResult } from '../interfaces';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export class SMTPProvider implements EmailProvider {
  public readonly name = 'smtp';
  private transporter: Transporter;

  constructor(
    private config: SMTPConfig,
    private defaultFrom: string
  ) {
    this.transporter = nodemailer.createTransporter({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const mailOptions = {
        from: message.from || this.defaultFrom,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
        attachments: message.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          cid: att.cid,
          encoding: att.encoding,
        })),
        headers: message.headers,
        priority: message.priority,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent via SMTP', {
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
        response: info.response,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('SMTP email send failed', {
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
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('SMTP verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}