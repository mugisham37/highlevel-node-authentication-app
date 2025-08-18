// Temporary User type - will be replaced with @company/shared when available
export interface User {
  id: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive' | 'suspended';
}

/**
 * tRPC context interface
 * This defines what's available in all tRPC procedures
 */
export interface Context {
  /**
   * Current authenticated user (null if not authenticated)
   */
  user: User | null;

  /**
   * Request IP address
   */
  ip: string;

  /**
   * User agent string
   */
  userAgent: string;

  /**
   * Request ID for tracing
   */
  requestId: string;

  /**
   * Session ID if available
   */
  sessionId?: string;

  /**
   * Device fingerprint for security
   */
  deviceFingerprint?: string;
}

/**
 * Context for authenticated users
 */
export interface AuthenticatedContext extends Context {
  user: User;
}
