import { DatabaseConnectionManager } from '../connection-manager';
import { Logger } from 'winston';

export class DatabaseInitializer {
  constructor(
    private connectionManager: DatabaseConnectionManager,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    this.logger.info('Starting database initialization...');

    try {
      // Run Prisma migrations
      await this.runPrismaMigrations();

      // Run Drizzle migrations
      await this.runDrizzleMigrations();

      // Create initial data
      await this.createInitialData();

      this.logger.info('Database initialization completed successfully');
    } catch (error) {
      this.logger.error('Database initialization failed', { error });
      throw error;
    }
  }

  private async runPrismaMigrations(): Promise<void> {
    this.logger.info('Running Prisma migrations...');

    try {
      const prisma = this.connectionManager.getPrismaClient();

      // Prisma migrations are typically run via CLI, but we can check connectivity
      await prisma.$queryRaw`SELECT 1`;

      this.logger.info('Prisma database connection verified');
    } catch (error) {
      this.logger.error('Prisma migration failed', { error });
      throw error;
    }
  }

  private async runDrizzleMigrations(): Promise<void> {
    this.logger.info('Running Drizzle migrations...');

    try {
      const db = this.connectionManager.getDrizzleDb();

      // Create Drizzle-specific tables
      await db.execute(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          token VARCHAR(500) NOT NULL UNIQUE,
          refresh_token VARCHAR(500) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          refresh_expires_at TIMESTAMP NOT NULL,
          last_activity TIMESTAMP DEFAULT NOW() NOT NULL,
          ip_address INET,
          device_fingerprint VARCHAR(255),
          user_agent TEXT,
          risk_score REAL DEFAULT 0 NOT NULL,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(token);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_expires_at ON active_sessions(expires_at);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS auth_attempts (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255),
          email VARCHAR(255),
          ip_address INET NOT NULL,
          user_agent TEXT,
          success BOOLEAN NOT NULL,
          failure_reason VARCHAR(255),
          timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
          risk_score REAL DEFAULT 0 NOT NULL,
          device_fingerprint VARCHAR(255)
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_id ON auth_attempts(user_id);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_address ON auth_attempts(ip_address);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp ON auth_attempts(timestamp);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS rate_limit_tracking (
          id SERIAL PRIMARY KEY,
          identifier VARCHAR(255) NOT NULL,
          resource VARCHAR(100) NOT NULL,
          request_count REAL DEFAULT 1 NOT NULL,
          window_start TIMESTAMP DEFAULT NOW() NOT NULL,
          window_end TIMESTAMP NOT NULL,
          blocked BOOLEAN DEFAULT false NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_tracking(identifier);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_rate_limit_resource ON rate_limit_tracking(resource);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end ON rate_limit_tracking(window_end);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_auth_cache (
          user_id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          password_hash TEXT,
          mfa_enabled BOOLEAN DEFAULT false NOT NULL,
          totp_secret VARCHAR(255),
          failed_login_attempts REAL DEFAULT 0 NOT NULL,
          locked_until TIMESTAMP,
          last_login_at TIMESTAMP,
          last_login_ip INET,
          risk_score REAL DEFAULT 0 NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_user_auth_cache_email ON user_auth_cache(email);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_token_cache (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          provider_account_id VARCHAR(255) NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          id_token TEXT,
          expires_at TIMESTAMP,
          token_type VARCHAR(50),
          scope TEXT,
          session_state TEXT,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_user_id ON oauth_token_cache(user_id);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_provider ON oauth_token_cache(provider);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_state_tracking (
          state VARCHAR(255) PRIMARY KEY,
          provider VARCHAR(50) NOT NULL,
          redirect_uri TEXT NOT NULL,
          code_verifier VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT false NOT NULL,
          ip_address VARCHAR(45),
          user_agent TEXT
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_state_expires_at ON oauth_state_tracking(expires_at);
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_auth_codes (
          code VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          redirect_uri TEXT NOT NULL,
          scope TEXT,
          code_challenge VARCHAR(255),
          code_challenge_method VARCHAR(10),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT false NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_user_id ON oauth_auth_codes(user_id);
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires_at ON oauth_auth_codes(expires_at);
      `);

      this.logger.info('Drizzle migrations completed successfully');
    } catch (error) {
      this.logger.error('Drizzle migration failed', { error });
      throw error;
    }
  }

  private async createInitialData(): Promise<void> {
    this.logger.info('Creating initial data...');

    try {
      const prisma = this.connectionManager.getPrismaClient();

      // Create default roles
      const adminRole = await prisma.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: {
          name: 'admin',
          description: 'System administrator with full access',
        },
      });

      const userRole = await prisma.role.upsert({
        where: { name: 'user' },
        update: {},
        create: {
          name: 'user',
          description: 'Standard user with basic access',
        },
      });

      // Create default permissions
      const permissions = [
        { name: 'user.read', resource: 'user', action: 'read' },
        { name: 'user.write', resource: 'user', action: 'write' },
        { name: 'user.delete', resource: 'user', action: 'delete' },
        { name: 'admin.read', resource: 'admin', action: 'read' },
        { name: 'admin.write', resource: 'admin', action: 'write' },
        { name: 'session.manage', resource: 'session', action: 'manage' },
        { name: 'audit.read', resource: 'audit', action: 'read' },
      ];

      for (const permission of permissions) {
        await prisma.permission.upsert({
          where: { name: permission.name },
          update: {},
          create: permission,
        });
      }

      // Assign permissions to roles
      const adminPermissions = await prisma.permission.findMany();
      const userPermissions = await prisma.permission.findMany({
        where: {
          name: {
            in: ['user.read', 'user.write', 'session.manage'],
          },
        },
      });

      // Assign all permissions to admin role
      for (const permission of adminPermissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        });
      }

      // Assign limited permissions to user role
      for (const permission of userPermissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: userRole.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: userRole.id,
            permissionId: permission.id,
          },
        });
      }

      this.logger.info('Initial data created successfully');
    } catch (error) {
      this.logger.error('Failed to create initial data', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check Prisma connection
      const prisma = this.connectionManager.getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;

      // Check Drizzle connection
      const db = this.connectionManager.getDrizzleDb();
      await db.execute(`SELECT 1`);

      return true;
    } catch (error) {
      this.logger.error('Database health check failed', { error });
      return false;
    }
  }
}
