import { DatabaseConnectionManager } from './connection-manager';
import { DatabaseInitializer } from './migrations/init';
import { PrismaUserRepository } from './repositories/prisma-user-repository';
import { DrizzleSessionRepository } from './repositories/drizzle-session-repository';
import { createDatabaseConfig } from './config';
import { Logger } from 'winston';

export interface DatabaseModule {
  connectionManager: DatabaseConnectionManager;
  initializer: DatabaseInitializer;
  repositories: {
    users: PrismaUserRepository;
    sessions: DrizzleSessionRepository;
  };
}

export async function createDatabaseModule(
  logger: Logger
): Promise<DatabaseModule> {
  // Create database configuration
  const config = createDatabaseConfig();

  // Initialize connection manager
  const connectionManager = new DatabaseConnectionManager(config, logger);

  // Initialize database
  const initializer = new DatabaseInitializer(connectionManager, logger);

  // Create repositories
  const repositories = {
    users: new PrismaUserRepository(
      connectionManager.getPrismaClient(),
      logger
    ),
    sessions: new DrizzleSessionRepository(
      connectionManager.getDrizzleDb(),
      logger
    ),
  };

  return {
    connectionManager,
    initializer,
    repositories,
  };
}

// Export types and schemas
export * from './connection-manager';
export * from './repositories/prisma-user-repository';
export * from './repositories/drizzle-session-repository';
export * from './drizzle/schema/auth-sessions';
export * from './drizzle/schema/oauth-cache';
export { DatabaseInitializer } from './migrations/init';
