import { promises as fs } from 'node:fs';
import path from 'node:path';

type ProviderKey = 'codex' | 'claude_code';

export interface ProviderAuthStatus {
  provider: ProviderKey;
  authenticated: boolean;
  source?: string;
  guidance?: string;
  lastChecked: string;
}

export interface AuthStatusSummary {
  codex: ProviderAuthStatus;
  claude_code: ProviderAuthStatus;
}

const now = () => new Date().toISOString();

async function exists(target: string | undefined): Promise<boolean> {
  if (!target) return false;
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function fileContains(target: string, term: RegExp): Promise<boolean> {
  try {
    const contents = await fs.readFile(target, 'utf8');
    return term.test(contents);
  } catch {
    return false;
  }
}

export class AuthChecker {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  async checkAll(): Promise<AuthStatusSummary> {
    const [codex, claude] = await Promise.all([this.checkCodex(), this.checkClaude()]);
    return { codex, claude_code: claude };
  }

  getAuthGuidance(status: AuthStatusSummary): string[] {
    const guidance: string[] = [];
    if (!status.codex.authenticated) {
      guidance.push('Codex: run `codex login` (workspace profile) or update state/accounts.yaml and rerun autopilot login.');
    }
    if (!status.claude_code.authenticated) {
      guidance.push('Claude: run `claude login` with the configured account or verify CLAUDE_CONFIG_DIR permissions.');
    }
    return guidance;
  }

  getWarning(status: AuthStatusSummary): string | null {
    const codex = status.codex.authenticated;
    const claude = status.claude_code.authenticated;
    if (codex && claude) return null;
    if (!codex && !claude) {
      return 'Neither Codex nor Claude Code are authenticated. MCP tools will be unable to run.';
    }
    if (!codex) return 'Codex authentication missing.';
    return 'Claude authentication missing.';
  }

  canProceed(status: AuthStatusSummary): boolean {
    return status.codex.authenticated || status.claude_code.authenticated;
  }

  private async checkCodex(): Promise<ProviderAuthStatus> {
    const workspace = this.workspaceRoot;
    const home = process.env.CODEX_HOME ?? path.join(workspace, '.accounts', 'codex');
    const hasHome = await exists(home);
    const accountsFile = path.join(workspace, 'state', 'accounts.yaml');
    const accountsMention = await fileContains(accountsFile, /codex/i);
    const authenticated = hasHome || accountsMention;
    const source = hasHome ? 'CODEX_HOME' : accountsMention ? 'state/accounts.yaml' : undefined;
    return {
      provider: 'codex',
      authenticated,
      source,
      guidance: authenticated ? undefined : 'Run `codex login` or configure state/accounts.yaml.',
      lastChecked: now(),
    };
  }

  private async checkClaude(): Promise<ProviderAuthStatus> {
    const workspace = this.workspaceRoot;
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(workspace, '.accounts', 'claude');
    const hasConfig = await exists(configDir);
    const accountsFile = path.join(workspace, 'state', 'accounts.yaml');
    const accountsMention = await fileContains(accountsFile, /claude/i);
    const authenticated = hasConfig || accountsMention;
    const source = hasConfig ? 'CLAUDE_CONFIG_DIR' : accountsMention ? 'state/accounts.yaml' : undefined;
    return {
      provider: 'claude_code',
      authenticated,
      source,
      guidance: authenticated ? undefined : 'Run `claude login` or populate CLAUDE_CONFIG_DIR.',
      lastChecked: now(),
    };
  }
}
