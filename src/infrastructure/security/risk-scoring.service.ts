/**
 * Risk Scoring Service
 * Advanced risk assessment and scoring algorithms for authentication security
 */

import {
  RiskAssessment,
  RiskFactor,
  SecurityContext,
  DeviceFingerprint,
  LoginHistory,
  GeoLocation,
} from './types';

export interface RiskConfiguration {
  // Weight factors (0-1)
  locationWeight: number;
  deviceWeight: number;
  behaviorWeight: number;
  temporalWeight: number;
  networkWeight: number;

  // Thresholds
  lowRiskThreshold: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;

  // Feature flags
  enableGeoLocationChecks: boolean;
  enableDeviceAnalysis: boolean;
  enableBehaviorAnalysis: boolean;
  enableNetworkAnalysis: boolean;
  enableTemporalAnalysis: boolean;
}

export class RiskScoringService {
  private static readonly DEFAULT_CONFIG: RiskConfiguration = {
    locationWeight: 0.25,
    deviceWeight: 0.25,
    behaviorWeight: 0.2,
    temporalWeight: 0.15,
    networkWeight: 0.15,
    lowRiskThreshold: 30,
    mediumRiskThreshold: 60,
    highRiskThreshold: 85,
    enableGeoLocationChecks: true,
    enableDeviceAnalysis: true,
    enableBehaviorAnalysis: true,
    enableNetworkAnalysis: true,
    enableTemporalAnalysis: true,
  };

  constructor(
    private readonly config: RiskConfiguration = RiskScoringService.DEFAULT_CONFIG
  ) {}

  /**
   * Perform comprehensive risk assessment
   */
  async assessRisk(context: SecurityContext): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Location-based risk assessment
    if (this.config.enableGeoLocationChecks && context.geoLocation) {
      const locationFactors = await this.assessLocationRisk(context);
      factors.push(...locationFactors);
      totalScore += this.calculateWeightedScore(
        locationFactors,
        this.config.locationWeight
      );
    }

    // Device-based risk assessment
    if (this.config.enableDeviceAnalysis) {
      const deviceFactors = await this.assessDeviceRisk(context);
      factors.push(...deviceFactors);
      totalScore += this.calculateWeightedScore(
        deviceFactors,
        this.config.deviceWeight
      );
    }

    // Behavioral risk assessment
    if (this.config.enableBehaviorAnalysis && context.previousLogins) {
      const behaviorFactors = await this.assessBehaviorRisk(context);
      factors.push(...behaviorFactors);
      totalScore += this.calculateWeightedScore(
        behaviorFactors,
        this.config.behaviorWeight
      );
    }

    // Temporal risk assessment
    if (this.config.enableTemporalAnalysis) {
      const temporalFactors = await this.assessTemporalRisk(context);
      factors.push(...temporalFactors);
      totalScore += this.calculateWeightedScore(
        temporalFactors,
        this.config.temporalWeight
      );
    }

    // Network-based risk assessment
    if (this.config.enableNetworkAnalysis) {
      const networkFactors = await this.assessNetworkRisk(context);
      factors.push(...networkFactors);
      totalScore += this.calculateWeightedScore(
        networkFactors,
        this.config.networkWeight
      );
    }

    // Normalize score to 0-100 range
    const overallScore = Math.max(0, Math.min(100, totalScore));

    // Determine risk level
    const level = this.determineRiskLevel(overallScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(factors, level);

    // Determine if MFA is required
    const requiresMFA = this.shouldRequireMFA(overallScore, factors);

    // Determine if access should be allowed
    const allowAccess = this.shouldAllowAccess(overallScore, factors);

    return {
      overallScore,
      level,
      factors,
      recommendations,
      requiresMFA,
      allowAccess,
      timestamp: new Date(),
    };
  }

  /**
   * Assess location-based risk factors
   */
  private async assessLocationRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    if (!context.geoLocation || !context.previousLogins) {
      return factors;
    }

    const currentLocation = context.geoLocation;
    const previousLocations = context.previousLogins
      .filter((login) => login.location)
      .map((login) => login.location!);

    if (previousLocations.length === 0) {
      factors.push({
        type: 'location',
        severity: 'medium',
        score: 40,
        description: 'First login from this location',
        metadata: { location: currentLocation },
      });
      return factors;
    }

    // Check for impossible travel
    const recentLogins = context.previousLogins
      .filter(
        (login) =>
          login.location &&
          login.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (recentLogins.length > 0) {
      const lastLogin = recentLogins[0];
      const timeDiff =
        (context.timestamp.getTime() - lastLogin.timestamp.getTime()) /
        (1000 * 60 * 60); // hours
      const distance = this.calculateDistance(
        currentLocation,
        lastLogin.location!
      );
      const maxPossibleSpeed = distance / timeDiff; // km/h

      if (maxPossibleSpeed > 1000) {
        // Faster than commercial aircraft
        factors.push({
          type: 'location',
          severity: 'critical',
          score: 90,
          description: 'Impossible travel detected',
          metadata: {
            distance: distance,
            timeDiff: timeDiff,
            speed: maxPossibleSpeed,
            previousLocation: lastLogin.location,
            currentLocation: currentLocation,
          },
        });
      } else if (maxPossibleSpeed > 500) {
        // Very fast travel
        factors.push({
          type: 'location',
          severity: 'high',
          score: 70,
          description: 'Very fast travel detected',
          metadata: {
            distance: distance,
            timeDiff: timeDiff,
            speed: maxPossibleSpeed,
          },
        });
      }
    }

    // Check for new country
    const previousCountries = new Set(
      previousLocations.map((loc) => loc.country)
    );
    if (!previousCountries.has(currentLocation.country)) {
      factors.push({
        type: 'location',
        severity: 'medium',
        score: 50,
        description: 'Login from new country',
        metadata: {
          newCountry: currentLocation.country,
          previousCountries: Array.from(previousCountries),
        },
      });
    }

    // Check for high-risk countries (this would be configurable in production)
    const highRiskCountries = ['CN', 'RU', 'KP', 'IR']; // Example list
    if (highRiskCountries.includes(currentLocation.country)) {
      factors.push({
        type: 'location',
        severity: 'high',
        score: 75,
        description: 'Login from high-risk country',
        metadata: { country: currentLocation.country },
      });
    }

    // Check location frequency
    const locationFrequency = previousLocations.filter(
      (loc) =>
        loc.country === currentLocation.country &&
        loc.city === currentLocation.city
    ).length;

    if (locationFrequency === 0) {
      factors.push({
        type: 'location',
        severity: 'medium',
        score: 45,
        description: 'Login from new city',
        metadata: {
          city: currentLocation.city,
          country: currentLocation.country,
        },
      });
    }

    return factors;
  }

  /**
   * Assess device-based risk factors
   */
  private async assessDeviceRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    const device = context.deviceFingerprint;

    // Check device trust score
    if (device.trustScore < 30) {
      factors.push({
        type: 'device',
        severity: 'high',
        score: 80,
        description: 'Low device trust score',
        metadata: { trustScore: device.trustScore },
      });
    } else if (device.trustScore < 50) {
      factors.push({
        type: 'device',
        severity: 'medium',
        score: 50,
        description: 'Medium device trust score',
        metadata: { trustScore: device.trustScore },
      });
    }

    // Check for new device
    const deviceAge =
      (Date.now() - device.createdAt.getTime()) / (1000 * 60 * 60 * 24); // days
    if (deviceAge < 1) {
      factors.push({
        type: 'device',
        severity: 'medium',
        score: 60,
        description: 'New device (less than 1 day old)',
        metadata: { deviceAge: deviceAge },
      });
    } else if (deviceAge < 7) {
      factors.push({
        type: 'device',
        severity: 'low',
        score: 30,
        description: 'Recent device (less than 1 week old)',
        metadata: { deviceAge: deviceAge },
      });
    }

    // Check for suspicious user agent patterns
    const suspiciousPatterns = [
      /headless/i,
      /phantom/i,
      /selenium/i,
      /webdriver/i,
      /automation/i,
      /bot/i,
      /crawler/i,
      /scraper/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(device.userAgent)) {
        factors.push({
          type: 'device',
          severity: 'critical',
          score: 95,
          description: 'Suspicious user agent detected',
          metadata: { userAgent: device.userAgent, pattern: pattern.source },
        });
        break;
      }
    }

    // Check for missing browser features
    let missingFeatures = 0;
    if (!device.canvas) missingFeatures++;
    if (!device.webgl) missingFeatures++;
    if (!device.audioContext) missingFeatures++;
    if (!device.plugins || device.plugins.length === 0) missingFeatures++;

    if (missingFeatures >= 3) {
      factors.push({
        type: 'device',
        severity: 'medium',
        score: 55,
        description: 'Many browser features missing or blocked',
        metadata: { missingFeatures: missingFeatures },
      });
    }

    return factors;
  }

  /**
   * Assess behavioral risk factors
   */
  private async assessBehaviorRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    if (!context.previousLogins || context.previousLogins.length === 0) {
      return factors;
    }

    const recentLogins = context.previousLogins
      .filter(
        (login) =>
          login.timestamp > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ) // Last 30 days
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Check login frequency
    const loginsToday = recentLogins.filter(
      (login) => login.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;

    if (loginsToday > 20) {
      factors.push({
        type: 'behavior',
        severity: 'high',
        score: 75,
        description: 'Unusually high login frequency today',
        metadata: { loginsToday: loginsToday },
      });
    } else if (loginsToday > 10) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 45,
        description: 'High login frequency today',
        metadata: { loginsToday: loginsToday },
      });
    }

    // Check failed login attempts
    if (context.failedAttempts && context.failedAttempts > 0) {
      const severity =
        context.failedAttempts > 5
          ? 'high'
          : context.failedAttempts > 2
            ? 'medium'
            : 'low';
      const score = Math.min(90, 20 + context.failedAttempts * 10);

      factors.push({
        type: 'behavior',
        severity,
        score,
        description: `${context.failedAttempts} recent failed login attempts`,
        metadata: { failedAttempts: context.failedAttempts },
      });
    }

    // Check login time patterns
    const currentHour = context.timestamp.getHours();
    const typicalHours = recentLogins.map((login) =>
      login.timestamp.getHours()
    );
    const hourFrequency = typicalHours.reduce(
      (acc, hour) => {
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>
    );

    const currentHourFrequency = hourFrequency[currentHour] || 0;
    const totalLogins = typicalHours.length;
    const currentHourRatio = currentHourFrequency / totalLogins;

    if (currentHourRatio < 0.05 && totalLogins > 10) {
      // Less than 5% of logins at this hour
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 40,
        description: 'Login at unusual time',
        metadata: {
          currentHour: currentHour,
          typicalHours: Object.keys(hourFrequency).map(Number),
          frequency: currentHourFrequency,
        },
      });
    }

    // Check success rate
    const successfulLogins = recentLogins.filter(
      (login) => login.success
    ).length;
    const successRate = successfulLogins / recentLogins.length;

    if (successRate < 0.5) {
      factors.push({
        type: 'behavior',
        severity: 'high',
        score: 70,
        description: 'Low recent login success rate',
        metadata: {
          successRate: successRate,
          totalLogins: recentLogins.length,
        },
      });
    } else if (successRate < 0.8) {
      factors.push({
        type: 'behavior',
        severity: 'medium',
        score: 45,
        description: 'Moderate recent login success rate',
        metadata: {
          successRate: successRate,
          totalLogins: recentLogins.length,
        },
      });
    }

    return factors;
  }

  /**
   * Assess temporal risk factors
   */
  private async assessTemporalRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    const now = context.timestamp;

    // Check for off-hours access (configurable business hours)
    const businessHours = { start: 9, end: 17 }; // 9 AM to 5 PM
    const currentHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    if (isWeekend) {
      factors.push({
        type: 'temporal',
        severity: 'low',
        score: 25,
        description: 'Weekend login',
        metadata: { day: now.getDay(), hour: currentHour },
      });
    }

    if (currentHour < businessHours.start || currentHour >= businessHours.end) {
      factors.push({
        type: 'temporal',
        severity: 'low',
        score: 20,
        description: 'Off-hours login',
        metadata: { hour: currentHour, businessHours: businessHours },
      });
    }

    // Check for very late night access (potential compromise)
    if (currentHour >= 2 && currentHour <= 5) {
      factors.push({
        type: 'temporal',
        severity: 'medium',
        score: 45,
        description: 'Very late night login',
        metadata: { hour: currentHour },
      });
    }

    // Check account age
    if (context.accountAge !== undefined) {
      if (context.accountAge < 1) {
        factors.push({
          type: 'temporal',
          severity: 'medium',
          score: 50,
          description: 'Very new account (less than 1 day)',
          metadata: { accountAge: context.accountAge },
        });
      } else if (context.accountAge < 7) {
        factors.push({
          type: 'temporal',
          severity: 'low',
          score: 30,
          description: 'New account (less than 1 week)',
          metadata: { accountAge: context.accountAge },
        });
      }
    }

    return factors;
  }

  /**
   * Assess network-based risk factors
   */
  private async assessNetworkRisk(
    context: SecurityContext
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    // Check for VPN usage
    if (context.isVPN) {
      factors.push({
        type: 'network',
        severity: 'medium',
        score: 50,
        description: 'VPN usage detected',
        metadata: { isVPN: true },
      });
    }

    // Check for Tor usage
    if (context.isTor) {
      factors.push({
        type: 'network',
        severity: 'high',
        score: 80,
        description: 'Tor network usage detected',
        metadata: { isTor: true },
      });
    }

    // Check for proxy usage
    if (context.isProxy) {
      factors.push({
        type: 'network',
        severity: 'medium',
        score: 45,
        description: 'Proxy usage detected',
        metadata: { isProxy: true },
      });
    }

    // Check for suspicious IP patterns
    const ip = context.ipAddress;
    if (this.isPrivateIP(ip)) {
      factors.push({
        type: 'network',
        severity: 'low',
        score: 20,
        description: 'Private IP address',
        metadata: { ipAddress: ip },
      });
    }

    // Check for IP reputation (this would integrate with threat intelligence in production)
    if (this.isKnownMaliciousIP(ip)) {
      factors.push({
        type: 'network',
        severity: 'critical',
        score: 95,
        description: 'Known malicious IP address',
        metadata: { ipAddress: ip },
      });
    }

    return factors;
  }

  private calculateWeightedScore(
    factors: RiskFactor[],
    weight: number
  ): number {
    if (factors.length === 0) return 0;

    const averageScore =
      factors.reduce((sum, factor) => sum + factor.score, 0) / factors.length;
    return averageScore * weight;
  }

  private determineRiskLevel(
    score: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.config.highRiskThreshold) return 'critical';
    if (score >= this.config.mediumRiskThreshold) return 'high';
    if (score >= this.config.lowRiskThreshold) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    factors: RiskFactor[],
    level: string
  ): string[] {
    const recommendations: string[] = [];

    if (level === 'critical') {
      recommendations.push('Block access immediately');
      recommendations.push('Require administrator approval');
      recommendations.push('Initiate security investigation');
    } else if (level === 'high') {
      recommendations.push('Require multi-factor authentication');
      recommendations.push('Limit session duration');
      recommendations.push('Monitor user activity closely');
    } else if (level === 'medium') {
      recommendations.push('Consider requiring MFA');
      recommendations.push('Log security event');
      recommendations.push('Monitor for additional risk factors');
    } else {
      recommendations.push('Allow normal access');
      recommendations.push('Continue standard monitoring');
    }

    // Add specific recommendations based on risk factors
    const factorTypes = new Set(factors.map((f) => f.type));

    if (factorTypes.has('location')) {
      recommendations.push('Verify user location through secondary channel');
    }

    if (factorTypes.has('device')) {
      recommendations.push('Request device verification');
    }

    if (factorTypes.has('behavior')) {
      recommendations.push('Review recent account activity');
    }

    return recommendations;
  }

  private shouldRequireMFA(score: number, factors: RiskFactor[]): boolean {
    // Always require MFA for high-risk scenarios
    if (score >= this.config.mediumRiskThreshold) {
      return true;
    }

    // Require MFA for specific risk factors
    const criticalFactors = factors.filter((f) => f.severity === 'critical');
    if (criticalFactors.length > 0) {
      return true;
    }

    const highSeverityFactors = factors.filter((f) => f.severity === 'high');
    if (highSeverityFactors.length >= 2) {
      return true;
    }

    return false;
  }

  private shouldAllowAccess(score: number, factors: RiskFactor[]): boolean {
    // Block access for critical risk scores
    if (score >= 90) {
      return false;
    }

    // Block access for multiple critical factors
    const criticalFactors = factors.filter((f) => f.severity === 'critical');
    if (criticalFactors.length >= 2) {
      return false;
    }

    // Check for specific blocking conditions
    const blockingFactors = factors.filter(
      (f) =>
        f.description.includes('malicious IP') ||
        f.description.includes('impossible travel') ||
        f.description.includes('automation')
    );

    return blockingFactors.length === 0;
  }

  private calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
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

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
    ];

    return privateRanges.some((range) => range.test(ip));
  }

  private isKnownMaliciousIP(ip: string): boolean {
    // In production, this would check against threat intelligence feeds
    // For now, return false as we don't have access to threat intelligence
    return false;
  }
}
