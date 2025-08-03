/**
 * Security Infrastructure Services
 * Export all security-related services
 */

export { PasswordHashingService } from './password-hashing.service';
export { JWTTokenService } from './jwt-token.service';
export { SecureIdGenerator } from './secure-id-generator.service';
export { DeviceFingerprintingService } from './device-fingerprinting.service';
export { RiskScoringService } from './risk-scoring.service';
export { SecureTokenGenerator } from './secure-token-generator.service';
export { CryptographicService } from './cryptographic.service';
export {
  DataEncryptionService,
  dataEncryptionService,
} from './data-encryption.service';
export {
  VulnerabilityScannerService,
  vulnerabilityScannerService,
} from './vulnerability-scanner.service';
export {
  SecureConfigManagerService,
  secureConfigManager,
} from './secure-config-manager.service';
export {
  TamperProtectionService,
  tamperProtectionService,
} from './tamper-protection.service';
export {
  ComplianceScannerService,
  complianceScannerService,
} from './compliance-scanner.service';

// Types and interfaces
export type {
  TokenGenerationOptions,
  DeviceFingerprint,
  RiskAssessment,
  SecurityContext,
  EncryptionOptions,
  EncryptionResult,
} from './types';

export type {
  DataEncryptionConfig,
  FieldEncryptionConfig,
  DatabaseEncryptionConfig,
} from './data-encryption.service';

export type {
  VulnerabilityReport,
  Vulnerability,
  ScanConfiguration,
} from './vulnerability-scanner.service';

export type {
  SecureConfigSchema,
  ConfigurationEntry,
  ConfigurationAudit,
} from './secure-config-manager.service';

export type {
  TamperProtectionConfig,
  ProtectedData,
  IntegrityViolation,
} from './tamper-protection.service';

export type {
  ComplianceRule,
  ComplianceCheckResult,
  ComplianceFinding,
  ComplianceEvidence,
  ComplianceScanResult,
} from './compliance-scanner.service';
