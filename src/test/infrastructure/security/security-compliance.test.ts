/**
 * Security Compliance Test Suite
 * Tests for security compliance and standards implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tamperProtectionService } from '../../../infrastructure/security/tamper-protection.service';
import { complianceScannerService } from '../../../infrastructure/security/compliance-scanner.service';
import { dataEncryptionService } from '../../../infrastructure/security/data-encryption.service';
import { secureConfigManager } from '../../../infrastructure/security/secure-config-manager.service';
import { gdprComplianceService } from '../../../infrastructure/compliance/gdpr-compliance.service';

describe('Security Compliance Implementation', () => {
  beforeEach(() => {
    // Reset any state before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
  });

  describe('Data Encryption at Rest and in Transit', () => {
    it('should encrypt data at rest successfully', async () => {
      const testData = 'sensitive user data';

      const encryptionResult =
        await dataEncryptionService.encryptAtRest(testData);

      expect(encryptionResult).toHaveProperty('encrypted');
      expect(encryptionResult).toHaveProperty('iv');
      expect(encryptionResult).toHaveProperty('salt');
      expect(encryptionResult).toHaveProperty('algorithm');
      expect(encryptionResult.encrypted).not.toBe(testData);
    });

    it('should decrypt data at rest successfully', async () => {
      const testData = 'sensitive user data';

      const encryptionResult =
        await dataEncryptionService.encryptAtRest(testData);
      const decryptedBuffer =
        await dataEncryptionService.decryptAtRest(encryptionResult);
      const decryptedData = decryptedBuffer.toString('utf8');

      expect(decryptedData).toBe(testData);
    });

    it('should encrypt field-level data', async () => {
      const fieldName = 'user_email';
      const fieldValue = 'user@example.com';

      const encryptedValue = await dataEncryptionService.encryptField(
        fieldName,
        fieldValue
      );

      expect(encryptedValue).not.toBe(fieldValue);
      expect(encryptedValue).toContain(':'); // Should contain IV separator
    });

    it('should decrypt field-level data', async () => {
      const fieldName = 'user_email';
      const fieldValue = 'user@example.com';

      const encryptedValue = await dataEncryptionService.encryptField(
        fieldName,
        fieldValue
      );
      const decryptedValue = await dataEncryptionService.decryptField(
        fieldName,
        encryptedValue
      );

      expect(decryptedValue).toBe(fieldValue);
    });

    it('should encrypt data in transit', async () => {
      const testData = { userId: '123', email: 'user@example.com' };

      const transitResult =
        await dataEncryptionService.encryptInTransit(testData);

      expect(transitResult).toHaveProperty('encryptedData');
      expect(transitResult).toHaveProperty('signature');
      expect(transitResult.encryptedData).not.toBe(JSON.stringify(testData));
    });

    it('should decrypt data in transit', async () => {
      const testData = { userId: '123', email: 'user@example.com' };

      const transitResult =
        await dataEncryptionService.encryptInTransit(testData);
      const decryptedData = await dataEncryptionService.decryptInTransit(
        transitResult.encryptedData,
        transitResult.signature
      );

      expect(decryptedData).toEqual(testData);
    });

    it('should provide encryption statistics', () => {
      const stats = dataEncryptionService.getEncryptionStats();

      expect(stats).toHaveProperty('keysGenerated');
      expect(stats).toHaveProperty('defaultAlgorithm');
      expect(stats).toHaveProperty('keyDerivationRounds');
      expect(stats).toHaveProperty('cacheSize');
      expect(typeof stats.keysGenerated).toBe('number');
    });
  });

  describe('GDPR Compliance Features', () => {
    it('should record consent successfully', async () => {
      const consentRecord = await gdprComplianceService.recordConsent(
        'user123',
        'marketing',
        'consent',
        true,
        '1.0',
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }
      );

      expect(consentRecord).toHaveProperty('id');
      expect(consentRecord.subjectId).toBe('user123');
      expect(consentRecord.purpose).toBe('marketing');
      expect(consentRecord.granted).toBe(true);
      expect(consentRecord.version).toBe('1.0');
    });

    it('should withdraw consent successfully', async () => {
      // First record consent
      await gdprComplianceService.recordConsent(
        'user123',
        'marketing',
        'consent',
        true,
        '1.0'
      );

      // Then withdraw it
      const withdrawnConsent = await gdprComplianceService.withdrawConsent(
        'user123',
        'marketing',
        'User requested withdrawal'
      );

      expect(withdrawnConsent).not.toBeNull();
      expect(withdrawnConsent?.withdrawnAt).toBeDefined();
      expect(withdrawnConsent?.withdrawalReason).toBe(
        'User requested withdrawal'
      );
    });

    it('should check valid consent', () => {
      // This would require setting up consent first
      const hasConsent = gdprComplianceService.hasValidConsent(
        'user123',
        'marketing'
      );
      expect(typeof hasConsent).toBe('boolean');
    });

    it('should request data export', async () => {
      const exportRequest = await gdprComplianceService.requestDataExport(
        'user123',
        'json',
        true
      );

      expect(exportRequest).toHaveProperty('id');
      expect(exportRequest.subjectId).toBe('user123');
      expect(exportRequest.format).toBe('json');
      expect(['pending', 'processing']).toContain(exportRequest.status);
    });

    it('should request data deletion', async () => {
      const deletionRequest = await gdprComplianceService.requestDataDeletion(
        'user123',
        'User requested account deletion'
      );

      expect(deletionRequest).toHaveProperty('id');
      expect(deletionRequest.subjectId).toBe('user123');
      expect(deletionRequest.status).toBe('pending');
      expect(deletionRequest.reason).toBe('User requested account deletion');
    });

    it('should generate compliance report', () => {
      const report = gdprComplianceService.generateComplianceReport();

      expect(report).toHaveProperty('totalSubjects');
      expect(report).toHaveProperty('activeConsents');
      expect(report).toHaveProperty('withdrawnConsents');
      expect(report).toHaveProperty('pendingExports');
      expect(report).toHaveProperty('completedExports');
      expect(report).toHaveProperty('pendingDeletions');
      expect(report).toHaveProperty('completedDeletions');
    });
  });

  describe('Security Audit Logging with Tamper Protection', () => {
    it('should protect data with tamper detection', async () => {
      const testData = {
        userId: '123',
        action: 'login',
        timestamp: new Date(),
      };
      const metadata = {
        source: 'authentication-service',
        classification: 'confidential' as const,
        retentionPeriod: 365,
      };

      const protectedDataId = await tamperProtectionService.protectData(
        testData,
        metadata
      );

      expect(protectedDataId).toBeDefined();
      expect(typeof protectedDataId).toBe('string');
      expect(protectedDataId).toMatch(/^protected_/);
    });

    it('should verify data integrity successfully', async () => {
      const testData = {
        userId: '123',
        action: 'login',
        timestamp: new Date(),
      };
      const metadata = {
        source: 'authentication-service',
        classification: 'confidential' as const,
      };

      const protectedDataId = await tamperProtectionService.protectData(
        testData,
        metadata
      );
      const verificationResult =
        await tamperProtectionService.verifyIntegrity(protectedDataId);

      expect(verificationResult.valid).toBe(true);
      expect(verificationResult.violations).toHaveLength(0);
      expect(verificationResult.data).toEqual(testData);
    });

    it('should detect integrity violations', async () => {
      const nonExistentDataId = 'protected_nonexistent_123';

      const verificationResult =
        await tamperProtectionService.verifyIntegrity(nonExistentDataId);

      expect(verificationResult.valid).toBe(false);
      expect(verificationResult.violations).toContain('Data not found');
    });

    it('should update protected data', async () => {
      const originalData = { userId: '123', action: 'login' };
      const metadata = {
        source: 'authentication-service',
        classification: 'confidential' as const,
      };

      const protectedDataId = await tamperProtectionService.protectData(
        originalData,
        metadata
      );

      const updatedData = { userId: '123', action: 'logout' };
      await tamperProtectionService.updateProtectedData(
        protectedDataId,
        updatedData,
        'system'
      );

      const verificationResult =
        await tamperProtectionService.verifyIntegrity(protectedDataId);
      expect(verificationResult.valid).toBe(true);
      expect(verificationResult.data).toEqual(updatedData);
    });

    it('should generate integrity report', () => {
      const report = tamperProtectionService.generateIntegrityReport();

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('violationsByType');
      expect(report).toHaveProperty('violationsBySeverity');
      expect(report).toHaveProperty('protectedDataByClassification');
      expect(report).toHaveProperty('keyRotationStatus');

      expect(report.summary).toHaveProperty('totalProtectedData');
      expect(report.summary).toHaveProperty('totalViolations');
      expect(report.summary).toHaveProperty('unresolvedViolations');
    });

    it('should get violations with filtering', () => {
      const violations = tamperProtectionService.getViolations({
        severity: 'high',
        resolved: false,
        limit: 10,
      });

      expect(Array.isArray(violations)).toBe(true);
    });
  });

  describe('Vulnerability Scanning Integration', () => {
    it('should provide vulnerability statistics', () => {
      const stats = complianceScannerService.healthCheck();

      expect(stats).toHaveProperty('status');
      expect(stats).toHaveProperty('details');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(stats.status);
    });

    it('should get compliance dashboard', () => {
      const dashboard = complianceScannerService.getComplianceDashboard();

      expect(dashboard).toHaveProperty('overallCompliance');
      expect(dashboard).toHaveProperty('standardsCompliance');
      expect(dashboard).toHaveProperty('criticalFindings');
      expect(dashboard).toHaveProperty('upcomingScans');
      expect(dashboard).toHaveProperty('trends');

      expect(typeof dashboard.overallCompliance).toBe('number');
      expect(Array.isArray(dashboard.criticalFindings)).toBe(true);
    });

    it('should run compliance scan for specific standard', async () => {
      const scanResult =
        await complianceScannerService.runComplianceScan('GDPR');

      expect(scanResult).toHaveProperty('id');
      expect(scanResult).toHaveProperty('standard');
      expect(scanResult).toHaveProperty('overallScore');
      expect(scanResult).toHaveProperty('status');
      expect(scanResult).toHaveProperty('rulesChecked');
      expect(scanResult).toHaveProperty('results');

      expect(scanResult.standard).toBe('GDPR');
      expect(['compliant', 'non_compliant', 'partially_compliant']).toContain(
        scanResult.status
      );
    });

    it('should run comprehensive compliance scan', async () => {
      const scanResults = await complianceScannerService.runComprehensiveScan();

      expect(Array.isArray(scanResults)).toBe(true);

      if (scanResults.length > 0) {
        const firstResult = scanResults[0];
        expect(firstResult).toHaveProperty('id');
        expect(firstResult).toHaveProperty('standard');
        expect(firstResult).toHaveProperty('overallScore');
        expect(firstResult).toHaveProperty('status');
      }
    });
  });

  describe('Secure Configuration Management', () => {
    it('should set secure configuration', async () => {
      await secureConfigManager.setConfig(
        'test_config_key',
        'test_config_value',
        {
          actor: 'test-user',
          reason: 'Testing configuration',
          sensitive: false,
        }
      );

      // Should not throw an error
      expect(true).toBe(true);
    });

    it('should get secure configuration', async () => {
      await secureConfigManager.setConfig(
        'test_config_key',
        'test_config_value',
        {
          actor: 'test-user',
          sensitive: false,
        }
      );

      const value = await secureConfigManager.getConfig('test_config_key', {
        actor: 'test-user',
      });

      expect(value).toBe('test_config_value');
    });

    it('should handle sensitive configuration', async () => {
      await secureConfigManager.setConfig('sensitive_key', 'sensitive_value', {
        actor: 'test-user',
        sensitive: true,
      });

      const value = await secureConfigManager.getConfig('sensitive_key', {
        actor: 'test-user',
      });

      expect(value).toBe('sensitive_value');
    });

    it('should delete configuration', async () => {
      await secureConfigManager.setConfig(
        'delete_test_key',
        'delete_test_value',
        {
          actor: 'test-user',
        }
      );

      const deleted = await secureConfigManager.deleteConfig(
        'delete_test_key',
        {
          actor: 'test-user',
          reason: 'Testing deletion',
        }
      );

      expect(deleted).toBe(true);

      const value = await secureConfigManager.getConfig('delete_test_key');
      expect(value).toBeUndefined();
    });

    it('should get configuration audit log', () => {
      const auditLog = secureConfigManager.getAuditLog({
        limit: 10,
      });

      expect(Array.isArray(auditLog)).toBe(true);
    });

    it('should export configurations', () => {
      const exportData = secureConfigManager.exportConfigurations();

      expect(exportData).toHaveProperty('configurations');
      expect(exportData).toHaveProperty('metadata');
      expect(exportData.metadata).toHaveProperty('exportedAt');
      expect(exportData.metadata).toHaveProperty('environment');
      expect(exportData.metadata).toHaveProperty('totalConfigs');
    });

    it('should validate all configurations', async () => {
      const validationResult =
        await secureConfigManager.validateAllConfigurations();

      expect(validationResult).toHaveProperty('valid');
      expect(validationResult).toHaveProperty('errors');
      expect(typeof validationResult.valid).toBe('boolean');
      expect(Array.isArray(validationResult.errors)).toBe(true);
    });

    it('should get configuration statistics', () => {
      const stats = secureConfigManager.getStatistics();

      expect(stats).toHaveProperty('totalConfigurations');
      expect(stats).toHaveProperty('encryptedConfigurations');
      expect(stats).toHaveProperty('sensitiveConfigurations');
      expect(stats).toHaveProperty('configurationsByEnvironment');
      expect(stats).toHaveProperty('auditLogEntries');

      expect(typeof stats.totalConfigurations).toBe('number');
      expect(typeof stats.encryptedConfigurations).toBe('number');
    });

    it('should perform health check', () => {
      const healthCheck = secureConfigManager.healthCheck();

      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('details');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(
        healthCheck.status
      );
    });
  });

  describe('Compliance Reporting and Documentation', () => {
    it('should register compliance rule', () => {
      const testRule = {
        id: 'test_rule_001',
        standard: 'GDPR' as const,
        category: 'Data Protection',
        title: 'Test Data Protection Rule',
        description: 'Test rule for data protection compliance',
        severity: 'medium' as const,
        automated: true,
        checkFunction: async () => ({
          compliant: true,
          score: 100,
          findings: [],
          evidence: [],
          recommendations: [],
          metadata: {},
        }),
      };

      complianceScannerService.registerRule(testRule);

      // Should not throw an error
      expect(true).toBe(true);
    });

    it('should get latest scan results', () => {
      const latestResults = complianceScannerService.getLatestScanResults();

      expect(Array.isArray(latestResults)).toBe(true);
    });

    it('should perform health check for compliance scanner', () => {
      const healthCheck = complianceScannerService.healthCheck();

      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('details');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(
        healthCheck.status
      );

      expect(healthCheck.details).toHaveProperty('totalRules');
      expect(healthCheck.details).toHaveProperty('automatedRules');
      expect(healthCheck.details).toHaveProperty('overallCompliance');
    });
  });

  describe('Integration Tests', () => {
    it('should integrate encryption with tamper protection', async () => {
      // First encrypt some data
      const sensitiveData = 'highly confidential information';
      const encryptionResult =
        await dataEncryptionService.encryptAtRest(sensitiveData);

      // Then protect the encrypted data with tamper detection
      const protectedDataId = await tamperProtectionService.protectData(
        encryptionResult,
        {
          source: 'encryption-service',
          classification: 'restricted',
        }
      );

      // Verify integrity
      const verificationResult =
        await tamperProtectionService.verifyIntegrity(protectedDataId);
      expect(verificationResult.valid).toBe(true);

      // Decrypt the protected data
      const decryptedBuffer = await dataEncryptionService.decryptAtRest(
        verificationResult.data!
      );
      const decryptedData = decryptedBuffer.toString('utf8');

      expect(decryptedData).toBe(sensitiveData);
    });

    it('should integrate GDPR compliance with secure configuration', async () => {
      // Set GDPR-related configuration
      await secureConfigManager.setConfig(
        'GDPR_DATA_RETENTION_DAYS',
        2555, // 7 years
        {
          actor: 'compliance-officer',
          reason: 'GDPR compliance requirement',
          sensitive: false,
        }
      );

      // Record consent
      const consentRecord = await gdprComplianceService.recordConsent(
        'user456',
        'data_processing',
        'consent',
        true,
        '2.0'
      );

      // Verify configuration was used
      const retentionDays = await secureConfigManager.getConfig(
        'GDPR_DATA_RETENTION_DAYS'
      );
      expect(retentionDays).toBe(2555);
      expect(consentRecord).toHaveProperty('id');
    });

    it('should provide comprehensive security health status', () => {
      const encryptionHealth = dataEncryptionService.healthCheck();
      const configHealth = secureConfigManager.healthCheck();
      const tamperHealth = tamperProtectionService.healthCheck();
      const complianceHealth = complianceScannerService.healthCheck();
      const gdprHealth = gdprComplianceService.healthCheck();

      const allHealthChecks = [
        encryptionHealth,
        configHealth,
        tamperHealth,
        complianceHealth,
        gdprHealth,
      ];

      allHealthChecks.forEach((health) => {
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('details');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      });

      // Calculate overall health
      const healthStatuses = allHealthChecks.map((h) => h.status);
      const overallHealth = healthStatuses.includes('unhealthy')
        ? 'unhealthy'
        : healthStatuses.includes('degraded')
          ? 'degraded'
          : 'healthy';

      expect(['healthy', 'degraded', 'unhealthy']).toContain(overallHealth);
    });
  });
});
