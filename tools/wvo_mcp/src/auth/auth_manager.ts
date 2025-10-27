/**
 * Authentication Manager - High-level interface for managing authentication
 *
 * This module:
 * - Coordinates OAuth flow and token management
 * - Provides simple interface for getting valid tokens
 * - Handles authentication state
 * - Integrates with existing auth_checker
 */

import { EventEmitter } from 'node:events';

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import { GoogleOAuthFlow, type OAuthTokens, type OAuthFlowOptions } from './google_oauth.js';
import { TokenRefresher, type TokenRefresherOptions } from './token_refresher.js';

export interface AuthManagerOptions {
  oauthOptions?: OAuthFlowOptions;
  refresherOptions?: TokenRefresherOptions;
  autoRefresh?: boolean; // Enable automatic token refresh (default: true)
}

export type AuthenticationStatus =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'expired'
  | 'refreshing'
  | 'refresh_failed';

export class AuthenticationManager extends EventEmitter {
  private status: AuthenticationStatus = 'unauthenticated';
  private readonly oauthFlow: GoogleOAuthFlow;
  private readonly tokenRefresher: TokenRefresher;
  private readonly autoRefresh: boolean;

  constructor(
    private readonly workspaceRoot: string,
    options: AuthManagerOptions = {}
  ) {
    super();

    this.oauthFlow = new GoogleOAuthFlow(workspaceRoot);
    this.tokenRefresher = new TokenRefresher(this.oauthFlow, options.refresherOptions);
    this.autoRefresh = options.autoRefresh ?? true;

    // Listen to refresher events
    this.tokenRefresher.on('refresh:success', (data) => {
      logInfo('Token refresh successful');
      this.status = 'authenticated';
      this.emit('auth:refreshed', data);
    });

    this.tokenRefresher.on('refresh:failed', (data) => {
      logWarning('Token refresh failed', data);
      this.status = 'refresh_failed';
      this.emit('auth:refresh_failed', data);
    });

    this.tokenRefresher.on('refresh:exhausted', (data) => {
      logError('Token refresh exhausted all retries', data);
      this.status = 'expired';
      this.emit('auth:expired', data);
    });
  }

  /**
   * Initialize authentication (load saved tokens or start fresh)
   */
  async initialize(): Promise<void> {
    try {
      const savedTokens = await this.oauthFlow.loadTokens();

      if (savedTokens) {
        logInfo('Loaded saved authentication tokens');
        this.status = 'authenticated';

        // Start automatic refresh if enabled
        if (this.autoRefresh && savedTokens.refresh_token) {
          await this.tokenRefresher.start(savedTokens);
        }

        this.emit('auth:loaded', {
          hasRefreshToken: !!savedTokens.refresh_token,
        });
      } else {
        logInfo('No saved tokens found');
        this.status = 'unauthenticated';
      }
    } catch (error) {
      logWarning('Failed to initialize authentication', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.status = 'unauthenticated';
    }
  }

  /**
   * Perform OAuth authentication flow
   */
  async authenticate(options?: OAuthFlowOptions): Promise<OAuthTokens> {
    if (this.status === 'authenticating') {
      throw new Error('Authentication already in progress');
    }

    this.status = 'authenticating';

    try {
      logInfo('Starting OAuth authentication flow');

      const tokens = await this.oauthFlow.authenticate(options);

      this.status = 'authenticated';

      // Start automatic refresh if enabled
      if (this.autoRefresh && tokens.refresh_token) {
        await this.tokenRefresher.start(tokens);
      }

      this.emit('auth:success', {
        hasRefreshToken: !!tokens.refresh_token,
      });

      return tokens;
    } catch (error) {
      this.status = 'unauthenticated';
      const errorMessage = error instanceof Error ? error.message : String(error);

      logError('Authentication failed', { error: errorMessage });

      this.emit('auth:failed', { error: errorMessage });

      throw error;
    }
  }

  /**
   * Get current valid access token
   * Returns null if not authenticated or token is expired
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = this.tokenRefresher.getCurrentTokens();

    if (!tokens) {
      // Try loading from disk
      const savedTokens = await this.oauthFlow.loadTokens();
      if (savedTokens) {
        // Start refresher with loaded tokens
        if (this.autoRefresh && savedTokens.refresh_token) {
          await this.tokenRefresher.start(savedTokens);
        }
        return savedTokens.access_token;
      }
      return null;
    }

    // Check if token is still valid
    if (!this.tokenRefresher.isValid()) {
      logWarning('Access token expired');
      this.status = 'expired';
      return null;
    }

    return tokens.access_token;
  }

  /**
   * Get all current tokens
   */
  async getTokens(): Promise<OAuthTokens | null> {
    const tokens = this.tokenRefresher.getCurrentTokens();

    if (!tokens) {
      return await this.oauthFlow.loadTokens();
    }

    return tokens;
  }

  /**
   * Force token refresh
   */
  async refresh(): Promise<OAuthTokens> {
    this.status = 'refreshing';

    try {
      const tokens = await this.tokenRefresher.forceRefresh();
      this.status = 'authenticated';
      return tokens;
    } catch (error) {
      this.status = 'refresh_failed';
      throw error;
    }
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.status === 'authenticated' && this.tokenRefresher.isValid();
  }

  /**
   * Get current authentication status
   */
  getStatus(): AuthenticationStatus {
    return this.status;
  }

  /**
   * Get detailed status information
   */
  getDetailedStatus(): {
    status: AuthenticationStatus;
    hasTokens: boolean;
    hasRefreshToken: boolean;
    isValid: boolean;
    timeUntilExpiration: number | null;
  } {
    const tokens = this.tokenRefresher.getCurrentTokens();

    return {
      status: this.status,
      hasTokens: !!tokens,
      hasRefreshToken: !!tokens?.refresh_token,
      isValid: this.tokenRefresher.isValid(),
      timeUntilExpiration: this.tokenRefresher.getTimeUntilExpiration(),
    };
  }

  /**
   * Logout (clear tokens and stop refresher)
   */
  async logout(): Promise<void> {
    this.tokenRefresher.stop();
    this.status = 'unauthenticated';

    // Note: We don't delete saved tokens file here to allow re-initialization
    // Users can manually delete state/auth/claude_tokens.json if needed

    logInfo('Logged out');
    this.emit('auth:logout');
  }

  /**
   * Stop all services
   */
  stop(): void {
    this.tokenRefresher.stop();
    this.oauthFlow.cleanup();
  }
}

/**
 * Global authentication manager instance
 * Use this for singleton access across the application
 */
let globalAuthManager: AuthenticationManager | null = null;

export function getAuthManager(workspaceRoot: string): AuthenticationManager {
  if (!globalAuthManager) {
    globalAuthManager = new AuthenticationManager(workspaceRoot);
  }
  return globalAuthManager;
}

export function resetAuthManager(): void {
  if (globalAuthManager) {
    globalAuthManager.stop();
    globalAuthManager = null;
  }
}
