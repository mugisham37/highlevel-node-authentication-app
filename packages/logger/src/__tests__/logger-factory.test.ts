import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import winston from 'winston';
import { LoggerFactory, initializeLogger } from '../logger-factory';

describe('LoggerFactory', () => {
  let factory: LoggerFactory;

  beforeEach(() => {
    factory = LoggerFactory.getInstance({
      level: 'debug',
      service: 'test-service',
      enableConsole: true,
      enableFile: false,
      enableRemote: false,
      enableMetrics: true
    });
  });

  afterEach(() => {
    // Reset singleton for clean tests
    (LoggerFactory as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should create a singleton instance', () => {
      const factory1 = LoggerFactory.getInstance();
      const factory2 = LoggerFactory.getInstance();
      expect(factory1).toBe(factory2);
    });

    it('should use provided configuration', () => {
      const config = {
        level: 'error',
        service: 'test',
        enableConsole: false
      };
      const factory = LoggerFactory.getInstance(config);
      expect(factory).toBeDefined();
    });
  });

  describe('createLogger', () => {
    it('should create a logger with service name', () => {
      const logger = factory.createLogger('test-service');
      expect(logger).toBeInstanceOf(winston.Logger);
    });

    it('should create logger with correlation ID', () => {
      const logger = factory.createLoggerWithCorrelation('test-service', 'test-correlation-id');
      expect(logger).toBeInstanceOf(winston.Logger);
    });
  });

  describe('metrics', () => {
    it('should provide metrics when enabled', () => {
      const metrics = factory.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics?.totalLogs).toBe('number');
    });

    it('should provide metrics summary', () => {
      const summary = factory.getMetricsSummary();
      expect(typeof summary).toBe('string');
      expect(summary).toContain('Log Metrics Summary');
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', () => {
      factory.updateConfig({ level: 'warn' });
      expect(factory.getRootLogger().level).toBe('warn');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(factory.shutdown()).resolves.toBeUndefined();
    });
  });
});

describe('initializeLogger', () => {
  it('should initialize default logger factory', () => {
    const factory = initializeLogger({
      level: 'info',
      service: 'test'
    });
    expect(factory).toBeInstanceOf(LoggerFactory);
  });
});