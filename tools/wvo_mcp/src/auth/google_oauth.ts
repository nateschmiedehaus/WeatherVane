/**
 * Google OAuth Flow - Browser-based authentication for Claude.ai
 *
 * This module implements:
 * - OAuth 2.0 Authorization Code Flow with PKCE
 * - Local callback server to capture tokens
 * - Secure token storage
 * - Browser automation for consent
 */

import { randomBytes, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  obtained_at: number; // Unix timestamp
}

export interface OAuthConfig {
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes: string[];
}

export interface OAuthFlowOptions {
  timeout?: number; // Timeout in milliseconds
  port?: number; // Local server port
  autoOpenBrowser?: boolean;
}

// Default configuration for Claude.ai Google OAuth
const CLAUDE_OAUTH_CONFIG: OAuthConfig = {
  client_id: process.env.CLAUDE_OAUTH_CLIENT_ID ?? 'claude-desktop-client',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  redirect_uri: 'http://localhost:8765/oauth/callback',
  scopes: ['openid', 'email', 'profile'],
};

export class GoogleOAuthFlow {
  private server: Server | null = null;
  private codeVerifier: string = '';
  private codeChallenge: string = '';
  private state: string = '';
  private readonly config: OAuthConfig;
  private readonly tokensPath: string;

  constructor(
    private readonly workspaceRoot: string,
    config?: Partial<OAuthConfig>
  ) {
    this.config = { ...CLAUDE_OAUTH_CONFIG, ...config };
    this.tokensPath = path.join(workspaceRoot, 'state', 'auth', 'claude_tokens.json');
  }

  /**
   * Start OAuth flow and obtain tokens
   */
  async authenticate(options: OAuthFlowOptions = {}): Promise<OAuthTokens> {
    const timeout = options.timeout ?? 300000; // 5 minutes default
    const port = options.port ?? 8765;

    // Generate PKCE parameters
    this.generatePKCEParameters();

    // Start local callback server
    const authCodePromise = this.startCallbackServer(port);

    // Build authorization URL
    const authUrl = this.buildAuthorizationUrl();

    logInfo('OAuth flow started', {
      authUrl,
      redirectUri: this.config.redirect_uri,
    });

    // Open browser (or instruct user to open)
    if (options.autoOpenBrowser ?? true) {
      await this.openBrowser(authUrl);
    } else {
      console.log('\nPlease open this URL in your browser to authenticate:');
      console.log(authUrl);
      console.log('');
    }

    // Wait for authorization code
    const authCode = await Promise.race([
      authCodePromise,
      this.timeout(timeout),
    ]);

    if (!authCode) {
      throw new Error('OAuth flow timed out');
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(authCode);

    // Save tokens
    await this.saveTokens(tokens);

    logInfo('OAuth authentication successful', {
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    return tokens;
  }

  /**
   * Load saved tokens
   */
  async loadTokens(): Promise<OAuthTokens | null> {
    try {
      const content = await fs.readFile(this.tokensPath, 'utf-8');
      const tokens = JSON.parse(content) as OAuthTokens;

      // Check if tokens are expired
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = tokens.obtained_at + tokens.expires_in;

      if (now >= expiresAt) {
        logWarning('Saved tokens are expired', {
          obtainedAt: new Date(tokens.obtained_at * 1000).toISOString(),
          expiresIn: tokens.expires_in,
        });
        return null;
      }

      return tokens;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return null; // No saved tokens
      }
      logWarning('Failed to load saved tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Save tokens to disk
   */
  private async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      const dir = path.dirname(this.tokensPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
      logInfo('Saved OAuth tokens', { path: this.tokensPath });
    } catch (error) {
      logError('Failed to save OAuth tokens', {
        path: this.tokensPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    if (this.config.client_secret) {
      params.set('client_secret', this.config.client_secret);
    }

    try {
      const response = await fetch(this.config.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        access_token: string;
        expires_in: number;
        token_type: string;
        refresh_token?: string;
        scope?: string;
      };

      const tokens: OAuthTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? refreshToken, // Keep old refresh token if not provided
        expires_in: data.expires_in,
        token_type: data.token_type,
        scope: data.scope,
        obtained_at: Math.floor(Date.now() / 1000),
      };

      // Save refreshed tokens
      await this.saveTokens(tokens);

      logInfo('Tokens refreshed successfully');

      return tokens;
    } catch (error) {
      logError('Failed to refresh tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCEParameters(): void {
    // Generate code verifier (random 43-128 character string)
    this.codeVerifier = randomBytes(32).toString('base64url');

    // Generate code challenge (SHA256 hash of verifier)
    this.codeChallenge = createHash('sha256')
      .update(this.codeVerifier)
      .digest('base64url');

    // Generate state for CSRF protection
    this.state = randomBytes(16).toString('base64url');
  }

  /**
   * Build authorization URL
   */
  private buildAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      redirect_uri: this.config.redirect_uri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state: this.state,
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256',
      // Google-specific parameters for better UX
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent screen to get refresh token
    });

    return `${this.config.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Start local callback server to capture authorization code
   */
  private startCallbackServer(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://localhost:${port}`);

        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error(`OAuth error: ${error}`));
            this.stopCallbackServer();
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>No authorization code received.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error('No authorization code received'));
            this.stopCallbackServer();
            return;
          }

          if (state !== this.state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>State mismatch (possible CSRF attack).</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error('State mismatch'));
            this.stopCallbackServer();
            return;
          }

          // Success!
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

          resolve(code);
          this.stopCallbackServer();
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.server.listen(port, () => {
        logInfo('OAuth callback server started', { port });
      });

      this.server.on('error', (error) => {
        logError('OAuth callback server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Stop callback server
   */
  private stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logInfo('OAuth callback server stopped');
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirect_uri,
      code_verifier: this.codeVerifier,
    });

    if (this.config.client_secret) {
      params.set('client_secret', this.config.client_secret);
    }

    try {
      const response = await fetch(this.config.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type: string;
        scope?: string;
      };

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        scope: data.scope,
        obtained_at: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      logError('Failed to exchange code for tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Open browser to authorization URL
   */
  private async openBrowser(url: string): Promise<void> {
    const { execa } = await import('execa');

    try {
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === 'darwin') {
        command = 'open';
        args = [url];
      } else if (platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', url];
      } else {
        // Linux
        command = 'xdg-open';
        args = [url];
      }

      await execa(command, args);
      logInfo('Opened browser for authentication');
    } catch (error) {
      logWarning('Failed to open browser automatically', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.log('\nPlease open this URL manually in your browser:');
      console.log(url);
      console.log('');
    }
  }

  /**
   * Timeout promise
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopCallbackServer();
  }
}
