/**
 * Device Fingerprinting Service
 * Advanced device fingerprinting and tracking for security analysis
 */

import { createHash } from 'crypto';
import { DeviceFingerprint } from './types';

export interface DeviceFingerprintInput {
  userAgent: string;
  ipAddress: string;
  acceptLanguage?: string | undefined;
  acceptEncoding?: string | undefined;
  timezone?: string | undefined;
  screenResolution?: string | undefined;
  colorDepth?: number | undefined;
  platform?: string | undefined;
  cookiesEnabled?: boolean | undefined;
  doNotTrack?: boolean | undefined;
  plugins?: string[] | undefined;
  fonts?: string[] | undefined;
  canvas?: string | undefined;
  webgl?: string | undefined;
  audioContext?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface DeviceAnalysis {
  fingerprint: DeviceFingerprint;
  riskFactors: string[];
  trustScore: number; // 0-100, higher = more trustworthy
  isBot: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  browserFamily: string;
  browserVersion: string;
  osFamily: string;
  osVersion: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
}

export class DeviceFingerprintingService {
  private static readonly BOT_PATTERNS = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i,
    /okhttp/i,
    /axios/i,
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckbot/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
  ];

  private static readonly MOBILE_PATTERNS = [
    /mobile/i,
    /android/i,
    /iphone/i,
    /ipad/i,
    /ipod/i,
    /blackberry/i,
    /windows phone/i,
    /opera mini/i,
  ];

  private static readonly TABLET_PATTERNS = [
    /tablet/i,
    /ipad/i,
    /android(?!.*mobile)/i,
    /kindle/i,
  ];

  private static readonly SUSPICIOUS_PATTERNS = [
    /headless/i,
    /phantom/i,
    /selenium/i,
    /webdriver/i,
    /automation/i,
    /puppeteer/i,
    /playwright/i,
  ];

  /**
   * Generate device fingerprint from input data
   */
  static generateFingerprint(input: DeviceFingerprintInput): DeviceFingerprint {
    const fingerprintData = this.normalizeInput(input);
    const id = this.calculateFingerprintId(fingerprintData);
    const trustScore = this.calculateTrustScore(fingerprintData);

    return {
      id,
      userAgent: fingerprintData.userAgent,
      ipAddress: fingerprintData.ipAddress,
      acceptLanguage: fingerprintData.acceptLanguage,
      acceptEncoding: fingerprintData.acceptEncoding,
      timezone: fingerprintData.timezone,
      screenResolution: fingerprintData.screenResolution,
      colorDepth: fingerprintData.colorDepth,
      platform: fingerprintData.platform,
      cookiesEnabled: fingerprintData.cookiesEnabled,
      doNotTrack: fingerprintData.doNotTrack,
      plugins: fingerprintData.plugins,
      fonts: fingerprintData.fonts,
      canvas: fingerprintData.canvas,
      webgl: fingerprintData.webgl,
      audioContext: fingerprintData.audioContext,
      createdAt: new Date(),
      lastSeen: new Date(),
      trustScore,
    };
  }

  /**
   * Create device fingerprint from input data (alias for generateFingerprint)
   * This method is used by the authentication service
   */
  static createFingerprint(input: DeviceFingerprintInput): DeviceFingerprint {
    return this.generateFingerprint(input);
  }

  /**
   * Analyze device characteristics and risk factors
   */
  static analyzeDevice(input: DeviceFingerprintInput): DeviceAnalysis {
    const fingerprint = this.generateFingerprint(input);
    const riskFactors: string[] = [];

    // Bot detection
    const isBot = this.detectBot(input.userAgent);
    if (isBot) {
      riskFactors.push('Detected as bot or automated tool');
    }

    // Device type detection
    const deviceType = this.detectDeviceType(input.userAgent);
    const isMobile = deviceType === 'mobile';
    const isTablet = deviceType === 'tablet';
    const isDesktop = deviceType === 'desktop';

    // Browser and OS detection
    const browserInfo = this.parseBrowserInfo(input.userAgent);
    const osInfo = this.parseOSInfo(input.userAgent);

    // Suspicious patterns
    if (this.hasSuspiciousPatterns(input.userAgent)) {
      riskFactors.push('User agent contains suspicious patterns');
    }

    // Inconsistency checks
    const inconsistencies = this.detectInconsistencies(input);
    riskFactors.push(...inconsistencies);

    // Privacy indicators
    if (input.doNotTrack) {
      riskFactors.push('Do Not Track enabled (privacy-conscious user)');
    }

    // Canvas fingerprinting detection
    if (!input.canvas) {
      riskFactors.push('Canvas fingerprinting blocked or unavailable');
    }

    // WebGL detection
    if (!input.webgl) {
      riskFactors.push('WebGL unavailable or blocked');
    }

    // Calculate adjusted trust score based on analysis
    let adjustedTrustScore = fingerprint.trustScore;
    if (isBot) adjustedTrustScore -= 30;
    if (riskFactors.length > 3) adjustedTrustScore -= 20;
    adjustedTrustScore = Math.max(0, Math.min(100, adjustedTrustScore));

    return {
      fingerprint: { ...fingerprint, trustScore: adjustedTrustScore },
      riskFactors,
      trustScore: adjustedTrustScore,
      isBot,
      isMobile,
      isTablet,
      isDesktop,
      browserFamily: browserInfo.family,
      browserVersion: browserInfo.version,
      osFamily: osInfo.family,
      osVersion: osInfo.version,
      deviceType,
    };
  }

  /**
   * Compare two device fingerprints for similarity
   */
  static compareFingerprints(
    fp1: DeviceFingerprint,
    fp2: DeviceFingerprint
  ): {
    similarity: number; // 0-100
    matchingFields: string[];
    differentFields: string[];
    isSameDevice: boolean;
  } {
    const fields = [
      'userAgent',
      'acceptLanguage',
      'acceptEncoding',
      'timezone',
      'screenResolution',
      'colorDepth',
      'platform',
      'cookiesEnabled',
      'doNotTrack',
      'canvas',
      'webgl',
      'audioContext',
    ];

    const matchingFields: string[] = [];
    const differentFields: string[] = [];

    for (const field of fields) {
      const val1 = fp1[field as keyof DeviceFingerprint];
      const val2 = fp2[field as keyof DeviceFingerprint];

      if (val1 === val2) {
        matchingFields.push(field);
      } else {
        differentFields.push(field);
      }
    }

    // Special handling for arrays
    if (this.arraysEqual(fp1.plugins || [], fp2.plugins || [])) {
      matchingFields.push('plugins');
    } else {
      differentFields.push('plugins');
    }

    if (this.arraysEqual(fp1.fonts || [], fp2.fonts || [])) {
      matchingFields.push('fonts');
    } else {
      differentFields.push('fonts');
    }

    const totalFields = fields.length + 2; // +2 for plugins and fonts
    const similarity = (matchingFields.length / totalFields) * 100;
    const isSameDevice = similarity >= 80; // 80% similarity threshold

    return {
      similarity,
      matchingFields,
      differentFields,
      isSameDevice,
    };
  }

  /**
   * Track device changes over time
   */
  static trackDeviceChanges(
    previousFingerprint: DeviceFingerprint,
    currentInput: DeviceFingerprintInput
  ): {
    hasChanged: boolean;
    changes: Array<{ field: string; oldValue: any; newValue: any }>;
    riskLevel: 'low' | 'medium' | 'high';
    explanation: string;
  } {
    const currentFingerprint = this.generateFingerprint(currentInput);
    const comparison = this.compareFingerprints(
      previousFingerprint,
      currentFingerprint
    );

    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

    for (const field of comparison.differentFields) {
      changes.push({
        field,
        oldValue: previousFingerprint[field as keyof DeviceFingerprint],
        newValue: currentFingerprint[field as keyof DeviceFingerprint],
      });
    }

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let explanation = 'No significant changes detected';

    if (changes.length === 0) {
      explanation = 'Device fingerprint unchanged';
    } else if (changes.length <= 2) {
      riskLevel = 'low';
      explanation = 'Minor changes detected (normal browser updates)';
    } else if (changes.length <= 5) {
      riskLevel = 'medium';
      explanation = 'Moderate changes detected (possible system update)';
    } else {
      riskLevel = 'high';
      explanation = 'Major changes detected (possible device spoofing)';
    }

    // Check for critical changes
    const criticalFields = ['userAgent', 'platform', 'screenResolution'];
    const criticalChanges = changes.filter((c) =>
      criticalFields.includes(c.field)
    );

    if (criticalChanges.length > 1) {
      riskLevel = 'high';
      explanation = 'Critical device characteristics changed';
    }

    return {
      hasChanged: changes.length > 0,
      changes,
      riskLevel,
      explanation,
    };
  }

  /**
   * Generate device reputation score based on history
   */
  static calculateDeviceReputation(
    fingerprint: DeviceFingerprint,
    loginHistory: Array<{
      timestamp: Date;
      success: boolean;
      ipAddress: string;
      location?: string;
    }>
  ): {
    score: number; // 0-100
    level: 'poor' | 'fair' | 'good' | 'excellent';
    factors: string[];
  } {
    let score = 50; // Start with neutral score
    const factors: string[] = [];

    // Age factor (older devices are more trustworthy)
    const ageInDays =
      (Date.now() - fingerprint.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays > 30) {
      score += 20;
      factors.push('Device has long history');
    } else if (ageInDays > 7) {
      score += 10;
      factors.push('Device has moderate history');
    } else {
      score -= 10;
      factors.push('New device');
    }

    // Success rate factor
    const totalLogins = loginHistory.length;
    const successfulLogins = loginHistory.filter((l) => l.success).length;
    const successRate = totalLogins > 0 ? successfulLogins / totalLogins : 0;

    if (successRate > 0.9) {
      score += 15;
      factors.push('High login success rate');
    } else if (successRate > 0.7) {
      score += 5;
      factors.push('Good login success rate');
    } else if (successRate < 0.5) {
      score -= 20;
      factors.push('Low login success rate');
    }

    // IP consistency factor
    const uniqueIPs = new Set(loginHistory.map((l) => l.ipAddress)).size;
    if (uniqueIPs === 1) {
      score += 10;
      factors.push('Consistent IP address');
    } else if (uniqueIPs <= 3) {
      score += 5;
      factors.push('Few IP addresses used');
    } else if (uniqueIPs > 10) {
      score -= 15;
      factors.push('Many different IP addresses');
    }

    // Trust score factor
    score += (fingerprint.trustScore - 50) * 0.5;

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    let level: 'poor' | 'fair' | 'good' | 'excellent';
    if (score < 25) level = 'poor';
    else if (score < 50) level = 'fair';
    else if (score < 75) level = 'good';
    else level = 'excellent';

    return { score, level, factors };
  }

  private static normalizeInput(
    input: DeviceFingerprintInput
  ): Required<DeviceFingerprintInput> {
    return {
      userAgent: input.userAgent || '',
      ipAddress: input.ipAddress || '',
      acceptLanguage: input.acceptLanguage || '',
      acceptEncoding: input.acceptEncoding || '',
      timezone: input.timezone || '',
      screenResolution: input.screenResolution || '',
      colorDepth: input.colorDepth || 0,
      platform: input.platform || '',
      cookiesEnabled: input.cookiesEnabled || false,
      doNotTrack: input.doNotTrack || false,
      plugins: input.plugins || [],
      fonts: input.fonts || [],
      canvas: input.canvas || '',
      webgl: input.webgl || '',
      audioContext: input.audioContext || '',
      headers: input.headers || {},
    };
  }

  private static calculateFingerprintId(
    input: Required<DeviceFingerprintInput>
  ): string {
    // Create a stable hash from key fingerprinting components
    const components = [
      input.userAgent,
      input.acceptLanguage,
      input.timezone,
      input.screenResolution,
      input.colorDepth?.toString(),
      input.platform,
      input.plugins?.sort().join(','),
      input.fonts?.sort().join(','),
      input.canvas,
      input.webgl,
      input.audioContext,
    ].filter(Boolean);

    const hash = createHash('sha256')
      .update(components.join('|'))
      .digest('hex');

    return `fp_${hash.substring(0, 32)}`;
  }

  private static calculateTrustScore(
    input: Required<DeviceFingerprintInput>
  ): number {
    let score = 50; // Start with neutral score

    // User agent completeness
    if (input.userAgent.length > 50) score += 10;
    if (input.userAgent.includes('Mozilla')) score += 5;

    // Browser features availability
    if (input.canvas) score += 10;
    if (input.webgl) score += 10;
    if (input.audioContext) score += 5;

    // Plugin availability (but not too many)
    const pluginCount = input.plugins?.length || 0;
    if (pluginCount > 0 && pluginCount < 20) score += 10;
    else if (pluginCount >= 20) score -= 5; // Too many plugins is suspicious

    // Font availability
    const fontCount = input.fonts?.length || 0;
    if (fontCount > 10 && fontCount < 100) score += 10;

    // Screen resolution reasonableness
    if (input.screenResolution) {
      const parts = input.screenResolution.split('x').map(Number);
      const width = parts[0];
      const height = parts[1];
      if (width && height && width >= 800 && height >= 600 && width <= 4000 && height <= 3000) {
        score += 10;
      }
    }

    // Color depth
    if (input.colorDepth === 24 || input.colorDepth === 32) score += 5;

    // Timezone consistency
    if (input.timezone) score += 5;

    // Language header
    if (input.acceptLanguage) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private static detectBot(userAgent: string): boolean {
    return this.BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
  }

  private static detectDeviceType(
    userAgent: string
  ): 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' {
    if (this.detectBot(userAgent)) return 'bot';
    if (this.TABLET_PATTERNS.some((pattern) => pattern.test(userAgent)))
      return 'tablet';
    if (this.MOBILE_PATTERNS.some((pattern) => pattern.test(userAgent)))
      return 'mobile';
    if (
      userAgent.includes('Windows') ||
      userAgent.includes('Mac') ||
      userAgent.includes('Linux')
    ) {
      return 'desktop';
    }
    return 'unknown';
  }

  private static hasSuspiciousPatterns(userAgent: string): boolean {
    return this.SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(userAgent));
  }

  private static detectInconsistencies(
    input: DeviceFingerprintInput
  ): string[] {
    const inconsistencies: string[] = [];

    // Check platform vs user agent consistency
    if (input.platform && input.userAgent) {
      const platformLower = input.platform.toLowerCase();
      const userAgentLower = input.userAgent.toLowerCase();

      if (
        platformLower.includes('win') &&
        !userAgentLower.includes('windows')
      ) {
        inconsistencies.push('Platform and User-Agent mismatch (Windows)');
      }
      if (platformLower.includes('mac') && !userAgentLower.includes('mac')) {
        inconsistencies.push('Platform and User-Agent mismatch (Mac)');
      }
      if (
        platformLower.includes('linux') &&
        !userAgentLower.includes('linux')
      ) {
        inconsistencies.push('Platform and User-Agent mismatch (Linux)');
      }
    }

    // Check screen resolution reasonableness
    if (input.screenResolution) {
      const parts = input.screenResolution.split('x').map(Number);
      const width = parts[0];
      const height = parts[1];
      if (width && height) {
        if (width < 320 || height < 240) {
          inconsistencies.push('Unusually small screen resolution');
        }
        if (width > 8000 || height > 6000) {
          inconsistencies.push('Unusually large screen resolution');
        }
      }
    }

    // Check color depth
    if (input.colorDepth && ![8, 16, 24, 32].includes(input.colorDepth)) {
      inconsistencies.push('Unusual color depth');
    }

    return inconsistencies;
  }

  private static parseBrowserInfo(userAgent: string): {
    family: string;
    version: string;
  } {
    // Simple browser detection (in production, use a proper library like ua-parser-js)
    if (userAgent.includes('Chrome')) {
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      return { family: 'Chrome', version: match?.[1] || 'unknown' };
    }
    if (userAgent.includes('Firefox')) {
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      return { family: 'Firefox', version: match?.[1] || 'unknown' };
    }
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      return { family: 'Safari', version: match?.[1] || 'unknown' };
    }
    if (userAgent.includes('Edge')) {
      const match = userAgent.match(/Edge\/(\d+\.\d+)/);
      return { family: 'Edge', version: match?.[1] || 'unknown' };
    }
    return { family: 'unknown', version: 'unknown' };
  }

  private static parseOSInfo(userAgent: string): {
    family: string;
    version: string;
  } {
    if (userAgent.includes('Windows NT')) {
      const match = userAgent.match(/Windows NT (\d+\.\d+)/);
      return { family: 'Windows', version: match?.[1] || 'unknown' };
    }
    if (userAgent.includes('Mac OS X')) {
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      return {
        family: 'macOS',
        version: match?.[1]?.replace('_', '.') || 'unknown',
      };
    }
    if (userAgent.includes('Linux')) {
      return { family: 'Linux', version: 'unknown' };
    }
    if (userAgent.includes('Android')) {
      const match = userAgent.match(/Android (\d+\.\d+)/);
      return { family: 'Android', version: match?.[1] || 'unknown' };
    }
    if (userAgent.includes('iOS')) {
      const match = userAgent.match(/OS (\d+_\d+)/);
      return {
        family: 'iOS',
        version: match?.[1]?.replace('_', '.') || 'unknown',
      };
    }
    return { family: 'unknown', version: 'unknown' };
  }

  private static arraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    return sorted1.every((val, index) => val === sorted2[index]);
  }
}
