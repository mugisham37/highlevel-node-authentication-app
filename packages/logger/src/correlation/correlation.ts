import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  metadata?: Record<string, any>;
}

/**
 * Async local storage for correlation context
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generate a new correlation ID
 */
export const generateCorrelationId = (): string => {
  return randomUUID();
};

/**
 * Get the current correlation context
 */
export const getCorrelationContext = (): CorrelationContext | undefined => {
  return correlationStorage.getStore();
};

/**
 * Get the current correlation ID
 */
export const getCorrelationId = (): string | undefined => {
  return getCorrelationContext()?.correlationId;
};

/**
 * Set correlation context for the current async context
 */
export const setCorrelationContext = <T>(context: CorrelationContext, callback: () => T): T => {
  return correlationStorage.run(context, callback);
};

/**
 * Update the current correlation context
 */
export const updateCorrelationContext = (updates: Partial<CorrelationContext>): void => {
  const current = getCorrelationContext();
  if (current) {
    Object.assign(current, updates);
  }
};

/**
 * Create a child correlation context
 */
export const createChildContext = (overrides: Partial<CorrelationContext> = {}): CorrelationContext => {
  const parent = getCorrelationContext();
  return {
    correlationId: parent?.correlationId || generateCorrelationId(),
    userId: parent?.userId,
    sessionId: parent?.sessionId,
    requestId: generateCorrelationId(),
    traceId: parent?.traceId || generateCorrelationId(),
    spanId: generateCorrelationId(),
    parentSpanId: parent?.spanId,
    metadata: { ...parent?.metadata },
    ...overrides
  };
};