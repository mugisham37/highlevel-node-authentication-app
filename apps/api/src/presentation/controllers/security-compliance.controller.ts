/**
 * Security Compliance Controller
 * Handles security compliance and standards implementation endpoints
 */

import {
  complianceScannerService,
  dataEncryptionService,
  EncryptionOptions,
  secureConfigManager,
  tamperProtectionService,
  vulnerabilityScannerService,
} from '@company/auth';
import { logger } from '@company/logger';
import {
  complianceReportingService,
  gdprComplianceService,
} from '@company/shared';
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Request schemas
const ConsentRequestSchema = z.object({
  subjectId: z.string(),
  purpose: z.string(),
  legalBasis: z.enum([
    'consent',
    'contract',
    'legal_obligation',
    'vital_interests',
    'public_task',
    'legitimate_interests',
  ]),
  granted: z.boolean(),
  version: z.string(),
});

const DataExportRequestSchema = z.object({
  subjectId: z.string(),
  format: z.enum(['json', 'xml', 'csv']).optional(),
  includeMetadata: z.boolean().optional(),
});

const DataDeletionRequestSchema = z.object({
  subjectId: z.string(),
  reason: z.string().optional(),
});

const ComplianceReportRequestSchema = z.object({
  standards: z.array(z.enum(['GDPR', 'SOC2', 'ISO27001', 'NIST'])).optional(),
  reportPeriod: z.object({
    from: z.string().transform((str) => new Date(str)),
    to: z.string().transform((str) => new Date(str)),
  }),
  reportType: z
    .enum(['self_assessment', 'audit_preparation', 'certification'])
    .optional(),
});

const VulnerabilityScanRequestSchema = z.object({
  scanType: z
    .enum(['dependency', 'code', 'infrastructure', 'comprehensive'])
    .optional(),
});

const ConfigurationRequestSchema = z.object({
  key: z.string(),
  value: z.any(),
  sensitive: z.boolean().optional(),
  environment: z.string().optional(),
  reason: z.string().optional(),
});

export class SecurityComplianceController {
  /**
   * Record GDPR consent
   */
  async recordConsent(
    request: FastifyRequest<{
      Body: z.infer<typeof ConsentRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = ConsentRequestSchema.parse(request.body);
      const clientIP = request.ip;
      const userAgent = request.headers['user-agent'];

      const metadata: any = {
        ipAddress: clientIP,
      };

      if (userAgent !== undefined) {
        metadata.userAgent = userAgent;
      }

      const consentRecord = await gdprComplianceService.recordConsent(
        validatedData.subjectId,
        validatedData.purpose,
        validatedData.legalBasis,
        validatedData.granted,
        validatedData.version,
        metadata
      );

      logger.info('GDPR consent recorded via API', {
        consentId: consentRecord.id,
        subjectId: validatedData.subjectId,
        purpose: validatedData.purpose,
        granted: validatedData.granted,
      });

      reply.status(201).send({
        success: true,
        data: consentRecord,
      });
    } catch (error) {
      logger.error('Failed to record GDPR consent', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Withdraw GDPR consent
   */
  async withdrawConsent(
    request: FastifyRequest<{
      Body: {
        subjectId: string;
        purpose: string;
        reason?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { subjectId, purpose, reason } = request.body;
      const clientIP = request.ip;
      const userAgent = request.headers['user-agent'];

      const metadata: any = {
        ipAddress: clientIP,
      };

      if (userAgent !== undefined) {
        metadata.userAgent = userAgent;
      }

      const consentRecord = await gdprComplianceService.withdrawConsent(
        subjectId,
        purpose,
        reason,
        metadata
      );

      if (!consentRecord) {
        reply.status(404).send({
          success: false,
          error: 'No active consent found for the specified purpose',
        });
        return;
      }

      logger.info('GDPR consent withdrawn via API', {
        consentId: consentRecord.id,
        subjectId,
        purpose,
        reason,
      });

      reply.send({
        success: true,
        data: consentRecord,
      });
    } catch (error) {
      logger.error('Failed to withdraw GDPR consent', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Request data export (GDPR Article 20)
   */
  async requestDataExport(
    request: FastifyRequest<{
      Body: z.infer<typeof DataExportRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = DataExportRequestSchema.parse(request.body);

      const exportRequest = await gdprComplianceService.requestDataExport(
        validatedData.subjectId,
        validatedData.format || 'json',
        validatedData.includeMetadata ?? true
      );

      logger.info('GDPR data export requested via API', {
        exportId: exportRequest.id,
        subjectId: validatedData.subjectId,
        format: exportRequest.format,
      });

      reply.status(202).send({
        success: true,
        data: exportRequest,
        message:
          'Data export request submitted. You will be notified when ready.',
      });
    } catch (error) {
      logger.error('Failed to request data export', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Request data deletion (GDPR Article 17)
   */
  async requestDataDeletion(
    request: FastifyRequest<{
      Body: z.infer<typeof DataDeletionRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = DataDeletionRequestSchema.parse(request.body);

      const deletionRequest = await gdprComplianceService.requestDataDeletion(
        validatedData.subjectId,
        validatedData.reason
      );

      logger.info('GDPR data deletion requested via API', {
        deletionId: deletionRequest.id,
        subjectId: validatedData.subjectId,
        reason: validatedData.reason,
      });

      reply.status(202).send({
        success: true,
        data: deletionRequest,
        message:
          'Data deletion request submitted and will be processed according to retention policies.',
      });
    } catch (error) {
      logger.error('Failed to request data deletion', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    request: FastifyRequest<{
      Body: z.infer<typeof ComplianceReportRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = ComplianceReportRequestSchema.parse(request.body);
      const standards = validatedData.standards || ['GDPR', 'SOC2'];

      const reports =
        await complianceReportingService.generateSecurityComplianceReport(
          validatedData.reportPeriod,
          standards,
          {
            reportType: validatedData.reportType || 'self_assessment',
            generatedBy: 'api-user', // This would come from authentication context
          }
        );

      logger.info('Compliance report generated via API', {
        standards,
        reportPeriod: validatedData.reportPeriod,
        reportCount: reports.length,
      });

      reply.send({
        success: true,
        data: reports,
      });
    } catch (error) {
      logger.error('Failed to generate compliance report', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Run vulnerability scan
   */
  async runVulnerabilityScan(
    request: FastifyRequest<{
      Body: z.infer<typeof VulnerabilityScanRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = VulnerabilityScanRequestSchema.parse(request.body);
      const scanType = validatedData.scanType || 'comprehensive';

      let scanResult;

      switch (scanType) {
        case 'dependency':
          scanResult = await vulnerabilityScannerService.scanDependencies();
          break;
        case 'code':
          scanResult = await vulnerabilityScannerService.scanCode();
          break;
        case 'infrastructure':
          scanResult = await vulnerabilityScannerService.scanInfrastructure();
          break;
        case 'comprehensive':
          const results =
            await vulnerabilityScannerService.runComprehensiveScan();
          reply.send({
            success: true,
            data: results,
          });
          return;
        default:
          throw new Error(`Unsupported scan type: ${scanType}`);
      }

      logger.info('Vulnerability scan completed via API', {
        scanType,
        reportId: scanResult.id,
        vulnerabilities: scanResult.summary,
      });

      reply.send({
        success: true,
        data: scanResult,
      });
    } catch (error) {
      logger.error('Failed to run vulnerability scan', {
        error: (error as Error).message,
        body: request.body,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get vulnerability statistics
   */
  async getVulnerabilityStatistics(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const statistics =
        vulnerabilityScannerService.getVulnerabilityStatistics();

      reply.send({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error('Failed to get vulnerability statistics', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Set secure configuration
   */
  async setSecureConfiguration(
    request: FastifyRequest<{
      Body: z.infer<typeof ConfigurationRequestSchema>;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const validatedData = ConfigurationRequestSchema.parse(request.body);

      const configOptions: any = {
        actor: 'api-user', // This would come from authentication context
      };

      if (validatedData.reason !== undefined) {
        configOptions.reason = validatedData.reason;
      }
      if (validatedData.environment !== undefined) {
        configOptions.environment = validatedData.environment;
      }
      if (validatedData.sensitive !== undefined) {
        configOptions.sensitive = validatedData.sensitive;
      }

      await secureConfigManager.setConfig(
        validatedData.key,
        validatedData.value,
        configOptions
      );

      logger.info('Secure configuration set via API', {
        key: validatedData.key,
        sensitive: validatedData.sensitive,
        environment: validatedData.environment,
      });

      reply.send({
        success: true,
        message: 'Configuration updated successfully',
      });
    } catch (error) {
      logger.error('Failed to set secure configuration', {
        error: (error as Error).message,
        key: request.body?.key,
      });

      reply.status(400).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get secure configuration
   */
  async getSecureConfiguration(
    request: FastifyRequest<{
      Params: { key: string };
      Querystring: { environment?: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { key } = request.params;
      const { environment } = request.query;

      const configOptions: any = {
        actor: 'api-user', // This would come from authentication context
      };

      if (environment !== undefined) {
        configOptions.environment = environment;
      }

      const value = await secureConfigManager.getConfig(key, configOptions);

      if (value === undefined) {
        reply.status(404).send({
          success: false,
          error: 'Configuration not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: { key, value },
      });
    } catch (error) {
      logger.error('Failed to get secure configuration', {
        error: (error as Error).message,
        key: request.params?.key,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get configuration audit log
   */
  async getConfigurationAuditLog(
    request: FastifyRequest<{
      Querystring: {
        key?: string;
        actor?: string;
        action?: string;
        limit?: number;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const auditLog = secureConfigManager.getAuditLog(request.query);

      reply.send({
        success: true,
        data: auditLog,
      });
    } catch (error) {
      logger.error('Failed to get configuration audit log', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Encrypt data
   */
  async encryptData(
    request: FastifyRequest<{
      Body: {
        data: string;
        options?: {
          algorithm?: string;
          keyDerivation?: string;
        };
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { data, options } = request.body;

      // Validate and filter encryption options
      let filteredOptions: Partial<EncryptionOptions> | undefined;
      if (options) {
        filteredOptions = {};

        // Validate algorithm
        if (options.algorithm) {
          const validAlgorithms: (
            | 'aes-256-gcm'
            | 'aes-256-cbc'
            | 'chacha20-poly1305'
          )[] = ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'];
          if (validAlgorithms.includes(options.algorithm as any)) {
            filteredOptions.algorithm = options.algorithm as any;
          }
        }

        // Validate keyDerivation
        if (options.keyDerivation) {
          const validKeyDerivations: ('pbkdf2' | 'scrypt' | 'argon2')[] = [
            'pbkdf2',
            'scrypt',
            'argon2',
          ];
          if (validKeyDerivations.includes(options.keyDerivation as any)) {
            filteredOptions.keyDerivation = options.keyDerivation as any;
          }
        }
      }

      const encryptionResult = await dataEncryptionService.encryptAtRest(
        data,
        filteredOptions
      );

      logger.info('Data encrypted via API', {
        algorithm: encryptionResult.algorithm,
        dataSize: data.length,
      });

      reply.send({
        success: true,
        data: encryptionResult,
      });
    } catch (error) {
      logger.error('Failed to encrypt data', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Decrypt data
   */
  async decryptData(
    request: FastifyRequest<{
      Body: {
        encryptionResult: {
          encrypted: string;
          iv: string;
          salt: string;
          algorithm: string;
          tag?: string;
        };
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { encryptionResult } = request.body;

      const decryptedBuffer =
        await dataEncryptionService.decryptAtRest(encryptionResult);
      const decryptedData = decryptedBuffer.toString('utf8');

      logger.info('Data decrypted via API', {
        algorithm: encryptionResult.algorithm,
        dataSize: decryptedData.length,
      });

      reply.send({
        success: true,
        data: decryptedData,
      });
    } catch (error) {
      logger.error('Failed to decrypt data', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get encryption statistics
   */
  async getEncryptionStatistics(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const statistics = dataEncryptionService.getEncryptionStats();

      reply.send({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error('Failed to get encryption statistics', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Protect data with tamper detection
   */
  async protectData(
    request: FastifyRequest<{
      Body: {
        data: any;
        metadata: {
          source: string;
          classification: 'public' | 'internal' | 'confidential' | 'restricted';
          retentionPeriod?: number;
        };
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { data, metadata } = request.body;

      const protectedDataId = await tamperProtectionService.protectData(
        data,
        metadata
      );

      logger.info('Data protected with tamper detection via API', {
        protectedDataId,
        source: metadata.source,
        classification: metadata.classification,
      });

      reply.status(201).send({
        success: true,
        data: { id: protectedDataId },
        message: 'Data protected with tamper detection',
      });
    } catch (error) {
      logger.error('Failed to protect data', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Verify data integrity
   */
  async verifyDataIntegrity(
    request: FastifyRequest<{
      Params: { dataId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { dataId } = request.params;

      const verificationResult =
        await tamperProtectionService.verifyIntegrity(dataId);

      logger.info('Data integrity verified via API', {
        dataId,
        valid: verificationResult.valid,
        violations: verificationResult.violations.length,
      });

      reply.send({
        success: true,
        data: verificationResult,
      });
    } catch (error) {
      logger.error('Failed to verify data integrity', {
        error: (error as Error).message,
        dataId: request.params?.dataId,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get integrity violations
   */
  async getIntegrityViolations(
    request: FastifyRequest<{
      Querystring: {
        severity?: 'low' | 'medium' | 'high' | 'critical';
        resolved?: boolean;
        limit?: number;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const violations = tamperProtectionService.getViolations(request.query);

      reply.send({
        success: true,
        data: violations,
      });
    } catch (error) {
      logger.error('Failed to get integrity violations', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Run compliance scan
   */
  async runComplianceScan(
    request: FastifyRequest<{
      Body: {
        standard?: 'GDPR' | 'SOC2' | 'ISO27001' | 'NIST' | 'PCI_DSS' | 'HIPAA';
        comprehensive?: boolean;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { standard, comprehensive } = request.body;

      let scanResults;

      if (comprehensive || !standard) {
        scanResults = await complianceScannerService.runComprehensiveScan();
      } else {
        scanResults = [
          await complianceScannerService.runComplianceScan(standard),
        ];
      }

      logger.info('Compliance scan completed via API', {
        standard: standard || 'comprehensive',
        resultsCount: scanResults.length,
      });

      reply.send({
        success: true,
        data: comprehensive || !standard ? scanResults : scanResults[0],
      });
    } catch (error) {
      logger.error('Failed to run compliance scan', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get compliance dashboard
   */
  async getComplianceDashboard(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const dashboard = complianceScannerService.getComplianceDashboard();

      reply.send({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      logger.error('Failed to get compliance dashboard', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get system health check for security compliance
   */
  async getSecurityHealthCheck(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const healthChecks = {
        dataEncryption: dataEncryptionService.healthCheck(),
        vulnerabilityScanner: vulnerabilityScannerService.healthCheck(),
        secureConfig: secureConfigManager.healthCheck(),
        tamperProtection: tamperProtectionService.healthCheck(),
        complianceScanner: complianceScannerService.healthCheck(),
        gdprCompliance: gdprComplianceService.healthCheck(),
      };

      // Determine overall health
      const healthStatuses = Object.values(healthChecks).map(
        (check) => check.status
      );
      const overallHealth = healthStatuses.includes('unhealthy')
        ? 'unhealthy'
        : healthStatuses.includes('degraded')
          ? 'degraded'
          : 'healthy';

      reply.send({
        success: true,
        data: {
          overallHealth,
          components: healthChecks,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get security health check', {
        error: (error as Error).message,
      });

      reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  }
}
