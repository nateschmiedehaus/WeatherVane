/**
 * Token Refresher - Automatically refreshes OAuth tokens before expiration
 *
 * This module:
 * - Monitors token expiration
 * - Proactively refreshes tokens before they expire
 * - Handles refresh failures with retry logic
 * - Emits events for token updates
 */

import { EventEmitter } from 'node:events';
import type { GoogleOAuthFlow, OAuthTokens } from './google_oauth.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface TokenRefresherOptions {
  refreshThresholdSeconds?: number; // Refresh when this many seconds remain (default: 300 = 5 min)
  checkIntervalSeconds?: number; // Check every N seconds (default: 60)
  retryDelaySeconds?: number; // Retry delay on failure (default: 30)
  maxRetries?: number; // Max retry attempts (default: 3)
}

export class TokenRefresher extends EventEmitter {
  private checkTimer: NodeJS.Timeout | null = null;
  private currentTokens: OAuthTokens | null = null;
  private readonly refreshThresholdSeconds: number;
  private readonly checkIntervalSeconds: number;
  private readonly retryDelaySeconds: number;
  private readonly maxRetries: number;
  private retryCount = 0;
  private isRefreshing = false;

  constructor(
    private readonly oauthFlow: GoogleOAuthFlow,
    options: TokenRefresherOptions = {}
  ) {
    super();
    this.refreshThresholdSeconds = options.refreshThresholdSeconds ?? 300; // 5 minutes
    this.checkIntervalSeconds = options.checkIntervalSeconds ?? 60; // 1 minute
    this.retryDelaySeconds = options.retryDelaySeconds ?? 30;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Start monitoring and refreshing tokens
   */
  async start(initialTokens?: OAuthTokens): Promise<void> {
    if (this.checkTimer) {
      logWarning('Token refresher already running');
      return;
    }

    // Load or use provided tokens
    if (initialTokens) {
      this.currentTokens = initialTokens;
    } else {
      this.currentTokens = await this.oauthFlow.loadTokens();
    }

    if (!this.currentTokens) {
      logWarning('No tokens available to refresh');
      return;
    }

    if (!this.currentTokens.refresh_token) {
      logWarning('No refresh token available, cannot auto-refresh');
      return;
    }

    logInfo('Token refresher started', {
      expiresIn: this.currentTokens.expires_in,
      refreshThreshold: this.refreshThresholdSeconds,
      checkInterval: this.checkIntervalSeconds,
    });

    // Start periodic check
    this.scheduleNextCheck();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
      logInfo('Token refresher stopped');
    }
  }

  /**
   * Get current tokens
   */
  getCurrentTokens(): OAuthTokens | null {
    return this.currentTokens;
  }

  /**
   * Check if tokens need refresh and refresh if necessary
   */
  private async checkAndRefresh(): Promise<void> {
    if (this.isRefreshing) {
      logInfo('Refresh already in progress, skipping check');
      return;
    }

    if (!this.currentTokens || !this.currentTokens.refresh_token) {
      logWarning('No tokens or refresh token available');
      this.stop();
      this.emit('refresh:failed', {
        reason: 'no_refresh_token',
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.currentTokens.obtained_at + this.currentTokens.expires_in;
    const secondsUntilExpiry = expiresAt - now;

    logInfo('Token expiry check', {
      secondsUntilExpiry,
      refreshThreshold: this.refreshThresholdSeconds,
      needsRefresh: secondsUntilExpiry <= this.refreshThresholdSeconds,
    });

    // Check if we need to refresh
    if (secondsUntilExpiry <= this.refreshThresholdSeconds) {
      await this.performRefresh();
    } else {
      // Schedule next check
      this.scheduleNextCheck();
    }
  }

  /**
   * Perform token refresh
   */
  private async performRefresh(): Promise<void> {
    if (!this.currentTokens?.refresh_token) {
      return;
    }

    this.isRefreshing = true;

    try {
      logInfo('Refreshing OAuth tokens', {
        retryCount: this.retryCount,
      });

      const newTokens = await this.oauthFlow.refreshTokens(this.currentTokens.refresh_token);

      this.currentTokens = newTokens;
      this.retryCount = 0; // Reset retry count on success
      this.isRefreshing = false;

      logInfo('Tokens refreshed successfully', {
        expiresIn: newTokens.expires_in,
      });

      this.emit('refresh:success', {
        tokens: newTokens,
        expiresIn: newTokens.expires_in,
      });

      // Schedule next check
      this.scheduleNextCheck();
    } catch (error) {
      this.isRefreshing = false;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logError('Failed to refresh tokens', {
        error: errorMessage,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
      });

      this.emit('refresh:failed', {
        error: errorMessage,
        retryCount: this.retryCount,
      });

      // Retry logic
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logInfo('Scheduling token refresh retry', {
          retryCount: this.retryCount,
          delaySeconds: this.retryDelaySeconds,
        });

        this.checkTimer = setTimeout(() => {
          void this.performRefresh();
        }, this.retryDelaySeconds * 1000);
      } else {
        logError('Max retries reached, stopping token refresher');
        this.stop();
        this.emit('refresh:exhausted', {
          error: errorMessage,
          retries: this.retryCount,
        });
      }
    }
  }

  /**
   * Schedule next check
   */
  private scheduleNextCheck(): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }

    this.checkTimer = setTimeout(() => {
      void this.checkAndRefresh();
    }, this.checkIntervalSeconds * 1000);
  }

  /**
   * Force immediate refresh (useful for testing or manual triggers)
   */
  async forceRefresh(): Promise<OAuthTokens> {
    if (!this.currentTokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    if (this.isRefreshing) {
      throw new Error('Refresh already in progress');
    }

    await this.performRefresh();

    if (!this.currentTokens) {
      throw new Error('Refresh failed');
    }

    return this.currentTokens;
  }

  /**
   * Check if tokens are currently valid
   */
  isValid(): boolean {
    if (!this.currentTokens) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.currentTokens.obtained_at + this.currentTokens.expires_in;

    return now < expiresAt;
  }

  /**
   * Get time until expiration in seconds
   */
  getTimeUntilExpiration(): number | null {
    if (!this.currentTokens) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.currentTokens.obtained_at + this.currentTokens.expires_in;

    return Math.max(0, expiresAt - now);
  }
}
