# Quick Start Guide

Get started with the Enterprise Authentication API in just 5 minutes.

## Prerequisites

- Node.js 18+ or any HTTP client
- Basic understanding of REST APIs and JWT tokens
- API endpoint: `https://api.example.com` (replace with your actual endpoint)

## Step 1: Create a User Account

First, let's create a user account using the API:

```bash
curl -X POST https://api.example.com/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "usr_clp123456789",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "mfaEnabled": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "User created successfully"
}
```

## Step 2: Authenticate the User

Now let's authenticate the user to get access tokens:

```bash
curl -X POST https://api.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "deviceInfo": {
      "fingerprint": "fp_unique_device_id",
      "userAgent": "curl/7.68.0",
      "platform": "Linux",
      "browser": "curl"
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_clp123456789",
      "email": "user@example.com",
      "name": "John Doe",
      "emailVerified": false,
      "mfaEnabled": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "rt_clp123456789abcdef",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    },
    "session": {
      "id": "ses_clp123456789",
      "expiresAt": "2024-01-01T01:00:00.000Z"
    },
    "requiresMFA": false,
    "riskScore": 25
  },
  "message": "Login successful"
}
```

## Step 3: Make Authenticated Requests

Use the access token to make authenticated requests:

```bash
curl -X GET https://api.example.com/api/v1/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_clp123456789",
      "email": "user@example.com",
      "name": "John Doe",
      "emailVerified": false,
      "mfaEnabled": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastLoginAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

## Step 4: Refresh Tokens

When the access token expires, use the refresh token to get new tokens:

```bash
curl -X POST https://api.example.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "rt_clp123456789abcdef",
    "deviceInfo": {
      "fingerprint": "fp_unique_device_id",
      "userAgent": "curl/7.68.0"
    }
  }'
```

## Step 5: Logout

Finally, logout to terminate the session:

```bash
curl -X POST https://api.example.com/api/v1/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "allSessions": false
  }'
```

## Next Steps

Now that you have the basics working, explore these advanced features:

1. **[OAuth Integration](oauth-integration.md)** - Add social login with Google, GitHub, Microsoft
2. **[Multi-Factor Authentication](mfa-setup.md)** - Enhance security with MFA
3. **[Passwordless Authentication](passwordless-auth.md)** - Implement WebAuthn and magic links
4. **[Webhook Integration](webhook-integration.md)** - Get real-time authentication events
5. **[Role-Based Access Control](rbac-setup.md)** - Implement permissions and roles

## Common Issues

### Invalid Credentials Error

```json
{
  "success": false,
  "error": "AUTHENTICATION_FAILED",
  "message": "Invalid credentials"
}
```

**Solution:** Verify the email and password are correct.

### Token Expired Error

```json
{
  "success": false,
  "error": "TOKEN_EXPIRED",
  "message": "Access token has expired"
}
```

**Solution:** Use the refresh token to get new access tokens.

### Rate Limit Error

```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests"
}
```

**Solution:** Wait before making more requests or implement exponential backoff.

## Support

- **Documentation:** [https://docs.example.com](https://docs.example.com)
- **API Reference:** [https://api.example.com/docs](https://api.example.com/docs)
- **Support Email:** api-support@example.com
- **GitHub Issues:** [https://github.com/example/enterprise-auth/issues](https://github.com/example/enterprise-auth/issues)
