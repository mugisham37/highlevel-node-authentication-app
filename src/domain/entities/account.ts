/**
 * Account Domain Entity
 * Represents OAuth provider account relationships
 */

export interface OAuthTokens {
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  idToken?: string | undefined;
  expiresAt?: number | undefined;
  tokenType?: string | undefined;
  scope?: string | undefined;
}

export interface AccountProps {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  type: 'oauth' | 'oidc';
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  idToken?: string | undefined;
  expiresAt?: number | undefined;
  tokenType?: string | undefined;
  scope?: string | undefined;
  sessionState?: string | undefined;
}

export class Account {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _provider: string;
  private readonly _providerAccountId: string;
  private readonly _type: 'oauth' | 'oidc';
  private _accessToken: string | undefined;
  private _refreshToken: string | undefined;
  private _idToken: string | undefined;
  private _expiresAt: number | undefined;
  private _tokenType: string | undefined;
  private _scope: string | undefined;
  private _sessionState: string | undefined;

  constructor(props: AccountProps) {
    this.validateProps(props);

    this._id = props.id;
    this._userId = props.userId;
    this._provider = props.provider;
    this._providerAccountId = props.providerAccountId;
    this._type = props.type;
    this._accessToken = props.accessToken;
    this._refreshToken = props.refreshToken;
    this._idToken = props.idToken;
    this._expiresAt = props.expiresAt;
    this._tokenType = props.tokenType;
    this._scope = props.scope;
    this._sessionState = props.sessionState;
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get userId(): string {
    return this._userId;
  }
  get provider(): string {
    return this._provider;
  }
  get providerAccountId(): string {
    return this._providerAccountId;
  }
  get type(): 'oauth' | 'oidc' {
    return this._type;
  }
  get accessToken(): string | undefined {
    return this._accessToken;
  }
  get refreshToken(): string | undefined {
    return this._refreshToken;
  }
  get idToken(): string | undefined {
    return this._idToken;
  }
  get expiresAt(): number | undefined {
    return this._expiresAt;
  }
  get tokenType(): string | undefined {
    return this._tokenType;
  }
  get scope(): string | undefined {
    return this._scope;
  }
  get sessionState(): string | undefined {
    return this._sessionState;
  }

  /**
   * Check if the access token is expired
   */
  isTokenExpired(): boolean {
    if (!this._expiresAt) return false;
    return Date.now() / 1000 >= this._expiresAt;
  }

  /**
   * Check if the token expires within the given seconds
   */
  tokenExpiresWithin(seconds: number): boolean {
    if (!this._expiresAt) return false;
    const threshold = Date.now() / 1000 + seconds;
    return this._expiresAt <= threshold;
  }

  /**
   * Check if the account needs token refresh
   */
  needsRefresh(): boolean {
    return (
      this.hasRefreshToken() &&
      (this.isTokenExpired() || this.tokenExpiresWithin(300))
    ); // 5 minutes
  }

  /**
   * Check if the account has a refresh token
   */
  hasRefreshToken(): boolean {
    return !!this._refreshToken;
  }

  /**
   * Check if the account has a valid access token
   */
  hasValidAccessToken(): boolean {
    return !!this._accessToken && !this.isTokenExpired();
  }

  /**
   * Update the OAuth tokens
   */
  updateTokens(tokens: OAuthTokens): void {
    if (tokens.accessToken !== undefined) {
      this._accessToken = tokens.accessToken;
    }

    if (tokens.refreshToken !== undefined) {
      this._refreshToken = tokens.refreshToken;
    }

    if (tokens.idToken !== undefined) {
      this._idToken = tokens.idToken;
    }

    if (tokens.expiresAt !== undefined) {
      this._expiresAt = tokens.expiresAt;
    }

    if (tokens.tokenType !== undefined) {
      this._tokenType = tokens.tokenType;
    }

    if (tokens.scope !== undefined) {
      this._scope = tokens.scope;
    }
  }

  /**
   * Get remaining token lifetime in seconds
   */
  getRemainingTokenTime(): number {
    if (!this._expiresAt) return 0;
    return Math.max(0, this._expiresAt - Math.floor(Date.now() / 1000));
  }

  /**
   * Check if the account has a specific scope
   */
  hasScope(scope: string): boolean {
    if (!this._scope) return false;
    const scopes = this._scope.split(' ');
    return scopes.includes(scope);
  }

  /**
   * Get all scopes as an array
   */
  getScopes(): string[] {
    if (!this._scope) return [];
    return this._scope.split(' ').filter((s) => s.length > 0);
  }

  /**
   * Check if this is a Google account
   */
  isGoogleAccount(): boolean {
    return this._provider.toLowerCase() === 'google';
  }

  /**
   * Check if this is a GitHub account
   */
  isGitHubAccount(): boolean {
    return this._provider.toLowerCase() === 'github';
  }

  /**
   * Check if this is a Microsoft account
   */
  isMicrosoftAccount(): boolean {
    return (
      this._provider.toLowerCase() === 'microsoft' ||
      this._provider.toLowerCase() === 'azure-ad'
    );
  }

  /**
   * Get provider-specific user information from ID token
   */
  getProviderUserInfo(): any {
    if (!this._idToken) return null;

    try {
      // Simple JWT decode (in production, should verify signature)
      const payload = this._idToken.split('.')[1];
      if (!payload) return null;

      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());

      // Return provider-specific fields
      switch (this._provider.toLowerCase()) {
        case 'google':
          return {
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
            emailVerified: decoded.email_verified,
          };
        case 'github':
          return {
            login: decoded.login,
            name: decoded.name,
            email: decoded.email,
            avatarUrl: decoded.avatar_url,
          };
        case 'microsoft':
        case 'azure-ad':
          return {
            email: decoded.email || decoded.preferred_username,
            name: decoded.name,
            givenName: decoded.given_name,
            familyName: decoded.family_name,
          };
        default:
          return decoded;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Revoke the account tokens
   */
  revokeTokens(): void {
    this._accessToken = undefined;
    this._refreshToken = undefined;
    this._idToken = undefined;
    this._expiresAt = undefined;
    this._sessionState = undefined;
  }

  /**
   * Check if the account is active and usable
   */
  isActive(): boolean {
    return this.hasValidAccessToken() || this.hasRefreshToken();
  }

  /**
   * Get account status for monitoring/debugging
   */
  getStatus(): {
    isActive: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isTokenExpired: boolean;
    needsRefresh: boolean;
    remainingTime: number;
    scopes: string[];
  } {
    return {
      isActive: this.isActive(),
      hasAccessToken: !!this._accessToken,
      hasRefreshToken: this.hasRefreshToken(),
      isTokenExpired: this.isTokenExpired(),
      needsRefresh: this.needsRefresh(),
      remainingTime: this.getRemainingTokenTime(),
      scopes: this.getScopes(),
    };
  }

  /**
   * Create a safe representation for logging (without sensitive tokens)
   */
  createAuditSummary(): {
    accountId: string;
    userId: string;
    provider: string;
    providerAccountId: string;
    type: string;
    hasTokens: boolean;
    isActive: boolean;
    scopes: string[];
  } {
    return {
      accountId: this._id,
      userId: this._userId,
      provider: this._provider,
      providerAccountId: this._providerAccountId,
      type: this._type,
      hasTokens: this.hasValidAccessToken(),
      isActive: this.isActive(),
      scopes: this.getScopes(),
    };
  }

  private validateProps(props: AccountProps): void {
    if (!props.id || typeof props.id !== 'string') {
      throw new Error('Account ID must be a non-empty string');
    }

    if (!props.userId || typeof props.userId !== 'string') {
      throw new Error('User ID must be a non-empty string');
    }

    if (!props.provider || typeof props.provider !== 'string') {
      throw new Error('Provider must be a non-empty string');
    }

    if (
      !props.providerAccountId ||
      typeof props.providerAccountId !== 'string'
    ) {
      throw new Error('Provider account ID must be a non-empty string');
    }

    if (!['oauth', 'oidc'].includes(props.type)) {
      throw new Error('Account type must be either "oauth" or "oidc"');
    }

    // Validate provider name
    const validProviders = [
      'google',
      'github',
      'microsoft',
      'azure-ad',
      'facebook',
      'twitter',
      'linkedin',
    ];
    if (!validProviders.includes(props.provider.toLowerCase())) {
      // Allow custom providers but log a warning
      console.warn(`Unknown OAuth provider: ${props.provider}`);
    }

    // Validate token expiration
    if (props.expiresAt !== undefined) {
      if (typeof props.expiresAt !== 'number' || props.expiresAt < 0) {
        throw new Error('Token expiration must be a positive number');
      }
    }

    // Validate token type
    if (props.tokenType !== undefined) {
      if (typeof props.tokenType !== 'string') {
        throw new Error('Token type must be a string');
      }
    }

    // Validate scope
    if (props.scope !== undefined) {
      if (typeof props.scope !== 'string') {
        throw new Error('Scope must be a string');
      }
    }
  }

  equals(other: Account): boolean {
    return this._id === other._id;
  }

  toJSON(): any {
    return {
      id: this._id,
      userId: this._userId,
      provider: this._provider,
      providerAccountId: this._providerAccountId,
      type: this._type,
      expiresAt: this._expiresAt,
      tokenType: this._tokenType,
      scope: this._scope,
      sessionState: this._sessionState,
      // Don't expose actual tokens in JSON
      hasAccessToken: !!this._accessToken,
      hasRefreshToken: !!this._refreshToken,
      hasIdToken: !!this._idToken,
    };
  }
}
