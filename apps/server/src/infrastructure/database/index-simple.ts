import { SimpleDatabaseConnectionManager } from './connection-manager-simple';
import { DrizzleSessionRepository } from './repositories/drizzle-session-repository';
import { createDatabaseConfig } from './config';
import { Logger } from 'winston';

export interface SimpleDatabaseModule {
  connectionManager: SimpleDatabaseConnectionManager;
  repositories: {
    sessions: DrizzleSessionRepository;
  };
}

export async function createSimpleDatabaseModule(
  logger: Logger
): Promise<SimpleDatabaseModule> {
  // Create database configuration
  const config = createDatabaseConfig();

  // Initialize connection manager
  const connectionManager = new SimpleDatabaseConnectionManager(config, logger);

  // Create repositories
  const repositories = {
    sessions: new DrizzleSessionRepository(
      connectionManager.getDrizzleDb(),
      logger
    ),
  };

  return {
    connectionManager,
    repositories,
  };
}

// Export types and schemas
export * from './connection-manager-simple';
export * from './repositories/drizzle-session-repository';
export * from './drizzle/schema/auth-sessions';
export * from './drizzle/schema/oauth-cache';
