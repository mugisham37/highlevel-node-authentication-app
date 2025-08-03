/**
 * Device Management Service
 * Handles device registration, management, and trust scoring for passwordless authentication
 */

import { Logger } from 'winston';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import { SecureTokenGenerator } from '../../infrastructure/security/secure-token-generator.service';
import {
  WebAuthnService,
  WebAuthnCredential,
} from '../../infrastructure/security/webauthn.service';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { DeviceInfo } from '../../domain/entities/user';

export interface DeviceRegistration {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  browser: string;
  trusted: boolean;
  registeredAt: Date;
  lastUsedAt?: Date;
  ipAddress?: string;
  location?: string;
  webAuthnCredentials: string[];
  riskScore: number;
  metadata?: Record<string, any>;
}

export interface DeviceRegistrationRequest {
  userId: string;
  deviceInfo: DeviceInfo;
  deviceName?: string;
  ipAddress?: string;
  location?: string;
  webAuthnCredentialId?: string;
}

export interface DeviceTrustAssessment {
  deviceId: string;
  trustScore: number;
  riskFactors: string[];
  recommendations: string[];
  trusted: boolean;
}

export interface DeviceAuthenticationAttempt {
  deviceId: string;
  userId: string;
  success: boolean;
  timestamp: Date;
  ipAddress?: string;
  location?: string;
  riskScore: number;
  failureReason?: string;
}

export class DeviceManagementService {
  private devices: Map<string, DeviceRegistration> = new Map();
  private authAttempts: Map<string, DeviceAuthenticationAttempt[]> = new Map();

  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly webAuthnService: WebAuthnService,
    private readonly logger: Logger
  ) {}

  /**
   * Register a new device for passwordless authentication
   */
  async registerDevice(request: DeviceRegistrationRequest): Promise<{
    success: boolean;
    deviceId?: string;
    trustScore?: number;
    error?: string;
  }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Device registration started', {
        correlationId,
        userId: request.userId,
        deviceFingerprint: request.deviceInfo.fingerprint,
        platform: request.deviceInfo.platform,
        browser: request.deviceInfo.browser,
      });

      // Check if device already exists
      const existingDevice = await this.getDeviceByFingerprint(
        request.userId,
        request.deviceInfo.fingerprint
      );

      if (existingDevice) {
        // Update existing device
        existingDevice.lastUsedAt = new Date();
        existingDevice.ipAddress = request.ipAddress;
        existingDevice.location = request.location;

        if (request.webAuthnCredentialId) {
          if (
            !existingDevice.webAuthnCredentials.includes(
              request.webAuthnCredentialId
            )
          ) {
            existingDevice.webAuthnCredentials.push(
              request.webAuthnCredentialId
            );
          }
        }

        this.devices.set(existingDevice.id, existingDevice);

        this.logger.info('Existing device updated', {
          correlationId,
          deviceId: existingDevice.id,
          userId: request.userId,
        });

        return {
          success: true,
          deviceId: existingDevice.id,
          trustScore: existingDevice.riskScore,
        };
      }

      // Create new device registration
      const deviceId = SecureIdGenerator.generateSecureId();
      const deviceName =
        request.deviceName || this.generateDeviceName(request.deviceInfo);
      const trustScore = await this.calculateInitialTrustScore(request);

      const device: DeviceRegistration = {
        id: deviceId,
        userId: request.userId,
        deviceFingerprint: request.deviceInfo.fingerprint,
        deviceName,
        deviceType: this.categorizeDevice(request.deviceInfo),
        platform: request.deviceInfo.platform,
        browser: request.deviceInfo.browser,
        trusted: trustScore > 70,
        registeredAt: new Date(),
        lastUsedAt: new Date(),
        ipAddress: request.ipAddress,
        location: request.location,
        webAuthnCredentials: request.webAuthnCredentialId
          ? [request.webAuthnCredentialId]
          : [],
        riskScore: trustScore,
        metadata: {
          userAgent: request.deviceInfo.userAgent,
          screenResolution: request.deviceInfo.screenResolution,
          timezone: request.deviceInfo.timezone,
          isMobile: request.deviceInfo.isMobile,
        },
      };

      this.devices.set(deviceId, device);

      this.logger.info('Device registered successfully', {
        correlationId,
        deviceId,
        userId: request.userId,
        deviceName,
        trustScore,
        trusted: device.trusted,
      });

      return {
        success: true,
        deviceId,
        trustScore,
      };
    } catch (error) {
      this.logger.error('Device registration error', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: 'Failed to register device',
      };
    }
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string): Promise<DeviceRegistration[]> {
    try {
      const userDevices: DeviceRegistration[] = [];

      for (const device of this.devices.values()) {
        if (device.userId === userId) {
          userDevices.push(device);
        }
      }

      // Also get WebAuthn credentials and merge
      const webAuthnCredentials =
        await this.webAuthnService.getUserCredentials(userId);

      // Create device entries for WebAuthn credentials not already tracked
      for (const credential of webAuthnCredentials) {
        const existingDevice = userDevices.find((d) =>
          d.webAuthnCredentials.includes(credential.credentialId)
        );

        if (!existingDevice) {
          const deviceId = SecureIdGenerator.generateSecureId();
          const device: DeviceRegistration = {
            id: deviceId,
            userId,
            deviceFingerprint: credential.credentialId,
            deviceName: credential.name,
            deviceType: credential.deviceType || 'unknown',
            platform: 'unknown',
            browser: 'unknown',
            trusted: true, // WebAuthn credentials are considered trusted
            registeredAt: credential.createdAt,
            lastUsedAt: credential.lastUsed,
            webAuthnCredentials: [credential.credentialId],
            riskScore: 20, // Low risk for WebAuthn
          };

          userDevices.push(device);
        }
      }

      // Sort by last used (most recent first)
      userDevices.sort((a, b) => {
        const aTime = a.lastUsedAt?.getTime() || 0;
        const bTime = b.lastUsedAt?.getTime() || 0;
        return bTime - aTime;
      });

      return userDevices;
    } catch (error) {
      this.logger.error('Failed to get user devices', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get device by ID
   */
  async getDeviceById(deviceId: string): Promise<DeviceRegistration | null> {
    try {
      return this.devices.get(deviceId) || null;
    } catch (error) {
      this.logger.error('Failed to get device by ID', {
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get device by fingerprint
   */
  async getDeviceByFingerprint(
    userId: string,
    fingerprint: string
  ): Promise<DeviceRegistration | null> {
    try {
      for (const device of this.devices.values()) {
        if (
          device.userId === userId &&
          device.deviceFingerprint === fingerprint
        ) {
          return device;
        }
      }
      return null;
    } catch (error) {
      this.logger.error('Failed to get device by fingerprint', {
        userId,
        fingerprint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Update device trust status
   */
  async updateDeviceTrust(
    deviceId: string,
    trusted: boolean,
    reason?: string
  ): Promise<boolean> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        return false;
      }

      device.trusted = trusted;
      device.riskScore = trusted
        ? Math.max(0, device.riskScore - 30)
        : Math.min(100, device.riskScore + 50);

      if (reason) {
        device.metadata = device.metadata || {};
        device.metadata.trustUpdateReason = reason;
        device.metadata.trustUpdatedAt = new Date();
      }

      this.devices.set(deviceId, device);

      this.logger.info('Device trust updated', {
        deviceId,
        userId: device.userId,
        trusted,
        newRiskScore: device.riskScore,
        reason,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to update device trust', {
        deviceId,
        trusted,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Remove a device
   */
  async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    try {
      const device = this.devices.get(deviceId);
      if (!device || device.userId !== userId) {
        return false;
      }

      // Remove associated WebAuthn credentials
      for (const credentialId of device.webAuthnCredentials) {
        await this.webAuthnService.removeCredential(userId, credentialId);
      }

      // Remove device
      this.devices.delete(deviceId);

      // Clean up authentication attempts
      this.authAttempts.delete(deviceId);

      this.logger.info('Device removed successfully', {
        deviceId,
        userId,
        deviceName: device.deviceName,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to remove device', {
        deviceId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Assess device trust based on various factors
   */
  async assessDeviceTrust(deviceId: string): Promise<DeviceTrustAssessment> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        return {
          deviceId,
          trustScore: 0,
          riskFactors: ['Device not found'],
          recommendations: ['Re-register device'],
          trusted: false,
        };
      }

      const riskFactors: string[] = [];
      const recommendations: string[] = [];
      let trustScore = 100;

      // Age factor
      const deviceAge = Date.now() - device.registeredAt.getTime();
      const daysSinceRegistration = deviceAge / (1000 * 60 * 60 * 24);

      if (daysSinceRegistration < 1) {
        trustScore -= 20;
        riskFactors.push('Recently registered device');
        recommendations.push('Monitor device activity closely');
      } else if (daysSinceRegistration > 365) {
        trustScore += 10; // Bonus for long-term devices
      }

      // Usage frequency
      const attempts = this.authAttempts.get(deviceId) || [];
      const recentAttempts = attempts.filter(
        (a) => Date.now() - a.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000 // Last 7 days
      );

      if (recentAttempts.length === 0 && daysSinceRegistration > 30) {
        trustScore -= 15;
        riskFactors.push('Inactive device');
        recommendations.push('Verify device ownership');
      }

      // Failed authentication attempts
      const failedAttempts = recentAttempts.filter((a) => !a.success);
      if (failedAttempts.length > 3) {
        trustScore -= 30;
        riskFactors.push('Multiple failed authentication attempts');
        recommendations.push('Review authentication logs');
      }

      // WebAuthn credential presence
      if (device.webAuthnCredentials.length === 0) {
        trustScore -= 25;
        riskFactors.push('No WebAuthn credentials');
        recommendations.push(
          'Register WebAuthn credential for enhanced security'
        );
      } else {
        trustScore += 15; // Bonus for WebAuthn
      }

      // Location consistency
      const uniqueLocations = new Set(
        recentAttempts.map((a) => a.location).filter(Boolean)
      );
      if (uniqueLocations.size > 3) {
        trustScore -= 20;
        riskFactors.push('Multiple locations detected');
        recommendations.push('Verify all login locations');
      }

      // IP address consistency
      const uniqueIPs = new Set(
        recentAttempts.map((a) => a.ipAddress).filter(Boolean)
      );
      if (uniqueIPs.size > 5) {
        trustScore -= 15;
        riskFactors.push('Multiple IP addresses');
        recommendations.push('Review network access patterns');
      }

      // Device type risk
      if (device.deviceType === 'mobile') {
        trustScore -= 5; // Mobile devices are slightly riskier
      }

      // Platform risk
      if (device.platform.toLowerCase().includes('unknown')) {
        trustScore -= 10;
        riskFactors.push('Unknown platform');
      }

      // Ensure score is within bounds
      trustScore = Math.max(0, Math.min(100, trustScore));

      // Update device risk score
      device.riskScore = 100 - trustScore;
      device.trusted = trustScore > 70;
      this.devices.set(deviceId, device);

      return {
        deviceId,
        trustScore,
        riskFactors,
        recommendations,
        trusted: trustScore > 70,
      };
    } catch (error) {
      this.logger.error('Failed to assess device trust', {
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        deviceId,
        trustScore: 0,
        riskFactors: ['Assessment failed'],
        recommendations: ['Contact support'],
        trusted: false,
      };
    }
  }

  /**
   * Record authentication attempt
   */
  async recordAuthenticationAttempt(
    attempt: DeviceAuthenticationAttempt
  ): Promise<void> {
    try {
      const attempts = this.authAttempts.get(attempt.deviceId) || [];
      attempts.push(attempt);

      // Keep only last 100 attempts per device
      if (attempts.length > 100) {
        attempts.splice(0, attempts.length - 100);
      }

      this.authAttempts.set(attempt.deviceId, attempts);

      // Update device last used time if successful
      if (attempt.success) {
        const device = this.devices.get(attempt.deviceId);
        if (device) {
          device.lastUsedAt = attempt.timestamp;
          device.ipAddress = attempt.ipAddress;
          device.location = attempt.location;
          this.devices.set(attempt.deviceId, device);
        }
      }

      this.logger.debug('Authentication attempt recorded', {
        deviceId: attempt.deviceId,
        userId: attempt.userId,
        success: attempt.success,
        riskScore: attempt.riskScore,
      });
    } catch (error) {
      this.logger.error('Failed to record authentication attempt', {
        deviceId: attempt.deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get device authentication history
   */
  async getDeviceAuthHistory(
    deviceId: string,
    limit: number = 50
  ): Promise<DeviceAuthenticationAttempt[]> {
    try {
      const attempts = this.authAttempts.get(deviceId) || [];
      return attempts
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get device auth history', {
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Generate device binding token for secure device identification
   */
  async generateDeviceBindingToken(deviceId: string): Promise<string | null> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        return null;
      }

      const secret = process.env.DEVICE_BINDING_SECRET || 'default-secret';
      return SecureTokenGenerator.generateDeviceBindingToken(deviceId, secret);
    } catch (error) {
      this.logger.error('Failed to generate device binding token', {
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Verify device binding token
   */
  async verifyDeviceBindingToken(
    token: string,
    expectedDeviceId: string
  ): Promise<boolean> {
    try {
      const secret = process.env.DEVICE_BINDING_SECRET || 'default-secret';
      return SecureTokenGenerator.verifyDeviceBindingToken(
        token,
        expectedDeviceId,
        secret
      );
    } catch (error) {
      this.logger.error('Failed to verify device binding token', {
        expectedDeviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Calculate initial trust score for new device
   */
  private async calculateInitialTrustScore(
    request: DeviceRegistrationRequest
  ): Promise<number> {
    let score = 50; // Base score

    // Platform bonus/penalty
    const platform = request.deviceInfo.platform.toLowerCase();
    if (
      platform.includes('windows') ||
      platform.includes('macos') ||
      platform.includes('linux')
    ) {
      score += 10; // Desktop platforms are generally more trusted
    } else if (platform.includes('ios')) {
      score += 5; // iOS is relatively secure
    } else if (platform.includes('android')) {
      score += 0; // Neutral
    } else {
      score -= 10; // Unknown platforms are riskier
    }

    // Browser bonus/penalty
    const browser = request.deviceInfo.browser.toLowerCase();
    if (
      browser.includes('chrome') ||
      browser.includes('firefox') ||
      browser.includes('safari')
    ) {
      score += 5; // Major browsers
    } else {
      score -= 5; // Unknown browsers
    }

    // WebAuthn credential bonus
    if (request.webAuthnCredentialId) {
      score += 20; // Significant bonus for WebAuthn
    }

    // Mobile penalty
    if (request.deviceInfo.isMobile) {
      score -= 5; // Mobile devices are slightly riskier
    }

    // Screen resolution check (basic bot detection)
    if (
      !request.deviceInfo.screenResolution ||
      request.deviceInfo.screenResolution === '0x0'
    ) {
      score -= 15; // Suspicious
    }

    // Timezone check
    if (!request.deviceInfo.timezone) {
      score -= 5; // Missing timezone is slightly suspicious
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate a human-readable device name
   */
  private generateDeviceName(deviceInfo: DeviceInfo): string {
    const platform = this.capitalizePlatform(deviceInfo.platform);
    const browser = this.capitalizeBrowser(deviceInfo.browser);
    const deviceType = deviceInfo.isMobile ? 'Mobile' : 'Desktop';

    return `${platform} ${deviceType} (${browser})`;
  }

  /**
   * Categorize device type
   */
  private categorizeDevice(deviceInfo: DeviceInfo): string {
    if (deviceInfo.isMobile) {
      if (deviceInfo.platform.toLowerCase().includes('ios')) {
        return 'iPhone/iPad';
      } else if (deviceInfo.platform.toLowerCase().includes('android')) {
        return 'Android';
      } else {
        return 'Mobile';
      }
    } else {
      if (deviceInfo.platform.toLowerCase().includes('windows')) {
        return 'Windows PC';
      } else if (deviceInfo.platform.toLowerCase().includes('mac')) {
        return 'Mac';
      } else if (deviceInfo.platform.toLowerCase().includes('linux')) {
        return 'Linux';
      } else {
        return 'Desktop';
      }
    }
  }

  /**
   * Capitalize platform name
   */
  private capitalizePlatform(platform: string): string {
    const platformMap: Record<string, string> = {
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
      ios: 'iOS',
      android: 'Android',
    };

    const lowerPlatform = platform.toLowerCase();
    for (const [key, value] of Object.entries(platformMap)) {
      if (lowerPlatform.includes(key)) {
        return value;
      }
    }

    return platform;
  }

  /**
   * Capitalize browser name
   */
  private capitalizeBrowser(browser: string): string {
    const browserMap: Record<string, string> = {
      chrome: 'Chrome',
      firefox: 'Firefox',
      safari: 'Safari',
      edge: 'Edge',
      opera: 'Opera',
    };

    const lowerBrowser = browser.toLowerCase();
    for (const [key, value] of Object.entries(browserMap)) {
      if (lowerBrowser.includes(key)) {
        return value;
      }
    }

    return browser;
  }
}
