import { logInfo, logWarning } from "../telemetry/logger.js";

export interface ProviderAuthStatus {
  authenticated: boolean;
  user?: string;
  tokenLastFour?: string;
  error?: string;
}

export interface AuthStatusSummary {
  codex: ProviderAuthStatus;
  claude_code: ProviderAuthStatus;
}

function maskToken(token: string | undefined): string | undefined {
  if (!token || token.length < 4) return undefined;
  return token.slice(-4);
}

export class AuthChecker {
  async checkAll(): Promise<AuthStatusSummary> {
    const [codex, claude] = await Promise.all([this.checkCodex(), this.checkClaudeCode()]);
    return { codex, claude_code: claude };
  }

  canProceed(status: AuthStatusSummary): boolean {
    return status.codex.authenticated || status.claude_code.authenticated;
  }

  getWarning(status: AuthStatusSummary): string | null {
    if (status.codex.authenticated && status.claude_code.authenticated) {
      return null;
    }

    if (status.codex.authenticated || status.claude_code.authenticated) {
      return "Only one provider is authenticated. Some workloads may be throttled.";
    }

    return "No providers authenticated. Configure credentials to enable autonomous execution.";
  }

  getAuthGuidance(status: AuthStatusSummary): string {
    if (status.codex.authenticated && status.claude_code.authenticated) {
      return "Codex and Claude Code credentials detected.";
    }

    if (status.codex.authenticated) {
      return "Codex authenticated. Add ANTHROPIC_API_KEY to enable Claude Code fallback.";
    }

    if (status.claude_code.authenticated) {
      return "Claude Code authenticated. Add CODEX_API_KEY or OPENAI_API_KEY to enable Codex tasks.";
    }

    return "Set CODEX_API_KEY / OPENAI_API_KEY and ANTHROPIC_API_KEY environment variables or configure tokens in state/credentials.";
  }

  private async checkCodex(): Promise<ProviderAuthStatus> {
    const token = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!token) {
      logWarning("Codex API key not detected");
      return {
        authenticated: false,
        error: "CODEX_API_KEY or OPENAI_API_KEY not configured",
      };
    }

    // In the bootstrap phase we avoid making live requests; simply report presence of token.
    logInfo("Codex token detected", { lastFour: maskToken(token) });
    return {
      authenticated: true,
      user: "codex",
      tokenLastFour: maskToken(token),
    };
  }

  private async checkClaudeCode(): Promise<ProviderAuthStatus> {
    const token = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
    if (!token) {
      logWarning("Claude Code API key not detected");
      return {
        authenticated: false,
        error: "ANTHROPIC_API_KEY not configured",
      };
    }

    logInfo("Claude Code token detected", { lastFour: maskToken(token) });
    return {
      authenticated: true,
      user: "claude_code",
      tokenLastFour: maskToken(token),
    };
  }
}
