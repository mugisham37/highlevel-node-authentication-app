/**
 * Compliance Scanner Service
 * Automated compliance scanning and validation for security standards
 */

import { logger } from '../logging/winston-logger';
import { auditTrailManager, AuditHelpers } from '../monitoring/audit-trail';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { vulnerabilityScannerService } from './vulnerability-scanner.service';
import { dataEncryptionService } from './data-encryption.service';
import { secureConfigManager } from './secure-config-manager.service';
import { gdprComplianceService } from '../compliance/gdpr-compliance.service';

export interface ComplianceRule {
  id: string;
  standard: 'GDPR' | 'SOC2' | 'ISO27001' | 'NIST' | 'PCI_DSS' | 'HIPAA';
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  automated: boolean;
  checkFunction: () => Promise<ComplianceCheckResult>;
  remediation?: {
    description: string;
    steps: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
    priority: number;
  };
}

export interface ComplianceCheckResult {
  compliant: boolean;
  score: number; // 0-100
  findings: ComplianceFinding[];
  evidence: ComplianceEvidence[];
  recommendations: string[];
  metadata: Record<string, any>;
}

export interface ComplianceFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location?: string;
  remediation?: string;
  riskScore: number;
}

export interface ComplianceEvidence {
  type: 'configuration' | 'log' | 'certificate' | 'policy' | 'test_result';
  description: string;
  value: any;
  timestamp: Date;
  source: string;
}

export interface ComplianceScanResult {
  id: string;
  timestamp: Date;
  standard: ComplianceRule['standard'];
  overallScore: number;
  status: 'compliant' | 'non_compliant' | 'partially_compliant';
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  results: Map<string, ComplianceCheckResult>;
  duration: number;
  nextScanDue: Date;
}

export class ComplianceScannerService {
  private readonly rules = new Map<string, ComplianceRule>();
  private readonly scanResults = new Map<string, ComplianceScanResult>();
  private scanInterval?: NodeJS.Timeout;
  private readonly scanIntervalHours = 24; // Daily scans

  constructor() {
    this.initializeComplianceRules();
    this.startScheduledScanning();
  }

  /**
   * Register compliance rule
   */
  registerRule(rule: ComplianceRule): void {
    this.rules.set(rule.id, rule);

    logger.info('Compliance rule registered', {
      ruleId: rule.id,
      standard: rule.standard,
      category: rule.category,
      severity: rule.severity,
      automated: rule.automated,
    });
  }

  /**
   * Run compliance scan for specific standard
   */
  async runComplianceScan(
    standard: ComplianceRule['standard']
  ): Promise<ComplianceScanResult> {
    const scanId = `scan_${standard}_${Date.now()}`;
    const startTime = Date.now();

    logger.info('Starting compliance scan', {
      scanId,
      standard,
    });

    // Get rules for this standard
    const applicableRules = Array.from(this.rules.values()).filter(
      (rule) => rule.standard === standard && rule.automated
    );

    const results = new Map<string, ComplianceCheckResult>();
    let totalScore = 0;
    let rulesPassed = 0;
    let rulesFailed = 0;
    let criticalFindings = 0;
    let highFindings = 0;
    let mediumFindings = 0;
    let lowFindings = 0;

    // Execute each rule
    for (const rule of applicableRules) {
      try {
        logger.debug('Executing compliance rule', {
          ruleId: rule.id,
          title: rule.title,
        });

        const result = await rule.checkFunction();
        results.set(rule.id, result);

        totalScore += result.score;

        if (result.compliant) {
          rulesPassed++;
        } else {
          rulesFailed++;
        }

        // Count findings by severity
        result.findings.forEach((finding) => {
          switch (finding.severity) {
            case 'critical':
              criticalFindings++;
              break;
            case 'high':
              highFindings++;
              break;
            case 'medium':
              mediumFindings++;
              break;
            case 'low':
              lowFindings++;
              break;
          }
        });
      } catch (error) {
        logger.error('Compliance rule execution failed', {
          ruleId: rule.id,
          error: (error as Error).message,
        });

        // Create failed result
        results.set(rule.id, {
          compliant: false,
          score: 0,
          findings: [
            {
              id: `error_${rule.id}`,
              severity: 'high',
              title: 'Rule Execution Failed',
              description: `Failed to execute compliance rule: ${(error as Error).message}`,
              riskScore: 8.0,
            },
          ],
          evidence: [],
          recommendations: ['Fix rule execution error'],
          metadata: { error: (error as Error).message },
        });

        rulesFailed++;
        highFindings++;
      }
    }

    const duration = Date.now() - startTime;
    const overallScore =
      applicableRules.length > 0 ? totalScore / applicableRules.length : 0;

    let status: ComplianceScanResult['status'] = 'compliant';
    if (criticalFindings > 0 || overallScore < 70) {
      status = 'non_compliant';
    } else if (highFindings > 0 || overallScore < 90) {
      status = 'partially_compliant';
    }

    const scanResult: ComplianceScanResult = {
      id: scanId,
      timestamp: new Date(),
      standard,
      overallScore,
      status,
      rulesChecked: applicableRules.length,
      rulesPassed,
      rulesFailed,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      results,
      duration,
      nextScanDue: new Date(
        Date.now() + this.scanIntervalHours * 60 * 60 * 1000
      ),
    };

    this.scanResults.set(scanId, scanResult);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor('compliance-scanner'),
      action: 'compliance_scan_completed',
      resource: AuditHelpers.createResource(
        'compliance_scan',
        scanId,
        standard
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        standard,
        overallScore,
        status,
        rulesChecked: applicableRules.length,
        rulesPassed,
        rulesFailed,
        criticalFindings,
        highFindings,
        duration,
      },
    });

    // Record metrics
    metricsManager.recordSecurityEvent(
      'compliance_scan_completed',
      criticalFindings > 0 ? 'critical' : highFindings > 0 ? 'high' : 'low',
      'compliance-scanner',
      criticalFindings + highFindings
    );

    logger.info('Compliance scan completed', {
      scanId,
      standard,
      overallScore,
      status,
      rulesChecked: applicableRules.length,
      rulesPassed,
      rulesFailed,
      criticalFindings,
      highFindings,
      duration,
    });

    return scanResult;
  }

  /**
   * Run comprehensive compliance scan for all standards
   */
  async runComprehensiveScan(): Promise<ComplianceScanResult[]> {
    logger.info('Starting comprehensive compliance scan');

    const standards = Array.from(
      new Set(Array.from(this.rules.values()).map((rule) => rule.standard))
    );

    const results: ComplianceScanResult[] = [];

    for (const standard of standards) {
      try {
        const result = await this.runComplianceScan(standard);
        results.push(result);
      } catch (error) {
        logger.error('Failed to scan compliance standard', {
          standard,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Comprehensive compliance scan completed', {
      standardsScanned: results.length,
      totalStandards: standards.length,
    });

    return results;
  }

  /**
   * Get scan result by ID
   */
  getScanResult(scanId: string): ComplianceScanResult | null {
    return this.scanResults.get(scanId) || null;
  }

  /**
   * Get latest scan results by standard
   */
  getLatestScanResults(
    standard?: ComplianceRule['standard']
  ): ComplianceScanResult[] {
    const results = Array.from(this.scanResults.values());

    let filteredResults = results;
    if (standard) {
      filteredResults = results.filter(
        (result) => result.standard === standard
      );
    }

    // Group by standard and get latest for each
    const latestByStandard = new Map<string, ComplianceScanResult>();

    filteredResults.forEach((result) => {
      const existing = latestByStandard.get(result.standard);
      if (!existing || result.timestamp > existing.timestamp) {
        latestByStandard.set(result.standard, result);
      }
    });

    return Array.from(latestByStandard.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Get compliance dashboard data
   */
  getComplianceDashboard(): {
    overallCompliance: number;
    standardsCompliance: Record<
      string,
      {
        score: number;
        status: string;
        lastScan: Date;
        criticalFindings: number;
        highFindings: number;
      }
    >;
    criticalFindings: ComplianceFinding[];
    upcomingScans: Array<{
      standard: string;
      nextScanDue: Date;
    }>;
    trends: Array<{
      standard: string;
      scores: Array<{ date: Date; score: number }>;
    }>;
  } {
    const latestResults = this.getLatestScanResults();

    const overallCompliance =
      latestResults.length > 0
        ? latestResults.reduce((sum, result) => sum + result.overallScore, 0) /
          latestResults.length
        : 0;

    const standardsCompliance: Record<string, any> = {};
    const criticalFindings: ComplianceFinding[] = [];
    const upcomingScans: Array<{ standard: string; nextScanDue: Date }> = [];

    latestResults.forEach((result) => {
      standardsCompliance[result.standard] = {
        score: result.overallScore,
        status: result.status,
        lastScan: result.timestamp,
        criticalFindings: result.criticalFindings,
        highFindings: result.highFindings,
      };

      upcomingScans.push({
        standard: result.standard,
        nextScanDue: result.nextScanDue,
      });

      // Collect critical findings
      result.results.forEach((checkResult) => {
        checkResult.findings
          .filter((finding) => finding.severity === 'critical')
          .forEach((finding) => criticalFindings.push(finding));
      });
    });

    // Generate trends (simplified - would use historical data in production)
    const trends = latestResults.map((result) => ({
      standard: result.standard,
      scores: [{ date: result.timestamp, score: result.overallScore }],
    }));

    return {
      overallCompliance,
      standardsCompliance,
      criticalFindings,
      upcomingScans: upcomingScans.sort(
        (a, b) => a.nextScanDue.getTime() - b.nextScanDue.getTime()
      ),
      trends,
    };
  }

  /**
   * Initialize default compliance rules
   */
  private initializeComplianceRules(): void {
    // GDPR Rules
    this.registerRule({
      id: 'gdpr_data_encryption',
      standard: 'GDPR',
      category: 'Data Protection',
      title: 'Personal Data Encryption',
      description: 'Ensure personal data is encrypted at rest and in transit',
      severity: 'high',
      automated: true,
      checkFunction: async () => {
        const encryptionStats = dataEncryptionService.getEncryptionStats();
        const hasEncryption = encryptionStats.keysGenerated > 0;

        return {
          compliant: hasEncryption,
          score: hasEncryption ? 100 : 0,
          findings: hasEncryption
            ? []
            : [
                {
                  id: 'gdpr_encryption_missing',
                  severity: 'high' as const,
                  title: 'Data Encryption Not Implemented',
                  description:
                    'Personal data encryption is not properly configured',
                  riskScore: 8.0,
                  remediation:
                    'Implement data encryption at rest and in transit',
                },
              ],
          evidence: [
            {
              type: 'configuration' as const,
              description: 'Encryption service statistics',
              value: encryptionStats,
              timestamp: new Date(),
              source: 'data-encryption-service',
            },
          ],
          recommendations: hasEncryption
            ? []
            : [
                'Configure data encryption service',
                'Implement field-level encryption for PII',
                'Enable TLS for data in transit',
              ],
          metadata: { encryptionStats },
        };
      },
      remediation: {
        description: 'Implement comprehensive data encryption',
        steps: [
          'Configure encryption master key',
          'Enable field-level encryption for PII',
          'Implement TLS for all communications',
          'Set up key rotation policies',
        ],
        estimatedEffort: 'medium',
        priority: 1,
      },
    });

    this.registerRule({
      id: 'gdpr_consent_management',
      standard: 'GDPR',
      category: 'Consent Management',
      title: 'Consent Records Management',
      description: 'Ensure proper consent management and record keeping',
      severity: 'high',
      automated: true,
      checkFunction: async () => {
        const gdprReport = gdprComplianceService.generateComplianceReport();
        const hasActiveConsents = gdprReport.activeConsents > 0;

        return {
          compliant: hasActiveConsents,
          score: hasActiveConsents ? 95 : 20,
          findings: hasActiveConsents
            ? []
            : [
                {
                  id: 'gdpr_no_consents',
                  severity: 'medium' as const,
                  title: 'No Active Consent Records',
                  description: 'No active consent records found in the system',
                  riskScore: 6.0,
                  remediation: 'Implement consent collection and management',
                },
              ],
          evidence: [
            {
              type: 'log' as const,
              description: 'GDPR compliance statistics',
              value: gdprReport,
              timestamp: new Date(),
              source: 'gdpr-compliance-service',
            },
          ],
          recommendations: hasActiveConsents
            ? [
                'Continue monitoring consent records',
                'Implement consent withdrawal mechanisms',
              ]
            : [
                'Implement consent collection forms',
                'Set up consent record storage',
                'Create consent withdrawal process',
              ],
          metadata: { gdprReport },
        };
      },
    });

    // SOC 2 Rules
    this.registerRule({
      id: 'soc2_access_controls',
      standard: 'SOC2',
      category: 'Access Control',
      title: 'Logical Access Controls',
      description:
        'Implement proper logical access controls and authentication',
      severity: 'high',
      automated: true,
      checkFunction: async () => {
        const configStats = secureConfigManager.getStatistics();
        const hasSecureConfig = configStats.encryptedConfigurations > 0;

        return {
          compliant: hasSecureConfig,
          score: hasSecureConfig ? 90 : 30,
          findings: hasSecureConfig
            ? []
            : [
                {
                  id: 'soc2_weak_access_controls',
                  severity: 'high' as const,
                  title: 'Insufficient Access Controls',
                  description:
                    'Access control configurations are not properly secured',
                  riskScore: 7.5,
                  remediation: 'Implement secure configuration management',
                },
              ],
          evidence: [
            {
              type: 'configuration' as const,
              description: 'Configuration management statistics',
              value: configStats,
              timestamp: new Date(),
              source: 'secure-config-manager',
            },
          ],
          recommendations: hasSecureConfig
            ? ['Continue monitoring access controls', 'Regular access reviews']
            : [
                'Implement secure configuration management',
                'Enable configuration encryption',
                'Set up access control policies',
              ],
          metadata: { configStats },
        };
      },
    });

    this.registerRule({
      id: 'soc2_vulnerability_management',
      standard: 'SOC2',
      category: 'Security',
      title: 'Vulnerability Management',
      description: 'Regular vulnerability scanning and remediation',
      severity: 'high',
      automated: true,
      checkFunction: async () => {
        const vulnStats =
          vulnerabilityScannerService.getVulnerabilityStatistics();
        const criticalVulns = vulnStats.bySeverity['critical'] || 0;
        const highVulns = vulnStats.bySeverity['high'] || 0;

        const compliant = criticalVulns === 0 && highVulns < 5;
        const score = Math.max(0, 100 - criticalVulns * 20 - highVulns * 5);

        const findings: ComplianceFinding[] = [];
        if (criticalVulns > 0) {
          findings.push({
            id: 'soc2_critical_vulns',
            severity: 'critical',
            title: 'Critical Vulnerabilities Detected',
            description: `${criticalVulns} critical vulnerabilities found`,
            riskScore: 9.0,
            remediation: 'Immediately remediate critical vulnerabilities',
          });
        }
        if (highVulns >= 5) {
          findings.push({
            id: 'soc2_high_vulns',
            severity: 'high',
            title: 'Multiple High Vulnerabilities',
            description: `${highVulns} high severity vulnerabilities found`,
            riskScore: 7.0,
            remediation:
              'Prioritize remediation of high severity vulnerabilities',
          });
        }

        return {
          compliant,
          score,
          findings,
          evidence: [
            {
              type: 'test_result' as const,
              description: 'Vulnerability scan statistics',
              value: vulnStats,
              timestamp: new Date(),
              source: 'vulnerability-scanner',
            },
          ],
          recommendations: compliant
            ? [
                'Continue regular vulnerability scanning',
                'Maintain vulnerability remediation processes',
              ]
            : [
                'Remediate critical and high vulnerabilities immediately',
                'Implement automated vulnerability scanning',
                'Establish vulnerability management procedures',
              ],
          metadata: { vulnStats },
        };
      },
    });

    // ISO 27001 Rules
    this.registerRule({
      id: 'iso27001_audit_logging',
      standard: 'ISO27001',
      category: 'Monitoring',
      title: 'Security Event Logging',
      description: 'Comprehensive security event logging and monitoring',
      severity: 'medium',
      automated: true,
      checkFunction: async () => {
        const auditStats = auditTrailManager.getStatistics();
        const hasAuditLogs = auditStats.totalEvents > 0;

        return {
          compliant: hasAuditLogs,
          score: hasAuditLogs ? 85 : 0,
          findings: hasAuditLogs
            ? []
            : [
                {
                  id: 'iso27001_no_audit_logs',
                  severity: 'medium' as const,
                  title: 'No Audit Logs Found',
                  description:
                    'Security event logging is not properly configured',
                  riskScore: 5.0,
                  remediation: 'Implement comprehensive audit logging',
                },
              ],
          evidence: [
            {
              type: 'log' as const,
              description: 'Audit trail statistics',
              value: auditStats,
              timestamp: new Date(),
              source: 'audit-trail-manager',
            },
          ],
          recommendations: hasAuditLogs
            ? [
                'Continue comprehensive audit logging',
                'Regular audit log reviews',
              ]
            : [
                'Implement audit trail system',
                'Configure security event logging',
                'Set up log retention policies',
              ],
          metadata: { auditStats },
        };
      },
    });

    logger.info('Compliance rules initialized', {
      totalRules: this.rules.size,
      rulesByStandard: this.getRulesByStandard(),
    });
  }

  /**
   * Get rules grouped by standard
   */
  private getRulesByStandard(): Record<string, number> {
    const rulesByStandard: Record<string, number> = {};

    for (const rule of this.rules.values()) {
      rulesByStandard[rule.standard] =
        (rulesByStandard[rule.standard] || 0) + 1;
    }

    return rulesByStandard;
  }

  /**
   * Start scheduled compliance scanning
   */
  private startScheduledScanning(): void {
    const intervalMs = this.scanIntervalHours * 60 * 60 * 1000;

    this.scanInterval = setInterval(async () => {
      try {
        logger.info('Starting scheduled compliance scan');
        await this.runComprehensiveScan();
      } catch (error) {
        logger.error('Scheduled compliance scan failed', {
          error: (error as Error).message,
        });
      }
    }, intervalMs);

    logger.info('Scheduled compliance scanning started', {
      intervalHours: this.scanIntervalHours,
    });
  }

  /**
   * Stop scheduled scanning
   */
  stopScheduledScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined as any;
      logger.info('Scheduled compliance scanning stopped');
    }
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    const dashboard = this.getComplianceDashboard();
    const criticalFindings = dashboard.criticalFindings.length;
    const overallCompliance = dashboard.overallCompliance;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (criticalFindings > 0 || overallCompliance < 70) {
      status = 'unhealthy';
    } else if (overallCompliance < 90) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        totalRules: this.rules.size,
        automatedRules: Array.from(this.rules.values()).filter(
          (r) => r.automated
        ).length,
        overallCompliance,
        criticalFindings,
        scanResults: this.scanResults.size,
        scheduledScanningEnabled: !!this.scanInterval,
        rulesByStandard: this.getRulesByStandard(),
      },
    };
  }

  /**
   * Shutdown compliance scanner
   */
  shutdown(): void {
    this.stopScheduledScanning();

    logger.info('Compliance scanner service shutdown complete', {
      totalRules: this.rules.size,
      scanResults: this.scanResults.size,
    });
  }
}

// Export singleton instance
export const complianceScannerService = new ComplianceScannerService();
