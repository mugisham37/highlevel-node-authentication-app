/**
 * Compliance Infrastructure Services
 * Export all compliance-related services
 */

export {
  GDPRComplianceService,
  gdprComplianceService,
} from './gdpr-compliance.service';
export {
  ComplianceReportingService,
  complianceReportingService,
} from './compliance-reporting.service';

// Types and interfaces
export type {
  GDPRDataSubject,
  ConsentRecord,
  DataProcessingActivity,
  DataExportRequest,
  DataDeletionRequest,
} from './gdpr-compliance.service';

export type {
  ComplianceReport,
  ComplianceSection,
  ComplianceControl,
  ComplianceRecommendation,
  ComplianceEvidence,
} from './compliance-reporting.service';
