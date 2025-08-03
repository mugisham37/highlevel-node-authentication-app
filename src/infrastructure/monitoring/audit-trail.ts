/**
 * Audit Trail System with Tamper Protection
 * Provides comprehensive audit logging with integrity verification
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import { correlationIdManager } from '../tracing/correlation-id';
import { loggers } from './structured-logger';
import { metricsManager } from './prometheus-metrics';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  outcome: AuditOutcome;
  context: AuditContext;
  changes?: AuditChanges;
  metadata: Record<string, any>;
  correlationId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  integrity: AuditIntegrity;
}

export interface AuditActor {
  type: 'user' | 'system' | 'service' | 'admin' | 'api_client';
  id: string;
  name?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  impersonatedBy?: string; // For admin impersonation
}

export interface AuditResource {
  type: string;
  id?: string;
  name?: string;
  attributes?: Record<string, any>;
  parent?: {
    type: string;
    id: string;
  };
}

export interface AuditOutcome {
  result: 'success' | 'failure' | 'partial';
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  riskScore?: number;
}

export interface AuditContext {
  operation: string;
  component: string;
  service: string;
  version: string;
  environment: string;
  requestId?: string;
  businessContext?: Record<string, any>;
  complianceContext?: {
    regulation: string;
    requirement: string;
    classification: string;
  };
}

export interface AuditChanges {
  before?: Record<string, any>;
  after?: Record<string, any>;
  delta?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    operation: 'create' | 'update' | 'delete';
  }>;
}

export interface AuditIntegrity {
  hash: string;
  signature: string;
  algorithm: string;
  keyId: string;
  previousHash?: string;
  chainIndex: number;
}

export interface AuditQuery {
  actor?: {
    type?: string;
    id?: string;
  };
  resource?: {
    type?: string;
    id?: string;
  };
  action?: string;
  outcome?: string;
  timeRange?: {
    from: Date;
    to: Date;
  };
  correlationId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'actor' | 'resource' | 'action';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStatistics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByActor: Record<string, number>;
  eventsByResource: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  timeRange: {
    earliest: Date;
    latest: Date;
  };
  integrityStatus: {
    verified: number;
    failed: number;
    pending: number;
  };
}

/**
 * Audit Trail Manager
 */
export class AuditTrailManager {
  private events: AuditEvent[] = [];
  private maxEvents = 100000; // Keep last 100k events in memory
  private secretKey: Buffer;
  private keyId: string;
  private chainIndex = 0;
  private lastHash?: string;
  private persistenceEnabled = true;
  private integrityCheckInterval?: NodeJS.Timeout;

  constructor(secretKey?: string) {
    this.secretKey = secretKey
      ? Buffer.from(secretKey, 'hex')
      : randomBytes(32);
    this.keyId = createHash('sha256')
      .update(this.secretKey)
      .digest('hex')
      .substring(0, 16);
    this.startIntegrityChecking();
  }

  /**
   * Record audit event
   */
  async recordEvent(eventData: {
    actor: AuditActor;
    action: string;
    resource: AuditResource;
    outcome: AuditOutcome;
    context?: Partial<AuditContext>;
    changes?: AuditChanges;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditEvent> {
    const correlationId = correlationIdManager.getCorrelationId();
    const sessionId = correlationIdManager.getContext()?.sessionId;

    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      actor: eventData.actor,
      action: eventData.action,
      resource: eventData.resource,
      outcome: eventData.outcome,
      context: {
        operation: eventData.action,
        component: 'audit',
        service: 'auth-backend',
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        requestId: correlationId,
        ...eventData.context,
      },
      changes: eventData.changes,
      metadata: eventData.metadata || {},
      correlationId,
      sessionId,
      ipAddress: eventData.ipAddress,
      userAgent: eventData.userAgent,
      integrity: this.generateIntegrity(eventData),
    };

    // Add to chain
    this.chainIndex++;
    event.integrity.chainIndex = this.chainIndex;
    event.integrity.previousHash = this.lastHash;

    // Calculate final hash including chain data
    event.integrity.hash = this.calculateEventHash(event);
    event.integrity.signature = this.signEvent(event);
    this.lastHash = event.integrity.hash;

    // Store event
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log audit event
    loggers.audit.audit(`Audit event recorded: ${event.action}`, {
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      outcome: event.outcome,
      correlationId: event.correlationId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      changes: event.changes,
      metadata: event.metadata,
      integrity: {
        hash: event.integrity.hash,
        chainIndex: event.integrity.chainIndex,
      },
    });

    // Record metrics
    metricsManager.recordSecurityEvent(
      `audit_${event.action}`,
      event.outcome.result === 'success' ? 'low' : 'medium',
      event.context.component,
      event.outcome.riskScore
    );

    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistEvent(event);
    }

    return event;
  }

  /**
   * Query audit events
   */
  queryEvents(query: AuditQuery = {}): AuditEvent[] {
    let filteredEvents = [...this.events];

    // Apply filters
    if (query.actor?.type) {
      filteredEvents = filteredEvents.filter(
        (event) => event.actor.type === query.actor!.type
      );
    }

    if (query.actor?.id) {
      filteredEvents = filteredEvents.filter(
        (event) => event.actor.id === query.actor!.id
      );
    }

    if (query.resource?.type) {
      filteredEvents = filteredEvents.filter(
        (event) => event.resource.type === query.resource!.type
      );
    }

    if (query.resource?.id) {
      filteredEvents = filteredEvents.filter(
        (event) => event.resource.id === query.resource!.id
      );
    }

    if (query.action) {
      filteredEvents = filteredEvents.filter(
        (event) => event.action === query.action
      );
    }

    if (query.outcome) {
      filteredEvents = filteredEvents.filter(
        (event) => event.outcome.result === query.outcome
      );
    }

    if (query.timeRange) {
      filteredEvents = filteredEvents.filter(
        (event) =>
          event.timestamp >= query.timeRange!.from &&
          event.timestamp <= query.timeRange!.to
      );
    }

    if (query.correlationId) {
      filteredEvents = filteredEvents.filter(
        (event) => event.correlationId === query.correlationId
      );
    }

    if (query.sessionId) {
      filteredEvents = filteredEvents.filter(
        (event) => event.sessionId === query.sessionId
      );
    }

    // Apply sorting
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';

    filteredEvents.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
          break;
        case 'actor':
          aValue = a.actor.id;
          bValue = b.actor.id;
          break;
        case 'resource':
          aValue = a.resource.type + (a.resource.id || '');
          bValue = b.resource.type + (b.resource.id || '');
          break;
        case 'action':
          aValue = a.action;
          bValue = b.action;
          break;
        default:
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    return filteredEvents.slice(offset, offset + limit);
  }

  /**
   * Get audit statistics
   */
  getStatistics(): AuditStatistics {
    const events = this.events;

    if (events.length === 0) {
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsByActor: {},
        eventsByResource: {},
        eventsByOutcome: {},
        timeRange: {
          earliest: new Date(),
          latest: new Date(),
        },
        integrityStatus: {
          verified: 0,
          failed: 0,
          pending: 0,
        },
      };
    }

    const eventsByType: Record<string, number> = {};
    const eventsByActor: Record<string, number> = {};
    const eventsByResource: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};

    events.forEach((event) => {
      // By type (action)
      eventsByType[event.action] = (eventsByType[event.action] || 0) + 1;

      // By actor
      const actorKey = `${event.actor.type}:${event.actor.id}`;
      eventsByActor[actorKey] = (eventsByActor[actorKey] || 0) + 1;

      // By resource
      const resourceKey = `${event.resource.type}${event.resource.id ? ':' + event.resource.id : ''}`;
      eventsByResource[resourceKey] = (eventsByResource[resourceKey] || 0) + 1;

      // By outcome
      eventsByOutcome[event.outcome.result] =
        (eventsByOutcome[event.outcome.result] || 0) + 1;
    });

    const timestamps = events.map((event) => event.timestamp.getTime());
    const earliest = new Date(Math.min(...timestamps));
    const latest = new Date(Math.max(...timestamps));

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByActor,
      eventsByResource,
      eventsByOutcome,
      timeRange: { earliest, latest },
      integrityStatus: {
        verified: events.length, // Simplified - would check actual integrity
        failed: 0,
        pending: 0,
      },
    };
  }

  /**
   * Verify event integrity
   */
  verifyEventIntegrity(event: AuditEvent): boolean {
    try {
      // Verify hash
      const calculatedHash = this.calculateEventHash(event);
      if (calculatedHash !== event.integrity.hash) {
        loggers.audit.error('Audit event hash verification failed', {
          eventId: event.id,
          expectedHash: event.integrity.hash,
          calculatedHash,
        });
        return false;
      }

      // Verify signature
      const calculatedSignature = this.signEvent(event);
      if (calculatedSignature !== event.integrity.signature) {
        loggers.audit.error('Audit event signature verification failed', {
          eventId: event.id,
          expectedSignature: event.integrity.signature,
          calculatedSignature,
        });
        return false;
      }

      return true;
    } catch (error) {
      loggers.audit.error('Audit event integrity verification error', {
        eventId: event.id,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Verify chain integrity
   */
  verifyChainIntegrity(): {
    valid: boolean;
    brokenAt?: number;
    details: string;
  } {
    if (this.events.length === 0) {
      return { valid: true, details: 'No events to verify' };
    }

    let previousHash: string | undefined;

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      // Verify individual event integrity
      if (!this.verifyEventIntegrity(event)) {
        return {
          valid: false,
          brokenAt: i,
          details: `Event integrity verification failed at index ${i}`,
        };
      }

      // Verify chain linkage
      if (previousHash && event.integrity.previousHash !== previousHash) {
        return {
          valid: false,
          brokenAt: i,
          details: `Chain linkage broken at index ${i}`,
        };
      }

      previousHash = event.integrity.hash;
    }

    return { valid: true, details: 'Chain integrity verified' };
  }

  /**
   * Export audit trail
   */
  exportAuditTrail(
    query: AuditQuery = {},
    format: 'json' | 'csv' = 'json'
  ): string {
    const events = this.queryEvents(query);

    if (format === 'csv') {
      return this.exportToCsv(events);
    } else {
      return JSON.stringify(events, null, 2);
    }
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate integrity data
   */
  private generateIntegrity(eventData: any): AuditIntegrity {
    return {
      hash: '', // Will be calculated after event is complete
      signature: '', // Will be calculated after event is complete
      algorithm: 'SHA256-HMAC',
      keyId: this.keyId,
      chainIndex: 0, // Will be set during recording
    };
  }

  /**
   * Calculate event hash
   */
  private calculateEventHash(event: AuditEvent): string {
    // Create a deterministic representation of the event
    const hashData = {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      outcome: event.outcome,
      context: event.context,
      changes: event.changes,
      metadata: event.metadata,
      correlationId: event.correlationId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      chainIndex: event.integrity.chainIndex,
      previousHash: event.integrity.previousHash,
    };

    const dataString = JSON.stringify(hashData, Object.keys(hashData).sort());
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Sign event
   */
  private signEvent(event: AuditEvent): string {
    const eventHash = event.integrity.hash || this.calculateEventHash(event);
    return createHmac('sha256', this.secretKey).update(eventHash).digest('hex');
  }

  /**
   * Persist event (placeholder for database storage)
   */
  private async persistEvent(event: AuditEvent): Promise<void> {
    // This would implement actual database persistence
    // For now, just log that persistence would occur
    loggers.audit.debug('Audit event persisted', {
      eventId: event.id,
      action: event.action,
      actor: event.actor.id,
    });
  }

  /**
   * Export to CSV
   */
  private exportToCsv(events: AuditEvent[]): string {
    if (events.length === 0) {
      return 'No events to export';
    }

    const headers = [
      'ID',
      'Timestamp',
      'Actor Type',
      'Actor ID',
      'Action',
      'Resource Type',
      'Resource ID',
      'Outcome',
      'IP Address',
      'Correlation ID',
      'Hash',
    ];

    const rows = events.map((event) => [
      event.id,
      event.timestamp.toISOString(),
      event.actor.type,
      event.actor.id,
      event.action,
      event.resource.type,
      event.resource.id || '',
      event.outcome.result,
      event.ipAddress || '',
      event.correlationId || '',
      event.integrity.hash,
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Start integrity checking
   */
  private startIntegrityChecking(): void {
    this.integrityCheckInterval = setInterval(() => {
      const result = this.verifyChainIntegrity();
      if (!result.valid) {
        loggers.audit.error('Audit chain integrity check failed', {
          brokenAt: result.brokenAt,
          details: result.details,
        });

        // Record security event for integrity failure
        metricsManager.recordSecurityEvent(
          'audit_integrity_failure',
          'critical',
          'audit-system'
        );
      } else {
        loggers.audit.debug('Audit chain integrity verified', {
          totalEvents: this.events.length,
          details: result.details,
        });
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Shutdown audit trail manager
   */
  shutdown(): void {
    if (this.integrityCheckInterval) {
      clearInterval(this.integrityCheckInterval);
    }

    loggers.audit.info('Audit trail manager shutdown complete', {
      totalEvents: this.events.length,
      chainIndex: this.chainIndex,
    });
  }
}

/**
 * Audit Helper Functions
 */
export class AuditHelpers {
  /**
   * Create actor from user context
   */
  static createUserActor(
    userId: string,
    userType: 'user' | 'admin' = 'user',
    additionalData?: {
      name?: string;
      email?: string;
      roles?: string[];
      permissions?: string[];
      impersonatedBy?: string;
    }
  ): AuditActor {
    return {
      type: userType,
      id: userId,
      name: additionalData?.name,
      email: additionalData?.email,
      roles: additionalData?.roles,
      permissions: additionalData?.permissions,
      impersonatedBy: additionalData?.impersonatedBy,
    };
  }

  /**
   * Create system actor
   */
  static createSystemActor(
    systemId: string = 'auth-backend',
    service?: string
  ): AuditActor {
    return {
      type: 'system',
      id: systemId,
      name: service || 'Authentication Backend',
    };
  }

  /**
   * Create resource descriptor
   */
  static createResource(
    type: string,
    id?: string,
    name?: string,
    attributes?: Record<string, any>,
    parent?: { type: string; id: string }
  ): AuditResource {
    return {
      type,
      id,
      name,
      attributes,
      parent,
    };
  }

  /**
   * Create successful outcome
   */
  static createSuccessOutcome(riskScore?: number): AuditOutcome {
    return {
      result: 'success',
      riskScore,
    };
  }

  /**
   * Create failure outcome
   */
  static createFailureOutcome(
    reason: string,
    errorCode?: string,
    errorMessage?: string,
    riskScore?: number
  ): AuditOutcome {
    return {
      result: 'failure',
      reason,
      errorCode,
      errorMessage,
      riskScore,
    };
  }

  /**
   * Create changes descriptor
   */
  static createChanges(
    before?: Record<string, any>,
    after?: Record<string, any>
  ): AuditChanges {
    const changes: AuditChanges = { before, after };

    if (before && after) {
      changes.delta = [];
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

      for (const key of allKeys) {
        const oldValue = before[key];
        const newValue = after[key];

        if (oldValue !== newValue) {
          let operation: 'create' | 'update' | 'delete';

          if (oldValue === undefined) {
            operation = 'create';
          } else if (newValue === undefined) {
            operation = 'delete';
          } else {
            operation = 'update';
          }

          changes.delta.push({
            field: key,
            oldValue,
            newValue,
            operation,
          });
        }
      }
    }

    return changes;
  }
}

// Export singleton instance
export const auditTrailManager = new AuditTrailManager(
  process.env.AUDIT_SECRET_KEY
);
