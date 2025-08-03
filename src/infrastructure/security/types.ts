/**
 * Security Infrastructure Types
 * Common types and interfaces for security services
 */

export interface TokenGenerationOptions {
  length?: number;
  alphabet?: string;
  prefix?: string;
  includeTimestamp?: boolean;
  entropy?: number;
}

export interface DeviceFingerprint {
  id: string;
  userAgent: string;
  ipAddress: string;
  acceptLanguage?: string;
  acceptEncoding?: string;
  timezone?: string;
  screenResolution?: string;
  colorDepth?: number;
  platform?: string;
  cookiesEnabled?: boolean;
  doNotTrack?: boolean;
  plugins?: string[];
  fonts?: string[];
  canvas?: string;
  webgl?: string;
  audioContext?: string;
  createdAt: Date;
  lastSeen: Date;
  trustScore: number;
}

export interface RiskFactor {
  type: 'location' | 'device' | 'behavior' | 'temporal' | 'network' | 'ip_change' | 'device_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  description: string;
  metadata?: Record<string, any>;
}

export interface RiskAssessment {
  overallScore: number; // 0-100, higher = more risky
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  recommendations: string[];
  requiresMFA: boolean;
  allowAccess: boolean;
  timestamp: Date;
}

export interface SecurityContext {
  userId: string;
  sessionId: string;
  deviceFingerprint: DeviceFingerprint;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  previousLogins?: LoginHistory[];
  accountAge?: number; // days
  failedAttempts?: number;
  isVPN?: boolean;
  isTor?: boolean;
  isProxy?: boolean;
  geoLocation?: GeoLocation;
}

export interface LoginHistory {
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  deviceFingerprint: string;
  location?: GeoLocation;
  riskScore: number;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp?: string;
  organization?: string;
}

export interface PasswordHashingOptions {
  type?: 'argon2id' | 'argon2i' | 'argon2d';
  memoryCost?: number; // Memory usage in KB
  timeCost?: number; // Number of iterations
  parallelism?: number; // Number of threads
  hashLength?: number; // Length of hash in bytes
  saltLength?: number; // Length of salt in bytes
}

export interface JWTSigningOptions {
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
  jwtid?: string;
  notBefore?: string | number;
  keyid?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: any;
  error?: string;
  expired?: boolean;
  notBefore?: boolean;
  audience?: boolean;
  issuer?: boolean;
  subject?: boolean;
}

export interface SecureRandomOptions {
  length: number;
  encoding?: 'hex' | 'base64' | 'base64url' | 'ascii';
  alphabet?: string;
}

export interface CryptographicKeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface EncryptionOptions {
  algorithm?: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
  keyDerivation?: 'pbkdf2' | 'scrypt' | 'argon2';
  iterations?: number;
  saltLength?: number;
  tagLength?: number;
}

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  salt: string;
  tag?: string;
  algorithm: string;
}
