/**
 * Authentication Checker - Validates sessions for both Codex and Claude Code
 */

import { exec } from "child_process";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "util";
import { logError, logInfo, logWarning } from "../telemetry/logger.js";

const execAsync = promisify(exec);

export interface AuthStatus {
  codex: {
    authenticated: boolean;
    user?: string;
    error?: string;
  };
  claude_code: {
    authenticated: boolean;
    user?: string;
    error?: string;
  };
}

export class AuthChecker {
  /**
   * Check Codex authentication status
   */
  private async checkCodexAuth(): Promise<{ authenticated: boolean; user?: string; error?: string }> {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const credentialCandidates = [
      path.join(codexHome, "credentials.json"),
      path.join(codexHome, "auth.json"),
    ];

    try {
      // Try to get Codex status
      const { stdout, stderr } = await execAsync("codex status 2>&1 || true");

      // Check if we're authenticated
      if (stdout.includes("Logged in") || stdout.includes("authenticated")) {
        const userMatch = stdout.match(/as\s+([^\s]+)/);
        return {
          authenticated: true,
          user: userMatch ? userMatch[1] : "unknown",
        };
      }

      // Not authenticated
      const fallback = await this.readCodexCredentials(credentialCandidates);
      if (fallback.authenticated) {
        return fallback;
      }
      return {
        authenticated: false,
        error: "Not logged in to Codex",
      };
    } catch (error) {
      const fallback = await this.readCodexCredentials(credentialCandidates);
      if (fallback.authenticated) {
        return fallback;
      }
      return {
        authenticated: false,
        error: `Codex CLI not available: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Decode JWT token to extract email (without verification - just parsing)
   */
  private decodeJWT(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], "base64").toString("utf-8");
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async readCodexCredentials(
    candidatePaths: string[],
  ): Promise<{ authenticated: boolean; user?: string; error?: string }> {
    for (const credentialsPath of candidatePaths) {
      try {
        const raw = await fs.readFile(credentialsPath, "utf-8");
        if (!raw) {
          continue;
        }
        const data = JSON.parse(raw) as {
          profile?: { email?: string; user?: string };
          user?: string;
          email?: string;
          refresh_token?: string;
          access_token?: string;
          tokens?: {
            account_id?: string;
            account_email?: string;
            refresh_token?: string;
            access_token?: string;
            id_token?: string;
          };
        };
        const hasToken = Boolean(
          data.refresh_token ||
            data.access_token ||
            data.tokens?.refresh_token ||
            data.tokens?.access_token,
        );
        if (hasToken) {
          // Try to extract email from JWT id_token
          let user: string | undefined;
          if (data.tokens?.id_token) {
            const decoded = this.decodeJWT(data.tokens.id_token);
            user = (decoded?.email as string) || undefined;
          }

          // Fallback to other sources
          if (!user) {
            user =
              data.profile?.email ||
              data.profile?.user ||
              data.email ||
              data.user ||
              data.tokens?.account_email ||
              data.tokens?.account_id ||
              "codex_user";
          }

          return { authenticated: true, user };
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
          continue; // try next candidate
        }
        return {
          authenticated: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { authenticated: false };
  }

  /**
   * Check Claude Code authentication status
   */
  private async checkClaudeCodeAuth(): Promise<{ authenticated: boolean; user?: string; error?: string }> {
    const claudeBin = process.env.CLAUDE_BIN ?? "claude";
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");

    try {
      const { stdout } = await execAsync(`${claudeBin} whoami 2>&1 || true`);
      const trimmed = stdout.trim();
      if (trimmed && !trimmed.toLowerCase().includes('login')) {
        return {
          authenticated: true,
          user: trimmed,
        };
      }
    } catch (error) {
      logWarning("Claude whoami check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const sessionPath = path.join(configDir, "session.json");
    const configPath = path.join(configDir, "config.json");

    if (existsSync(sessionPath) || existsSync(configPath)) {
      let user: string | undefined;
      try {
        const raw = await fs.readFile(sessionPath, "utf-8");
        const data = JSON.parse(raw) as { user?: string };
        user = data.user;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          logWarning("Unable to parse Claude session.json", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return {
        authenticated: true,
        user,
      };
    }

    return {
      authenticated: false,
      error: `Claude credentials not found (expected under ${configDir})`,
    };
  }

  /**
   * Check authentication for both providers (silent)
   */
  async checkAllSilent(): Promise<AuthStatus> {
    const [codexAuth, claudeAuth] = await Promise.all([
      this.checkCodexAuth(),
      this.checkClaudeCodeAuth(),
    ]);

    return {
      codex: codexAuth,
      claude_code: claudeAuth,
    };
  }

  /**
   * Check authentication for both providers with logging
   */
  async checkAll(): Promise<AuthStatus> {
    logInfo("Checking authentication status...");

    const status = await this.checkAllSilent();

    // Log results
    if (status.codex.authenticated && status.claude_code.authenticated) {
      logInfo("✅ Both providers authenticated", {
        codex: status.codex.user,
        claude_code: status.claude_code.user,
      });
    } else if (status.codex.authenticated || status.claude_code.authenticated) {
      logWarning("⚠️  Partial authentication - some providers unavailable", status as unknown as Record<string, unknown>);
    } else {
      logError("❌ No providers authenticated", status as unknown as Record<string, unknown>);
    }

    return status;
  }

  /**
   * Get authentication guidance based on status
   */
  getAuthGuidance(status: AuthStatus): string {
    const guidance: string[] = [];

    if (!status.codex.authenticated) {
      guidance.push("📋 Codex: Run `codex login` to authenticate");
      if (status.codex.error) {
        guidance.push(`   Error: ${status.codex.error}`);
      }
    }

    if (!status.claude_code.authenticated) {
      guidance.push("📋 Claude Code: Authenticate via Claude Desktop or CLI");
      if (status.claude_code.error) {
        guidance.push(`   Error: ${status.claude_code.error}`);
      }
    }

    if (guidance.length === 0) {
      return "✅ All providers authenticated";
    }

    return `⚠️  Authentication needed:\n\n${guidance.join("\n")}`;
  }

  /**
   * Determine if we can proceed with current auth status
   */
  canProceed(status: AuthStatus): boolean {
    // Can proceed if at least one provider is authenticated
    return status.codex.authenticated || status.claude_code.authenticated;
  }

  /**
   * Get warning message if only partial auth
   */
  getWarning(status: AuthStatus): string | null {
    if (status.codex.authenticated && status.claude_code.authenticated) {
      return null; // All good
    }

    if (status.codex.authenticated && !status.claude_code.authenticated) {
      return "⚠️  Running with Codex only. Claude Code unavailable for failover.";
    }

    if (!status.codex.authenticated && status.claude_code.authenticated) {
      return "⚠️  Running with Claude Code only. Codex unavailable for failover.";
    }

    return "❌ No authentication available. Please log in to at least one provider.";
  }
}
