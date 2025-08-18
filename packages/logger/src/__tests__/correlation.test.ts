import { describe, expect, it } from 'vitest';
import {
    CorrelationContext,
    createChildContext,
    generateCorrelationId,
    getCorrelationContext,
    getCorrelationId,
    setCorrelationContext,
    updateCorrelationContext
} from '../correlation/correlation';

describe('Correlation', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('correlation context', () => {
    it('should return undefined when no context is set', () => {
      expect(getCorrelationContext()).toBeUndefined();
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should set and get correlation context', () => {
      const context: CorrelationContext = {
        correlationId: 'test-id',
        userId: 'user-123',
        sessionId: 'session-456'
      };

      setCorrelationContext(context, () => {
        const retrievedContext = getCorrelationContext();
        expect(retrievedContext).toEqual(context);
        expect(getCorrelationId()).toBe('test-id');
      });
    });

    it('should update correlation context', () => {
      const context: CorrelationContext = {
        correlationId: 'test-id'
      };

      setCorrelationContext(context, () => {
        updateCorrelationContext({ userId: 'user-123' });
        const updatedContext = getCorrelationContext();
        expect(updatedContext?.userId).toBe('user-123');
        expect(updatedContext?.correlationId).toBe('test-id');
      });
    });

    it('should create child context', () => {
      const parentContext: CorrelationContext = {
        correlationId: 'parent-id',
        userId: 'user-123',
        traceId: 'trace-456'
      };

      setCorrelationContext(parentContext, () => {
        const childContext = createChildContext({ userId: 'child-user' });
        
        expect(childContext.correlationId).toBe('parent-id');
        expect(childContext.userId).toBe('child-user');
        expect(childContext.traceId).toBe('trace-456');
        expect(childContext.parentSpanId).toBeUndefined();
        expect(childContext.spanId).toBeDefined();
        expect(childContext.requestId).toBeDefined();
      });
    });

    it('should create independent child context when no parent exists', () => {
      const childContext = createChildContext({ userId: 'test-user' });
      
      expect(childContext.correlationId).toBeDefined();
      expect(childContext.userId).toBe('test-user');
      expect(childContext.traceId).toBeDefined();
      expect(childContext.spanId).toBeDefined();
      expect(childContext.requestId).toBeDefined();
    });
  });
});