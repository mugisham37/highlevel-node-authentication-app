/**
 * Authentication Service Interface
 * Defines the contract for authentication operations
 */

import { User } from "@company/shared"entities/user';
import { Session } from "@company/shared"entities/session';
import { DeviceInfo } from "@company/shared"entities/user';
import { TokenPair } from '../../infrastructure/security/jwt-token.service';
import { RiskAssessment } from '../../infrastructure/security/types';

export interface AuthCredentials {
  type: 'email_password' | 'oauth' | 'passwordless' | 'mfa';
  email?: string;
  password?: string;
  provider?: string;
  token?: string;
  mfaCode?: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  session?: Session;
  requiresMFA?: boolean;
  mfaChallenge?: MFAChallenge;
  riskScore: number;
  riskAssessment?: RiskAssessment;
  error?: AuthError;
}

export interface MFAChallenge {
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  challengeId: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface TokenValidation {
  valid: boolean;
  user?: User;
  session?: Session;
  error?: AuthError;
  requiresRefresh?: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
}

export interface IAuthenticationService {
  /**
   * Authenticate user with provided credentials
   */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;

  /**
   * Validate JWT token and return user/session information
   */
  validateToken(token: string): Promise<TokenValidation>;

  /**
   * Refresh access token using refresh token
   */
  refreshToken(request: RefreshTokenRequest): Promise<AuthResult>;

  /**
   * Logout user and terminate session
   */
  logout(sessionId: string): Promise<void>;
}

