import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { TransportStreamOptions } from 'winston-transport';

export interface FileTransportOptions extends TransportStreamOptions {
  filename: string;
  maxSize?: string;
  maxFiles?: string | number;
  datePattern?: string;
  zippedArchive?: boolean;
  auditFile?: string;
  createSymlink?: boolean;
  symlinkName?: string;
}

/**
 * File transport with daily rotation support
 */
export class FileTransport extends DailyRotateFile {
  constructor(options: FileTransportOptions) {
    const format = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    super({
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
      auditFile: `${options.filename}-audit.json`,
      createSymlink: true,
      symlinkName: `${options.filename}-current.log`,
      ...options,
      format
    });

    // Handle rotation events
    this.on('rotate', (oldFilename, newFilename) => {
      console.log(`Log rotated from ${oldFilename} to ${newFilename}`);
    });

    this.on('archive', (zipFilename) => {
      console.log(`Log archived to ${zipFilename}`);
    });

    this.on('logRemoved', (removedFilename) => {
      console.log(`Old log file removed: ${removedFilename}`);
    });
  }
}

/**
 * Create a standard file transport
 */
export const createFileTransport = (options: FileTransportOptions): FileTransport => {
  return new FileTransport(options);
};

/**
 * Create an error-only file transport
 */
export const createErrorFileTransport = (filename: string, options: Partial<FileTransportOptions> = {}): FileTransport => {
  return new FileTransport({
    filename,
    level: 'error',
    ...options
  });
};

/**
 * Create a combined log file transport
 */
export const createCombinedFileTransport = (filename: string, options: Partial<FileTransportOptions> = {}): FileTransport => {
  return new FileTransport({
    filename,
    level: 'info',
    ...options
  });
};