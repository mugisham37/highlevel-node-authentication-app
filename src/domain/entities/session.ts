/**
 * Session Domain Entity
 * Represents a user session with expiration logic and risk scoring
 */

import { DeviceInfo } from './user';

export interface SessionProps {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  deviceInfo?: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  riskScore: number;
  isActive: boolean;
}

export class Session {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _token: string;
  private readonly _refreshToken: string;
  private readonly _expiresAt: Date;
  private readonly _refreshExpiresAt: Date;
  private readonly _createdAt: Date;
  private _lastActivity: Date;
  private readonly _deviceInfo?: DeviceInfo;
  private readonly _ipAddress?: string;
  private readonly _userAgent?: string;
  private _riskScore: number;
  private _isActive: boolean;

  constructor(props: SessionProps) {
    this.validateProps(props);

    this._id = props.id;
    this._userId = props.userId;
    this._token = props.token;
    this._refreshToken = props.refreshToken;
    this._expiresAt = props.expiresAt;
    this._refreshExpiresAt = props.refreshExpiresAt;
    this._createdAt = props.createdAt;
    this._lastActivity = props.lastActivity;
    this._deviceInfo = props.deviceInfo;
    this._ipAddress = props.ipAddress;
    this._userAgent = props.userAgent;
    this._riskScore = props.riskScore;
    this._isActive = props.isActive;
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get userId(): string {
    return this._userId;
  }
  get token(): string {
    return this._token;
  }
  get refreshToken(): string {
    return this._refreshToken;
  }
  get expiresAt(): Date {
    return this._expiresAt;
  }
  get refreshExpiresAt(): Date {
    return this._refreshExpiresAt;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get lastActivity(): Date {
    return this._lastActivity;
  }
  get deviceInfo(): DeviceInfo | undefined {
    return this._deviceInfo;
  }
  get ipAddress(): string | undefined {
    return this._ipAddress;
  }
  get userAgent(): string | undefined {
    return this._userAgent;
  }
  get riskScore(): number {
    return this._riskScore;
  }
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Check if the session is expired
   */
  isExpired(): boolean {
    return new Date() > this._expiresAt;
  }

  /**
   * Check if the refresh token is expired
   */
  isRefreshExpired(): boolean {
    return new Date() > this._refreshExpiresAt;
  }

  /**
   * Check if the session is refreshable
   */
  isRefreshable(): boolean {
    return this._isActive && !this.isRefreshExpired();
  }

  /**
   * Check if the session is valid for use
   */
  isValid(): boolean {
    return this._isActive && !this.isExpired();
  }

  /**
   * Update the last activity timestamp
   */
  updateActivity(): void {
    this._lastActivity = new Date();
  }

  /**
   * Calculate and update risk score based on current context
   */
  calculateRiskScore(currentIP: string, currentDevice?: DeviceInfo): number {
    let riskScore = 0;

    // IP address risk
    if (this._ipAddress && this._ipAddress !== currentIP) {
      riskScore += 30; // Different IP address is high risk
    }

    // Device fingerprint risk
    if (this._deviceInfo && currentDevice) {
      if (this._deviceInfo.fingerprint !== currentDevice.fingerprint) {
        riskScore += 25; // Different device fingerprint
      }

      if (this._deviceInfo.userAgent !== currentDevice.userAgent) {
        riskScore += 15; // Different user agent
      }

      if (this._deviceInfo.platform !== currentDevice.platform) {
        riskScore += 20; // Different platform
      }
    }

    // Time-based risk factors
    const sessionAge = Date.now() - this._createdAt.getTime();
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

    if (sessionAge > maxSessionAge) {
      riskScore += 15; // Old sessions are riskier
    }

    // Activity pattern risk
    const timeSinceLastActivity = Date.now() - this._lastActivity.getTime();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

    if (timeSinceLastActivity > inactivityThreshold) {
      riskScore += 10; // Long inactivity periods
    }

    // Rapid activity risk (potential bot behavior)
    const activityWindow = 60 * 1000; // 1 minute
    if (timeSinceLastActivity < activityWindow) {
      riskScore += 5; // Very rapid activity
    }

    // Geographic risk (simplified - in real implementation would use IP geolocation)
    if (this._ipAddress && currentIP) {
      const ipParts1 = this._ipAddress.split('.');
      const ipParts2 = currentIP.split('.');

      // Simple check for different network ranges
      if (ipParts1[0] !== ipParts2[0] || ipParts1[1] !== ipParts2[1]) {
        riskScore += 20; // Different network range
      }
    }

    this._riskScore = Math.min(100, Math.max(0, riskScore));
    return this._riskScore;
  }

  /**
   * Revoke the session
   */
  revoke(): void {
    this._isActive = false;
  }

  /**
   * Check if session expires within the given minutes
   */
  expiresWithin(minutes: number): boolean {
    const threshold = new Date(Date.now() + minutes * 60 * 1000);
    return this._expiresAt <= threshold;
  }

  /**
   * Get remaining time until expiration in minutes
   */
  getRemainingTime(): number {
    const remaining = this._expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / (60 * 1000)));
  }

  /**
   * Get remaining refresh time in minutes
   */
  getRemainingRefreshTime(): number {
    const remaining = this._refreshExpiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / (60 * 1000)));
  }

  /**
   * Check if this session is from a mobile device
   */
  isMobileSession(): boolean {
    return this._deviceInfo?.isMobile ?? false;
  }

  /**
   * Get session duration in minutes
   */
  getSessionDuration(): number {
    const duration = this._lastActivity.getTime() - this._createdAt.getTime();
    return Math.floor(duration / (60 * 1000));
  }

  /**
   * Check if session is suspicious based on risk factors
   */
  isSuspicious(): boolean {
    return this._riskScore > 70;
  }

  /**
   * Get session security status
   */
  getSecurityStatus(): {
    isSecure: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (this.isExpired()) {
      issues.push('Session has expired');
      recommendations.push('Please log in again');
    }

    if (this.expiresWithin(5)) {
      issues.push('Session expires soon');
      recommendations.push('Session will expire in less than 5 minutes');
    }

    if (this._riskScore > 50) {
      issues.push('Elevated risk score detected');
      recommendations.push(
        'Verify your identity with additional authentication'
      );
    }

    const sessionAge = Date.now() - this._createdAt.getTime();
    const maxRecommendedAge = 8 * 60 * 60 * 1000; // 8 hours

    if (sessionAge > maxRecommendedAge) {
      issues.push('Long-running session');
      recommendations.push('Consider logging out and back in for security');
    }

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (this._riskScore < 25) {
      riskLevel = 'low';
    } else if (this._riskScore < 50) {
      riskLevel = 'medium';
    } else if (this._riskScore < 75) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    return {
      isSecure: issues.length === 0 && this._riskScore < 50,
      riskLevel,
      issues,
      recommendations,
    };
  }

  /**
   * Create a session summary for logging/auditing
   */
  createAuditSummary(): {
    sessionId: string;
    userId: string;
    duration: number;
    riskScore: number;
    deviceType: string;
    ipAddress?: string;
    isActive: boolean;
  } {
    return {
      sessionId: this._id,
      userId: this._userId,
      duration: this.getSessionDuration(),
      riskScore: this._riskScore,
      deviceType: this._deviceInfo?.isMobile ? 'mobile' : 'desktop',
      ipAddress: this._ipAddress,
      isActive: this._isActive,
    };
  }

  private validateProps(props: SessionProps): void {
    if (!props.id || typeof props.id !== 'string') {
      throw new Error('Session ID must be a non-empty string');
    }

    if (!props.userId || typeof props.userId !== 'string') {
      throw new Error('User ID must be a non-empty string');
    }

    if (!props.token || typeof props.token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    if (!props.refreshToken || typeof props.refreshToken !== 'string') {
      throw new Error('Refresh token must be a non-empty string');
    }

    if (!(props.expiresAt instanceof Date)) {
      throw new Error('Expires at must be a Date');
    }

    if (!(props.refreshExpiresAt instanceof Date)) {
      throw new Error('Refresh expires at must be a Date');
    }

    if (!(props.createdAt instanceof Date)) {
      throw new Error('Created at must be a Date');
    }

    if (!(props.lastActivity instanceof Date)) {
      throw new Error('Last activity must be a Date');
    }

    if (props.riskScore < 0 || props.riskScore > 100) {
      throw new Error('Risk score must be between 0 and 100');
    }

    if (props.expiresAt <= props.createdAt) {
      throw new Error('Expiration time must be after creation time');
    }

    if (props.refreshExpiresAt <= props.expiresAt) {
      throw new Error('Refresh expiration must be after token expiration');
    }

    if (props.lastActivity < props.createdAt) {
      throw new Error('Last activity cannot be before creation time');
    }
  }

  equals(other: Session): boolean {
    return this._id === other._id;
  }

  toJSON(): any {
    return {
      id: this._id,
      userId: this._userId,
      expiresAt: this._expiresAt,
      refreshExpiresAt: this._refreshExpiresAt,
      createdAt: this._createdAt,
      lastActivity: this._lastActivity,
      deviceInfo: this._deviceInfo,
      ipAddress: this._ipAddress,
      userAgent: this._userAgent,
      riskScore: this._riskScore,
      isActive: this._isActive,
      // Don't expose actual tokens in JSON
      hasToken: !!this._token,
      hasRefreshToken: !!this._refreshToken,
    };
  }
}
