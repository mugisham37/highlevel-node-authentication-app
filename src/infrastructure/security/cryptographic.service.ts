/**
 * Cryptographic Service
 * Main orchestrator for all cryptographic operations and security services
 */

import { PasswordHashingService } from './password-hashing.service';
import { JWTTokenService } from './jwt-token.service';
import { SecureIdGenerator } from './secure-id-generator.service';
import { DeviceFingerprintingService } from './device-fingerprinting.service';
import { RiskScoringService } from './risk-scoring.service';
import { SecureTokenGenerator } from './secure-token-generator.service';
import {
  SecurityContext,
  RiskAssessment,
  DeviceFingerprint,
  PasswordHashingOptions,
  JWTSigningOptions,
  TokenGenerationOptions,
} from './types';

export interface CryptographicConfig {
  // JWT Configuration
  accessTokenSecret: string;
  refreshTokenSecret: string;
  jwtSigningOptions?: Partial<JWTSigningOptions>;

  // Password Hashing Configuration
  passwordHashingOptions?: Partial<PasswordHashingOptions>;

  // Risk Scoring Configuration
  riskScoringEnabled?: boolean;

  // Device Fingerprinting Configuration
  deviceFingerprintingEnabled?: boolean;

  // Token Generation Configuration
  defaultTokenOptions?: Partial<TokenGenerationOptions>;
}

export class CryptographicService {
  private readonly passwordHashingService: PasswordHashingService;
  private readonly jwtTokenService: JWTTokenService;
  private readonly riskScoringService: RiskScoringService;

  constructor(private readonly config: CryptographicConfig) {
    // Validate configuration
    this.validateConfig(config);

    // Initialize services
    this.passwordHashingService = new PasswordHashingService();
    this.jwtTokenService = new JWTTokenService(
      config.accessTokenSecret,
      config.jwtSigningOptions?.issuer
    );
    this.riskScoringService = new RiskScoringService();
  }

  /**
   * Password Operations
   */
  async hashPassword(
    password: string,
    options?: Partial<PasswordHashingOptions>
  ): Promise<string> {
    const hashOptions = { ...this.config.passwordHashingOptions, ...options };
    return this.passwordHashingService.hashPassword(password, hashOptions);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return this.passwordHashingService.verifyPassword(password, hash);
  }

  needsPasswordRehash(
    hash: string,
    options?: Partial<PasswordHashingOptions>
  ): boolean {
    const hashOptions = { ...this.config.passwordHashingOptions, ...options };
    return this.passwordHashingService.needsRehash(hash, hashOptions);
  }

  validatePasswordStrength(password: string) {
    return this.passwordHashingService.validatePasswordStrength(password);
  }

  /**
   * JWT Token Operations
   */
  createAccessToken(
    payload: any,
    options?: Partial<JWTSigningOptions>
  ): string {
    return this.jwtTokenService.createAccessToken(payload, options);
  }

  createRefreshToken(
    payload: any,
    options?: Partial<JWTSigningOptions>
  ): string {
    return this.jwtTokenService.createRefreshToken(payload, options);
  }

  async createTokenPair(
    payload: any,
    accessTokenOptions?: Partial<JWTSigningOptions>,
    refreshTokenOptions?: Partial<JWTSigningOptions>
  ): Promise<{ accessToken: string; refreshToken: string; tokenType: string; expiresIn: number }> {
    const accessTokenExpiry = accessTokenOptions?.expiresIn || '15m';
    const refreshTokenExpiry = refreshTokenOptions?.expiresIn || '7d';
    
    const tokenPair = await this.jwtTokenService.generateTokenPair(
      payload,
      accessTokenExpiry,
      refreshTokenExpiry
    );

    // Calculate expiresIn seconds from the expiry string
    const expiresIn = this.parseExpiryToSeconds(accessTokenExpiry);

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: tokenPair.tokenType,
      expiresIn
    };
  }

  verifyAccessToken(token: string) {
    return this.jwtTokenService.verifyAccessToken(token);
  }

  verifyRefreshToken(token: string) {
    return this.jwtTokenService.verifyRefreshToken(token);
  }

  refreshAccessToken(refreshToken: string) {
    return this.jwtTokenService.refreshAccessToken(refreshToken);
  }

  createSpecialToken(
    type: 'reset' | 'verification' | 'mfa',
    payload: any,
    expiresIn?: string
  ): string {
    return this.jwtTokenService.createSpecialToken(
      payload,
      type,
      expiresIn ? { expiresIn } : undefined
    );
  }

  verifySpecialToken(
    token: string,
    expectedType: 'reset' | 'verification' | 'mfa'
  ) {
    return this.jwtTokenService.verifySpecialToken(token, expectedType);
  }

  /**
   * Secure ID Generation
   */
  generateUserId(): string {
    return SecureIdGenerator.generateUserId();
  }

  generateSessionId(): string {
    return SecureIdGenerator.generateSessionId();
  }

  generateDeviceId(): string {
    return SecureIdGenerator.generateDeviceId();
  }

  generateApiKey(): string {
    return SecureIdGenerator.generateApiKey();
  }

  generateCorrelationId(): string {
    return SecureIdGenerator.generateCorrelationId();
  }

  generateCustomId(options?: Partial<TokenGenerationOptions>): string {
    const idOptions = { ...this.config.defaultTokenOptions, ...options };
    return SecureIdGenerator.generateCustomId(idOptions);
  }

  validateId(id: string, options?: Partial<TokenGenerationOptions>) {
    const idOptions = { ...this.config.defaultTokenOptions, ...options };
    return SecureIdGenerator.validateId(id, idOptions);
  }

  /**
   * Device Fingerprinting
   */
  generateDeviceFingerprint(input: any): DeviceFingerprint {
    if (!this.config.deviceFingerprintingEnabled) {
      throw new Error('Device fingerprinting is disabled');
    }
    return DeviceFingerprintingService.generateFingerprint(input);
  }

  analyzeDevice(input: any) {
    if (!this.config.deviceFingerprintingEnabled) {
      throw new Error('Device fingerprinting is disabled');
    }
    return DeviceFingerprintingService.analyzeDevice(input);
  }

  compareDeviceFingerprints(fp1: DeviceFingerprint, fp2: DeviceFingerprint) {
    return DeviceFingerprintingService.compareFingerprints(fp1, fp2);
  }

  trackDeviceChanges(
    previousFingerprint: DeviceFingerprint,
    currentInput: any
  ) {
    return DeviceFingerprintingService.trackDeviceChanges(
      previousFingerprint,
      currentInput
    );
  }

  /**
   * Risk Assessment
   */
  async assessRisk(context: SecurityContext): Promise<RiskAssessment> {
    if (!this.config.riskScoringEnabled) {
      // Return minimal risk assessment if disabled
      return {
        overallScore: 0,
        level: 'low',
        factors: [],
        recommendations: ['Risk scoring disabled'],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      };
    }
    return this.riskScoringService.assessRisk(context);
  }

  /**
   * Secure Token Generation
   */
  generatePasswordResetToken(): string {
    return SecureTokenGenerator.generatePasswordResetToken();
  }

  generateEmailVerificationToken(): string {
    return SecureTokenGenerator.generateEmailVerificationToken();
  }

  generateMagicLinkToken(): string {
    return SecureTokenGenerator.generateMagicLinkToken();
  }

  generateWebhookSecret(): string {
    return SecureTokenGenerator.generateWebhookSecret();
  }

  generateCSRFToken(): string {
    return SecureTokenGenerator.generateCSRFToken();
  }

  generateOAuthState(): string {
    return SecureTokenGenerator.generateOAuthState();
  }

  generateOTP(length?: number): string {
    return SecureTokenGenerator.generateOTP(length);
  }

  generateBackupCodes(count?: number): string[] {
    return SecureTokenGenerator.generateBackupCodes(count);
  }

  generateSessionToken(): string {
    return SecureTokenGenerator.generateSessionToken();
  }

  generateNonce(length?: number): string {
    return SecureTokenGenerator.generateNonce(length);
  }

  generateChallenge(): string {
    return SecureTokenGenerator.generateChallenge();
  }

  /**
   * PKCE Operations
   */
  generatePKCECodeVerifier(): string {
    return SecureTokenGenerator.generatePKCECodeVerifier();
  }

  generatePKCECodeChallenge(verifier: string): string {
    return SecureTokenGenerator.generatePKCECodeChallenge(verifier);
  }

  /**
   * Signed Token Operations
   */
  generateSignedToken(payload: string, secret: string, options?: any): string {
    return SecureTokenGenerator.generateSignedToken(payload, secret, options);
  }

  verifySignedToken(signedToken: string, secret: string) {
    return SecureTokenGenerator.verifySignedToken(signedToken, secret);
  }

  /**
   * Device Binding Operations
   */
  generateDeviceBindingToken(deviceId: string, secret: string): string {
    return SecureTokenGenerator.generateDeviceBindingToken(deviceId, secret);
  }

  verifyDeviceBindingToken(
    token: string,
    expectedDeviceId: string,
    secret: string,
    maxAge?: number
  ): boolean {
    return SecureTokenGenerator.verifyDeviceBindingToken(
      token,
      expectedDeviceId,
      secret,
      maxAge
    );
  }

  /**
   * HMAC Operations
   */
  generateHMACToken(data: string, secret: string, algorithm?: string): string {
    return SecureTokenGenerator.generateHMACToken(data, secret, algorithm);
  }

  /**
   * Utility Operations
   */
  generateSalt(length?: number): string {
    return SecureTokenGenerator.generateSalt(length);
  }

  generateKey(length?: number): Buffer {
    return SecureTokenGenerator.generateKey(length);
  }

  generateIV(length?: number): Buffer {
    return SecureTokenGenerator.generateIV(length);
  }

  /**
   * Comprehensive Security Assessment
   */
  async performSecurityAssessment(context: SecurityContext): Promise<{
    riskAssessment: RiskAssessment;
    deviceAnalysis: any;
    recommendations: string[];
    securityScore: number;
    allowAccess: boolean;
    requiresMFA: boolean;
  }> {
    // Perform risk assessment
    const riskAssessment = await this.assessRisk(context);

    // Analyze device if enabled
    let deviceAnalysis = null;
    if (this.config.deviceFingerprintingEnabled) {
      deviceAnalysis = this.analyzeDevice({
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      });
    }

    // Calculate overall security score
    let securityScore = 100 - riskAssessment.overallScore;
    if (deviceAnalysis && deviceAnalysis.isBot) {
      securityScore -= 30;
    }
    if (deviceAnalysis && deviceAnalysis.trustScore < 50) {
      securityScore -= 20;
    }

    securityScore = Math.max(0, Math.min(100, securityScore));

    // Generate comprehensive recommendations
    const recommendations = [...riskAssessment.recommendations];

    if (deviceAnalysis) {
      recommendations.push(...deviceAnalysis.riskFactors);
    }

    return {
      riskAssessment,
      deviceAnalysis,
      recommendations: [...new Set(recommendations)], // Remove duplicates
      securityScore,
      allowAccess: riskAssessment.allowAccess && securityScore > 30,
      requiresMFA: riskAssessment.requiresMFA || securityScore < 60,
    };
  }

  /**
   * Generate comprehensive security context
   */
  createSecurityContext(input: {
    userId?: string;
    sessionId?: string;
    ipAddress: string;
    userAgent: string;
    previousLogins?: any[];
    accountAge?: number;
    failedAttempts?: number;
    geoLocation?: any;
  }): SecurityContext {
    const deviceFingerprint = this.config.deviceFingerprintingEnabled
      ? this.generateDeviceFingerprint({
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
        })
      : ({
          id: 'fingerprinting-disabled',
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
          createdAt: new Date(),
          lastSeen: new Date(),
          trustScore: 50,
        } as DeviceFingerprint);

    return {
      userId: input.userId || 'anonymous',
      sessionId: input.sessionId || `session-${Date.now()}`,
      deviceFingerprint,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      timestamp: new Date(),
      ...(input.previousLogins && { previousLogins: input.previousLogins }),
      ...(input.accountAge !== undefined && { accountAge: input.accountAge }),
      ...(input.failedAttempts !== undefined && { failedAttempts: input.failedAttempts }),
      ...(input.geoLocation && { geoLocation: input.geoLocation }),
    };
  }

  private validateConfig(config: CryptographicConfig): void {
    if (!config.accessTokenSecret || !config.refreshTokenSecret) {
      throw new Error('JWT secrets are required');
    }

    if (config.accessTokenSecret === config.refreshTokenSecret) {
      throw new Error('Access and refresh token secrets must be different');
    }

    if (config.accessTokenSecret.length < 32) {
      throw new Error('Access token secret must be at least 32 characters');
    }

    if (config.refreshTokenSecret.length < 32) {
      throw new Error('Refresh token secret must be at least 32 characters');
    }
  }

  /**
   * Generate secure configuration
   */
  static generateSecureConfig(): Pick<
    CryptographicConfig,
    'accessTokenSecret' | 'refreshTokenSecret'
  > {
    const secrets = JWTTokenService.generateSecrets();
    return {
      accessTokenSecret: secrets.accessTokenSecret,
      refreshTokenSecret: secrets.refreshTokenSecret,
    };
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string | number): number {
    if (typeof expiry === 'number') {
      return expiry;
    }

    const timeUnit = expiry.slice(-1);
    const timeValue = parseInt(expiry.slice(0, -1));

    switch (timeUnit) {
      case 's':
        return timeValue;
      case 'm':
        return timeValue * 60;
      case 'h':
        return timeValue * 60 * 60;
      case 'd':
        return timeValue * 24 * 60 * 60;
      default:
        return 900; // Default 15 minutes
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    timestamp: Date;
  } {
    const services = {
      passwordHashing: true, // Always available
      jwtTokens: true, // Always available
      secureIdGeneration: true, // Always available
      deviceFingerprinting: this.config.deviceFingerprintingEnabled || false,
      riskScoring: this.config.riskScoringEnabled || false,
      tokenGeneration: true, // Always available
    };

    const enabledServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.keys(services).length;
    const healthRatio = enabledServices / totalServices;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthRatio >= 0.8) status = 'healthy';
    else if (healthRatio >= 0.5) status = 'degraded';
    else status = 'unhealthy';

    return {
      status,
      services,
      timestamp: new Date(),
    };
  }
}
