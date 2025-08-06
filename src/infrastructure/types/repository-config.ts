/**
 * Repository Configuration Types
 * Provides type-safe configuration for repository implementations
 */

import { IUserRepository } from '../database/repositories/interfaces/user-repository.interface';
import { ISessionRepository } from '../database/repositories/interfaces/session-repository.interface';
import { MultiLayerCache } from '../cache/multi-layer-cache';

export interface RepositoryFactoryConfig {
  userRepository?: IUserRepository | undefined;
  sessionRepository?: ISessionRepository | undefined;
  cache?: MultiLayerCache | undefined;
}

export interface RepositoryConfig {
  enableCaching?: boolean;
  cacheConfig?: {
    defaultTtl?: number;
    maxMemoryItems?: number;
  };
  enableMetrics?: boolean;
  optimizationLevel?: 'basic' | 'aggressive';
}

export interface CacheConfiguration {
  enabled: boolean;
  defaultTtl: number;
  maxMemoryItems: number;
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

export interface TransactionConfiguration {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface RepositoryMetrics {
  queriesExecuted: number;
  averageResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  lastUpdated: Date;
}

export const createDefaultRepositoryConfig = (): RepositoryConfig => ({
  enableCaching: true,
  cacheConfig: {
    defaultTtl: 3600,
    maxMemoryItems: 1000,
  },
  enableMetrics: true,
  optimizationLevel: 'basic',
});

export const createDefaultCacheConfig = (): CacheConfiguration => ({
  enabled: true,
  defaultTtl: 3600,
  maxMemoryItems: 1000,
});
