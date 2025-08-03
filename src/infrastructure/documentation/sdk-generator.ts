/**
 * SDK Generator
 * Generates client SDKs for popular programming languages from OpenAPI specification
 */

import { FastifyInstance } from 'fastify';

export interface SDKGeneratorOptions {
  language: 'javascript' | 'python' | 'curl' | 'php' | 'java' | 'csharp';
  packageName?: string;
  version?: string;
  baseUrl?: string;
}

/**
 * Generate SDK code for specified language
 */
export async function generateSDK(
  spec: any,
  options: SDKGeneratorOptions
): Promise<string> {
  switch (options.language) {
    case 'javascript':
      return generateJavaScriptSDK(spec, options);
    case 'python':
      return generatePythonSDK(spec, options);
    case 'curl':
      return generateCurlExamples(spec, options);
    case 'php':
      return generatePHPSDK(spec, options);
    case 'java':
      return generateJavaSDK(spec, options);
    case 'csharp':
      return generateCSharpSDK(spec, options);
    default:
      throw new Error(`Unsupported language: ${options.language}`);
  }
}

/**
 * Generate JavaScript/TypeScript SDK
 */
function generateJavaScriptSDK(
  spec: any,
  options: SDKGeneratorOptions
): string {
  const packageName = options.packageName || 'enterprise-auth-client';
  const version = options.version || '1.0.0';
  const baseUrl = options.baseUrl || 'https://api.example.com';

  return `/**
 * ${spec.info?.title || 'Enterprise Authentication API'} - JavaScript SDK
 * Generated on ${new Date().toISOString()}
 * Version: ${version}
 */

class EnterpriseAuthClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '${baseUrl}';
    this.apiVersion = options.apiVersion || 'v1';
    this.accessToken = options.accessToken || null;
    this.refreshToken = options.refreshToken || null;
    this.onTokenRefresh = options.onTokenRefresh || null;
  }

  // Set authentication tokens
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  // Make authenticated request
  async request(method, endpoint, data = null, options = {}) {
    const url = \`\${this.baseUrl}/api/\${this.apiVersion}\${endpoint}\`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken && !options.skipAuth) {
      headers.Authorization = \`Bearer \${this.accessToken}\`;
    }

    const config = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      const result = await response.json();

      if (!response.ok) {
        // Handle token expiration
        if (response.status === 401 && result.error === 'TOKEN_EXPIRED' && this.refreshToken) {
          await this.refreshAccessToken();
          // Retry the request with new token
          headers.Authorization = \`Bearer \${this.accessToken}\`;
          const retryResponse = await fetch(url, { ...config, headers });
          return await retryResponse.json();
        }

        throw new Error(\`API Error: \${result.message || response.statusText}\`);
      }

      return result;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to API');
      }
      throw error;
    }
  }

  // Authentication methods
  async login(email, password, deviceInfo, rememberMe = false) {
    const response = await this.request('POST', '/auth/login', {
      email,
      password,
      deviceInfo,
      rememberMe,
    }, { skipAuth: true });

    if (response.success) {
      this.setTokens(
        response.data.tokens.accessToken,
        response.data.tokens.refreshToken
      );

      if (this.onTokenRefresh) {
        this.onTokenRefresh(response.data.tokens);
      }
    }

    return response;
  }

  async logout(allSessions = false) {
    return await this.request('POST', '/auth/logout', { allSessions });
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await this.request('POST', '/auth/refresh', {
      refreshToken: this.refreshToken,
      deviceInfo: this.getDeviceInfo(),
    }, { skipAuth: true });

    if (response.success) {
      this.setTokens(
        response.data.tokens.accessToken,
        response.data.tokens.refreshToken
      );

      if (this.onTokenRefresh) {
        this.onTokenRefresh(response.data.tokens);
      }
    }

    return response;
  }

  async getProfile() {
    return await this.request('GET', '/auth/profile');
  }

  async changePassword(currentPassword, newPassword, confirmPassword) {
    return await this.request('POST', '/auth/password/change', {
      currentPassword,
      newPassword,
      confirmPassword,
    });
  }

  // OAuth methods
  async initiateOAuth(provider, redirectUri, scopes = []) {
    return await this.request('POST', '/oauth/initiate', {
      provider,
      redirectUri,
      scopes,
      deviceInfo: this.getDeviceInfo(),
    }, { skipAuth: true });
  }

  async handleOAuthCallback(provider, code, state) {
    return await this.request('POST', '/oauth/callback', {
      provider,
      code,
      state,
      deviceInfo: this.getDeviceInfo(),
    }, { skipAuth: true });
  }

  async getLinkedAccounts() {
    return await this.request('GET', '/oauth/accounts');
  }

  async linkAccount(provider, code, state) {
    return await this.request('POST', '/oauth/link', {
      provider,
      code,
      state,
    });
  }

  async unlinkAccount(provider) {
    return await this.request('POST', '/oauth/unlink', { provider });
  }

  // MFA methods
  async setupMFA(type, phoneNumber = null) {
    return await this.request('POST', '/auth/mfa/setup', {
      type,
      phoneNumber,
    });
  }

  async verifyMFA(code, type, backupCode = false) {
    return await this.request('POST', '/auth/mfa/verify', {
      code,
      type,
      backupCode,
    });
  }

  async handleMFAChallenge(sessionId, code, type) {
    return await this.request('POST', '/auth/mfa/challenge', {
      sessionId,
      code,
      type,
    }, { skipAuth: true });
  }

  // User management methods (admin)
  async createUser(userData) {
    return await this.request('POST', '/users', userData);
  }

  async getUser(userId, includeRelations = false) {
    return await this.request('GET', \`/users/\${userId}\`, null, {
      headers: includeRelations ? { 'X-Include-Relations': 'true' } : {},
    });
  }

  async updateUser(userId, updates) {
    return await this.request('PUT', \`/users/\${userId}\`, updates);
  }

  async deleteUser(userId) {
    return await this.request('DELETE', \`/users/\${userId}\`);
  }

  async getUsers(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const endpoint = queryString ? \`/users?\${queryString}\` : '/users';
    return await this.request('GET', endpoint);
  }

  async searchUsers(query, limit = 10) {
    return await this.request('GET', \`/users/search?query=\${encodeURIComponent(query)}&limit=\${limit}\`);
  }

  // Role management methods
  async assignRole(userId, roleId) {
    return await this.request('POST', \`/users/\${userId}/roles\`, { roleId });
  }

  async removeRole(userId, roleId) {
    return await this.request('DELETE', \`/users/\${userId}/roles/\${roleId}\`);
  }

  // Utility methods
  getDeviceInfo() {
    if (typeof window === 'undefined') {
      // Node.js environment
      return {
        fingerprint: 'server_' + Math.random().toString(36).substring(7),
        userAgent: 'Node.js SDK',
        platform: process.platform,
        browser: 'Node.js',
      };
    }

    // Browser environment
    return {
      fingerprint: this.generateDeviceFingerprint(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      browser: this.getBrowserName(),
      version: this.getBrowserVersion(),
      mobile: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent),
      screenResolution: \`\${screen.width}x\${screen.height}\`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    };
  }

  generateDeviceFingerprint() {
    // Simple device fingerprinting for demo purposes
    const factors = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
    ];
    
    let hash = 0;
    const str = factors.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return 'fp_' + Math.abs(hash).toString(36);
  }

  getBrowserName() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  getBrowserVersion() {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/(Chrome|Firefox|Safari|Edge)\\/(\\d+)/);
    return match ? match[2] : 'Unknown';
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnterpriseAuthClient;
}

if (typeof window !== 'undefined') {
  window.EnterpriseAuthClient = EnterpriseAuthClient;
}

// Example usage:
/*
const client = new EnterpriseAuthClient({
  baseUrl: '${baseUrl}',
  onTokenRefresh: (tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
  },
});

// Login
try {
  const result = await client.login('user@example.com', 'password', client.getDeviceInfo());
  if (result.success) {
    console.log('Login successful:', result.data.user);
  }
} catch (error) {
  console.error('Login failed:', error.message);
}

// Get user profile
try {
  const profile = await client.getProfile();
  console.log('User profile:', profile.data.user);
} catch (error) {
  console.error('Failed to get profile:', error.message);
}
*/`;
}

/**
 * Generate Python SDK
 */
function generatePythonSDK(spec: any, options: SDKGeneratorOptions): string {
  const packageName = options.packageName || 'enterprise_auth_client';
  const version = options.version || '1.0.0';
  const baseUrl = options.baseUrl || 'https://api.example.com';

  return `"""
${spec.info?.title || 'Enterprise Authentication API'} - Python SDK
Generated on ${new Date().toISOString()}
Version: ${version}

Installation:
    pip install requests

Usage:
    from enterprise_auth_client import EnterpriseAuthClient
    
    client = EnterpriseAuthClient(base_url='${baseUrl}')
    result = client.login('user@example.com', 'password')
"""

import json
import time
import hashlib
import platform
import requests
from typing import Optional, Dict, Any, List, Callable
from urllib.parse import urlencode


class EnterpriseAuthError(Exception):
    """Base exception for Enterprise Auth API errors"""
    def __init__(self, message: str, error_code: str = None, status_code: int = None):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code


class EnterpriseAuthClient:
    """
    Python client for the Enterprise Authentication API
    
    Args:
        base_url: Base URL of the API (default: ${baseUrl})
        api_version: API version (default: v1)
        access_token: JWT access token
        refresh_token: Refresh token
        on_token_refresh: Callback function called when tokens are refreshed
        timeout: Request timeout in seconds (default: 30)
    """
    
    def __init__(
        self,
        base_url: str = '${baseUrl}',
        api_version: str = 'v1',
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        on_token_refresh: Optional[Callable[[Dict[str, Any]], None]] = None,
        timeout: int = 30
    ):
        self.base_url = base_url.rstrip('/')
        self.api_version = api_version
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.on_token_refresh = on_token_refresh
        self.timeout = timeout
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': f'EnterpriseAuthClient-Python/{version}',
        })

    def set_tokens(self, access_token: str, refresh_token: str) -> None:
        """Set authentication tokens"""
        self.access_token = access_token
        self.refresh_token = refresh_token

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        skip_auth: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """Make HTTP request to API"""
        url = f"{self.base_url}/api/{self.api_version}{endpoint}"
        
        headers = kwargs.pop('headers', {})
        if self.access_token and not skip_auth:
            headers['Authorization'] = f'Bearer {self.access_token}'

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data if data else None,
                headers=headers,
                timeout=self.timeout,
                **kwargs
            )
            
            result = response.json()
            
            if not response.ok:
                # Handle token expiration
                if (response.status_code == 401 and 
                    result.get('error') == 'TOKEN_EXPIRED' and 
                    self.refresh_token):
                    self.refresh_access_token()
                    # Retry with new token
                    headers['Authorization'] = f'Bearer {self.access_token}'
                    response = self.session.request(
                        method=method,
                        url=url,
                        json=data if data else None,
                        headers=headers,
                        timeout=self.timeout,
                        **kwargs
                    )
                    result = response.json()
                    
                    if not response.ok:
                        raise EnterpriseAuthError(
                            result.get('message', response.reason),
                            result.get('error'),
                            response.status_code
                        )
                else:
                    raise EnterpriseAuthError(
                        result.get('message', response.reason),
                        result.get('error'),
                        response.status_code
                    )
            
            return result
            
        except requests.exceptions.RequestException as e:
            raise EnterpriseAuthError(f"Network error: {str(e)}")

    # Authentication methods
    def login(
        self,
        email: str,
        password: str,
        device_info: Optional[Dict[str, Any]] = None,
        remember_me: bool = False
    ) -> Dict[str, Any]:
        """
        Authenticate user with email and password
        
        Args:
            email: User email address
            password: User password
            device_info: Device information (auto-generated if not provided)
            remember_me: Extended session duration
            
        Returns:
            Login response with user data and tokens
        """
        if device_info is None:
            device_info = self.get_device_info()
            
        response = self._request('POST', '/auth/login', {
            'email': email,
            'password': password,
            'deviceInfo': device_info,
            'rememberMe': remember_me,
        }, skip_auth=True)
        
        if response.get('success') and 'tokens' in response.get('data', {}):
            tokens = response['data']['tokens']
            self.set_tokens(tokens['accessToken'], tokens['refreshToken'])
            
            if self.on_token_refresh:
                self.on_token_refresh(tokens)
        
        return response

    def logout(self, all_sessions: bool = False) -> Dict[str, Any]:
        """
        Logout user and terminate session(s)
        
        Args:
            all_sessions: Terminate all user sessions
            
        Returns:
            Logout response
        """
        return self._request('POST', '/auth/logout', {
            'allSessions': all_sessions
        })

    def refresh_access_token(self) -> Dict[str, Any]:
        """
        Refresh access token using refresh token
        
        Returns:
            Token refresh response
        """
        if not self.refresh_token:
            raise EnterpriseAuthError('No refresh token available')
            
        response = self._request('POST', '/auth/refresh', {
            'refreshToken': self.refresh_token,
            'deviceInfo': self.get_device_info(),
        }, skip_auth=True)
        
        if response.get('success') and 'tokens' in response.get('data', {}):
            tokens = response['data']['tokens']
            self.set_tokens(tokens['accessToken'], tokens['refreshToken'])
            
            if self.on_token_refresh:
                self.on_token_refresh(tokens)
        
        return response

    def get_profile(self) -> Dict[str, Any]:
        """Get current user profile"""
        return self._request('GET', '/auth/profile')

    def change_password(
        self,
        current_password: str,
        new_password: str,
        confirm_password: str
    ) -> Dict[str, Any]:
        """
        Change user password
        
        Args:
            current_password: Current password
            new_password: New password
            confirm_password: Password confirmation
            
        Returns:
            Password change response
        """
        return self._request('POST', '/auth/password/change', {
            'currentPassword': current_password,
            'newPassword': new_password,
            'confirmPassword': confirm_password,
        })

    # OAuth methods
    def initiate_oauth(
        self,
        provider: str,
        redirect_uri: str,
        scopes: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Initiate OAuth authentication flow
        
        Args:
            provider: OAuth provider (google, github, microsoft)
            redirect_uri: Callback URL
            scopes: Requested scopes
            
        Returns:
            OAuth initiation response with authorization URL
        """
        return self._request('POST', '/oauth/initiate', {
            'provider': provider,
            'redirectUri': redirect_uri,
            'scopes': scopes or [],
            'deviceInfo': self.get_device_info(),
        }, skip_auth=True)

    def handle_oauth_callback(
        self,
        provider: str,
        code: str,
        state: str
    ) -> Dict[str, Any]:
        """
        Handle OAuth callback
        
        Args:
            provider: OAuth provider
            code: Authorization code
            state: State parameter
            
        Returns:
            OAuth callback response with user data and tokens
        """
        response = self._request('POST', '/oauth/callback', {
            'provider': provider,
            'code': code,
            'state': state,
            'deviceInfo': self.get_device_info(),
        }, skip_auth=True)
        
        if response.get('success') and 'tokens' in response.get('data', {}):
            tokens = response['data']['tokens']
            self.set_tokens(tokens['accessToken'], tokens['refreshToken'])
            
            if self.on_token_refresh:
                self.on_token_refresh(tokens)
        
        return response

    def get_linked_accounts(self) -> Dict[str, Any]:
        """Get all linked OAuth accounts"""
        return self._request('GET', '/oauth/accounts')

    def link_account(self, provider: str, code: str, state: str) -> Dict[str, Any]:
        """
        Link OAuth account to current user
        
        Args:
            provider: OAuth provider
            code: Authorization code
            state: State parameter
            
        Returns:
            Account linking response
        """
        return self._request('POST', '/oauth/link', {
            'provider': provider,
            'code': code,
            'state': state,
        })

    def unlink_account(self, provider: str) -> Dict[str, Any]:
        """
        Unlink OAuth account
        
        Args:
            provider: OAuth provider to unlink
            
        Returns:
            Account unlinking response
        """
        return self._request('POST', '/oauth/unlink', {
            'provider': provider
        })

    # MFA methods
    def setup_mfa(self, mfa_type: str, phone_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Setup multi-factor authentication
        
        Args:
            mfa_type: MFA type (totp, sms, email)
            phone_number: Phone number for SMS MFA
            
        Returns:
            MFA setup response
        """
        data = {'type': mfa_type}
        if phone_number:
            data['phoneNumber'] = phone_number
            
        return self._request('POST', '/auth/mfa/setup', data)

    def verify_mfa(
        self,
        code: str,
        mfa_type: str,
        backup_code: bool = False
    ) -> Dict[str, Any]:
        """
        Verify MFA code
        
        Args:
            code: MFA verification code
            mfa_type: MFA type
            backup_code: Whether this is a backup code
            
        Returns:
            MFA verification response
        """
        return self._request('POST', '/auth/mfa/verify', {
            'code': code,
            'type': mfa_type,
            'backupCode': backup_code,
        })

    def handle_mfa_challenge(
        self,
        session_id: str,
        code: str,
        mfa_type: str
    ) -> Dict[str, Any]:
        """
        Complete MFA challenge during login
        
        Args:
            session_id: MFA challenge session ID
            code: MFA verification code
            mfa_type: MFA type
            
        Returns:
            MFA challenge response with tokens
        """
        response = self._request('POST', '/auth/mfa/challenge', {
            'sessionId': session_id,
            'code': code,
            'type': mfa_type,
        }, skip_auth=True)
        
        if response.get('success') and 'tokens' in response.get('data', {}):
            tokens = response['data']['tokens']
            self.set_tokens(tokens['accessToken'], tokens['refreshToken'])
            
            if self.on_token_refresh:
                self.on_token_refresh(tokens)
        
        return response

    # User management methods
    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new user (admin only)"""
        return self._request('POST', '/users', user_data)

    def get_user(self, user_id: str, include_relations: bool = False) -> Dict[str, Any]:
        """Get user by ID"""
        headers = {}
        if include_relations:
            headers['X-Include-Relations'] = 'true'
        return self._request('GET', f'/users/{user_id}', headers=headers)

    def update_user(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update user"""
        return self._request('PUT', f'/users/{user_id}', updates)

    def delete_user(self, user_id: str) -> Dict[str, Any]:
        """Delete user"""
        return self._request('DELETE', f'/users/{user_id}')

    def get_users(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Get users with optional filters"""
        endpoint = '/users'
        if filters:
            query_string = urlencode(filters, doseq=True)
            endpoint = f'/users?{query_string}'
        return self._request('GET', endpoint)

    def search_users(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search users"""
        return self._request('GET', f'/users/search?query={query}&limit={limit}')

    # Role management methods
    def assign_role(self, user_id: str, role_id: str) -> Dict[str, Any]:
        """Assign role to user"""
        return self._request('POST', f'/users/{user_id}/roles', {'roleId': role_id})

    def remove_role(self, user_id: str, role_id: str) -> Dict[str, Any]:
        """Remove role from user"""
        return self._request('DELETE', f'/users/{user_id}/roles/{role_id}')

    # Utility methods
    def get_device_info(self) -> Dict[str, Any]:
        """Generate device information"""
        import uuid
        import socket
        
        hostname = socket.gethostname()
        fingerprint = hashlib.sha256(
            f"{platform.system()}{platform.node()}{platform.processor()}".encode()
        ).hexdigest()[:16]
        
        return {
            'fingerprint': f'fp_{fingerprint}',
            'userAgent': f'Python/{platform.python_version()} ({platform.system()})',
            'platform': platform.system(),
            'browser': 'Python SDK',
            'version': version,
            'mobile': False,
        }


# Example usage
if __name__ == '__main__':
    # Initialize client
    client = EnterpriseAuthClient(
        base_url='${baseUrl}',
        on_token_refresh=lambda tokens: print(f"Tokens refreshed: {tokens['accessToken'][:20]}...")
    )
    
    try:
        # Login
        result = client.login('user@example.com', 'password')
        if result['success']:
            print(f"Login successful: {result['data']['user']['email']}")
            
            # Get profile
            profile = client.get_profile()
            print(f"User profile: {profile['data']['user']['name']}")
            
        else:
            print(f"Login failed: {result.get('message')}")
            
    except EnterpriseAuthError as e:
        print(f"API Error: {e} (Code: {e.error_code}, Status: {e.status_code})")
    except Exception as e:
        print(f"Unexpected error: {e}")
`;
}

/**
 * Generate cURL examples
 */
function generateCurlExamples(spec: any, options: SDKGeneratorOptions): string {
  const baseUrl = options.baseUrl || 'https://api.example.com';

  return `# ${spec.info?.title || 'Enterprise Authentication API'} - cURL Examples
# Generated on ${new Date().toISOString()}
# Base URL: ${baseUrl}

# Set base URL and common variables
BASE_URL="${baseUrl}"
API_VERSION="v1"
CONTENT_TYPE="Content-Type: application/json"

# Device info for requests (customize as needed)
DEVICE_INFO='{
  "fingerprint": "fp_curl_example",
  "userAgent": "curl/7.68.0",
  "platform": "Linux",
  "browser": "curl"
}'

echo "=== Enterprise Authentication API - cURL Examples ==="
echo

# 1. User Login
echo "1. User Login"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/login" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "deviceInfo": '"$DEVICE_INFO"',
    "rememberMe": false
  }' | jq '.'

echo
echo "Save the access token from the response for authenticated requests:"
echo 'ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."'
echo 'REFRESH_TOKEN="rt_clp123456789abcdef"'
echo

# 2. Get User Profile (requires authentication)
echo "2. Get User Profile"
curl -X GET "$BASE_URL/api/$API_VERSION/auth/profile" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo

# 3. Refresh Access Token
echo "3. Refresh Access Token"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/refresh" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "refreshToken": "'"$REFRESH_TOKEN"'",
    "deviceInfo": '"$DEVICE_INFO"'
  }' | jq '.'

echo

# 4. Change Password
echo "4. Change Password"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/password/change" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "currentPassword": "SecurePassword123!",
    "newPassword": "NewSecurePassword456!",
    "confirmPassword": "NewSecurePassword456!"
  }' | jq '.'

echo

# 5. Initiate OAuth Flow
echo "5. Initiate OAuth Flow (Google)"
curl -X POST "$BASE_URL/api/$API_VERSION/oauth/initiate" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "provider": "google",
    "redirectUri": "https://yourapp.com/auth/callback",
    "state": "random_state_string_123",
    "scopes": ["openid", "email", "profile"],
    "deviceInfo": '"$DEVICE_INFO"'
  }' | jq '.'

echo

# 6. Handle OAuth Callback
echo "6. Handle OAuth Callback"
curl -X POST "$BASE_URL/api/$API_VERSION/oauth/callback" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "provider": "google",
    "code": "authorization_code_from_google",
    "state": "random_state_string_123",
    "deviceInfo": '"$DEVICE_INFO"'
  }' | jq '.'

echo

# 7. Get Linked OAuth Accounts
echo "7. Get Linked OAuth Accounts"
curl -X GET "$BASE_URL/api/$API_VERSION/oauth/accounts" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo

# 8. Setup MFA (TOTP)
echo "8. Setup MFA (TOTP)"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/mfa/setup" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "type": "totp"
  }' | jq '.'

echo

# 9. Verify MFA Setup
echo "9. Verify MFA Setup"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/mfa/verify" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "code": "123456",
    "type": "totp",
    "backupCode": false
  }' | jq '.'

echo

# 10. Create User (Admin)
echo "10. Create User (Admin)"
curl -X POST "$BASE_URL/api/$API_VERSION/users" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "email": "newuser@example.com",
    "name": "New User",
    "password": "SecurePassword123!",
    "emailVerified": false,
    "roles": ["user"]
  }' | jq '.'

echo

# 11. Get Users with Filters
echo "11. Get Users with Filters"
curl -X GET "$BASE_URL/api/$API_VERSION/users?search=john&mfaEnabled=true&limit=10&sortBy=createdAt&sortOrder=desc" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo

# 12. Search Users
echo "12. Search Users"
curl -X GET "$BASE_URL/api/$API_VERSION/users/search?query=john&limit=5" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo

# 13. Update User
echo "13. Update User"
curl -X PUT "$BASE_URL/api/$API_VERSION/users/usr_123456789" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "name": "Updated Name",
    "emailVerified": true
  }' | jq '.'

echo

# 14. Assign Role to User
echo "14. Assign Role to User"
curl -X POST "$BASE_URL/api/$API_VERSION/users/usr_123456789/roles" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "roleId": "rol_admin_123"
  }' | jq '.'

echo

# 15. Bulk Create Users
echo "15. Bulk Create Users"
curl -X POST "$BASE_URL/api/$API_VERSION/users/bulk" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "users": [
      {
        "email": "user1@example.com",
        "name": "User One",
        "password": "SecurePassword123!"
      },
      {
        "email": "user2@example.com",
        "name": "User Two",
        "password": "SecurePassword123!"
      }
    ]
  }' | jq '.'

echo

# 16. Export Users
echo "16. Export Users"
curl -X GET "$BASE_URL/api/$API_VERSION/users/export?mfaEnabled=true&createdAfter=2024-01-01T00:00:00Z" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -o users_export.csv

echo

# 17. Lock User Account
echo "17. Lock User Account"
curl -X POST "$BASE_URL/api/$API_VERSION/users/usr_123456789/lock" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "reason": "Suspicious activity detected"
  }' | jq '.'

echo

# 18. Get User Statistics
echo "18. Get User Statistics"
curl -X GET "$BASE_URL/api/$API_VERSION/users/stats" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo

# 19. Health Check
echo "19. Health Check"
curl -X GET "$BASE_URL/health" \\
  -H "$CONTENT_TYPE" | jq '.'

echo

# 20. API Documentation Info
echo "20. API Documentation Info"
curl -X GET "$BASE_URL/docs/info" \\
  -H "$CONTENT_TYPE" | jq '.'

echo

# 21. Logout
echo "21. Logout"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/logout" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "allSessions": false
  }' | jq '.'

echo
echo "=== End of Examples ==="

# Error Handling Examples
echo
echo "=== Error Handling Examples ==="

# Invalid credentials
echo "Example: Invalid Credentials"
curl -X POST "$BASE_URL/api/$API_VERSION/auth/login" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "email": "invalid@example.com",
    "password": "wrongpassword",
    "deviceInfo": '"$DEVICE_INFO"'
  }' | jq '.'

echo

# Expired token
echo "Example: Expired Token"
curl -X GET "$BASE_URL/api/$API_VERSION/auth/profile" \\
  -H "$CONTENT_TYPE" \\
  -H "Authorization: Bearer expired_token_here" | jq '.'

echo

# Rate limiting
echo "Example: Rate Limiting (make multiple rapid requests)"
for i in {1..10}; do
  curl -X POST "$BASE_URL/api/$API_VERSION/auth/login" \\
    -H "$CONTENT_TYPE" \\
    -d '{
      "email": "test@example.com",
      "password": "test",
      "deviceInfo": '"$DEVICE_INFO"'
    }' -w "Request $i: %{http_code}\\n" -o /dev/null -s
done

echo
echo "=== Common HTTP Status Codes ==="
echo "200 - Success"
echo "400 - Bad Request (validation error)"
echo "401 - Unauthorized (authentication required)"
echo "403 - Forbidden (insufficient permissions)"
echo "404 - Not Found"
echo "429 - Too Many Requests (rate limited)"
echo "500 - Internal Server Error"

echo
echo "=== Tips ==="
echo "1. Always include proper Content-Type headers"
echo "2. Store and reuse access tokens for authenticated requests"
echo "3. Handle token expiration by using refresh tokens"
echo "4. Implement proper error handling for all status codes"
echo "5. Use jq for pretty-printing JSON responses"
echo "6. Set up environment variables for sensitive data"
echo "7. Use proper device fingerprinting in production"`;
}

/**
 * Generate PHP SDK
 */
function generatePHPSDK(spec: any, options: SDKGeneratorOptions): string {
  const packageName = options.packageName || 'enterprise-auth-client';
  const version = options.version || '1.0.0';
  const baseUrl = options.baseUrl || 'https://api.example.com';

  return `<?php
/**
 * ${spec.info?.title || 'Enterprise Authentication API'} - PHP SDK
 * Generated on ${new Date().toISOString()}
 * Version: ${version}
 * 
 * Requirements:
 * - PHP 7.4+
 * - cURL extension
 * - JSON extension
 * 
 * Installation:
 * composer require guzzlehttp/guzzle (optional, for better HTTP client)
 * 
 * Usage:
 * $client = new EnterpriseAuthClient('${baseUrl}');
 * $result = $client->login('user@example.com', 'password');
 */

class EnterpriseAuthException extends Exception
{
    private $errorCode;
    private $statusCode;
    
    public function __construct($message, $errorCode = null, $statusCode = null, $previous = null)
    {
        parent::__construct($message, 0, $previous);
        $this->errorCode = $errorCode;
        $this->statusCode = $statusCode;
    }
    
    public function getErrorCode()
    {
        return $this->errorCode;
    }
    
    public function getStatusCode()
    {
        return $this->statusCode;
    }
}

class EnterpriseAuthClient
{
    private $baseUrl;
    private $apiVersion;
    private $accessToken;
    private $refreshToken;
    private $onTokenRefresh;
    private $timeout;
    private $httpClient;
    
    /**
     * Initialize the Enterprise Auth Client
     * 
     * @param string $baseUrl Base URL of the API
     * @param string $apiVersion API version
     * @param string|null $accessToken JWT access token
     * @param string|null $refreshToken Refresh token
     * @param callable|null $onTokenRefresh Callback for token refresh
     * @param int $timeout Request timeout in seconds
     */
    public function __construct(
        $baseUrl = '${baseUrl}',
        $apiVersion = 'v1',
        $accessToken = null,
        $refreshToken = null,
        $onTokenRefresh = null,
        $timeout = 30
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiVersion = $apiVersion;
        $this->accessToken = $accessToken;
        $this->refreshToken = $refreshToken;
        $this->onTokenRefresh = $onTokenRefresh;
        $this->timeout = $timeout;
        
        // Initialize HTTP client (use Guzzle if available, otherwise cURL)
        if (class_exists('GuzzleHttp\\Client')) {
            $this->httpClient = new \\GuzzleHttp\\Client([
                'timeout' => $this->timeout,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'User-Agent' => 'EnterpriseAuthClient-PHP/${version}',
                ],
            ]);
        }
    }
    
    /**
     * Set authentication tokens
     */
    public function setTokens($accessToken, $refreshToken)
    {
        $this->accessToken = $accessToken;
        $this->refreshToken = $refreshToken;
    }
    
    /**
     * Make HTTP request to API
     */
    private function request($method, $endpoint, $data = null, $skipAuth = false, $headers = [])
    {
        $url = $this->baseUrl . '/api/' . $this->apiVersion . $endpoint;
        
        $defaultHeaders = [
            'Content-Type' => 'application/json',
            'User-Agent' => 'EnterpriseAuthClient-PHP/${version}',
        ];
        
        if ($this->accessToken && !$skipAuth) {
            $defaultHeaders['Authorization'] = 'Bearer ' . $this->accessToken;
        }
        
        $headers = array_merge($defaultHeaders, $headers);
        
        try {
            if ($this->httpClient && class_exists('GuzzleHttp\\Client')) {
                // Use Guzzle HTTP client
                $options = [
                    'headers' => $headers,
                ];
                
                if ($data && in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'])) {
                    $options['json'] = $data;
                }
                
                $response = $this->httpClient->request($method, $url, $options);
                $result = json_decode($response->getBody()->getContents(), true);
                $statusCode = $response->getStatusCode();
            } else {
                // Use cURL
                $ch = curl_init();
                curl_setopt_array($ch, [
                    CURLOPT_URL => $url,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => $this->timeout,
                    CURLOPT_CUSTOMREQUEST => strtoupper($method),
                    CURLOPT_HTTPHEADER => $this->formatHeaders($headers),
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_SSL_VERIFYHOST => 2,
                ]);
                
                if ($data && in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'])) {
                    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
                }
                
                $response = curl_exec($ch);
                $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $error = curl_error($ch);
                curl_close($ch);
                
                if ($error) {
                    throw new EnterpriseAuthException('Network error: ' . $error);
                }
                
                $result = json_decode($response, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    throw new EnterpriseAuthException('Invalid JSON response');
                }
            }
            
            if ($statusCode >= 400) {
                // Handle token expiration
                if ($statusCode === 401 && 
                    isset($result['error']) && 
                    $result['error'] === 'TOKEN_EXPIRED' && 
                    $this->refreshToken) {
                    $this->refreshAccessToken();
                    // Retry with new token
                    $headers['Authorization'] = 'Bearer ' . $this->accessToken;
                    return $this->request($method, $endpoint, $data, $skipAuth, $headers);
                }
                
                throw new EnterpriseAuthException(
                    $result['message'] ?? 'API Error',
                    $result['error'] ?? null,
                    $statusCode
                );
            }
            
            return $result;
            
        } catch (Exception $e) {
            if ($e instanceof EnterpriseAuthException) {
                throw $e;
            }
            throw new EnterpriseAuthException('Request failed: ' . $e->getMessage());
        }
    }
    
    /**
     * Format headers for cURL
     */
    private function formatHeaders($headers)
    {
        $formatted = [];
        foreach ($headers as $key => $value) {
            $formatted[] = $key . ': ' . $value;
        }
        return $formatted;
    }
    
    // Authentication methods
    
    /**
     * Authenticate user with email and password
     */
    public function login($email, $password, $deviceInfo = null, $rememberMe = false)
    {
        if ($deviceInfo === null) {
            $deviceInfo = $this->getDeviceInfo();
        }
        
        $response = $this->request('POST', '/auth/login', [
            'email' => $email,
            'password' => $password,
            'deviceInfo' => $deviceInfo,
            'rememberMe' => $rememberMe,
        ], true);
        
        if (isset($response['success']) && $response['success'] && isset($response['data']['tokens'])) {
            $tokens = $response['data']['tokens'];
            $this->setTokens($tokens['accessToken'], $tokens['refreshToken']);
            
            if ($this->onTokenRefresh) {
                call_user_func($this->onTokenRefresh, $tokens);
            }
        }
        
        return $response;
    }
    
    /**
     * Logout user
     */
    public function logout($allSessions = false)
    {
        return $this->request('POST', '/auth/logout', [
            'allSessions' => $allSessions
        ]);
    }
    
    /**
     * Refresh access token
     */
    public function refreshAccessToken()
    {
        if (!$this->refreshToken) {
            throw new EnterpriseAuthException('No refresh token available');
        }
        
        $response = $this->request('POST', '/auth/refresh', [
            'refreshToken' => $this->refreshToken,
            'deviceInfo' => $this->getDeviceInfo(),
        ], true);
        
        if (isset($response['success']) && $response['success'] && isset($response['data']['tokens'])) {
            $tokens = $response['data']['tokens'];
            $this->setTokens($tokens['accessToken'], $tokens['refreshToken']);
            
            if ($this->onTokenRefresh) {
                call_user_func($this->onTokenRefresh, $tokens);
            }
        }
        
        return $response;
    }
    
    /**
     * Get user profile
     */
    public function getProfile()
    {
        return $this->request('GET', '/auth/profile');
    }
    
    /**
     * Change password
     */
    public function changePassword($currentPassword, $newPassword, $confirmPassword)
    {
        return $this->request('POST', '/auth/password/change', [
            'currentPassword' => $currentPassword,
            'newPassword' => $newPassword,
            'confirmPassword' => $confirmPassword,
        ]);
    }
    
    // OAuth methods
    
    /**
     * Initiate OAuth flow
     */
    public function initiateOAuth($provider, $redirectUri, $scopes = [])
    {
        return $this->request('POST', '/oauth/initiate', [
            'provider' => $provider,
            'redirectUri' => $redirectUri,
            'scopes' => $scopes,
            'deviceInfo' => $this->getDeviceInfo(),
        ], true);
    }
    
    /**
     * Handle OAuth callback
     */
    public function handleOAuthCallback($provider, $code, $state)
    {
        $response = $this->request('POST', '/oauth/callback', [
            'provider' => $provider,
            'code' => $code,
            'state' => $state,
            'deviceInfo' => $this->getDeviceInfo(),
        ], true);
        
        if (isset($response['success']) && $response['success'] && isset($response['data']['tokens'])) {
            $tokens = $response['data']['tokens'];
            $this->setTokens($tokens['accessToken'], $tokens['refreshToken']);
            
            if ($this->onTokenRefresh) {
                call_user_func($this->onTokenRefresh, $tokens);
            }
        }
        
        return $response;
    }
    
    /**
     * Get linked OAuth accounts
     */
    public function getLinkedAccounts()
    {
        return $this->request('GET', '/oauth/accounts');
    }
    
    /**
     * Link OAuth account
     */
    public function linkAccount($provider, $code, $state)
    {
        return $this->request('POST', '/oauth/link', [
            'provider' => $provider,
            'code' => $code,
            'state' => $state,
        ]);
    }
    
    /**
     * Unlink OAuth account
     */
    public function unlinkAccount($provider)
    {
        return $this->request('POST', '/oauth/unlink', [
            'provider' => $provider
        ]);
    }
    
    // MFA methods
    
    /**
     * Setup MFA
     */
    public function setupMFA($type, $phoneNumber = null)
    {
        $data = ['type' => $type];
        if ($phoneNumber) {
            $data['phoneNumber'] = $phoneNumber;
        }
        
        return $this->request('POST', '/auth/mfa/setup', $data);
    }
    
    /**
     * Verify MFA
     */
    public function verifyMFA($code, $type, $backupCode = false)
    {
        return $this->request('POST', '/auth/mfa/verify', [
            'code' => $code,
            'type' => $type,
            'backupCode' => $backupCode,
        ]);
    }
    
    /**
     * Handle MFA challenge
     */
    public function handleMFAChallenge($sessionId, $code, $type)
    {
        $response = $this->request('POST', '/auth/mfa/challenge', [
            'sessionId' => $sessionId,
            'code' => $code,
            'type' => $type,
        ], true);
        
        if (isset($response['success']) && $response['success'] && isset($response['data']['tokens'])) {
            $tokens = $response['data']['tokens'];
            $this->setTokens($tokens['accessToken'], $tokens['refreshToken']);
            
            if ($this->onTokenRefresh) {
                call_user_func($this->onTokenRefresh, $tokens);
            }
        }
        
        return $response;
    }
    
    // User management methods
    
    /**
     * Create user
     */
    public function createUser($userData)
    {
        return $this->request('POST', '/users', $userData);
    }
    
    /**
     * Get user by ID
     */
    public function getUser($userId, $includeRelations = false)
    {
        $headers = [];
        if ($includeRelations) {
            $headers['X-Include-Relations'] = 'true';
        }
        return $this->request('GET', '/users/' . $userId, null, false, $headers);
    }
    
    /**
     * Update user
     */
    public function updateUser($userId, $updates)
    {
        return $this->request('PUT', '/users/' . $userId, $updates);
    }
    
    /**
     * Delete user
     */
    public function deleteUser($userId)
    {
        return $this->request('DELETE', '/users/' . $userId);
    }
    
    /**
     * Get users with filters
     */
    public function getUsers($filters = [])
    {
        $endpoint = '/users';
        if (!empty($filters)) {
            $endpoint .= '?' . http_build_query($filters);
        }
        return $this->request('GET', $endpoint);
    }
    
    /**
     * Search users
     */
    public function searchUsers($query, $limit = 10)
    {
        return $this->request('GET', '/users/search?' . http_build_query([
            'query' => $query,
            'limit' => $limit,
        ]));
    }
    
    // Role management methods
    
    /**
     * Assign role to user
     */
    public function assignRole($userId, $roleId)
    {
        return $this->request('POST', '/users/' . $userId . '/roles', [
            'roleId' => $roleId
        ]);
    }
    
    /**
     * Remove role from user
     */
    public function removeRole($userId, $roleId)
    {
        return $this->request('DELETE', '/users/' . $userId . '/roles/' . $roleId);
    }
    
    // Utility methods
    
    /**
     * Generate device information
     */
    public function getDeviceInfo()
    {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'PHP SDK';
        $fingerprint = 'fp_' . substr(md5($userAgent . php_uname()), 0, 16);
        
        return [
            'fingerprint' => $fingerprint,
            'userAgent' => $userAgent,
            'platform' => PHP_OS,
            'browser' => 'PHP SDK',
            'version' => '${version}',
            'mobile' => false,
        ];
    }
}

// Example usage
/*
try {
    // Initialize client
    $client = new EnterpriseAuthClient(
        '${baseUrl}',
        'v1',
        null,
        null,
        function($tokens) {
            // Save tokens to session or database
            $_SESSION['access_token'] = $tokens['accessToken'];
            $_SESSION['refresh_token'] = $tokens['refreshToken'];
        }
    );
    
    // Login
    $result = $client->login('user@example.com', 'password');
    if ($result['success']) {
        echo "Login successful: " . $result['data']['user']['email'] . "\\n";
        
        // Get profile
        $profile = $client->getProfile();
        echo "User profile: " . $profile['data']['user']['name'] . "\\n";
    } else {
        echo "Login failed: " . $result['message'] . "\\n";
    }
    
} catch (EnterpriseAuthException $e) {
    echo "API Error: " . $e->getMessage() . 
         " (Code: " . $e->getErrorCode() . 
         ", Status: " . $e->getStatusCode() . ")\\n";
} catch (Exception $e) {
    echo "Unexpected error: " . $e->getMessage() . "\\n";
}
*/

?>`;
}

/**
 * Generate Java SDK (basic structure)
 */
function generateJavaSDK(spec: any, options: SDKGeneratorOptions): string {
  return `// Java SDK generation would require more complex templating
// This is a basic structure example

/**
 * ${spec.info?.title || 'Enterprise Authentication API'} - Java SDK
 * Generated on ${new Date().toISOString()}
 * Version: ${options.version || '1.0.0'}
 */

// For full Java SDK generation, consider using:
// - OpenAPI Generator: https://openapi-generator.tech/
// - Swagger Codegen: https://swagger.io/tools/swagger-codegen/

// Example Maven dependency:
/*
<dependency>
    <groupId>com.example</groupId>
    <artifactId>enterprise-auth-client</artifactId>
    <version>${options.version || '1.0.0'}</version>
</dependency>
*/

// Example usage:
/*
EnterpriseAuthClient client = new EnterpriseAuthClient("${options.baseUrl || 'https://api.example.com'}");
LoginResponse response = client.login("user@example.com", "password");
*/`;
}

/**
 * Generate C# SDK (basic structure)
 */
function generateCSharpSDK(spec: any, options: SDKGeneratorOptions): string {
  return `// C# SDK generation would require more complex templating
// This is a basic structure example

/**
 * ${spec.info?.title || 'Enterprise Authentication API'} - C# SDK
 * Generated on ${new Date().toISOString()}
 * Version: ${options.version || '1.0.0'}
 */

// For full C# SDK generation, consider using:
// - NSwag: https://github.com/RicoSuter/NSwag
// - OpenAPI Generator: https://openapi-generator.tech/

// Example NuGet package:
/*
Install-Package EnterpriseAuth.Client -Version ${options.version || '1.0.0'}
*/

// Example usage:
/*
var client = new EnterpriseAuthClient("${options.baseUrl || 'https://api.example.com'}");
var response = await client.LoginAsync("user@example.com", "password");
*/`;
}

/**
 * Register SDK generation routes
 */
export async function registerSDKRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // SDK generation endpoints
  fastify.get(
    '/docs/sdk/:language',
    {
      schema: {
        tags: ['Documentation'],
        summary: 'Generate SDK for programming language',
        description:
          'Generate client SDK code for the specified programming language',
        params: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['javascript', 'python', 'curl', 'php', 'java', 'csharp'],
              description: 'Programming language for SDK generation',
            },
          },
          required: ['language'],
        },
        querystring: {
          type: 'object',
          properties: {
            packageName: { type: 'string', description: 'Package/module name' },
            version: { type: 'string', description: 'SDK version' },
            baseUrl: { type: 'string', description: 'API base URL' },
          },
        },
        response: {
          200: {
            type: 'string',
            description: 'Generated SDK code',
          },
        },
      },
    },
    async (request, reply) => {
      const { language } = request.params as { language: string };
      const { packageName, version, baseUrl } = request.query as any;

      const spec = fastify.swagger();
      const options: SDKGeneratorOptions = {
        language: language as any,
        packageName,
        version,
        baseUrl: baseUrl || `${request.protocol}://${request.headers.host}`,
      };

      try {
        const sdkCode = await generateSDK(spec, options);

        // Set appropriate content type and filename
        const contentTypes = {
          javascript: 'application/javascript',
          python: 'text/x-python',
          curl: 'text/plain',
          php: 'application/x-php',
          java: 'text/x-java-source',
          csharp: 'text/x-csharp',
        };

        const extensions = {
          javascript: 'js',
          python: 'py',
          curl: 'sh',
          php: 'php',
          java: 'java',
          csharp: 'cs',
        };

        reply.type(contentTypes[language] || 'text/plain');
        reply.header(
          'Content-Disposition',
          `attachment; filename="enterprise-auth-client.${extensions[language]}"`
        );

        return sdkCode;
      } catch (error) {
        reply.status(400).send({
          success: false,
          error: 'SDK_GENERATION_FAILED',
          message: error.message,
        });
      }
    }
  );
}
