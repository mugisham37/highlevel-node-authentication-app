/**
 * Risk Scoring Service
 * Advanced risk assessment for authentication and authorization decisions
 */

import {
  RiskAssessment,
  RiskFactor,
  SecurityContext,
  GeoLocation,
} from './types';
import { DeviceFingerprintingService } from './device-fingerprinting.service';
import { logger } from '../logging/winston-logger';

export interface RiskScoringOptions {
  enableGeoLocationChecks?: boolean;
  enableBehavioralAnalysis?: boolean;
  enableDeviceTracking?: boolean;
  enableVPNDetection?: boolean;
  baselineRiskScore?: number;
  riskThresholds?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export class RiskScoringService {
  private static readonly DEFAULT_OPTIONS: Required<RiskScoringOptions> = {
    enableGeoLocationChecks: true,
    enableBehavioralAnalysis: true,
    enableDeviceTracking: true,
    enableVPNDetection: true,
    baselineRiskScore: 10,
    riskThresholds: {
      low: 25,
      medium: 50,
      high: 75,
      critical: 90,
    },
  };

  private readonly options: Required<RiskScoringOptions>;

  constructor(options: RiskScoringOptions = {}) {
    this.options = { ...RiskScoringService.DEFAULT_OPTIONS, ...options };
  }

  private static readonly SUSPICIOUS_USER_AGENTS = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /webdriver/i,
    /automation/i,
    /puppeteer/i,
    /playwright/i,
  ];

  private static readonly VPN_INDICATORS = [
    'vpn',
    'proxy',
    'tor',
    'tunnel',
    'anonymous',
    'privacy',
    'hide',
    'mask',
  ];

  /**
   * Assess risk for a given security context
   */
  async assessRisk(
    context: SecurityContext,
    optionOverrides: RiskScoringOptions = {}
  ): Promise<RiskAssessment> {
    const opts = { ...this.options, ...optionOverrides };
    const factors: RiskFactor[] = [];
    let totalScore = opts.baselineRiskScore;

    try {
      // Device-based risk factors
      if (opts.enableDeviceTracking) {
        const deviceFactors = await RiskScoringService.analyzeDeviceRisk(context);
        factors.push(...deviceFactors);
        totalScore += deviceFactors.reduce(
          (sum, factor) => sum + factor.score,
          0
        );
      }

      // Behavioral risk factors
      if (opts.enableBehavioralAnalysis && context.previousLogins) {
        const behavioralFactors = RiskScoringService.analyzeBehavioralRisk(context);
        factors.push(...behavioralFactors);
        totalScore += behavioralFactors.reduce(
          (sum, factor) => sum + factor.score,
          0
        );
      }

      // Geographic risk factors
      if (opts.enableGeoLocationChecks && context.geoLocation) {
        const geoFactors = RiskScoringService.analyzeGeographicRisk(context);
        factors.push(...geoFactors);
        totalScore += geoFactors.reduce((sum: number, factor: RiskFactor) => sum + factor.score, 0);
      }

      // Network-based risk factors
      if (opts.enableVPNDetection) {
        const networkFactors = RiskScoringService.analyzeNetworkRisk(context);
        factors.push(...networkFactors);
        totalScore += networkFactors.reduce(
          (sum: number, factor: RiskFactor) => sum + factor.score,
          0
        );
      }

      // Temporal risk factors
      const temporalFactors = RiskScoringService.analyzeTemporalRisk(context);
      factors.push(...temporalFactors);
      totalScore += temporalFactors.reduce(
        (sum: number, factor: RiskFactor) => sum + factor.score,
        0
      );

      // Account-based risk factors
      const accountFactors = RiskScoringService.analyzeAccountRisk(context);
      factors.push(...accountFactors);
      totalScore += accountFactors.reduce(
        (sum: number, factor: RiskFactor) => sum + factor.score,
        0
      );

      // Normalize score to 0-100 range
      totalScore = Math.max(0, Math.min(100, totalScore));

      // Determine risk level
      const level = RiskScoringService.determineRiskLevel(totalScore, opts.riskThresholds);

      // Generate recommendations
      const recommendations = RiskScoringService.generateRecommendations(factors, level);

      // Determine if MFA is required
      const requiresMFA =
        totalScore >= opts.riskThresholds.medium ||
        factors.some((f) => f.severity === 'critical');

      // Determine if access should be allowed
      const allowAccess = totalScore < opts.riskThresholds.critical;

      const assessment: RiskAssessment = {
        overallScore: totalScore,
        level,
        factors,
        recommendations,
        requiresMFA,
        allowAccess,
        timestamp: new Date(),
      };

      // Log high-risk assessments
      if (level === 'high' || level === 'critical') {
        logger.warn('High-risk authentication attempt detected', {
          userId: context.userId,
          sessionId: context.sessionId,
          riskScore: totalScore,
          riskLevel: level,
          ipAddress: context.ipAddress,
          factors: factors.map((f) => f.type),
        });
      }

      return assessment;
    } catch (error) {
      logger.error('Error during risk assessment', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return safe default assessment on error
      return {
        overallScore: opts.riskThresholds.high, // Conservative approach
        level: 'high',
        factors: [
          {
            type: 'network',
            severity: 'high',
            score: opts.riskThresholds.high,
            description: 'Risk assessment failed - defaulting to high risk',
          },
        ],
        recommendations: ['Complete additional verification'],
        requiresMFA: true,
        allowAccess: true, // Don't block access due to system errors
        timestamp: new Date(),
      };
    }
  }

  /**
   * Analyze device-based risk factors
   */
  private static async analyzeDeviceRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    // Analyze device fingerprint
    const deviceAnalysis = DeviceFingerprintingService.analyzeDevice({
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    // Bot detection
    if (deviceAnalysis.isBot) {
      factors.push({
        type: 'device',
        severity: 'critical',
        score: 40,
        description: 'Automated bot or script detected',
        metadata: { deviceType: deviceAnalysis.deviceType },
      });
    }

    // Suspicious user agent patterns
    if (
      this.SUSPICIOUS_USER_AGENTS.some((pattern) =>
        pattern.test(context.userAgent)
      )
    ) {
      factors.push({
        type: 'device',
        severity: 'high',
        score: 25,
        description: 'Suspicious user agent detected',
        metadata: { userAgent: context.userAgent },
      });
    }

    // Device trust score
    if (deviceAnalysis.trustScore < 30) {
      factors.push({
        type: 'device',
        severity: 'high',
        score: 20,
        description: 'Low device trust score',
        metadata: { trustScore: deviceAnalysis.trustScore },
      });
    } else if (deviceAnalysis.trustScore < 50) {
      factors.push({
        type: 'device',
        severity: 'medium',
        score: 10,
        description: 'Moderate device trust score',
        metadata: { trustScore: deviceAnalysis.trustScore },
      });
    }

    // Risk factors from device analysis
    if (deviceAnalysis.riskFactors.length > 3) {
      factors.push({
        type: 'device',
        severity: 'medium',
        score: 15,
        description: 'Multiple device risk factors detected',
        metadata: { riskFactors: deviceAnalysis.riskFactors },
      });
    }

    return factors;
  }

  /**
   * Analyze behavioral risk factors
   */
  private static analyzeBehavioralRisk(context: SecurityContext): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const { previousLogins } = context;

    if (!previousLogins || previousLogins.length === 0) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 15,
        description: 'No previous login history available',
      });
      return factors;
    }

    // Analyze login patterns
    const recentLogins = previousLogins
      .filter(
        (login) =>
          Date.now() - login.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
      ) // Last 7 days
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Failed login attempts
    const recentFailures = recentLogins.filter((login) => !login.success);
    if (recentFailures.length > 3) {
      factors.push({
        type: 'behavior',
        severity: 'high',
        score: 25,
        description: 'Multiple recent failed login attempts',
        metadata: { failedAttempts: recentFailures.length },
      });
    } else if (recentFailures.length > 0) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 10,
        description: 'Recent failed login attempts detected',
        metadata: { failedAttempts: recentFailures.length },
      });
    }

    // Unusual login frequency
    if (recentLogins.length > 50) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 15,
        description: 'Unusually high login frequency',
        metadata: { loginCount: recentLogins.length },
      });
    }

    // Time-based patterns
    const loginHours = recentLogins.map((login) => login.timestamp.getHours());
    const currentHour = new Date().getHours();
    const isUnusualTime =
      !loginHours.includes(currentHour) && loginHours.length > 5;

    if (isUnusualTime) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 10,
        description: 'Login at unusual time',
        metadata: { currentHour, typicalHours: [...new Set(loginHours)] },
      });
    }

    // IP address changes
    const uniqueIPs = new Set(recentLogins.map((login) => login.ipAddress));
    if (uniqueIPs.size > 5) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 15,
        description: 'Multiple IP addresses used recently',
        metadata: { uniqueIPCount: uniqueIPs.size },
      });
    }

    // Device changes
    const uniqueDevices = new Set(
      recentLogins.map((login) => login.deviceFingerprint)
    );
    if (uniqueDevices.size > 3) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 12,
        description: 'Multiple devices used recently',
        metadata: { uniqueDeviceCount: uniqueDevices.size },
      });
    }

    return factors;
  }

  /**
   * Analyze geographic risk factors
   */
  private static analyzeGeographicRisk(context: SecurityContext): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const { geoLocation, previousLogins } = context;

    if (!geoLocation) {
      factors.push({
        type: 'location',
        severity: 'low',
        score: 5,
        description: 'Geographic location unavailable',
      });
      return factors;
    }

    // Check for high-risk countries (simplified list)
    const highRiskCountries = ['CN', 'RU', 'KP', 'IR'];
    if (highRiskCountries.includes(geoLocation.country)) {
      factors.push({
        type: 'location',
        severity: 'high',
        score: 20,
        description: 'Login from high-risk country',
        metadata: { country: geoLocation.country },
      });
    }

    // Compare with previous locations
    if (previousLogins && previousLogins.length > 0) {
      const recentLocations = previousLogins
        .filter(
          (login) =>
            login.location &&
            Date.now() - login.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000
        ) // Last 30 days
        .map((login) => login.location!)
        .filter(Boolean);

      if (recentLocations.length > 0) {
        const isNewCountry = !recentLocations.some(
          (loc) => loc.country === geoLocation.country
        );
        const isNewRegion = !recentLocations.some(
          (loc) =>
            loc.country === geoLocation.country &&
            loc.region === geoLocation.region
        );

        if (isNewCountry) {
          factors.push({
            type: 'location',
            severity: 'high',
            score: 25,
            description: 'Login from new country',
            metadata: {
              newCountry: geoLocation.country,
              previousCountries: [
                ...new Set(recentLocations.map((loc) => loc.country)),
              ],
            },
          });
        } else if (isNewRegion) {
          factors.push({
            type: 'location',
            severity: 'medium',
            score: 15,
            description: 'Login from new region',
            metadata: {
              newRegion: geoLocation.region,
              country: geoLocation.country,
            },
          });
        }

        // Calculate distance from typical locations (simplified)
        const typicalLocation = this.calculateCentroid(recentLocations);
        const distance = this.calculateDistance(geoLocation, typicalLocation);

        if (distance > 1000) {
          // More than 1000km from typical location
          factors.push({
            type: 'location',
            severity: 'medium',
            score: 12,
            description: 'Login from distant location',
            metadata: { distance: Math.round(distance) },
          });
        }
      }
    }

    return factors;
  }

  /**
   * Analyze network-based risk factors
   */
  private static analyzeNetworkRisk(context: SecurityContext): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const { userAgent, geoLocation } = context;

    // VPN/Proxy detection (simplified)
    const lowerUserAgent = userAgent.toLowerCase();
    const hasVPNIndicators = this.VPN_INDICATORS.some((indicator) =>
      lowerUserAgent.includes(indicator)
    );

    if (hasVPNIndicators) {
      factors.push({
        type: 'network',
        severity: 'medium',
        score: 15,
        description: 'Potential VPN or proxy usage detected',
        metadata: {
          indicators: this.VPN_INDICATORS.filter((i) =>
            lowerUserAgent.includes(i)
          ),
        },
      });
    }

    // Check for Tor exit nodes (simplified check)
    if (context.isTor) {
      factors.push({
        type: 'network',
        severity: 'high',
        score: 30,
        description: 'Tor network usage detected',
      });
    }

    // Check for known proxy/VPN
    if (context.isProxy || context.isVPN) {
      factors.push({
        type: 'network',
        severity: 'medium',
        score: 18,
        description: 'Proxy or VPN usage detected',
        metadata: { isProxy: context.isProxy, isVPN: context.isVPN },
      });
    }

    // ISP analysis (if available)
    if (geoLocation?.isp) {
      const suspiciousISPs = ['hosting', 'datacenter', 'cloud', 'server'];
      const isSuspiciousISP = suspiciousISPs.some((term) =>
        geoLocation.isp!.toLowerCase().includes(term)
      );

      if (isSuspiciousISP) {
        factors.push({
          type: 'network',
          severity: 'medium',
          score: 12,
          description: 'Login from hosting/datacenter IP',
          metadata: { isp: geoLocation.isp },
        });
      }
    }

    return factors;
  }

  /**
   * Analyze temporal risk factors
   */
  private static analyzeTemporalRisk(context: SecurityContext): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const now = new Date();
    const hour = now.getHours();

    // Unusual hours (late night/early morning)
    if (hour >= 2 && hour <= 5) {
      factors.push({
        type: 'temporal',
        severity: 'low',
        score: 8,
        description: 'Login during unusual hours',
        metadata: { hour },
      });
    }

    // Weekend activity (might be unusual for business accounts)
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend) {
      factors.push({
        type: 'temporal',
        severity: 'low',
        score: 5,
        description: 'Weekend login activity',
        metadata: { dayOfWeek: now.getDay() },
      });
    }

    // Rapid successive attempts
    if (context.previousLogins && context.previousLogins.length > 0) {
      const lastLogin = context.previousLogins[0];
      if (lastLogin?.timestamp) {
        const timeSinceLastLogin = now.getTime() - lastLogin.timestamp.getTime();

        if (timeSinceLastLogin < 60000) {
          // Less than 1 minute
          factors.push({
            type: 'temporal',
            severity: 'medium',
            score: 15,
            description: 'Rapid successive login attempts',
            metadata: {
              timeSinceLastLogin: Math.round(timeSinceLastLogin / 1000),
            },
          });
        }
      }
    }

    return factors;
  }

  /**
   * Analyze account-based risk factors
   */
  private static analyzeAccountRisk(context: SecurityContext): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // New account risk
    if (context.accountAge !== undefined) {
      if (context.accountAge < 1) {
        // Less than 1 day old
        factors.push({
          type: 'behavior',
          severity: 'high',
          score: 20,
          description: 'Very new account',
          metadata: { accountAge: context.accountAge },
        });
      } else if (context.accountAge < 7) {
        // Less than 1 week old
        factors.push({
          type: 'behavior',
          severity: 'medium',
          score: 12,
          description: 'New account',
          metadata: { accountAge: context.accountAge },
        });
      }
    }

    // Failed attempts
    if (context.failedAttempts !== undefined && context.failedAttempts > 0) {
      const score = Math.min(30, context.failedAttempts * 5);
      const severity =
        context.failedAttempts > 5
          ? 'high'
          : context.failedAttempts > 2
            ? 'medium'
            : 'low';

      factors.push({
        type: 'behavior',
        severity: severity as 'low' | 'medium' | 'high',
        score,
        description: 'Recent failed login attempts',
        metadata: { failedAttempts: context.failedAttempts },
      });
    }

    return factors;
  }

  /**
   * Determine risk level based on score and thresholds
   */
  private static determineRiskLevel(
    score: number,
    thresholds: { low: number; medium: number; high: number; critical: number }
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= thresholds.critical) return 'critical';
    if (score >= thresholds.high) return 'high';
    if (score >= thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on risk factors
   */
  private static generateRecommendations(
    factors: RiskFactor[],
    level: 'low' | 'medium' | 'high' | 'critical'
  ): string[] {
    const recommendations: string[] = [];

    // Level-based recommendations
    switch (level) {
      case 'critical':
        recommendations.push('Block access and require manual verification');
        recommendations.push('Contact security team immediately');
        break;
      case 'high':
        recommendations.push('Require multi-factor authentication');
        recommendations.push('Implement additional verification steps');
        break;
      case 'medium':
        recommendations.push('Consider requiring MFA');
        recommendations.push('Monitor session closely');
        break;
      case 'low':
        recommendations.push('Allow access with standard monitoring');
        break;
    }

    // Factor-specific recommendations
    const factorTypes = new Set(factors.map((f) => f.type));

    if (factorTypes.has('location')) {
      recommendations.push('Verify login location with user');
    }

    if (factorTypes.has('device')) {
      recommendations.push('Verify device identity');
    }

    if (factorTypes.has('network')) {
      recommendations.push('Investigate network source');
    }

    if (factorTypes.has('behavior')) {
      recommendations.push('Review recent account activity');
    }

    if (factors.some((f) => f.severity === 'critical')) {
      recommendations.push('Escalate to security team');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Calculate centroid of geographic locations
   */
  private static calculateCentroid(locations: GeoLocation[]): GeoLocation {
    const avgLat =
      locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length;
    const avgLng =
      locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length;

    const firstLocation = locations[0];
    if (!firstLocation) {
      throw new Error('No locations provided for centroid calculation');
    }

    return {
      country: firstLocation.country, // Use first location's country as reference
      region: firstLocation.region,
      city: 'Centroid',
      latitude: avgLat,
      longitude: avgLng,
      timezone: firstLocation.timezone,
    };
  }

  /**
   * Calculate distance between two geographic points (Haversine formula)
   */
  private static calculateDistance(
    loc1: GeoLocation,
    loc2: GeoLocation
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(loc2.latitude - loc1.latitude);
    const dLon = this.toRadians(loc2.longitude - loc1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(loc1.latitude)) *
        Math.cos(this.toRadians(loc2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
