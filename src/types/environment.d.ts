/**
 * Environment variable type definitions
 * This file extends the NodeJS ProcessEnv interface to include typed environment variables
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Server Configuration
      NODE_ENV: 'development' | 'production' | 'test' | 'staging';
      PORT?: string;
      HOST?: string;
      
      // Database
      DATABASE_URL: string;
      
      // JWT Configuration
      JWT_SECRET: string;
      JWT_REFRESH_SECRET: string;
      JWT_ACCESS_EXPIRES_IN?: string;
      JWT_REFRESH_EXPIRES_IN?: string;
      
      // Frontend URLs
      FRONTEND_URL?: string;
      
      // Support Configuration
      SUPPORT_EMAIL?: string;
      SUPPORT_PHONE?: string;
      SUPPORT_CHAT_URL?: string;
      SUPPORT_TICKET_URL?: string;
      SUPPORT_HOURS?: string;
      SUPPORT_RESPONSE_TIME?: string;
      
      // OAuth Configuration
      OAUTH_DEFAULT_CLIENT_ID?: string;
      OAUTH_DEFAULT_CLIENT_SECRET?: string;
      OAUTH_MOBILE_CLIENT_ID?: string;
      OAUTH_API_CLIENT_ID?: string;
      OAUTH_API_CLIENT_SECRET?: string;
      
      // External OAuth Providers
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      GITHUB_CLIENT_ID?: string;
      GITHUB_CLIENT_SECRET?: string;
      MICROSOFT_CLIENT_ID?: string;
      MICROSOFT_CLIENT_SECRET?: string;
      
      // Email Configuration
      SMTP_HOST?: string;
      SMTP_PORT?: string;
      SMTP_USER?: string;
      SMTP_PASS?: string;
      SMTP_FROM?: string;
      
      // SMS Configuration
      TWILIO_ACCOUNT_SID?: string;
      TWILIO_AUTH_TOKEN?: string;
      TWILIO_PHONE_NUMBER?: string;
      
      // Redis Configuration
      REDIS_URL?: string;
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      
      // Security
      ENCRYPTION_KEY?: string;
      SESSION_SECRET?: string;
      
      // Monitoring
      SENTRY_DSN?: string;
      
      // Rate Limiting
      RATE_LIMIT_WINDOW_MS?: string;
      RATE_LIMIT_MAX_REQUESTS?: string;
      
      // File Upload
      MAX_FILE_SIZE?: string;
      UPLOAD_DIR?: string;
      
      // WebAuthn
      WEBAUTHN_RP_NAME?: string;
      WEBAUTHN_RP_ID?: string;
      WEBAUTHN_ORIGIN?: string;
      
      // Logging
      LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug';
      LOG_FORMAT?: 'json' | 'simple';
      
      // Application Version and Audit
      APP_VERSION?: string;
      AUDIT_SECRET_KEY?: string;
      
      // Testing
      TEST_DATABASE_URL?: string;
      TEST_CONFIG_VALUE?: string;
      
      // Backup Configuration
      BACKUP_PATH?: string;
      REMOTE_STORAGE_ENABLED?: string;
      REMOTE_STORAGE_TYPE?: string;
      REMOTE_STORAGE_BUCKET?: string;
      REMOTE_STORAGE_REGION?: string;
      REMOTE_STORAGE_ACCESS_KEY?: string;
      REMOTE_STORAGE_SECRET_KEY?: string;
      REMOTE_STORAGE_CONNECTION_STRING?: string;
      
      // PostgreSQL Backup
      PG_DUMP_PATH?: string;
      PG_RESTORE_PATH?: string;
      WAL_ARCHIVE_PATH?: string;
      
      // Redis Backup
      REDIS_RDB_PATH?: string;
      
      // Backup Compression
      BACKUP_COMPRESSION_ENABLED?: string;
      BACKUP_COMPRESSION_LEVEL?: string;
      
      // Backup Encryption
      BACKUP_ENCRYPTION_ENABLED?: string;
      BACKUP_ENCRYPTION_ALGORITHM?: string;
      BACKUP_ENCRYPTION_KEY_PATH?: string;
      
      // Backup Schedule
      BACKUP_SCHEDULE_ENABLED?: string;
      BACKUP_SCHEDULE_INTERVAL?: string;
      BACKUP_SCHEDULE_TYPE?: string;
      
      // Backup Retention
      BACKUP_RETENTION_DAYS?: string;
      BACKUP_MAX_COUNT?: string;
      
      // Cross-Region Replication
      CROSS_REGION_REPLICATION_ENABLED?: string;
      CROSS_REGION_TARGETS?: string;
      CROSS_REGION_DELAY?: string;
      
      // Scaling Configuration
      AUTO_SCALING_ENABLED?: string;
      MIN_INSTANCES?: string;
      MAX_INSTANCES?: string;
      TARGET_CPU_UTILIZATION?: string;
      TARGET_MEMORY_UTILIZATION?: string;
      TARGET_REQUEST_RATE?: string;
      TARGET_RESPONSE_TIME?: string;
      SCALE_UP_COOLDOWN?: string;
      SCALE_DOWN_COOLDOWN?: string;
      SCALE_UP_THRESHOLD?: string;
      SCALE_DOWN_THRESHOLD?: string;
      SCALING_EVALUATION_PERIOD?: string;
      SCALING_DATA_POINTS?: string;
      
      // Graceful Shutdown
      GRACEFUL_SHUTDOWN_ENABLED?: string;
      GRACEFUL_SHUTDOWN_GRACE_PERIOD?: string;
      GRACEFUL_SHUTDOWN_DRAIN_TIMEOUT?: string;
      HEALTH_CHECK_GRACE_PERIOD?: string;
      FORCE_SHUTDOWN_TIMEOUT?: string;
      ENABLE_PRE_SHUTDOWN_HOOK?: string;
      ENABLE_POST_SHUTDOWN_HOOK?: string;
      DEPLOYMENT_STRATEGY?: string;
      MAX_UNAVAILABLE?: string;
      MAX_SURGE?: string;
      READINESS_PROBE_PATH?: string;
      READINESS_INITIAL_DELAY?: string;
      READINESS_PERIOD?: string;
      READINESS_TIMEOUT?: string;
      READINESS_FAILURE_THRESHOLD?: string;
      LIVENESS_PROBE_PATH?: string;
      LIVENESS_INITIAL_DELAY?: string;
      LIVENESS_PERIOD?: string;
      LIVENESS_TIMEOUT?: string;
      LIVENESS_FAILURE_THRESHOLD?: string;
      
      // Load Balancer Configuration
      LOAD_BALANCER_TYPE?: string;
      SERVER_PORT?: string;
      SERVER_HOST?: string;
      ENABLE_STICKY_SESSIONS?: string;
      SSL_ENABLED?: string;
      SSL_CERT_PATH?: string;
      SSL_KEY_PATH?: string;
      DOMAIN_NAME?: string;
      ADDITIONAL_INSTANCES?: string;
      
      // Session Affinity
      ENABLE_SESSION_AFFINITY?: string;
      AFFINITY_METHOD?: string;
      AFFINITY_COOKIE_NAME?: string;
      AFFINITY_HEADER_NAME?: string;
      AFFINITY_DURATION?: string;
      COOKIE_DOMAIN?: string;
      
      // Stateless Manager
      HOSTNAME?: string;
      npm_package_version?: string;
      AWS_REGION?: string;
      REGION?: string;
      AWS_AVAILABILITY_ZONE?: string;
      ZONE?: string;
      SESSION_STORAGE?: string;
      CACHE_STRATEGY?: string;
      ENABLE_SESSION_REPLICATION?: string;
      USE_LOCAL_CACHE?: string;
      USE_FILE_SESSIONS?: string;
      STORE_UPLOADS_LOCALLY?: string;
    }
  }
}

export {};
