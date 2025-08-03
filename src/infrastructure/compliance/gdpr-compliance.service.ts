/**
 * GDPR Compliance Service
 * Implements GDPR requirements for data protection and user rights
 */

import { logger } from '../logging/winston-logger';
import { auditTrailManager, AuditHelpers } from '../monitoring/audit-trail';
import { dataEncryptionService } from '../security/data-encryption.service';

export interface GDPRDataSubject {
  id: string;
  email: string;
  name?: string;
  registrationDate: Date;
  lastActivity?: Date;
  consentRecords: ConsentRecord[];
  dataProcessingActivities: DataProcessingActivity[];
}

export interface ConsentRecord {
  id: string;
  subjectId: string;
  purpose: string;
  legalBasis:
    | 'consent'
    | 'contract'
    | 'legal_obligation'
    | 'vital_interests'
    | 'public_task'
    | 'legitimate_interests';
  granted: boolean;
  timestamp: Date;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  withdrawnAt?: Date;
  withdrawalReason?: string;
}

export interface DataProcessingActivity {
  id: string;
  subjectId: string;
  activity: string;
  purpose: string;
  dataCategories: string[];
  legalBasis: string;
  timestamp: Date;
  retentionPeriod?: number; // days
  automated: boolean;
  thirdPartySharing?: {
    recipient: string;
    purpose: string;
    safeguards: string[];
  }[];
}

export interface DataExportRequest {
  id: string;
  subjectId: string;
  requestedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: 'json' | 'xml' | 'csv';
  includeMetadata: boolean;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface DataDeletionRequest {
  id: string;
  subjectId: string;
  requestedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  reason?: string;
  scheduledFor?: Date;
  completedAt?: Date;
  retentionOverride?: {
    reason: string;
    legalBasis: string;
    retainUntil: Date;
  };
}

export class GDPRComplianceService {
  private readonly dataSubjects = new Map<string, GDPRDataSubject>();
  private readonly consentRecords = new Map<string, ConsentRecord>();
  private readonly exportRequests = new Map<string, DataExportRequest>();
  private readonly deletionRequests = new Map<string, DataDeletionRequest>();
  private readonly retentionPolicies = new Map<string, number>(); // dataType -> days

  constructor() {
    this.initializeRetentionPolicies();
    this.startRetentionCleanup();
  }

  /**
   * Record consent
   */
  async recordConsent(
    subjectId: string,
    purpose: string,
    legalBasis: ConsentRecord['legalBasis'],
    granted: boolean,
    version: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ConsentRecord> {
    const consentRecord: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subjectId,
      purpose,
      legalBasis,
      granted,
      timestamp: new Date(),
      version,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    };

    this.consentRecords.set(consentRecord.id, consentRecord);

    // Update data subject
    let subject = this.dataSubjects.get(subjectId);
    if (!subject) {
      subject = {
        id: subjectId,
        email: '', // Will be updated separately
        registrationDate: new Date(),
        consentRecords: [],
        dataProcessingActivities: [],
      };
      this.dataSubjects.set(subjectId, subject);
    }

    subject.consentRecords.push(consentRecord);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createUserActor(subjectId),
      action: 'consent_recorded',
      resource: AuditHelpers.createResource(
        'consent',
        consentRecord.id,
        purpose
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        purpose,
        legalBasis,
        granted,
        version,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    logger.info('GDPR consent recorded', {
      subjectId,
      purpose,
      legalBasis,
      granted,
      consentId: consentRecord.id,
    });

    return consentRecord;
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(
    subjectId: string,
    purpose: string,
    reason?: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<ConsentRecord | null> {
    const subject = this.dataSubjects.get(subjectId);
    if (!subject) {
      throw new Error('Data subject not found');
    }

    // Find the latest consent record for this purpose
    const consentRecord = subject.consentRecords
      .filter((c) => c.purpose === purpose && c.granted && !c.withdrawnAt)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (!consentRecord) {
      return null;
    }

    // Update consent record
    consentRecord.withdrawnAt = new Date();
    consentRecord.withdrawalReason = reason;

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createUserActor(subjectId),
      action: 'consent_withdrawn',
      resource: AuditHelpers.createResource(
        'consent',
        consentRecord.id,
        purpose
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        purpose,
        reason,
        originalConsentDate: consentRecord.timestamp,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    logger.info('GDPR consent withdrawn', {
      subjectId,
      purpose,
      reason,
      consentId: consentRecord.id,
    });

    return consentRecord;
  }

  /**
   * Check if consent is valid
   */
  hasValidConsent(subjectId: string, purpose: string): boolean {
    const subject = this.dataSubjects.get(subjectId);
    if (!subject) {
      return false;
    }

    const validConsent = subject.consentRecords.find(
      (c) => c.purpose === purpose && c.granted && !c.withdrawnAt
    );

    return !!validConsent;
  }

  /**
   * Record data processing activity
   */
  async recordDataProcessing(
    subjectId: string,
    activity: string,
    purpose: string,
    dataCategories: string[],
    legalBasis: string,
    options?: {
      retentionPeriod?: number;
      automated?: boolean;
      thirdPartySharing?: DataProcessingActivity['thirdPartySharing'];
    }
  ): Promise<DataProcessingActivity> {
    const processingActivity: DataProcessingActivity = {
      id: `processing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subjectId,
      activity,
      purpose,
      dataCategories,
      legalBasis,
      timestamp: new Date(),
      retentionPeriod: options?.retentionPeriod,
      automated: options?.automated || false,
      thirdPartySharing: options?.thirdPartySharing,
    };

    let subject = this.dataSubjects.get(subjectId);
    if (!subject) {
      subject = {
        id: subjectId,
        email: '',
        registrationDate: new Date(),
        consentRecords: [],
        dataProcessingActivities: [],
      };
      this.dataSubjects.set(subjectId, subject);
    }

    subject.dataProcessingActivities.push(processingActivity);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(),
      action: 'data_processing_recorded',
      resource: AuditHelpers.createResource(
        'data_processing',
        processingActivity.id,
        activity
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        subjectId,
        activity,
        purpose,
        dataCategories,
        legalBasis,
        automated: processingActivity.automated,
      },
    });

    return processingActivity;
  }

  /**
   * Request data export (Right to Data Portability)
   */
  async requestDataExport(
    subjectId: string,
    format: 'json' | 'xml' | 'csv' = 'json',
    includeMetadata: boolean = true
  ): Promise<DataExportRequest> {
    const exportRequest: DataExportRequest = {
      id: `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subjectId,
      requestedAt: new Date(),
      status: 'pending',
      format,
      includeMetadata,
    };

    this.exportRequests.set(exportRequest.id, exportRequest);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createUserActor(subjectId),
      action: 'data_export_requested',
      resource: AuditHelpers.createResource('data_export', exportRequest.id),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        format,
        includeMetadata,
      },
    });

    // Process export asynchronously
    this.processDataExport(exportRequest.id);

    logger.info('GDPR data export requested', {
      subjectId,
      exportId: exportRequest.id,
      format,
      includeMetadata,
    });

    return exportRequest;
  }

  /**
   * Process data export
   */
  private async processDataExport(exportId: string): Promise<void> {
    const exportRequest = this.exportRequests.get(exportId);
    if (!exportRequest) {
      return;
    }

    try {
      exportRequest.status = 'processing';

      const subject = this.dataSubjects.get(exportRequest.subjectId);
      if (!subject) {
        throw new Error('Data subject not found');
      }

      // Collect all data for the subject
      const exportData = {
        subject: {
          id: subject.id,
          email: subject.email,
          name: subject.name,
          registrationDate: subject.registrationDate,
          lastActivity: subject.lastActivity,
        },
        consents: subject.consentRecords,
        dataProcessing: subject.dataProcessingActivities,
        metadata: exportRequest.includeMetadata
          ? {
              exportedAt: new Date(),
              format: exportRequest.format,
              version: '1.0',
            }
          : undefined,
      };

      // Convert to requested format
      let exportContent: string;
      switch (exportRequest.format) {
        case 'json':
          exportContent = JSON.stringify(exportData, null, 2);
          break;
        case 'xml':
          exportContent = this.convertToXML(exportData);
          break;
        case 'csv':
          exportContent = this.convertToCSV(exportData);
          break;
        default:
          throw new Error(`Unsupported format: ${exportRequest.format}`);
      }

      // Encrypt the export data
      const encryptedData =
        await dataEncryptionService.encryptAtRest(exportContent);

      // In a real implementation, you would store this in a secure location
      // and provide a download URL. For now, we'll simulate this.
      exportRequest.downloadUrl = `https://secure-exports.example.com/${exportId}`;
      exportRequest.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      exportRequest.completedAt = new Date();
      exportRequest.status = 'completed';

      // Audit trail
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor(),
        action: 'data_export_completed',
        resource: AuditHelpers.createResource('data_export', exportId),
        outcome: AuditHelpers.createSuccessOutcome(),
        metadata: {
          subjectId: exportRequest.subjectId,
          format: exportRequest.format,
          dataSize: exportContent.length,
          encrypted: true,
        },
      });

      logger.info('GDPR data export completed', {
        exportId,
        subjectId: exportRequest.subjectId,
        format: exportRequest.format,
        dataSize: exportContent.length,
      });
    } catch (error) {
      exportRequest.status = 'failed';

      logger.error('GDPR data export failed', {
        exportId,
        subjectId: exportRequest.subjectId,
        error: (error as Error).message,
      });

      // Audit trail
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor(),
        action: 'data_export_failed',
        resource: AuditHelpers.createResource('data_export', exportId),
        outcome: AuditHelpers.createFailureOutcome((error as Error).message),
        metadata: {
          subjectId: exportRequest.subjectId,
        },
      });
    }
  }

  /**
   * Request data deletion (Right to be Forgotten)
   */
  async requestDataDeletion(
    subjectId: string,
    reason?: string
  ): Promise<DataDeletionRequest> {
    const deletionRequest: DataDeletionRequest = {
      id: `deletion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subjectId,
      requestedAt: new Date(),
      status: 'pending',
      reason,
      scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    this.deletionRequests.set(deletionRequest.id, deletionRequest);

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createUserActor(subjectId),
      action: 'data_deletion_requested',
      resource: AuditHelpers.createResource(
        'data_deletion',
        deletionRequest.id
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        reason,
        scheduledFor: deletionRequest.scheduledFor,
      },
    });

    logger.info('GDPR data deletion requested', {
      subjectId,
      deletionId: deletionRequest.id,
      reason,
      scheduledFor: deletionRequest.scheduledFor,
    });

    return deletionRequest;
  }

  /**
   * Process data deletion
   */
  async processDataDeletion(deletionId: string): Promise<void> {
    const deletionRequest = this.deletionRequests.get(deletionId);
    if (!deletionRequest) {
      return;
    }

    try {
      deletionRequest.status = 'processing';

      // Check if there are any retention overrides
      if (deletionRequest.retentionOverride) {
        if (new Date() < deletionRequest.retentionOverride.retainUntil) {
          deletionRequest.status = 'rejected';

          logger.info('GDPR data deletion rejected due to retention override', {
            deletionId,
            subjectId: deletionRequest.subjectId,
            retentionReason: deletionRequest.retentionOverride.reason,
            retainUntil: deletionRequest.retentionOverride.retainUntil,
          });

          return;
        }
      }

      // Perform the actual deletion
      const subject = this.dataSubjects.get(deletionRequest.subjectId);
      if (subject) {
        // In a real implementation, this would delete from all systems
        this.dataSubjects.delete(deletionRequest.subjectId);

        // Remove consent records
        subject.consentRecords.forEach((consent) => {
          this.consentRecords.delete(consent.id);
        });
      }

      deletionRequest.status = 'completed';
      deletionRequest.completedAt = new Date();

      // Audit trail
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor(),
        action: 'data_deletion_completed',
        resource: AuditHelpers.createResource('data_deletion', deletionId),
        outcome: AuditHelpers.createSuccessOutcome(),
        metadata: {
          subjectId: deletionRequest.subjectId,
          deletedAt: deletionRequest.completedAt,
        },
      });

      logger.info('GDPR data deletion completed', {
        deletionId,
        subjectId: deletionRequest.subjectId,
        completedAt: deletionRequest.completedAt,
      });
    } catch (error) {
      deletionRequest.status = 'failed';

      logger.error('GDPR data deletion failed', {
        deletionId,
        subjectId: deletionRequest.subjectId,
        error: (error as Error).message,
      });

      // Audit trail
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor(),
        action: 'data_deletion_failed',
        resource: AuditHelpers.createResource('data_deletion', deletionId),
        outcome: AuditHelpers.createFailureOutcome((error as Error).message),
        metadata: {
          subjectId: deletionRequest.subjectId,
        },
      });
    }
  }
  /**
   * Get data subject information
   */
  getDataSubject(subjectId: string): GDPRDataSubject | null {
    return this.dataSubjects.get(subjectId) || null;
  }

  /**
   * Get export request status
   */
  getExportRequest(exportId: string): DataExportRequest | null {
    return this.exportRequests.get(exportId) || null;
  }

  /**
   * Get deletion request status
   */
  getDeletionRequest(deletionId: string): DataDeletionRequest | null {
    return this.deletionRequests.get(deletionId) || null;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(): {
    totalSubjects: number;
    activeConsents: number;
    withdrawnConsents: number;
    pendingExports: number;
    completedExports: number;
    pendingDeletions: number;
    completedDeletions: number;
    dataProcessingActivities: number;
    retentionPolicies: Record<string, number>;
  } {
    let activeConsents = 0;
    let withdrawnConsents = 0;
    let dataProcessingActivities = 0;

    for (const consent of this.consentRecords.values()) {
      if (consent.granted && !consent.withdrawnAt) {
        activeConsents++;
      } else if (consent.withdrawnAt) {
        withdrawnConsents++;
      }
    }

    for (const subject of this.dataSubjects.values()) {
      dataProcessingActivities += subject.dataProcessingActivities.length;
    }

    const exportRequests = Array.from(this.exportRequests.values());
    const deletionRequests = Array.from(this.deletionRequests.values());

    return {
      totalSubjects: this.dataSubjects.size,
      activeConsents,
      withdrawnConsents,
      pendingExports: exportRequests.filter(
        (r) => r.status === 'pending' || r.status === 'processing'
      ).length,
      completedExports: exportRequests.filter((r) => r.status === 'completed')
        .length,
      pendingDeletions: deletionRequests.filter(
        (r) => r.status === 'pending' || r.status === 'processing'
      ).length,
      completedDeletions: deletionRequests.filter(
        (r) => r.status === 'completed'
      ).length,
      dataProcessingActivities,
      retentionPolicies: Object.fromEntries(this.retentionPolicies),
    };
  }

  /**
   * Convert data to XML format
   */
  private convertToXML(data: any): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';

    function objectToXML(obj: any, rootName: string = 'root'): string {
      if (typeof obj !== 'object' || obj === null) {
        return `<${rootName}>${obj}</${rootName}>`;
      }

      if (Array.isArray(obj)) {
        return obj
          .map((item, index) => objectToXML(item, `${rootName}_${index}`))
          .join('\n');
      }

      const xmlContent = Object.entries(obj)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              return `<${key}>\n${value.map((item, index) => objectToXML(item, `item_${index}`)).join('\n')}\n</${key}>`;
            } else {
              return `<${key}>\n${objectToXML(value)}\n</${key}>`;
            }
          } else {
            return `<${key}>${value}</${key}>`;
          }
        })
        .join('\n');

      return `<${rootName}>\n${xmlContent}\n</${rootName}>`;
    }

    return xmlHeader + objectToXML(data, 'gdpr_export');
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): string {
    const csvRows: string[] = [];

    // Subject information
    csvRows.push('Subject Information');
    csvRows.push('Field,Value');
    csvRows.push(`ID,${data.subject.id}`);
    csvRows.push(`Email,${data.subject.email}`);
    csvRows.push(`Name,${data.subject.name || ''}`);
    csvRows.push(`Registration Date,${data.subject.registrationDate}`);
    csvRows.push(`Last Activity,${data.subject.lastActivity || ''}`);
    csvRows.push('');

    // Consents
    csvRows.push('Consent Records');
    csvRows.push('ID,Purpose,Legal Basis,Granted,Timestamp,Withdrawn At');
    data.consents.forEach((consent: ConsentRecord) => {
      csvRows.push(
        `${consent.id},${consent.purpose},${consent.legalBasis},${consent.granted},${consent.timestamp},${consent.withdrawnAt || ''}`
      );
    });
    csvRows.push('');

    // Data Processing Activities
    csvRows.push('Data Processing Activities');
    csvRows.push(
      'ID,Activity,Purpose,Data Categories,Legal Basis,Timestamp,Automated'
    );
    data.dataProcessing.forEach((activity: DataProcessingActivity) => {
      csvRows.push(
        `${activity.id},${activity.activity},${activity.purpose},"${activity.dataCategories.join(';')}",${activity.legalBasis},${activity.timestamp},${activity.automated}`
      );
    });

    return csvRows.join('\n');
  }

  /**
   * Initialize retention policies
   */
  private initializeRetentionPolicies(): void {
    // Set default retention periods (in days)
    this.retentionPolicies.set('user_data', 2555); // 7 years
    this.retentionPolicies.set('session_data', 90); // 3 months
    this.retentionPolicies.set('audit_logs', 2555); // 7 years
    this.retentionPolicies.set('consent_records', 2555); // 7 years
    this.retentionPolicies.set('marketing_data', 1095); // 3 years
    this.retentionPolicies.set('analytics_data', 730); // 2 years
  }

  /**
   * Start retention cleanup process
   */
  private startRetentionCleanup(): void {
    // Run cleanup every 24 hours
    setInterval(
      () => {
        this.performRetentionCleanup();
      },
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Perform retention cleanup
   */
  private async performRetentionCleanup(): Promise<void> {
    logger.info('Starting GDPR retention cleanup');

    let cleanedRecords = 0;
    const now = new Date();

    // Clean up old consent records
    for (const [consentId, consent] of this.consentRecords) {
      const retentionPeriod =
        this.retentionPolicies.get('consent_records') || 2555;
      const expiryDate = new Date(
        consent.timestamp.getTime() + retentionPeriod * 24 * 60 * 60 * 1000
      );

      if (now > expiryDate) {
        this.consentRecords.delete(consentId);
        cleanedRecords++;
      }
    }

    // Clean up old export requests
    for (const [exportId, exportRequest] of this.exportRequests) {
      if (exportRequest.expiresAt && now > exportRequest.expiresAt) {
        this.exportRequests.delete(exportId);
        cleanedRecords++;
      }
    }

    logger.info('GDPR retention cleanup completed', {
      cleanedRecords,
      totalSubjects: this.dataSubjects.size,
      totalConsents: this.consentRecords.size,
    });
  }

  /**
   * Set retention override for deletion request
   */
  async setRetentionOverride(
    deletionId: string,
    reason: string,
    legalBasis: string,
    retainUntil: Date
  ): Promise<void> {
    const deletionRequest = this.deletionRequests.get(deletionId);
    if (!deletionRequest) {
      throw new Error('Deletion request not found');
    }

    deletionRequest.retentionOverride = {
      reason,
      legalBasis,
      retainUntil,
    };

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(),
      action: 'retention_override_set',
      resource: AuditHelpers.createResource('data_deletion', deletionId),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        subjectId: deletionRequest.subjectId,
        reason,
        legalBasis,
        retainUntil,
      },
    });

    logger.info('GDPR retention override set', {
      deletionId,
      subjectId: deletionRequest.subjectId,
      reason,
      legalBasis,
      retainUntil,
    });
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    return {
      status: 'healthy',
      details: {
        totalSubjects: this.dataSubjects.size,
        totalConsents: this.consentRecords.size,
        pendingExports: Array.from(this.exportRequests.values()).filter(
          (r) => r.status === 'pending'
        ).length,
        pendingDeletions: Array.from(this.deletionRequests.values()).filter(
          (r) => r.status === 'pending'
        ).length,
        retentionPoliciesConfigured: this.retentionPolicies.size,
      },
    };
  }
}

// Export singleton instance
export const gdprComplianceService = new GDPRComplianceService();
