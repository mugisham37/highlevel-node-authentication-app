# Troubleshooting Guide

This guide covers common issues and their solutions when integrating with the Enterprise Authentication API.

## Table of Contents

1. [Authentication Issues](#authentication-issues)
2. [Token Management](#token-management)
3. [OAuth Integration](#oauth-integration)
4. [Multi-Factor Authentication](#multi-factor-authentication)
5. [Rate Limiting](#rate-limiting)
6. [Network and Connectivity](#network-and-connectivity)
7. [Data Validation](#data-validation)
8. [Performance Issues](#performance-issues)
9. [Security Concerns](#security-concerns)
10. [Development Environment](#development-environment)

## Authentication Issues

### Invalid Credentials Error

**Problem:**

```json
{
  "success": false,
  "error": "AUTHENTICATION_FAILED",
  "message": "Invalid credentials",
  "correlationId": "req_123456789"
}
```

**Possible Causes:**

- Incorrect email or password
- Account locked due to failed attempts
- Account disabled or deleted
- Case sensitivity in email address

**Solutions:**

1. Verify email and password are correct
2. Check if account is locked: `GET /api/v1/users/{userId}`
3. Reset password if forgotten: `POST /api/v1/auth/password/reset`
4. Contact administrator if account is disabled

**Example Fix:**

```bash
# Check account status
curl -X GET "https://api.example.com/api/v1/users/search?query=user@example.com" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Reset password
curl -X POST "https://api.example.com/api/v1/auth/password/reset" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### Account Locked Error

**Problem:**

```json
{
  "success": false,
  "error": "ACCOUNT_LOCKED",
  "message": "Account is temporarily locked",
  "details": {
    "lockedUntil": "2024-01-01T01:00:00.000Z",
    "reason": "Too many failed login attempts"
  }
}
```

**Solutions:**

1. Wait for the lockout period to expire
2. Admin can unlock the account manually
3. Implement exponential backoff in your client

**Example Fix:**

```bash
# Admin unlock account
curl -X POST "https://api.example.com/api/v1/users/{userId}/unlock" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### MFA Required Error

**Problem:**

```json
{
  "success": true,
  "data": {
    "requiresMFA": true,
    "mfaChallenge": {
      "challengeId": "mfa_123456789",
      "type": "totp",
      "expiresAt": "2024-01-01T00:05:00.000Z"
    }
  }
}
```

**Solutions:**

1. Prompt user for MFA code
2. Complete MFA challenge with the provided challenge ID
3. Handle different MFA types (TOTP, SMS, email)

**Example Fix:**

```javascript
// Handle MFA challenge
if (loginResponse.data.requiresMFA) {
  const mfaCode = prompt('Enter MFA code:');
  const mfaResponse = await client.handleMFAChallenge(
    loginResponse.data.mfaChallenge.challengeId,
    mfaCode,
    loginResponse.data.mfaChallenge.type
  );
}
```

## Token Management

### Token Expired Error

**Problem:**

```json
{
  "success": false,
  "error": "TOKEN_EXPIRED",
  "message": "Access token has expired",
  "correlationId": "req_123456789"
}
```

**Solutions:**

1. Use refresh token to get new access token
2. Implement automatic token refresh
3. Handle token expiration gracefully

**Example Fix:**

```javascript
class AuthClient {
  async request(method, endpoint, data) {
    try {
      return await this.makeRequest(method, endpoint, data);
    } catch (error) {
      if (error.error === 'TOKEN_EXPIRED') {
        await this.refreshToken();
        return await this.makeRequest(method, endpoint, data);
      }
      throw error;
    }
  }

  async refreshToken() {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: this.refreshToken,
        deviceInfo: this.getDeviceInfo(),
      }),
    });

    const data = await response.json();
    if (data.success) {
      this.accessToken = data.data.tokens.accessToken;
      this.refreshToken = data.data.tokens.refreshToken;
    }
  }
}
```

### Invalid Refresh Token

**Problem:**

```json
{
  "success": false,
  "error": "INVALID_REFRESH_TOKEN",
  "message": "Refresh token is invalid or expired"
}
```

**Solutions:**

1. Redirect user to login page
2. Clear stored tokens
3. Implement proper token storage with expiration

**Example Fix:**

```javascript
try {
  await client.refreshToken();
} catch (error) {
  if (error.error === 'INVALID_REFRESH_TOKEN') {
    // Clear tokens and redirect to login
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }
}
```

## OAuth Integration

### OAuth Provider Error

**Problem:**

```json
{
  "success": false,
  "error": "OAUTH_PROVIDER_ERROR",
  "message": "Provider returned an error",
  "details": {
    "provider": "google",
    "error": "invalid_grant",
    "error_description": "Authorization code has expired"
  }
}
```

**Solutions:**

1. Check OAuth provider configuration
2. Verify redirect URIs match exactly
3. Ensure authorization code is used immediately
4. Check provider-specific requirements

**Common OAuth Provider Issues:**

#### Google OAuth

- Ensure redirect URI is exactly registered
- Check if Google+ API is enabled
- Verify client ID and secret

#### GitHub OAuth

- Check OAuth App settings
- Verify callback URL configuration
- Ensure proper scopes are requested

#### Microsoft OAuth

- Verify Azure AD app registration
- Check redirect URI configuration
- Ensure proper permissions are granted

### Invalid State Parameter

**Problem:**

```json
{
  "success": false,
  "error": "INVALID_STATE",
  "message": "State parameter mismatch"
}
```

**Solutions:**

1. Ensure state parameter is properly stored and retrieved
2. Check for CSRF protection implementation
3. Verify state parameter encoding/decoding

**Example Fix:**

```javascript
// Store state parameter
const state = generateRandomString();
sessionStorage.setItem('oauth_state', state);

// Verify state parameter in callback
const storedState = sessionStorage.getItem('oauth_state');
if (callbackState !== storedState) {
  throw new Error('Invalid state parameter');
}
sessionStorage.removeItem('oauth_state');
```

## Multi-Factor Authentication

### TOTP Code Invalid

**Problem:**

```json
{
  "success": false,
  "error": "INVALID_MFA_CODE",
  "message": "MFA code is invalid or expired"
}
```

**Solutions:**

1. Check device time synchronization
2. Verify TOTP secret is correctly stored
3. Account for time drift (±30 seconds)
4. Use backup codes if available

**Example Fix:**

```javascript
// Account for time drift
const codes = [
  generateTOTP(secret, Math.floor(Date.now() / 30000) - 1), // Previous
  generateTOTP(secret, Math.floor(Date.now() / 30000)), // Current
  generateTOTP(secret, Math.floor(Date.now() / 30000) + 1), // Next
];

for (const code of codes) {
  try {
    await client.verifyMFA(code, 'totp');
    break;
  } catch (error) {
    continue;
  }
}
```

### SMS MFA Not Received

**Problem:** SMS codes are not being delivered

**Solutions:**

1. Check phone number format (international format)
2. Verify SMS provider configuration
3. Check for carrier blocking
4. Use alternative MFA method

**Example Fix:**

```javascript
// Ensure proper phone number format
const phoneNumber = '+1234567890'; // Include country code

// Retry with different MFA method
try {
  await client.setupMFA('sms', phoneNumber);
} catch (error) {
  // Fallback to email MFA
  await client.setupMFA('email');
}
```

## Rate Limiting

### Rate Limit Exceeded

**Problem:**

```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetTime": "2024-01-01T01:00:00.000Z"
  }
}
```

**Solutions:**

1. Implement exponential backoff
2. Cache responses when possible
3. Optimize request frequency
4. Use batch operations for bulk data

**Example Fix:**

```javascript
class RateLimitHandler {
  async makeRequest(requestFn, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (error.error === 'RATE_LIMIT_EXCEEDED') {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

## Network and Connectivity

### Connection Timeout

**Problem:** Requests timeout or fail to connect

**Solutions:**

1. Check network connectivity
2. Verify API endpoint URL
3. Check firewall settings
4. Increase timeout values
5. Implement retry logic

**Example Fix:**

```javascript
const client = axios.create({
  timeout: 30000, // 30 seconds
  retry: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000; // 1s, 2s, 3s
  },
});

client.interceptors.response.use(null, (error) => {
  if (error.code === 'ECONNABORTED') {
    console.log('Request timeout, retrying...');
    return client.request(error.config);
  }
  return Promise.reject(error);
});
```

### SSL/TLS Certificate Issues

**Problem:** SSL certificate verification fails

**Solutions:**

1. Ensure valid SSL certificate
2. Update certificate store
3. Check certificate chain
4. For development only: disable SSL verification

**Example Fix:**

```javascript
// For development only - DO NOT use in production
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

// Better solution: Update certificate store or use proper certificates
const https = require('https');
const agent = new https.Agent({
  ca: fs.readFileSync('path/to/ca-certificate.pem'),
});
```

## Data Validation

### Validation Error

**Problem:**

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_format"
    }
  ]
}
```

**Solutions:**

1. Validate data on client side before sending
2. Check required fields
3. Verify data formats and constraints
4. Handle validation errors gracefully

**Example Fix:**

```javascript
function validateLoginData(email, password) {
  const errors = [];

  if (!email || !email.includes('@')) {
    errors.push({ field: 'email', message: 'Valid email required' });
  }

  if (!password || password.length < 8) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters',
    });
  }

  return errors;
}

// Use validation before API call
const errors = validateLoginData(email, password);
if (errors.length > 0) {
  displayErrors(errors);
  return;
}
```

## Performance Issues

### Slow Response Times

**Problem:** API responses are slower than expected

**Solutions:**

1. Check network latency
2. Optimize request payload size
3. Use appropriate HTTP methods
4. Implement caching
5. Use pagination for large datasets

**Example Fix:**

```javascript
// Use pagination for large datasets
async function getAllUsers() {
  const users = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await client.getUsers({ limit, offset });
    users.push(...response.data);

    if (response.data.length < limit) break;
    offset += limit;
  }

  return users;
}

// Implement caching
const cache = new Map();
async function getCachedUser(userId) {
  if (cache.has(userId)) {
    return cache.get(userId);
  }

  const user = await client.getUser(userId);
  cache.set(userId, user);
  setTimeout(() => cache.delete(userId), 300000); // 5 min TTL

  return user;
}
```

### Memory Leaks

**Problem:** Application memory usage increases over time

**Solutions:**

1. Properly clean up event listeners
2. Clear intervals and timeouts
3. Remove unused references
4. Monitor memory usage

**Example Fix:**

```javascript
class AuthClient {
  constructor() {
    this.tokenRefreshInterval = null;
    this.eventListeners = [];
  }

  startTokenRefresh() {
    this.tokenRefreshInterval = setInterval(() => {
      this.refreshToken();
    }, 3300000); // 55 minutes
  }

  destroy() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }

    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }
}
```

## Security Concerns

### CORS Issues

**Problem:**

```
Access to fetch at 'https://api.example.com' from origin 'https://myapp.com'
has been blocked by CORS policy
```

**Solutions:**

1. Configure CORS on the API server
2. Use proper origin headers
3. Handle preflight requests
4. Use server-side proxy if needed

**Example Fix:**

```javascript
// Server-side CORS configuration (if you control the API)
app.use(
  cors({
    origin: ['https://myapp.com', 'https://staging.myapp.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Client-side proxy configuration (Next.js example)
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.example.com/api/:path*',
      },
    ];
  },
};
```

### XSS Prevention

**Problem:** Potential XSS vulnerabilities in token handling

**Solutions:**

1. Use httpOnly cookies for tokens
2. Sanitize user input
3. Implement Content Security Policy
4. Avoid storing tokens in localStorage

**Example Fix:**

```javascript
// Use httpOnly cookies instead of localStorage
function setTokenCookie(token) {
  document.cookie = `accessToken=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`;
}

// Sanitize user input
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

// Content Security Policy header
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

## Development Environment

### Environment Configuration

**Problem:** Different behavior between development and production

**Solutions:**

1. Use environment-specific configuration
2. Implement proper logging
3. Use feature flags
4. Test in staging environment

**Example Fix:**

```javascript
const config = {
  development: {
    apiUrl: 'http://localhost:3000',
    logLevel: 'debug',
    enableMocks: true,
  },
  staging: {
    apiUrl: 'https://staging-api.example.com',
    logLevel: 'info',
    enableMocks: false,
  },
  production: {
    apiUrl: 'https://api.example.com',
    logLevel: 'error',
    enableMocks: false,
  },
};

const env = process.env.NODE_ENV || 'development';
const currentConfig = config[env];
```

### Testing Issues

**Problem:** Tests failing due to authentication requirements

**Solutions:**

1. Use test-specific authentication
2. Mock API responses
3. Create test fixtures
4. Use test databases

**Example Fix:**

```javascript
// Jest test with mocked API
jest.mock('../api/client');

describe('Authentication', () => {
  beforeEach(() => {
    // Mock successful login
    client.login.mockResolvedValue({
      success: true,
      data: {
        user: { id: 'test-user', email: 'test@example.com' },
        tokens: { accessToken: 'test-token' },
      },
    });
  });

  test('should login successfully', async () => {
    const result = await login('test@example.com', 'password');
    expect(result.success).toBe(true);
    expect(client.login).toHaveBeenCalledWith('test@example.com', 'password');
  });
});
```

## Getting Help

If you're still experiencing issues after trying these solutions:

1. **Check the API Status**: Visit [https://status.example.com](https://status.example.com)
2. **Review Documentation**: [https://docs.example.com](https://docs.example.com)
3. **Search GitHub Issues**: [https://github.com/example/enterprise-auth/issues](https://github.com/example/enterprise-auth/issues)
4. **Contact Support**: api-support@example.com
5. **Join Community**: [Discord](https://discord.gg/example) or [Slack](https://example.slack.com)

### When Reporting Issues

Please include:

- API endpoint and HTTP method
- Request payload (remove sensitive data)
- Response body and status code
- Correlation ID from error response
- Client library and version
- Environment details (browser, Node.js version, etc.)

### Example Issue Report

````
**Issue**: Login fails with 500 error

**Endpoint**: POST /api/v1/auth/login

**Request**:
```json
{
  "email": "user@example.com",
  "password": "[REDACTED]",
  "deviceInfo": { ... }
}
````

**Response**:

```json
{
  "success": false,
  "error": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred",
  "correlationId": "req_abc123def456"
}
```

**Environment**:

- Client: JavaScript SDK v1.0.0
- Browser: Chrome 120.0.0.0
- OS: Windows 11

**Steps to Reproduce**:

1. Initialize client with base URL
2. Call login method with valid credentials
3. Error occurs consistently

```

This format helps our support team quickly identify and resolve issues.
```
