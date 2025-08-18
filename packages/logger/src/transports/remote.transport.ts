import winston from 'winston';
import { TransportStreamOptions } from 'winston-transport';

export interface RemoteTransportOptions extends TransportStreamOptions {
  host: string;
  port: number;
  path?: string;
  protocol?: 'http' | 'https';
  auth?: {
    username: string;
    password: string;
  };
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Remote logging transport for centralized log aggregation
 */
export class RemoteTransport extends winston.Transport {
  private options: RemoteTransportOptions;
  private retryCount: number = 0;

  constructor(options: RemoteTransportOptions) {
    super(options);
    this.options = {
      protocol: 'https',
      path: '/logs',
      timeout: 5000,
      retries: 3,
      retryDelay: 1000,
      ...options
    };
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    this.sendLog(info)
      .then(() => {
        this.retryCount = 0;
        callback();
      })
      .catch((error) => {
        if (this.retryCount < (this.options.retries || 3)) {
          this.retryCount++;
          setTimeout(() => {
            this.log(info, callback);
          }, this.options.retryDelay || 1000);
        } else {
          this.emit('error', error);
          this.retryCount = 0;
          callback();
        }
      });
  }

  private async sendLog(info: any): Promise<void> {
    const url = `${this.options.protocol}://${this.options.host}:${this.options.port}${this.options.path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers
    };

    if (this.options.auth) {
      const auth = Buffer.from(`${this.options.auth.username}:${this.options.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const payload = {
      timestamp: info.timestamp || new Date().toISOString(),
      level: info.level,
      message: info.message,
      service: info.service,
      correlationId: info.correlationId,
      meta: info.meta || {},
      hostname: require('os').hostname(),
      pid: process.pid
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options.timeout || 5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Failed to send log to remote server: ${error.message}`);
    }
  }
}

export const createRemoteTransport = (options: RemoteTransportOptions): RemoteTransport => {
  return new RemoteTransport(options);
};