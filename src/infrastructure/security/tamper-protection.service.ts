/**
 * Tamper Protection Service
 * Provides advanced tamper detection and protection for audit logs and sensitive data
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '../logging/winston-logger';
import { auditTrailManager, AuditHelpers } from '../monitoring/audit-trail';
import { metricsManager } from '../monitoring/prometheus-metrics';

export interface TamperProtectionConfig {
  enabled: boolean;
  hashAlgorithm: 'sha256' | 'sha512';
  signatureAlgorithm: 'hmac-sha256' | 'hmac-sha512';
  keyRotationInterval: number; // hours
  integrityCheckInterval: number; // minutes
  alertThreshold: number; // number of failures before alert
}

export interface ProtectedData {
  id: string;
  data: any;
  timestamp: Date;
  hash: string;
  signature: string;
  keyId: string;
  version: number;
  metadata: {
    source: string;
    classification: 'public' | 'internal' | 'confidential' | 'restricted';
    retentionPeriod?: number; // days
  };
}

export interface IntegrityViolation {
  id: string;
  timestamp: Date;
  dataId: string;
  violationType:
    | 'hash_mismatch'
    | 'signature_invalid'
    | 'data_modified'
    | 'key_compromised';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  evidence: {
    expectedHash?: string;
    actualHash?: string;
    expectedSignature?: string;
    actualSignature?: string;
  };
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export class TamperProtectionService {
  private readonly config: TamperProtectionConfig;
  private readonly protectedData = new Map<string, ProtectedData>();
  private readonly violations: IntegrityViolation[] = [];
  private readonly signingKeys = new Map<string, Buffer>();
  private currentKeyId: string;
  private keyRotationTimer?: NodeJS.Timeout;
  private integrityCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<TamperProtectionConfig>) {
    this.config = {
      enabled: true,
      hashAlgorithm: 'sha256',
      signatureAlgorithm: 'hmac-sha256',
      keyRotationInterval: 24, // 24 hours
      integrityCheckInterval: 15, // 15 minutes
      alertThreshold: 3,
      ...config,
    };

    this.currentKeyId = this.generateSigningKey();

    if (this.config.enabled) {
      this.startKeyRotation();
      this.startIntegrityChecking();
    }
  }

  /**
   * Protect data with tamper detection
   */
  async protectData(
    data: any,
    metadata: {
      source: string;
      classification: ProtectedData['metadata']['classification'];
      retentionPeriod?: number;
    }
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Tamper protection is disabled');
    }

    const id = this.generateDataId();
    const timestamp = new Date();
    const serializedData = JSON.stringify(data, Object.keys(data).sort());

    // Calculate hash
    const hash = this.calculateHash(serializedData, timestamp.toISOString());

    // Create signature
    const signature = this.createSignature(hash, this.currentKeyId);

    const protectedData: ProtectedData = {
      id,
      data,
      timestamp,
      hash,
      signature,
      keyId: this.currentKeyId,
      version: 1,
      metadata,
    };

    this.protectedData.set(id, protectedData);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor('tamper-protection'),
      action: 'data_protected',
      resource: AuditHelpers.createResource(
        'protected_data',
        id,
        metadata.source
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        classification: metadata.classification,
        hashAlgorithm: this.config.hashAlgorithm,
        signatureAlgorithm: this.config.signatureAlgorithm,
        keyId: this.currentKeyId,
      },
    });

    logger.info('Data protected with tamper detection', {
      dataId: id,
      source: metadata.source,
      classification: metadata.classification,
      hashAlgorithm: this.config.hashAlgorithm,
    });

    return id;
  }

  /**
   * Verify data integrity
   */
  async verifyIntegrity(dataId: string): Promise<{
    valid: boolean;
    violations: string[];
    data?: any;
  }> {
    const protectedData = this.protectedData.get(dataId);
    if (!protectedData) {
      return {
        valid: false,
        violations: ['Data not found'],
      };
    }

    const violations: string[] = [];

    try {
      // Verify hash
      const serializedData = JSON.stringify(
        protectedData.data,
        Object.keys(protectedData.data).sort()
      );
      const expectedHash = this.calculateHash(
        serializedData,
        protectedData.timestamp.toISOString()
      );

      if (
        !timingSafeEqual(
          Buffer.from(protectedData.hash, 'hex'),
          Buffer.from(expectedHash, 'hex')
        )
      ) {
        violations.push(
          'Hash verification failed - data may have been modified'
        );

        await this.recordViolation({
          dataId,
          violationType: 'hash_mismatch',
          severity: 'high',
          details: 'Data hash does not match expected value',
          evidence: {
            expectedHash,
            actualHash: protectedData.hash,
          },
        });
      }

      // Verify signature
      const signingKey = this.signingKeys.get(protectedData.keyId);
      if (!signingKey) {
        violations.push(
          'Signing key not found - key may have been compromised'
        );

        await this.recordViolation({
          dataId,
          violationType: 'key_compromised',
          severity: 'critical',
          details: `Signing key ${protectedData.keyId} not found`,
          evidence: {},
        });
      } else {
        const expectedSignature = this.createSignature(
          protectedData.hash,
          protectedData.keyId
        );

        if (
          !timingSafeEqual(
            Buffer.from(protectedData.signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
          )
        ) {
          violations.push(
            'Signature verification failed - data authenticity compromised'
          );

          await this.recordViolation({
            dataId,
            violationType: 'signature_invalid',
            severity: 'critical',
            details: 'Data signature is invalid',
            evidence: {
              expectedSignature,
              actualSignature: protectedData.signature,
            },
          });
        }
      }

      const isValid = violations.length === 0;

      // Record metrics
      metricsManager.recordSecurityEvent(
        'tamper_protection_verification',
        isValid ? 'low' : 'high',
        'tamper-protection-service'
      );

      if (isValid) {
        logger.debug('Data integrity verified successfully', {
          dataId,
          source: protectedData.metadata.source,
        });
      } else {
        logger.warn('Data integrity verification failed', {
          dataId,
          violations,
          source: protectedData.metadata.source,
        });
      }

      return {
        valid: isValid,
        violations,
        data: isValid ? protectedData.data : undefined,
      };
    } catch (error) {
      const errorMessage = `Integrity verification error: ${(error as Error).message}`;
      violations.push(errorMessage);

      await this.recordViolation({
        dataId,
        violationType: 'data_modified',
        severity: 'high',
        details: errorMessage,
        evidence: {},
      });

      logger.error('Error during integrity verification', {
        dataId,
        error: (error as Error).message,
      });

      return {
        valid: false,
        violations,
      };
    }
  }

  /**
   * Update protected data
   */
  async updateProtectedData(
    dataId: string,
    newData: any,
    updatedBy: string
  ): Promise<void> {
    const existingData = this.protectedData.get(dataId);
    if (!existingData) {
      throw new Error('Protected data not found');
    }

    // Verify current integrity before update
    const verification = await this.verifyIntegrity(dataId);
    if (!verification.valid) {
      throw new Error(
        `Cannot update data with integrity violations: ${verification.violations.join(', ')}`
      );
    }

    const timestamp = new Date();
    const serializedData = JSON.stringify(newData, Object.keys(newData).sort());

    // Calculate new hash and signature
    const hash = this.calculateHash(serializedData, timestamp.toISOString());
    const signature = this.createSignature(hash, this.currentKeyId);

    // Update protected data
    const updatedData: ProtectedData = {
      ...existingData,
      data: newData,
      timestamp,
      hash,
      signature,
      keyId: this.currentKeyId,
      version: existingData.version + 1,
    };

    this.protectedData.set(dataId, updatedData);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(updatedBy),
      action: 'protected_data_updated',
      resource: AuditHelpers.createResource(
        'protected_data',
        dataId,
        existingData.metadata.source
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        previousVersion: existingData.version,
        newVersion: updatedData.version,
        classification: existingData.metadata.classification,
      },
    });

    logger.info('Protected data updated', {
      dataId,
      version: updatedData.version,
      updatedBy,
    });
  }

  /**
   * Get all integrity violations
   */
  getViolations(options?: {
    severity?: IntegrityViolation['severity'];
    resolved?: boolean;
    limit?: number;
  }): IntegrityViolation[] {
    let filteredViolations = [...this.violations];

    if (options?.severity) {
      filteredViolations = filteredViolations.filter(
        (v) => v.severity === options.severity
      );
    }

    if (options?.resolved !== undefined) {
      filteredViolations = filteredViolations.filter(
        (v) => v.resolved === options.resolved
      );
    }

    // Sort by timestamp (newest first)
    filteredViolations.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    if (options?.limit) {
      filteredViolations = filteredViolations.slice(0, options.limit);
    }

    return filteredViolations;
  }

  /**
   * Resolve integrity violation
   */
  async resolveViolation(
    violationId: string,
    resolvedBy: string,
    resolution: string
  ): Promise<void> {
    const violation = this.violations.find((v) => v.id === violationId);
    if (!violation) {
      throw new Error('Violation not found');
    }

    if (violation.resolved) {
      throw new Error('Violation already resolved');
    }

    violation.resolved = true;
    violation.resolvedAt = new Date();
    violation.resolvedBy = resolvedBy;

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(resolvedBy),
      action: 'integrity_violation_resolved',
      resource: AuditHelpers.createResource('integrity_violation', violationId),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        violationType: violation.violationType,
        severity: violation.severity,
        dataId: violation.dataId,
        resolution,
      },
    });

    logger.info('Integrity violation resolved', {
      violationId,
      violationType: violation.violationType,
      severity: violation.severity,
      resolvedBy,
      resolution,
    });
  }

  /**
   * Generate comprehensive integrity report
   */
  generateIntegrityReport(): {
    summary: {
      totalProtectedData: number;
      totalViolations: number;
      unresolvedViolations: number;
      criticalViolations: number;
      lastIntegrityCheck: Date;
    };
    violationsByType: Record<string, number>;
    violationsBySeverity: Record<string, number>;
    protectedDataByClassification: Record<string, number>;
    keyRotationStatus: {
      currentKeyId: string;
      keyCount: number;
      lastRotation: Date;
      nextRotation: Date;
    };
  } {
    const unresolvedViolations = this.violations.filter((v) => !v.resolved);
    const criticalViolations = this.violations.filter(
      (v) => v.severity === 'critical'
    );

    const violationsByType: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};

    this.violations.forEach((violation) => {
      violationsByType[violation.violationType] =
        (violationsByType[violation.violationType] || 0) + 1;
      violationsBySeverity[violation.severity] =
        (violationsBySeverity[violation.severity] || 0) + 1;
    });

    const protectedDataByClassification: Record<string, number> = {};
    for (const data of this.protectedData.values()) {
      protectedDataByClassification[data.metadata.classification] =
        (protectedDataByClassification[data.metadata.classification] || 0) + 1;
    }

    return {
      summary: {
        totalProtectedData: this.protectedData.size,
        totalViolations: this.violations.length,
        unresolvedViolations: unresolvedViolations.length,
        criticalViolations: criticalViolations.length,
        lastIntegrityCheck: new Date(), // This would track actual last check
      },
      violationsByType,
      violationsBySeverity,
      protectedDataByClassification,
      keyRotationStatus: {
        currentKeyId: this.currentKeyId,
        keyCount: this.signingKeys.size,
        lastRotation: new Date(), // This would track actual last rotation
        nextRotation: new Date(
          Date.now() + this.config.keyRotationInterval * 60 * 60 * 1000
        ),
      },
    };
  }

  /**
   * Calculate data hash
   */
  private calculateHash(data: string, timestamp: string): string {
    const hashInput = `${data}:${timestamp}`;
    return createHash(this.config.hashAlgorithm)
      .update(hashInput)
      .digest('hex');
  }

  /**
   * Create signature
   */
  private createSignature(hash: string, keyId: string): string {
    const signingKey = this.signingKeys.get(keyId);
    if (!signingKey) {
      throw new Error(`Signing key not found: ${keyId}`);
    }

    const algorithm = this.config.signatureAlgorithm.replace('hmac-', '');
    return createHmac(algorithm, signingKey).update(hash).digest('hex');
  }

  /**
   * Generate signing key
   */
  private generateSigningKey(): string {
    const keyId = `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const key = randomBytes(32);
    this.signingKeys.set(keyId, key);

    logger.info('New signing key generated', {
      keyId,
      algorithm: this.config.signatureAlgorithm,
    });

    return keyId;
  }

  /**
   * Generate data ID
   */
  private generateDataId(): string {
    return `protected_${Date.now()}_${randomBytes(12).toString('hex')}`;
  }

  /**
   * Record integrity violation
   */
  private async recordViolation(violationData: {
    dataId: string;
    violationType: IntegrityViolation['violationType'];
    severity: IntegrityViolation['severity'];
    details: string;
    evidence: IntegrityViolation['evidence'];
  }): Promise<void> {
    const violation: IntegrityViolation = {
      id: `violation_${Date.now()}_${randomBytes(8).toString('hex')}`,
      timestamp: new Date(),
      ...violationData,
      resolved: false,
    };

    this.violations.push(violation);

    // Record security event
    metricsManager.recordSecurityEvent(
      'integrity_violation',
      violation.severity,
      'tamper-protection-service'
    );

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor('tamper-protection'),
      action: 'integrity_violation_detected',
      resource: AuditHelpers.createResource('protected_data', violation.dataId),
      outcome: AuditHelpers.createFailureOutcome(violation.details),
      metadata: {
        violationId: violation.id,
        violationType: violation.violationType,
        severity: violation.severity,
        evidence: violation.evidence,
      },
    });

    logger.error('Integrity violation detected', {
      violationId: violation.id,
      dataId: violation.dataId,
      violationType: violation.violationType,
      severity: violation.severity,
      details: violation.details,
    });

    // Check if we need to trigger alerts
    const recentViolations = this.violations.filter(
      (v) => v.timestamp > new Date(Date.now() - 60 * 60 * 1000) && !v.resolved
    );

    if (recentViolations.length >= this.config.alertThreshold) {
      await this.triggerSecurityAlert(recentViolations);
    }
  }

  /**
   * Trigger security alert for multiple violations
   */
  private async triggerSecurityAlert(
    violations: IntegrityViolation[]
  ): Promise<void> {
    const criticalCount = violations.filter(
      (v) => v.severity === 'critical'
    ).length;
    const highCount = violations.filter((v) => v.severity === 'high').length;

    // Audit trail for security alert
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor('tamper-protection'),
      action: 'security_alert_triggered',
      resource: AuditHelpers.createResource(
        'security_system',
        'tamper_protection'
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        violationCount: violations.length,
        criticalViolations: criticalCount,
        highViolations: highCount,
        alertThreshold: this.config.alertThreshold,
        violationIds: violations.map((v) => v.id),
      },
    });

    logger.error('Security alert: Multiple integrity violations detected', {
      violationCount: violations.length,
      criticalViolations: criticalCount,
      highViolations: highCount,
      threshold: this.config.alertThreshold,
    });

    // Record critical security event
    metricsManager.recordSecurityEvent(
      'multiple_integrity_violations',
      'critical',
      'tamper-protection-service',
      violations.length
    );
  }

  /**
   * Start key rotation
   */
  private startKeyRotation(): void {
    const rotationIntervalMs = this.config.keyRotationInterval * 60 * 60 * 1000;

    this.keyRotationTimer = setInterval(() => {
      this.rotateSigningKeys();
    }, rotationIntervalMs);

    logger.info('Key rotation started', {
      intervalHours: this.config.keyRotationInterval,
    });
  }

  /**
   * Rotate signing keys
   */
  private async rotateSigningKeys(): Promise<void> {
    try {
      const oldKeyId = this.currentKeyId;
      this.currentKeyId = this.generateSigningKey();

      // Keep old keys for verification of existing data
      // In production, you might want to implement a more sophisticated key management system

      // Audit trail
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor('tamper-protection'),
        action: 'signing_keys_rotated',
        resource: AuditHelpers.createResource(
          'security_system',
          'key_management'
        ),
        outcome: AuditHelpers.createSuccessOutcome(),
        metadata: {
          oldKeyId,
          newKeyId: this.currentKeyId,
          totalKeys: this.signingKeys.size,
        },
      });

      logger.info('Signing keys rotated', {
        oldKeyId,
        newKeyId: this.currentKeyId,
        totalKeys: this.signingKeys.size,
      });
    } catch (error) {
      logger.error('Failed to rotate signing keys', {
        error: (error as Error).message,
      });

      metricsManager.recordSecurityEvent(
        'key_rotation_failure',
        'high',
        'tamper-protection-service'
      );
    }
  }

  /**
   * Start integrity checking
   */
  private startIntegrityChecking(): void {
    const checkIntervalMs = this.config.integrityCheckInterval * 60 * 1000;

    this.integrityCheckTimer = setInterval(() => {
      this.performIntegrityCheck();
    }, checkIntervalMs);

    logger.info('Integrity checking started', {
      intervalMinutes: this.config.integrityCheckInterval,
    });
  }

  /**
   * Perform integrity check on all protected data
   */
  private async performIntegrityCheck(): Promise<void> {
    logger.debug('Starting integrity check', {
      protectedDataCount: this.protectedData.size,
    });

    let checkedCount = 0;
    let violationCount = 0;

    for (const [dataId, _] of this.protectedData) {
      try {
        const result = await this.verifyIntegrity(dataId);
        checkedCount++;

        if (!result.valid) {
          violationCount++;
        }
      } catch (error) {
        logger.error('Error during integrity check', {
          dataId,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Integrity check completed', {
      checkedCount,
      violationCount,
      totalProtectedData: this.protectedData.size,
    });

    // Record metrics
    metricsManager.recordSecurityEvent(
      'integrity_check_completed',
      violationCount > 0 ? 'medium' : 'low',
      'tamper-protection-service',
      violationCount
    );
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    const report = this.generateIntegrityReport();
    const unresolvedCritical = this.violations.filter(
      (v) => !v.resolved && v.severity === 'critical'
    ).length;
    const unresolvedHigh = this.violations.filter(
      (v) => !v.resolved && v.severity === 'high'
    ).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (unresolvedCritical > 0) {
      status = 'unhealthy';
    } else if (unresolvedHigh > 5 || report.summary.unresolvedViolations > 10) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        enabled: this.config.enabled,
        protectedDataCount: this.protectedData.size,
        totalViolations: this.violations.length,
        unresolvedViolations: report.summary.unresolvedViolations,
        criticalViolations: unresolvedCritical,
        highViolations: unresolvedHigh,
        keyCount: this.signingKeys.size,
        currentKeyId: this.currentKeyId,
        keyRotationEnabled: !!this.keyRotationTimer,
        integrityCheckingEnabled: !!this.integrityCheckTimer,
      },
    };
  }

  /**
   * Shutdown tamper protection service
   */
  shutdown(): void {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
      this.keyRotationTimer = undefined;
    }

    if (this.integrityCheckTimer) {
      clearInterval(this.integrityCheckTimer);
      this.integrityCheckTimer = undefined;
    }

    logger.info('Tamper protection service shutdown complete', {
      protectedDataCount: this.protectedData.size,
      violationCount: this.violations.length,
    });
  }
}

// Export singleton instance
export const tamperProtectionService = new TamperProtectionService();
