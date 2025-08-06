/**
 * Compliance Reporting Service
 * Generates comprehensive compliance reports for various standards
 */

import { logger } from '../logging/winston-logger';
import { gdprComplianceService } from './gdpr-compliance.service';
import { vulnerabilityScannerService } from '../security/vulnerability-scanner.service';
import { secureConfigManager } from '../security/secure-config-manager.service';
import { dataEncryptionService } from '../security/data-encryption.service';

export interface ComplianceReport {
  id: string;
  standard: 'GDPR' | 'SOC2' | 'ISO27001' | 'NIST' | 'PCI_DSS' | 'HIPAA';
  version: string;
  generatedAt: Date;
  reportPeriod: {
    from: Date;
    to: Date;
  };
  overallScore: number; // 0-100
  status: 'compliant' | 'non_compliant' | 'partially_compliant';
  sections: ComplianceSection[];
  recommendations: ComplianceRecommendation[];
  evidence: ComplianceEvidence[];
  metadata: {
    generatedBy: string;
    reportType: 'self_assessment' | 'audit_preparation' | 'certification';
    confidentialityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  };
}

export interface ComplianceSection {
  id: string;
  title: string;
  requirement: string;
  description: string;
  status:
    | 'compliant'
    | 'non_compliant'
    | 'partially_compliant'
    | 'not_applicable';
  score: number; // 0-100
  evidence: string[];
  gaps: string[];
  controls: ComplianceControl[];
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
  effectiveness: 'high' | 'medium' | 'low';
  lastTested?: Date;
  testResults?: string;
  owner: string;
}

export interface ComplianceRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;
  relatedSections: string[];
}

export interface ComplianceEvidence {
  id: string;
  type: 'document' | 'log' | 'configuration' | 'test_result' | 'certificate';
  title: string;
  description: string;
  source: string;
  collectedAt: Date;
  validUntil?: Date;
  confidential: boolean;
  hash?: string;
}

export class ComplianceReportingService {
  private readonly reports = new Map<string, ComplianceReport>();

  /**
   * Generate GDPR compliance report
   */
  async generateGDPRReport(
    reportPeriod: { from: Date; to: Date },
    options?: {
      reportType?: 'self_assessment' | 'audit_preparation' | 'certification';
      generatedBy?: string;
    }
  ): Promise<ComplianceReport> {
    const reportId = `gdpr_${Date.now()}`;

    logger.info('Generating GDPR compliance report', {
      reportId,
      reportPeriod,
      reportType: options?.reportType || 'self_assessment',
    });

    // Collect GDPR data
    const gdprData = gdprComplianceService.generateComplianceReport();
    const encryptionStats = dataEncryptionService.getEncryptionStats();

    // Define GDPR sections
    const sections: ComplianceSection[] = [
      {
        id: 'gdpr_lawfulness',
        title: 'Lawfulness of Processing (Art. 6)',
        requirement: 'Processing must have a lawful basis',
        description: 'Ensure all data processing has a valid legal basis',
        status: gdprData.activeConsents > 0 ? 'compliant' : 'non_compliant',
        score: gdprData.activeConsents > 0 ? 100 : 0,
        evidence: ['consent_records', 'processing_activities'],
        gaps:
          gdprData.activeConsents === 0
            ? ['No active consent records found']
            : [],
        controls: [
          {
            id: 'consent_management',
            name: 'Consent Management System',
            description: 'System to record and manage user consents',
            implemented: true,
            effectiveness: 'high',
            owner: 'Data Protection Officer',
          },
        ],
      },
      {
        id: 'gdpr_data_subject_rights',
        title: 'Data Subject Rights (Art. 12-23)',
        requirement: 'Facilitate exercise of data subject rights',
        description:
          'Provide mechanisms for data subjects to exercise their rights',
        status: 'compliant',
        score: 95,
        evidence: ['export_requests', 'deletion_requests'],
        gaps: [],
        controls: [
          {
            id: 'data_export',
            name: 'Data Export Functionality',
            description: 'Automated data export for data portability',
            implemented: true,
            effectiveness: 'high',
            owner: 'Engineering Team',
          },
          {
            id: 'data_deletion',
            name: 'Data Deletion Functionality',
            description: 'Right to be forgotten implementation',
            implemented: true,
            effectiveness: 'high',
            owner: 'Engineering Team',
          },
        ],
      },
      {
        id: 'gdpr_security',
        title: 'Security of Processing (Art. 32)',
        requirement:
          'Implement appropriate technical and organizational measures',
        description: 'Ensure security of personal data processing',
        status:
          encryptionStats.keysGenerated > 0
            ? 'compliant'
            : 'partially_compliant',
        score: encryptionStats.keysGenerated > 0 ? 90 : 60,
        evidence: ['encryption_implementation', 'audit_logs'],
        gaps:
          encryptionStats.keysGenerated === 0
            ? ['Encryption not fully implemented']
            : [],
        controls: [
          {
            id: 'data_encryption',
            name: 'Data Encryption',
            description: 'Encryption of personal data at rest and in transit',
            implemented: encryptionStats.keysGenerated > 0,
            effectiveness: 'high',
            owner: 'Security Team',
          },
          {
            id: 'audit_logging',
            name: 'Audit Logging',
            description: 'Comprehensive audit trail for all data processing',
            implemented: true,
            effectiveness: 'high',
            owner: 'Security Team',
          },
        ],
      },
      {
        id: 'gdpr_breach_notification',
        title: 'Personal Data Breach Notification (Art. 33-34)',
        requirement: 'Notify breaches within 72 hours',
        description: 'Implement breach detection and notification procedures',
        status: 'partially_compliant',
        score: 70,
        evidence: ['incident_response_plan'],
        gaps: ['Automated breach detection not fully implemented'],
        controls: [
          {
            id: 'breach_detection',
            name: 'Breach Detection System',
            description: 'Automated detection of potential data breaches',
            implemented: false,
            effectiveness: 'medium',
            owner: 'Security Team',
          },
        ],
      },
    ];

    // Calculate overall score
    const overallScore =
      sections.reduce((sum, section) => sum + section.score, 0) /
      sections.length;

    // Generate recommendations
    const recommendations: ComplianceRecommendation[] = [
      {
        id: 'implement_breach_detection',
        priority: 'high',
        category: 'Security',
        title: 'Implement Automated Breach Detection',
        description:
          'Deploy automated systems to detect potential data breaches',
        impact: 'Improves compliance with Art. 33 notification requirements',
        effort: 'medium',
        timeline: '3 months',
        relatedSections: ['gdpr_breach_notification'],
      },
      {
        id: 'enhance_consent_tracking',
        priority: 'medium',
        category: 'Data Management',
        title: 'Enhance Consent Tracking',
        description:
          'Improve granular tracking of consent purposes and withdrawals',
        impact: 'Better compliance with lawfulness requirements',
        effort: 'low',
        timeline: '1 month',
        relatedSections: ['gdpr_lawfulness'],
      },
    ];

    // Collect evidence
    const evidence: ComplianceEvidence[] = [
      {
        id: 'consent_records',
        type: 'log',
        title: 'Consent Records',
        description: 'Database of user consent records',
        source: 'GDPR Compliance Service',
        collectedAt: new Date(),
        confidential: true,
      },
      {
        id: 'audit_logs',
        type: 'log',
        title: 'Audit Trail Logs',
        description: 'Comprehensive audit logs of all system activities',
        source: 'Audit Trail Manager',
        collectedAt: new Date(),
        confidential: true,
      },
      {
        id: 'encryption_implementation',
        type: 'configuration',
        title: 'Encryption Configuration',
        description: 'Data encryption implementation details',
        source: 'Data Encryption Service',
        collectedAt: new Date(),
        confidential: false,
      },
    ];

    const report: ComplianceReport = {
      id: reportId,
      standard: 'GDPR',
      version: '2016/679',
      generatedAt: new Date(),
      reportPeriod,
      overallScore,
      status:
        overallScore >= 90
          ? 'compliant'
          : overallScore >= 70
            ? 'partially_compliant'
            : 'non_compliant',
      sections,
      recommendations,
      evidence,
      metadata: {
        generatedBy: options?.generatedBy || 'system',
        reportType: options?.reportType || 'self_assessment',
        confidentialityLevel: 'confidential',
      },
    };

    this.reports.set(reportId, report);

    logger.info('GDPR compliance report generated', {
      reportId,
      overallScore,
      status: report.status,
      sectionsCount: sections.length,
      recommendationsCount: recommendations.length,
    });

    return report;
  }

  /**
   * Generate SOC 2 compliance report
   */
  async generateSOC2Report(
    reportPeriod: { from: Date; to: Date },
    options?: {
      reportType?: 'self_assessment' | 'audit_preparation' | 'certification';
      generatedBy?: string;
    }
  ): Promise<ComplianceReport> {
    const reportId = `soc2_${Date.now()}`;

    logger.info('Generating SOC 2 compliance report', {
      reportId,
      reportPeriod,
    });

    // Collect security data
    const vulnerabilityStats =
      vulnerabilityScannerService.getVulnerabilityStatistics();
    const configStats = secureConfigManager.getStatistics();

    // Define SOC 2 sections (Trust Service Criteria)
    const sections: ComplianceSection[] = [
      {
        id: 'soc2_security',
        title: 'Security (CC6.0)',
        requirement: 'Logical and physical access controls',
        description:
          'The entity implements logical and physical access controls to protect against threats',
        status:
          (vulnerabilityStats.bySeverity['critical'] || 0) === 0
            ? 'compliant'
            : 'non_compliant',
        score: (vulnerabilityStats.bySeverity['critical'] || 0) === 0 ? 95 : 60,
        evidence: ['vulnerability_scans', 'access_controls'],
        gaps:
          (vulnerabilityStats.bySeverity['critical'] || 0) > 0
            ? ['Critical vulnerabilities detected']
            : [],
        controls: [
          {
            id: 'vulnerability_management',
            name: 'Vulnerability Management',
            description: 'Regular vulnerability scanning and remediation',
            implemented: true,
            effectiveness: 'high',
            owner: 'Security Team',
          },
        ],
      },
      {
        id: 'soc2_availability',
        title: 'Availability (A1.0)',
        requirement: 'System availability commitments',
        description:
          'The entity maintains system availability as committed or agreed',
        status: 'compliant',
        score: 90,
        evidence: ['uptime_monitoring', 'incident_response'],
        gaps: [],
        controls: [
          {
            id: 'monitoring_system',
            name: 'System Monitoring',
            description: 'Continuous monitoring of system availability',
            implemented: true,
            effectiveness: 'high',
            owner: 'Operations Team',
          },
        ],
      },
      {
        id: 'soc2_processing_integrity',
        title: 'Processing Integrity (PI1.0)',
        requirement: 'System processing integrity',
        description:
          'System processing is complete, valid, accurate, timely, and authorized',
        status: 'compliant',
        score: 85,
        evidence: ['audit_logs', 'data_validation'],
        gaps: [],
        controls: [
          {
            id: 'data_validation',
            name: 'Data Validation Controls',
            description: 'Input validation and data integrity checks',
            implemented: true,
            effectiveness: 'high',
            owner: 'Engineering Team',
          },
        ],
      },
      {
        id: 'soc2_confidentiality',
        title: 'Confidentiality (C1.0)',
        requirement: 'Confidential information protection',
        description: 'Information designated as confidential is protected',
        status:
          configStats.encryptedConfigurations > 0
            ? 'compliant'
            : 'partially_compliant',
        score: configStats.encryptedConfigurations > 0 ? 90 : 70,
        evidence: ['encryption_implementation', 'access_controls'],
        gaps:
          configStats.encryptedConfigurations === 0
            ? ['Not all sensitive data encrypted']
            : [],
        controls: [
          {
            id: 'data_encryption',
            name: 'Data Encryption',
            description: 'Encryption of confidential data',
            implemented: configStats.encryptedConfigurations > 0,
            effectiveness: 'high',
            owner: 'Security Team',
          },
        ],
      },
    ];

    const overallScore =
      sections.reduce((sum, section) => sum + section.score, 0) /
      sections.length;

    const recommendations: ComplianceRecommendation[] = [
      {
        id: 'remediate_critical_vulns',
        priority: 'critical',
        category: 'Security',
        title: 'Remediate Critical Vulnerabilities',
        description:
          'Address all critical security vulnerabilities immediately',
        impact: 'Essential for SOC 2 security compliance',
        effort: 'high',
        timeline: '2 weeks',
        relatedSections: ['soc2_security'],
      },
    ];

    const evidence: ComplianceEvidence[] = [
      {
        id: 'vulnerability_scans',
        type: 'test_result',
        title: 'Vulnerability Scan Results',
        description: 'Regular vulnerability assessment reports',
        source: 'Vulnerability Scanner Service',
        collectedAt: new Date(),
        confidential: true,
      },
    ];

    const report: ComplianceReport = {
      id: reportId,
      standard: 'SOC2',
      version: '2017',
      generatedAt: new Date(),
      reportPeriod,
      overallScore,
      status:
        overallScore >= 90
          ? 'compliant'
          : overallScore >= 70
            ? 'partially_compliant'
            : 'non_compliant',
      sections,
      recommendations,
      evidence,
      metadata: {
        generatedBy: options?.generatedBy || 'system',
        reportType: options?.reportType || 'self_assessment',
        confidentialityLevel: 'confidential',
      },
    };

    this.reports.set(reportId, report);

    logger.info('SOC 2 compliance report generated', {
      reportId,
      overallScore,
      status: report.status,
    });

    return report;
  } /**
   * 
Generate comprehensive security compliance report
   */
  async generateSecurityComplianceReport(
    reportPeriod: { from: Date; to: Date },
    standards: Array<'GDPR' | 'SOC2' | 'ISO27001' | 'NIST'> = ['GDPR', 'SOC2'],
    options?: {
      reportType?: 'self_assessment' | 'audit_preparation' | 'certification';
      generatedBy?: string;
    }
  ): Promise<ComplianceReport[]> {
    logger.info('Generating comprehensive security compliance report', {
      standards,
      reportPeriod,
    });

    const reports: ComplianceReport[] = [];

    for (const standard of standards) {
      try {
        let report: ComplianceReport;

        switch (standard) {
          case 'GDPR':
            report = await this.generateGDPRReport(reportPeriod, options);
            break;
          case 'SOC2':
            report = await this.generateSOC2Report(reportPeriod, options);
            break;
          case 'ISO27001':
            report = await this.generateISO27001Report(reportPeriod, options);
            break;
          case 'NIST':
            report = await this.generateNISTReport(reportPeriod, options);
            break;
          default:
            throw new Error(`Unsupported standard: ${standard}`);
        }

        reports.push(report);
      } catch (error) {
        logger.error(`Failed to generate ${standard} compliance report`, {
          error: (error as Error).message,
        });
      }
    }

    return reports;
  }

  /**
   * Generate ISO 27001 compliance report
   */
  private async generateISO27001Report(
    reportPeriod: { from: Date; to: Date },
    options?: {
      reportType?: 'self_assessment' | 'audit_preparation' | 'certification';
      generatedBy?: string;
    }
  ): Promise<ComplianceReport> {
    const reportId = `iso27001_${Date.now()}`;

    // Simplified ISO 27001 assessment
    const sections: ComplianceSection[] = [
      {
        id: 'iso_isms',
        title: 'Information Security Management System (Clause 4-10)',
        requirement:
          'Establish, implement, maintain and continually improve an ISMS',
        description: 'Information Security Management System implementation',
        status: 'partially_compliant',
        score: 75,
        evidence: ['security_policies', 'risk_assessments'],
        gaps: ['Formal ISMS documentation incomplete'],
        controls: [
          {
            id: 'security_policy',
            name: 'Information Security Policy',
            description: 'Documented information security policy',
            implemented: true,
            effectiveness: 'medium',
            owner: 'CISO',
          },
        ],
      },
    ];

    const overallScore =
      sections.reduce((sum, section) => sum + section.score, 0) /
      sections.length;

    const report: ComplianceReport = {
      id: reportId,
      standard: 'ISO27001',
      version: '2013',
      generatedAt: new Date(),
      reportPeriod,
      overallScore,
      status:
        overallScore >= 90
          ? 'compliant'
          : overallScore >= 70
            ? 'partially_compliant'
            : 'non_compliant',
      sections,
      recommendations: [],
      evidence: [],
      metadata: {
        generatedBy: options?.generatedBy || 'system',
        reportType: options?.reportType || 'self_assessment',
        confidentialityLevel: 'confidential',
      },
    };

    this.reports.set(reportId, report);
    return report;
  }

  /**
   * Generate NIST Cybersecurity Framework report
   */
  private async generateNISTReport(
    reportPeriod: { from: Date; to: Date },
    options?: {
      reportType?: 'self_assessment' | 'audit_preparation' | 'certification';
      generatedBy?: string;
    }
  ): Promise<ComplianceReport> {
    const reportId = `nist_${Date.now()}`;

    // NIST CSF Core Functions
    const sections: ComplianceSection[] = [
      {
        id: 'nist_identify',
        title: 'Identify (ID)',
        requirement:
          'Develop organizational understanding to manage cybersecurity risk',
        description:
          'Asset Management, Business Environment, Governance, Risk Assessment',
        status: 'compliant',
        score: 85,
        evidence: ['asset_inventory', 'risk_assessments'],
        gaps: [],
        controls: [
          {
            id: 'asset_management',
            name: 'Asset Management',
            description:
              'Identification and management of organizational assets',
            implemented: true,
            effectiveness: 'high',
            owner: 'IT Team',
          },
        ],
      },
      {
        id: 'nist_protect',
        title: 'Protect (PR)',
        requirement: 'Develop and implement appropriate safeguards',
        description:
          'Identity Management, Access Control, Data Security, Protective Technology',
        status: 'compliant',
        score: 90,
        evidence: ['access_controls', 'encryption_implementation'],
        gaps: [],
        controls: [
          {
            id: 'access_control',
            name: 'Access Control',
            description: 'Identity and access management controls',
            implemented: true,
            effectiveness: 'high',
            owner: 'Security Team',
          },
        ],
      },
    ];

    const overallScore =
      sections.reduce((sum, section) => sum + section.score, 0) /
      sections.length;

    const report: ComplianceReport = {
      id: reportId,
      standard: 'NIST',
      version: '1.1',
      generatedAt: new Date(),
      reportPeriod,
      overallScore,
      status:
        overallScore >= 90
          ? 'compliant'
          : overallScore >= 70
            ? 'partially_compliant'
            : 'non_compliant',
      sections,
      recommendations: [],
      evidence: [],
      metadata: {
        generatedBy: options?.generatedBy || 'system',
        reportType: options?.reportType || 'self_assessment',
        confidentialityLevel: 'confidential',
      },
    };

    this.reports.set(reportId, report);
    return report;
  }

  /**
   * Get compliance report by ID
   */
  getReport(reportId: string): ComplianceReport | null {
    return this.reports.get(reportId) || null;
  }

  /**
   * Get all reports
   */
  getAllReports(): ComplianceReport[] {
    return Array.from(this.reports.values());
  }

  /**
   * Get reports by standard
   */
  getReportsByStandard(
    standard: ComplianceReport['standard']
  ): ComplianceReport[] {
    return Array.from(this.reports.values()).filter(
      (report) => report.standard === standard
    );
  }

  /**
   * Export report to different formats
   */
  exportReport(
    reportId: string,
    format: 'json' | 'pdf' | 'html' | 'csv' = 'json'
  ): string {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'html':
        return this.generateHTMLReport(report);
      case 'csv':
        return this.generateCSVReport(report);
      case 'pdf':
        // In a real implementation, you would use a PDF generation library
        return 'PDF generation not implemented in this example';
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(report: ComplianceReport): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${report.standard} Compliance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .compliant { background-color: #d4edda; }
        .non-compliant { background-color: #f8d7da; }
        .partially-compliant { background-color: #fff3cd; }
        .score { font-size: 24px; font-weight: bold; }
        .recommendations { background-color: #e2e3e5; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.standard} Compliance Report</h1>
        <p><strong>Report ID:</strong> ${report.id}</p>
        <p><strong>Generated:</strong> ${report.generatedAt.toISOString()}</p>
        <p><strong>Period:</strong> ${report.reportPeriod.from.toISOString()} to ${report.reportPeriod.to.toISOString()}</p>
        <p><strong>Overall Score:</strong> <span class="score">${report.overallScore.toFixed(1)}/100</span></p>
        <p><strong>Status:</strong> <span class="${report.status}">${report.status.toUpperCase()}</span></p>
    </div>

    <h2>Compliance Sections</h2>
    ${report.sections
      .map(
        (section) => `
        <div class="section ${section.status}">
            <h3>${section.title}</h3>
            <p><strong>Requirement:</strong> ${section.requirement}</p>
            <p><strong>Description:</strong> ${section.description}</p>
            <p><strong>Status:</strong> ${section.status}</p>
            <p><strong>Score:</strong> ${section.score}/100</p>
            ${
              section.gaps.length > 0
                ? `
                <p><strong>Gaps:</strong></p>
                <ul>${section.gaps.map((gap) => `<li>${gap}</li>`).join('')}</ul>
            `
                : ''
            }
        </div>
    `
      )
      .join('')}

    ${
      report.recommendations.length > 0
        ? `
        <h2>Recommendations</h2>
        <div class="recommendations">
            ${report.recommendations
              .map(
                (rec) => `
                <div style="margin-bottom: 15px;">
                    <h4>${rec.title} (${rec.priority.toUpperCase()})</h4>
                    <p>${rec.description}</p>
                    <p><strong>Impact:</strong> ${rec.impact}</p>
                    <p><strong>Effort:</strong> ${rec.effort}</p>
                    <p><strong>Timeline:</strong> ${rec.timeline}</p>
                </div>
            `
              )
              .join('')}
        </div>
    `
        : ''
    }
</body>
</html>`;

    return html;
  }

  /**
   * Generate CSV report
   */
  private generateCSVReport(report: ComplianceReport): string {
    const rows = [
      ['Report Information'],
      ['ID', report.id],
      ['Standard', report.standard],
      ['Generated At', report.generatedAt.toISOString()],
      ['Overall Score', report.overallScore.toString()],
      ['Status', report.status],
      [''],
      ['Sections'],
      ['Title', 'Status', 'Score', 'Requirement'],
    ];

    report.sections.forEach((section) => {
      rows.push([
        section.title,
        section.status,
        section.score.toString(),
        section.requirement,
      ]);
    });

    if (report.recommendations.length > 0) {
      rows.push(
        [''],
        ['Recommendations'],
        ['Title', 'Priority', 'Description', 'Timeline']
      );
      report.recommendations.forEach((rec) => {
        rows.push([rec.title, rec.priority, rec.description, rec.timeline]);
      });
    }

    return rows.map((row) => row.join(',')).join('\n');
  }

  /**
   * Get compliance dashboard data
   */
  getComplianceDashboard(): {
    totalReports: number;
    reportsByStandard: Record<string, number>;
    reportsByStatus: Record<string, number>;
    averageScores: Record<string, number>;
    recentReports: ComplianceReport[];
    criticalRecommendations: ComplianceRecommendation[];
  } {
    const reports = Array.from(this.reports.values());

    const reportsByStandard: Record<string, number> = {};
    const reportsByStatus: Record<string, number> = {};
    const scoresByStandard: Record<string, number[]> = {};
    const criticalRecommendations: ComplianceRecommendation[] = [];

    reports.forEach((report) => {
      // Count by standard
      reportsByStandard[report.standard] =
        (reportsByStandard[report.standard] || 0) + 1;

      // Count by status
      reportsByStatus[report.status] =
        (reportsByStatus[report.status] || 0) + 1;

      // Collect scores by standard
      if (!scoresByStandard[report.standard]) {
        scoresByStandard[report.standard] = [];
      }
      scoresByStandard[report.standard]!.push(report.overallScore);

      // Collect critical recommendations
      report.recommendations
        .filter((rec) => rec.priority === 'critical')
        .forEach((rec) => criticalRecommendations.push(rec));
    });

    // Calculate average scores
    const averageScores: Record<string, number> = {};
    Object.entries(scoresByStandard).forEach(([standard, scores]) => {
      averageScores[standard] =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;
    });

    // Get recent reports (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentReports = reports
      .filter((report) => report.generatedAt > thirtyDaysAgo)
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, 10);

    return {
      totalReports: reports.length,
      reportsByStandard,
      reportsByStatus,
      averageScores,
      recentReports,
      criticalRecommendations: criticalRecommendations.slice(0, 10),
    };
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    const dashboard = this.getComplianceDashboard();
    const recentReports = dashboard.recentReports.length;
    const criticalRecommendations = dashboard.criticalRecommendations.length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (criticalRecommendations > 5) {
      status = 'unhealthy';
    } else if (criticalRecommendations > 2 || recentReports === 0) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        totalReports: dashboard.totalReports,
        recentReports,
        criticalRecommendations,
        averageComplianceScore:
          Object.values(dashboard.averageScores).reduce(
            (sum, score) => sum + score,
            0
          ) / Object.keys(dashboard.averageScores).length || 0,
        supportedStandards: ['GDPR', 'SOC2', 'ISO27001', 'NIST'],
      },
    };
  }
}

// Export singleton instance
export const complianceReportingService = new ComplianceReportingService();
