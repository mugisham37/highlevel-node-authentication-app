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

    // Create and return authentication service
    return new AuthenticationService(
      userRepository,
      sessionRepository,
      passwordHashingService,
      jwtTokenService,
      riskScoringService,
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
        ...(config.jwt?.issuer !== undefined && { issuer: config.jwt.issuer }),
        ...(config.jwt?.audience !== undefined && { audience: config.jwt.audience }),
      }
    );

    const riskScoringOptions = config.riskScoring
      ? {
          enableGeoLocationChecks: true,
          enableBehavioralAnalysis: true,
          enableDeviceTracking: true,
          enableVPNDetection: true,
          baselineRiskScore: 10,
          riskThresholds: {
            low: 30,
            medium: 60,
            high: 85,
            critical: 95,
          },
        }
      : {};

    const riskScoringService = new RiskScoringService(riskScoringOptions);

    return new AuthenticationService(
      userRepository,
      sessionRepository,
      passwordHashingService,
      jwtTokenService,
      riskScoringService,
      logger
    );
  }
}
