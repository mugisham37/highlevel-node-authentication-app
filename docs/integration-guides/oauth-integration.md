# OAuth2 Integration Guide

Complete guide to integrating OAuth2 providers (Google, GitHub, Microsoft) with the Enterprise Authentication API.

## Overview

The Enterprise Authentication API supports OAuth2/OpenID Connect integration in two modes:

1. **OAuth Client** - Authenticate users with external providers (Google, GitHub, Microsoft)
2. **OAuth Server** - Act as an OAuth provider for other applications

## OAuth Client Integration

### Supported Providers

| Provider  | Scopes                 | User Info            |
| --------- | ---------------------- | -------------------- |
| Google    | `openid email profile` | Email, name, picture |
| GitHub    | `user:email`           | Email, name, avatar  |
| Microsoft | `openid email profile` | Email, name, picture |

### Step 1: Configure OAuth Provider

First, register your application with the OAuth provider:

#### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs: `https://yourapp.com/auth/callback`

#### GitHub OAuth Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App
3. Set Authorization callback URL: `https://yourapp.com/auth/callback`

#### Microsoft OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application in Azure AD
3. Add redirect URI: `https://yourapp.com/auth/callback`
4. Generate client secret

### Step 2: Initiate OAuth Flow

Start the OAuth authentication flow:

```bash
curl -X POST https://api.example.com/api/v1/oauth/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "redirectUri": "https://yourapp.com/auth/callback",
    "state": "random_state_string",
    "scopes": ["openid", "email", "profile"],
    "deviceInfo": {
      "fingerprint": "fp_unique_device_id",
      "userAgent": "Mozilla/5.0...",
      "platform": "Windows",
      "browser": "Chrome"
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://accounts.google.com/oauth/authorize?client_id=...",
    "state": "random_state_string",
    "codeChallenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    "codeChallengeMethod": "S256"
  },
  "message": "OAuth flow initiated"
}
```

### Step 3: Redirect User to Provider

Redirect the user to the `authorizationUrl` from the response. The user will authenticate with the provider and be redirected back to your `redirectUri` with an authorization code.

### Step 4: Handle OAuth Callback

Process the callback from the OAuth provider:

```bash
curl -X POST https://api.example.com/api/v1/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "code": "authorization_code_from_provider",
    "state": "random_state_string",
    "deviceInfo": {
      "fingerprint": "fp_unique_device_id",
      "userAgent": "Mozilla/5.0..."
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
      "email": "user@gmail.com",
      "name": "John Doe",
      "image": "https://lh3.googleusercontent.com/...",
      "emailVerified": true,
      "mfaEnabled": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "rt_clp123456789abcdef",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    },
    "account": {
      "id": "acc_clp123456789",
      "provider": "google",
      "providerAccountId": "1234567890",
      "type": "oauth"
    },
    "isNewUser": false,
    "requiresMFA": false,
    "riskScore": 15
  },
  "message": "OAuth authentication successful"
}
```

## Frontend Integration Examples

### JavaScript/React Example

```javascript
// OAuth login component
import React, { useState } from 'react';

const OAuthLogin = () => {
  const [loading, setLoading] = useState(false);

  const handleOAuthLogin = async (provider) => {
    setLoading(true);

    try {
      // Step 1: Initiate OAuth flow
      const response = await fetch('/api/v1/oauth/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          redirectUri: `${window.location.origin}/auth/callback`,
          state: generateRandomState(),
          deviceInfo: {
            fingerprint: await generateDeviceFingerprint(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            browser: getBrowserName(),
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Step 2: Redirect to provider
        window.location.href = data.data.authorizationUrl;
      }
    } catch (error) {
      console.error('OAuth initiation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oauth-login">
      <button
        onClick={() => handleOAuthLogin('google')}
        disabled={loading}
        className="oauth-button google"
      >
        {loading ? 'Loading...' : 'Continue with Google'}
      </button>

      <button
        onClick={() => handleOAuthLogin('github')}
        disabled={loading}
        className="oauth-button github"
      >
        {loading ? 'Loading...' : 'Continue with GitHub'}
      </button>

      <button
        onClick={() => handleOAuthLogin('microsoft')}
        disabled={loading}
        className="oauth-button microsoft"
      >
        {loading ? 'Loading...' : 'Continue with Microsoft'}
      </button>
    </div>
  );
};

// OAuth callback handler
const OAuthCallback = () => {
  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const provider = urlParams.get('provider') || 'google';

      if (code && state) {
        try {
          const response = await fetch('/api/v1/oauth/callback', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              provider,
              code,
              state,
              deviceInfo: {
                fingerprint: await generateDeviceFingerprint(),
                userAgent: navigator.userAgent,
              },
            }),
          });

          const data = await response.json();

          if (data.success) {
            // Store tokens
            localStorage.setItem('accessToken', data.data.tokens.accessToken);
            localStorage.setItem('refreshToken', data.data.tokens.refreshToken);

            // Redirect to dashboard
            window.location.href = '/dashboard';
          }
        } catch (error) {
          console.error('OAuth callback failed:', error);
        }
      }
    };

    handleCallback();
  }, []);

  return <div>Processing OAuth callback...</div>;
};

// Utility functions
const generateRandomState = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

const generateDeviceFingerprint = async () => {
  // Simple device fingerprinting
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('Device fingerprint', 2, 2);

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join('|');

  // Hash the fingerprint
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'fp_' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const getBrowserName = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
};
```

### Node.js/Express Example

```javascript
const express = require('express');
const axios = require('axios');
const app = express();

// OAuth initiation endpoint
app.post('/auth/oauth/:provider', async (req, res) => {
  const { provider } = req.params;
  const { redirectUri } = req.body;

  try {
    const response = await axios.post(
      'https://api.example.com/api/v1/oauth/initiate',
      {
        provider,
        redirectUri:
          redirectUri || `${req.protocol}://${req.get('host')}/auth/callback`,
        state: generateRandomState(),
        deviceInfo: {
          fingerprint: generateDeviceFingerprint(req),
          userAgent: req.get('User-Agent'),
          platform: 'Server',
          browser: 'Node.js',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'OAUTH_INITIATION_FAILED',
      message: error.message,
    });
  }
});

// OAuth callback endpoint
app.get('/auth/callback', async (req, res) => {
  const { code, state, provider = 'google' } = req.query;

  try {
    const response = await axios.post(
      'https://api.example.com/api/v1/oauth/callback',
      {
        provider,
        code,
        state,
        deviceInfo: {
          fingerprint: generateDeviceFingerprint(req),
          userAgent: req.get('User-Agent'),
        },
      }
    );

    if (response.data.success) {
      // Set secure cookies
      res.cookie('accessToken', response.data.data.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: response.data.data.tokens.expiresIn * 1000,
      });

      res.cookie('refreshToken', response.data.data.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.redirect('/dashboard');
    } else {
      res.redirect('/login?error=oauth_failed');
    }
  } catch (error) {
    res.redirect('/login?error=oauth_error');
  }
});

// Utility functions
const generateRandomState = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

const generateDeviceFingerprint = (req) => {
  const crypto = require('crypto');
  const fingerprint = [
    req.get('User-Agent'),
    req.get('Accept-Language'),
    req.ip,
  ].join('|');

  return (
    'fp_' +
    crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .substring(0, 16)
  );
};
```

## Account Linking

### Link Additional OAuth Accounts

Allow users to link multiple OAuth accounts:

```bash
curl -X POST https://api.example.com/api/v1/oauth/link \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github",
    "code": "authorization_code_from_github",
    "state": "random_state_string"
  }'
```

### Get Linked Accounts

Retrieve all linked OAuth accounts:

```bash
curl -X GET https://api.example.com/api/v1/oauth/accounts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Unlink Account

Remove a linked OAuth account:

```bash
curl -X POST https://api.example.com/api/v1/oauth/unlink \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github"
  }'
```

## OAuth Server Mode

### Acting as OAuth Provider

The API can also act as an OAuth provider for other applications:

#### Authorization Endpoint

```bash
# Redirect user to this URL
https://api.example.com/api/v1/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://yourapp.com/callback&response_type=code&scope=read:profile&state=random_state
```

#### Token Exchange

```bash
curl -X POST https://api.example.com/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "authorization_code",
    "redirect_uri": "https://yourapp.com/callback",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

#### User Info Endpoint

```bash
curl -X GET https://api.example.com/api/v1/oauth/userinfo \
  -H "Authorization: Bearer OAUTH_ACCESS_TOKEN"
```

## Error Handling

### Common OAuth Errors

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

### Error Recovery

```javascript
const handleOAuthError = (error) => {
  switch (error.error) {
    case 'OAUTH_PROVIDER_ERROR':
      // Restart OAuth flow
      window.location.href = '/auth/login';
      break;
    case 'INVALID_STATE':
      // CSRF protection triggered
      alert('Security error. Please try again.');
      break;
    case 'ACCOUNT_LINKING_FAILED':
      // Account already linked to another user
      alert('This account is already linked to another user.');
      break;
    default:
      alert('Authentication failed. Please try again.');
  }
};
```

## Security Best Practices

1. **Always validate state parameter** to prevent CSRF attacks
2. **Use PKCE** for public clients (mobile apps, SPAs)
3. **Store tokens securely** (httpOnly cookies for web apps)
4. **Implement proper error handling** for all OAuth flows
5. **Use HTTPS** for all OAuth redirects and callbacks
6. **Validate redirect URIs** on the server side
7. **Implement rate limiting** for OAuth endpoints

## Testing OAuth Integration

Use the provided Postman collection or test with curl:

```bash
# Test OAuth initiation
curl -X POST https://api.example.com/api/v1/oauth/initiate \
  -H "Content-Type: application/json" \
  -d @oauth-test-payload.json

# Test with different providers
for provider in google github microsoft; do
  echo "Testing $provider..."
  curl -X POST https://api.example.com/api/v1/oauth/initiate \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"$provider\",\"redirectUri\":\"https://example.com/callback\",\"deviceInfo\":{\"fingerprint\":\"test\",\"userAgent\":\"test\"}}"
done
```

## Troubleshooting

### Provider Configuration Issues

- Verify client ID and secret
- Check redirect URI configuration
- Ensure proper scopes are requested

### Token Issues

- Check token expiration
- Verify token format and signature
- Ensure proper token storage

### Network Issues

- Check firewall settings
- Verify SSL/TLS configuration
- Test with different networks

## Next Steps

- [Multi-Factor Authentication Setup](mfa-setup.md)
- [Passwordless Authentication](passwordless-auth.md)
- [Webhook Integration](webhook-integration.md)
- [Enterprise Deployment](enterprise-deployment.md)
