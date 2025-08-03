/**
 * Authentication Service Factory
 * Factory for creating authentication service with all dependencies
 */

import { Logger } from 'winston';
import { PrismaClient } from '@prisma/client';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AuthenticationService } from '../services/authentication.service';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { DrizzleSessionRepository } from '../../infrastructure/database/repositories/drizzle-session-repository';
import { PasswordHashingService } from '../../infrastructure/security/password-hashing.service';
import { JWTTokenService } from '../../infrastructure/security/jwt-token.service';
import { RiskScoringService } from '../../infrastructure/security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../infrastructure/security/device-fingerprinting.service';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';

export interface AuthenticationServiceDependencies {
  prismaClient: PrismaClient;
  drizzleDb: NodePgDatabase<any>;
  logger: Logger;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
}

export class AuthenticationServiceFactory {
  static create(
    dependencies: AuthenticationServiceDependencies
  ): AuthenticationService {
    const {
      prismaClient,
      drizzleDb,
      logger,
      jwtAccessSecret,
      jwtRefreshSecret,
    } = dependencies;

    // Create repositories
    const userRepository = new PrismaUserRepository(prismaClient, logger);
    const sessionRepository = new DrizzleSessionRepository(drizzleDb, logger);

    // Create security services
    const passwordHashingService = new PasswordHashingService();
    const jwtTokenService = new JWTTokenService(
      jwtAccessSecret,
      jwtRefreshSecret
    );
    const riskScoringService = new RiskScoringService();
    const deviceFingerprintingService = new DeviceFingerprintingService();

    // Create and return authentication service
    return new AuthenticationService(
      userRepository,
      sessionRepository,
      passwordHashingService,
      jwtTokenService,
      riskScoringService,
      deviceFingerprintingService,
      logger
    );
  }

  /**
   * Create authentication service with custom configuration
   */
  static createWithConfig(
    dependencies: AuthenticationServiceDependencies,
    config: {
      passwordHashing?: {
        memoryCost?: number;
        timeCost?: number;
        parallelism?: number;
      };
      jwt?: {
        accessTokenExpiry?: string;
        refreshTokenExpiry?: string;
        issuer?: string;
        audience?: string;
      };
      riskScoring?: {
        locationWeight?: number;
        deviceWeight?: number;
        behaviorWeight?: number;
        temporalWeight?: number;
        networkWeight?: number;
      };
    } = {}
  ): AuthenticationService {
    const {
      prismaClient,
      drizzleDb,
      logger,
      jwtAccessSecret,
      jwtRefreshSecret,
    } = dependencies;

    // Create repositories
    const userRepository = new PrismaUserRepository(prismaClient, logger);
    const sessionRepository = new DrizzleSessionRepository(drizzleDb, logger);

    // Create security services with custom configuration
    const passwordHashingService = new PasswordHashingService();

    const jwtTokenService = new JWTTokenService(
      jwtAccessSecret,
      jwtRefreshSecret,
      {
        issuer: config.jwt?.issuer,
        audience: config.jwt?.audience,
      }
    );

    const riskScoringService = new RiskScoringService(
      config.riskScoring
        ? {
            locationWeight: config.riskScoring.locationWeight || 0.25,
            deviceWeight: config.riskScoring.deviceWeight || 0.25,
            behaviorWeight: config.riskScoring.behaviorWeight || 0.2,
            temporalWeight: config.riskScoring.temporalWeight || 0.15,
            networkWeight: config.riskScoring.networkWeight || 0.15,
            lowRiskThreshold: 30,
            mediumRiskThreshold: 60,
            highRiskThreshold: 85,
            enableGeoLocationChecks: true,
            enableDeviceAnalysis: true,
            enableBehaviorAnalysis: true,
            enableNetworkAnalysis: true,
            enableTemporalAnalysis: true,
          }
        : undefined
    );

    const deviceFingerprintingService = new DeviceFingerprintingService();

    return new AuthenticationService(
      userRepository,
      sessionRepository,
      passwordHashingService,
      jwtTokenService,
      riskScoringService,
      deviceFingerprintingService,
      logger
    );
  }
}
