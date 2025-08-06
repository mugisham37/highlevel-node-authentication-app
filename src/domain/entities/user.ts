/**
 * User Domain Entity
 * Represents a user with domain methods and business rules validation
 */

import { Email } from '../value-objects/email';
import { Password } from '../value-objects/password';

export interface DeviceInfo {
  fingerprint: string;
  userAgent: string;
  platform: string;
  browser: string;
  version: string;
  isMobile: boolean;
  screenResolution?: string;
  timezone?: string;
}

export interface UserProps {
  id: string;
  email: Email;
  emailVerified?: Date | undefined;
  name?: string | undefined;
  image?: string | undefined;
  password?: Password | undefined;
  createdAt: Date;
  updatedAt: Date;

  // MFA Properties
  mfaEnabled: boolean;
  totpSecret?: string | undefined;
  backupCodes: string[];

  // Security Properties
  failedLoginAttempts: number;
  lockedUntil?: Date | undefined;
  lastLoginAt?: Date | undefined;
  lastLoginIP?: string | undefined;
  riskScore: number;
}

export class User {
  private readonly _id: string;
  private _email: Email;
  private _emailVerified: Date | undefined;
  private _name: string | undefined;
  private _image: string | undefined;
  private _password: Password | undefined;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  // MFA Properties
  private _mfaEnabled: boolean;
  private _totpSecret: string | undefined;
  private _backupCodes: string[];

  // Security Properties
  private _failedLoginAttempts: number;
  private _lockedUntil: Date | undefined;
  private _lastLoginAt: Date | undefined;
  private _lastLoginIP: string | undefined;
  private _riskScore: number;

  constructor(props: UserProps) {
    this.validateProps(props);

    this._id = props.id;
    this._email = props.email;
    this._emailVerified = props.emailVerified;
    this._name = props.name;
    this._image = props.image;
    this._password = props.password;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;

    this._mfaEnabled = props.mfaEnabled;
    this._totpSecret = props.totpSecret;
    this._backupCodes = props.backupCodes;

    this._failedLoginAttempts = props.failedLoginAttempts;
    this._lockedUntil = props.lockedUntil;
    this._lastLoginAt = props.lastLoginAt;
    this._lastLoginIP = props.lastLoginIP;
    this._riskScore = props.riskScore;
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get email(): Email {
    return this._email;
  }
  get emailVerified(): Date | undefined {
    return this._emailVerified;
  }
  get name(): string | undefined {
    return this._name;
  }
  get image(): string | undefined {
    return this._image;
  }
  get password(): Password | undefined {
    return this._password;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get mfaEnabled(): boolean {
    return this._mfaEnabled;
  }
  get totpSecret(): string | undefined {
    return this._totpSecret;
  }
  get backupCodes(): string[] {
    return [...this._backupCodes];
  }
  get failedLoginAttempts(): number {
    return this._failedLoginAttempts;
  }
  get lockedUntil(): Date | undefined {
    return this._lockedUntil;
  }
  get lastLoginAt(): Date | undefined {
    return this._lastLoginAt;
  }
  get lastLoginIP(): string | undefined {
    return this._lastLoginIP;
  }
  get riskScore(): number {
    return this._riskScore;
  }

  /**
   * Check if the user account is currently locked
   */
  isLocked(): boolean {
    if (!this._lockedUntil) return false;
    return new Date() < this._lockedUntil;
  }

  /**
   * Check if the user can authenticate
   */
  canAuthenticate(): boolean {
    return !this.isLocked() && this.isEmailVerified();
  }

  /**
   * Check if email is verified
   */
  isEmailVerified(): boolean {
    return this._emailVerified !== undefined && this._emailVerified !== null;
  }

  /**
   * Increment failed login attempts and potentially lock account
   */
  incrementFailedAttempts(): void {
    this._failedLoginAttempts += 1;
    this._updatedAt = new Date();

    // Progressive lockout strategy
    if (this._failedLoginAttempts >= 3) {
      const lockoutMinutes = Math.min(
        Math.pow(2, this._failedLoginAttempts - 3),
        60
      ); // Max 60 minutes
      this._lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }
  }

  /**
   * Reset failed login attempts after successful authentication
   */
  resetFailedAttempts(): void {
    this._failedLoginAttempts = 0;
    this._lockedUntil = undefined;
    this._updatedAt = new Date();
  }

  /**
   * Update last login information
   */
  updateLastLogin(ipAddress: string, deviceInfo?: DeviceInfo): void {
    this._lastLoginAt = new Date();
    this._lastLoginIP = ipAddress;
    this._updatedAt = new Date();

    // Update risk score based on login patterns
    this.updateRiskScore(ipAddress, deviceInfo);
  }

  /**
   * Update risk score based on various factors
   */
  updateRiskScore(ipAddress: string, deviceInfo?: DeviceInfo): void {
    let riskScore = 0;

    // IP address risk factors
    if (this._lastLoginIP && this._lastLoginIP !== ipAddress) {
      riskScore += 20; // Different IP address
    }

    // Time-based risk factors
    if (this._lastLoginAt) {
      const hoursSinceLastLogin =
        (Date.now() - this._lastLoginAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastLogin < 1) {
        riskScore += 10; // Very frequent logins
      }
    }

    // Failed attempts risk
    riskScore += this._failedLoginAttempts * 5;

    // Device risk factors
    if (deviceInfo) {
      if (deviceInfo.isMobile) {
        riskScore += 5; // Mobile devices are slightly riskier
      }
    }

    // Account age risk (newer accounts are riskier)
    const accountAgeInDays =
      (Date.now() - this._createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeInDays < 7) {
      riskScore += 15;
    } else if (accountAgeInDays < 30) {
      riskScore += 10;
    }

    // Email verification risk
    if (!this.isEmailVerified()) {
      riskScore += 25;
    }

    // MFA risk reduction
    if (this._mfaEnabled) {
      riskScore = Math.max(0, riskScore - 20);
    }

    this._riskScore = Math.min(100, Math.max(0, riskScore));
    this._updatedAt = new Date();
  }

  /**
   * Enable MFA for the user
   */
  enableMFA(totpSecret: string, backupCodes: string[]): void {
    if (!totpSecret || totpSecret.length === 0) {
      throw new Error('TOTP secret is required to enable MFA');
    }

    if (!backupCodes || backupCodes.length < 8) {
      throw new Error('At least 8 backup codes are required');
    }

    this._mfaEnabled = true;
    this._totpSecret = totpSecret;
    this._backupCodes = [...backupCodes];
    this._updatedAt = new Date();

    // Reduce risk score when MFA is enabled
    this._riskScore = Math.max(0, this._riskScore - 20);
  }

  /**
   * Disable MFA for the user
   */
  disableMFA(): void {
    this._mfaEnabled = false;
    this._totpSecret = undefined;
    this._backupCodes = [];
    this._updatedAt = new Date();

    // Increase risk score when MFA is disabled
    this._riskScore = Math.min(100, this._riskScore + 20);
  }

  /**
   * Use a backup code for MFA
   */
  useBackupCode(code: string): boolean {
    const index = this._backupCodes.indexOf(code);
    if (index === -1) return false;

    this._backupCodes.splice(index, 1);
    this._updatedAt = new Date();
    return true;
  }

  /**
   * Verify email address
   */
  verifyEmail(): void {
    this._emailVerified = new Date();
    this._updatedAt = new Date();

    // Reduce risk score when email is verified
    this._riskScore = Math.max(0, this._riskScore - 25);
  }

  /**
   * Update user profile information
   */
  updateProfile(updates: {
    name?: string;
    image?: string;
    email?: Email;
  }): void {
    if (updates.name !== undefined) {
      this.validateName(updates.name);
      this._name = updates.name;
    }

    if (updates.image !== undefined) {
      this.validateImage(updates.image);
      this._image = updates.image;
    }

    if (updates.email !== undefined) {
      // If email changes, reset verification
      if (!this._email.equals(updates.email)) {
        this._email = updates.email;
        this._emailVerified = undefined;
        this._riskScore = Math.min(100, this._riskScore + 25);
      }
    }

    this._updatedAt = new Date();
  }

  /**
   * Change user password
   */
  async changePassword(newPassword: Password): Promise<void> {
    this._password = newPassword;
    this._updatedAt = new Date();

    // Reset failed attempts when password is changed
    this.resetFailedAttempts();
  }

  /**
   * Check if user requires MFA based on risk score
   */
  requiresMFA(): boolean {
    return this._mfaEnabled || this._riskScore > 50;
  }

  /**
   * Get user's security status
   */
  getSecurityStatus(): {
    isSecure: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!this.isEmailVerified()) {
      issues.push('Email not verified');
      recommendations.push('Verify your email address');
    }

    if (!this._password) {
      issues.push('No password set');
      recommendations.push('Set a strong password');
    }

    if (!this._mfaEnabled) {
      issues.push('MFA not enabled');
      recommendations.push('Enable multi-factor authentication');
    }

    if (this._riskScore > 70) {
      issues.push('High risk score');
      recommendations.push('Review recent account activity');
    }

    if (this._failedLoginAttempts > 0) {
      issues.push('Recent failed login attempts');
      recommendations.push('Monitor account for suspicious activity');
    }

    return {
      isSecure: issues.length === 0,
      issues,
      recommendations,
    };
  }

  private validateProps(props: UserProps): void {
    if (!props.id || typeof props.id !== 'string') {
      throw new Error('User ID must be a non-empty string');
    }

    if (!(props.email instanceof Email)) {
      throw new Error('Email must be an Email value object');
    }

    if (props.name !== undefined) {
      this.validateName(props.name);
    }

    if (props.image !== undefined) {
      this.validateImage(props.image);
    }

    if (props.riskScore < 0 || props.riskScore > 100) {
      throw new Error('Risk score must be between 0 and 100');
    }

    if (props.failedLoginAttempts < 0) {
      throw new Error('Failed login attempts cannot be negative');
    }
  }

  private validateName(name: string): void {
    if (typeof name !== 'string') {
      throw new Error('Name must be a string');
    }

    if (name.length === 0) {
      throw new Error('Name cannot be empty');
    }

    if (name.length > 100) {
      throw new Error('Name cannot be longer than 100 characters');
    }

    // Check for potentially malicious content
    if (/<script|javascript:|data:/i.test(name)) {
      throw new Error('Name contains invalid content');
    }
  }

  private validateImage(image: string): void {
    if (typeof image !== 'string') {
      throw new Error('Image must be a string');
    }

    if (image.length === 0) {
      throw new Error('Image URL cannot be empty');
    }

    if (image.length > 500) {
      throw new Error('Image URL cannot be longer than 500 characters');
    }

    // Basic URL validation
    try {
      new URL(image);
    } catch {
      throw new Error('Image must be a valid URL');
    }
  }

  equals(other: User): boolean {
    return this._id === other._id;
  }

  toJSON(): any {
    return {
      id: this._id,
      email: this._email.value,
      emailVerified: this._emailVerified,
      name: this._name,
      image: this._image,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      mfaEnabled: this._mfaEnabled,
      failedLoginAttempts: this._failedLoginAttempts,
      lockedUntil: this._lockedUntil,
      lastLoginAt: this._lastLoginAt,
      lastLoginIP: this._lastLoginIP,
      riskScore: this._riskScore,
    };
  }
}
