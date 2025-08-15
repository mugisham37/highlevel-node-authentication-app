/**
 * Authentication Service Usage Example
 * Demonstrates how to use the core authentication service
 */

import { AuthenticationService } from '../services/authentication.service';
import { AuthenticationServiceFactory } from '../factories/authentication.factory';
import { AuthCredentials } from '../interfaces/authentication.interface';

// This is a usage example - not meant to be executed directly
export async function authenticationExample() {
  // Create authentication service using factory
  // In a real application, these would come from environment variables
  const authService = AuthenticationServiceFactory.create({
    prismaClient: {} as any, // Would be actual Prisma client
    drizzleDb: {} as any, // Would be actual Drizzle database
    logger: console as any, // Would be actual Winston logger
    jwtAccessSecret: 'your-access-token-secret-here',
    jwtRefreshSecret: 'your-refresh-token-secret-here',
  });

  // Example 1: Email/Password Authentication
  const credentials: AuthCredentials = {
    type: 'email_password',
    email: 'user@example.com',
    password: 'securePassword123',
    deviceInfo: {
      fingerprint: 'device-fingerprint-hash',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      platform: 'Windows',
      browser: 'Chrome',
      version: '91.0.4472.124',
      isMobile: false,
      screenResolution: '1920x1080',
      timezone: 'America/New_York',
    },
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  try {
    // Authenticate user
    const authResult = await authService.authenticate(credentials);

    if (authResult.success) {
      console.log('Authentication successful!');
      console.log('User ID:', authResult.user?.id);
      console.log('Access Token:', authResult.tokens?.accessToken);
      console.log('Risk Score:', authResult.riskScore);

      // Validate token
      const tokenValidation = await authService.validateToken(
        authResult.tokens!.accessToken
      );

      if (tokenValidation.valid) {
        console.log('Token is valid');
        console.log('User:', tokenValidation.user?.email.value);
      }

      // Refresh token
      const refreshResult = await authService.refreshToken({
        refreshToken: authResult.tokens!.refreshToken,
        deviceInfo: credentials.deviceInfo,
        ipAddress: credentials.ipAddress,
        userAgent: credentials.userAgent,
      });

      if (refreshResult.success) {
        console.log('Token refreshed successfully');
        console.log('New Access Token:', refreshResult.tokens?.accessToken);
      }

      // Logout
      if (authResult.session) {
        await authService.logout(authResult.session.id);
        console.log('User logged out successfully');
      }
    } else if (authResult.requiresMFA) {
      console.log('MFA required');
      console.log('Challenge Type:', authResult.mfaChallenge?.type);
      console.log('Challenge ID:', authResult.mfaChallenge?.challengeId);

      // In a real application, you would present the MFA challenge to the user
      // and then call authenticate again with the MFA code
    } else {
      console.log('Authentication failed');
      console.log('Error:', authResult.error?.message);
      console.log('Risk Score:', authResult.riskScore);
    }
  } catch (error) {
    console.error('Authentication error:', error);
  }
}

// Example 2: Token Validation Middleware
export function createAuthMiddleware(authService: AuthenticationService) {
  return async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid authorization header',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const validation = await authService.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({
          error: validation.error?.message || 'Invalid token',
          code: validation.error?.code,
          requiresRefresh: validation.requiresRefresh,
        });
      }

      // Add user and session to request object
      req.user = validation.user;
      req.session = validation.session;

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        error: 'Internal authentication error',
      });
    }
  };
}

// Example 3: Error Handling
export function handleAuthError(error: any) {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return {
        status: 401,
        message: 'Invalid email or password',
        action: 'retry_login',
      };

    case 'ACCOUNT_LOCKED':
      return {
        status: 423,
        message: `Account locked until ${error.details?.lockedUntil}`,
        action: 'wait_or_contact_support',
      };

    case 'ACCOUNT_NOT_VERIFIED':
      return {
        status: 403,
        message: 'Please verify your email address',
        action: 'verify_email',
      };

    case 'MFA_REQUIRED':
      return {
        status: 200,
        message: 'Multi-factor authentication required',
        action: 'provide_mfa',
        challengeId: error.challengeId,
        challengeType: error.challengeType,
      };

    case 'HIGH_RISK_BLOCKED':
      return {
        status: 403,
        message: 'Authentication blocked due to security concerns',
        action: 'contact_support',
        riskScore: error.riskScore,
      };

    case 'INVALID_TOKEN':
      return {
        status: 401,
        message: 'Token is invalid or expired',
        action: error.requiresRefresh ? 'refresh_token' : 'login_again',
      };

    default:
      return {
        status: 500,
        message: 'An unexpected error occurred',
        action: 'try_again_later',
      };
  }
}

// Example 4: Configuration with Custom Settings
export function createCustomAuthService() {
  return AuthenticationServiceFactory.createWithConfig(
    {
      prismaClient: {} as any,
      drizzleDb: {} as any,
      logger: console as any,
      jwtAccessSecret: 'your-access-secret',
      jwtRefreshSecret: 'your-refresh-secret',
    },
    {
      // Custom password hashing configuration
      passwordHashing: {
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 1,
      },

      // Custom JWT configuration
      jwt: {
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'my-app',
        audience: 'my-app-users',
      },

      // Custom risk scoring weights
      riskScoring: {
        locationWeight: 0.3,
        deviceWeight: 0.3,
        behaviorWeight: 0.2,
        temporalWeight: 0.1,
        networkWeight: 0.1,
      },
    }
  );
}

// Example usage in an Express.js application
export function setupAuthRoutes(app: any, authService: AuthenticationService) {
  // Login endpoint
  app.post('/auth/login', async (req: any, res: any) => {
    try {
      const { email, password } = req.body;
      const deviceInfo = {
        fingerprint: req.headers['x-device-fingerprint'] || 'unknown',
        userAgent: req.headers['user-agent'] || '',
        platform: 'web',
        browser: 'unknown',
        version: 'unknown',
        isMobile: /mobile/i.test(req.headers['user-agent'] || ''),
      };

      const result = await authService.authenticate({
        type: 'email_password',
        email,
        password,
        deviceInfo,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      if (result.success) {
        res.json({
          success: true,
          tokens: result.tokens,
          user: {
            id: result.user?.id,
            email: result.user?.email.value,
            name: result.user?.name,
          },
          riskScore: result.riskScore,
        });
      } else if (result.requiresMFA) {
        res.json({
          success: false,
          requiresMFA: true,
          challenge: result.mfaChallenge,
        });
      } else {
        const errorResponse = handleAuthError(result.error);
        res.status(errorResponse.status).json(errorResponse);
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  });

  // Token refresh endpoint
  app.post('/auth/refresh', async (req: any, res: any) => {
    try {
      const { refreshToken } = req.body;
      const deviceInfo = {
        fingerprint: req.headers['x-device-fingerprint'] || 'unknown',
        userAgent: req.headers['user-agent'] || '',
        platform: 'web',
        browser: 'unknown',
        version: 'unknown',
        isMobile: /mobile/i.test(req.headers['user-agent'] || ''),
      };

      const result = await authService.refreshToken({
        refreshToken,
        deviceInfo,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      if (result.success) {
        res.json({
          success: true,
          tokens: result.tokens,
          riskScore: result.riskScore,
        });
      } else {
        const errorResponse = handleAuthError(result.error);
        res.status(errorResponse.status).json(errorResponse);
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  });

  // Logout endpoint
  app.post(
    '/auth/logout',
    createAuthMiddleware(authService),
    async (req: any, res: any) => {
      try {
        if (req.session) {
          await authService.logout(req.session.id);
        }
        res.json({ success: true });
      } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  );

  // Protected route example
  app.get(
    '/api/profile',
    createAuthMiddleware(authService),
    (req: any, res: any) => {
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email.value,
          name: req.user.name,
          emailVerified: req.user.emailVerified,
          mfaEnabled: req.user.mfaEnabled,
        },
        session: {
          id: req.session.id,
          createdAt: req.session.createdAt,
          lastActivity: req.session.lastActivity,
          riskScore: req.session.riskScore,
        },
      });
    }
  );
}
