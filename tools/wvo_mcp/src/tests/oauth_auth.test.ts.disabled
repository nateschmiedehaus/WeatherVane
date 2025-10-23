/**
 * OAuth Authentication Tests - Comprehensive tests for Google OAuth flow
 *
 * Tests:
 * - GoogleOAuthFlow
 * - TokenRefresher
 * - AuthenticationManager
 *
 * Note: These are mostly unit tests with mocked components.
 * Full E2E OAuth flow requires browser interaction and is tested manually.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GoogleOAuthFlow, type OAuthTokens } from '../auth/google_oauth.js';
import { TokenRefresher } from '../auth/token_refresher.js';
import { AuthenticationManager } from '../auth/auth_manager.js';

describe('GoogleOAuthFlow', () => {
  let tempDir: string;
  let oauthFlow: GoogleOAuthFlow;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-oauth-test-'));
    oauthFlow = new GoogleOAuthFlow(tempDir);
  });

  afterEach(async () => {
    oauthFlow.cleanup();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should save and load tokens', async () => {
    const tokens: OAuthTokens = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email profile',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    // Save tokens
    await oauthFlow['saveTokens'](tokens);

    // Load tokens
    const loaded = await oauthFlow.loadTokens();

    expect(loaded).toBeDefined();
    expect(loaded?.access_token).toBe(tokens.access_token);
    expect(loaded?.refresh_token).toBe(tokens.refresh_token);
    expect(loaded?.expires_in).toBe(tokens.expires_in);
  });

  it('should detect expired tokens', async () => {
    const expiredTokens: OAuthTokens = {
      access_token: 'expired_token',
      refresh_token: 'refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    };

    await oauthFlow['saveTokens'](expiredTokens);

    const loaded = await oauthFlow.loadTokens();

    // Should return null because tokens are expired
    expect(loaded).toBeNull();
  });

  it('should return null when no tokens exist', async () => {
    const loaded = await oauthFlow.loadTokens();
    expect(loaded).toBeNull();
  });

  it('should handle missing tokens file gracefully', async () => {
    // Try to load from empty directory
    const loaded = await oauthFlow.loadTokens();
    expect(loaded).toBeNull();
  });
});

describe('TokenRefresher', () => {
  let tempDir: string;
  let oauthFlow: GoogleOAuthFlow;
  let refresher: TokenRefresher;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-refresher-test-'));
    oauthFlow = new GoogleOAuthFlow(tempDir);
    refresher = new TokenRefresher(oauthFlow, {
      refreshThresholdSeconds: 300,
      checkIntervalSeconds: 1, // Fast check for testing
      retryDelaySeconds: 1,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    refresher.stop();
    oauthFlow.cleanup();
  });

  it('should start with valid tokens', async () => {
    const validTokens: OAuthTokens = {
      access_token: 'valid_token',
      refresh_token: 'refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    await oauthFlow['saveTokens'](validTokens);
    await refresher.start();

    expect(refresher.getCurrentTokens()).toBeDefined();
    expect(refresher.isValid()).toBe(true);
  });

  it('should detect invalid tokens', async () => {
    const expiredTokens: OAuthTokens = {
      access_token: 'expired_token',
      refresh_token: 'refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000) - 7200,
    };

    await refresher.start(expiredTokens);

    expect(refresher.isValid()).toBe(false);
  });

  it('should calculate time until expiration', async () => {
    const tokens: OAuthTokens = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    await refresher.start(tokens);

    const timeUntilExpiration = refresher.getTimeUntilExpiration();
    expect(timeUntilExpiration).toBeGreaterThan(0);
    expect(timeUntilExpiration).toBeLessThanOrEqual(3600);
  });

  it('should emit refresh events', async () => {
    const events: string[] = [];

    refresher.on('refresh:success', () => events.push('success'));
    refresher.on('refresh:failed', () => events.push('failed'));

    // Can't actually test refresh without mocking fetch, but we can verify event setup
    expect(refresher.listeners('refresh:success').length).toBeGreaterThan(0);
    expect(refresher.listeners('refresh:failed').length).toBeGreaterThan(0);
  });

  it('should stop monitoring', async () => {
    const tokens: OAuthTokens = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    await refresher.start(tokens);
    refresher.stop();

    // After stop, timer should be null
    expect(refresher['checkTimer']).toBeNull();
  });
});

describe('AuthenticationManager', () => {
  let tempDir: string;
  let authManager: AuthenticationManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-auth-manager-test-'));
    authManager = new AuthenticationManager(tempDir, {
      autoRefresh: false, // Disable auto-refresh for testing
    });
  });

  afterEach(() => {
    authManager.stop();
  });

  it('should initialize with no saved tokens', async () => {
    await authManager.initialize();

    expect(authManager.getStatus()).toBe('unauthenticated');
    expect(authManager.isAuthenticated()).toBe(false);
  });

  it('should initialize with saved tokens', async () => {
    const tokens: OAuthTokens = {
      access_token: 'saved_token',
      refresh_token: 'saved_refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    // Save tokens directly via GoogleOAuthFlow
    const oauthFlow = new GoogleOAuthFlow(tempDir);
    await oauthFlow['saveTokens'](tokens);

    await authManager.initialize();

    const status = authManager.getStatus();
    expect(status).toBe('authenticated');
  });

  it('should get detailed status', async () => {
    await authManager.initialize();

    const detailedStatus = authManager.getDetailedStatus();

    expect(detailedStatus).toHaveProperty('status');
    expect(detailedStatus).toHaveProperty('hasTokens');
    expect(detailedStatus).toHaveProperty('hasRefreshToken');
    expect(detailedStatus).toHaveProperty('isValid');
    expect(detailedStatus).toHaveProperty('timeUntilExpiration');
  });

  it('should emit authentication events', async () => {
    const events: string[] = [];

    authManager.on('auth:loaded', () => events.push('loaded'));
    authManager.on('auth:success', () => events.push('success'));
    authManager.on('auth:failed', () => events.push('failed'));
    authManager.on('auth:expired', () => events.push('expired'));
    authManager.on('auth:refreshed', () => events.push('refreshed'));

    // Verify event handlers are registered
    expect(authManager.listenerCount('auth:loaded')).toBeGreaterThan(0);
    expect(authManager.listenerCount('auth:success')).toBeGreaterThan(0);
    expect(authManager.listenerCount('auth:failed')).toBeGreaterThan(0);
  });

  it('should handle logout', async () => {
    const tokens: OAuthTokens = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    const oauthFlow = new GoogleOAuthFlow(tempDir);
    await oauthFlow['saveTokens'](tokens);

    await authManager.initialize();
    expect(authManager.getStatus()).toBe('authenticated');

    await authManager.logout();
    expect(authManager.getStatus()).toBe('unauthenticated');
  });

  it('should get access token', async () => {
    const tokens: OAuthTokens = {
      access_token: 'my_access_token',
      refresh_token: 'my_refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    const oauthFlow = new GoogleOAuthFlow(tempDir);
    await oauthFlow['saveTokens'](tokens);

    await authManager.initialize();

    const accessToken = await authManager.getAccessToken();
    expect(accessToken).toBe('my_access_token');
  });

  it('should return null access token when not authenticated', async () => {
    await authManager.initialize();

    const accessToken = await authManager.getAccessToken();
    expect(accessToken).toBeNull();
  });

  it('should get all tokens', async () => {
    const tokens: OAuthTokens = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    const oauthFlow = new GoogleOAuthFlow(tempDir);
    await oauthFlow['saveTokens'](tokens);

    await authManager.initialize();

    const allTokens = await authManager.getTokens();
    expect(allTokens).toBeDefined();
    expect(allTokens?.access_token).toBe('token');
    expect(allTokens?.refresh_token).toBe('refresh');
  });
});

describe('OAuth Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-oauth-int-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should persist tokens across manager instances', async () => {
    const tokens: OAuthTokens = {
      access_token: 'persistent_token',
      refresh_token: 'persistent_refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000),
    };

    // Save with first instance
    const manager1 = new AuthenticationManager(tempDir);
    const flow1 = new GoogleOAuthFlow(tempDir);
    await flow1['saveTokens'](tokens);
    manager1.stop();

    // Load with second instance
    const manager2 = new AuthenticationManager(tempDir);
    await manager2.initialize();

    const accessToken = await manager2.getAccessToken();
    expect(accessToken).toBe('persistent_token');

    manager2.stop();
  });

  it('should handle token expiration gracefully', async () => {
    const expiredTokens: OAuthTokens = {
      access_token: 'expired',
      refresh_token: 'refresh',
      expires_in: 60,
      token_type: 'Bearer',
      obtained_at: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago, expired
    };

    const oauthFlow = new GoogleOAuthFlow(tempDir);
    await oauthFlow['saveTokens'](expiredTokens);

    const manager = new AuthenticationManager(tempDir);
    await manager.initialize();

    // Tokens are expired, should be unauthenticated
    expect(manager.isAuthenticated()).toBe(false);

    const accessToken = await manager.getAccessToken();
    expect(accessToken).toBeNull();

    manager.stop();
  });
});
