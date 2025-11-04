/**
 * PolicyController - Thin wrapper around the legacy autopilot_policy.py script.
 *
 * The bash autopilot loop relied on this controller to maintain rolling policy
 * state (state/policy/autopilot_policy.json) and append history entries to
 * state/analytics/autopilot_policy_history.jsonl.  The unified orchestrator
 * needs the same hook so supervisors keep their guardrail visibility.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { execa, execaSync } from 'execa';

import { logInfo, logWarning } from '../telemetry/logger.js';

const PYTHON_BINARIES = ['python3', 'python'];
const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /private[_-]?key/i,
  /credential/i,
];
const COMMAND_DENY_PATTERNS = [
  /rm\s+-rf\b/i,
  /rm\s+-r\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\btruncate\s+/i,
  /\bdrop\s+database\b/i,
  /\bkill\s+-9\b/i,
  /\bapt(-get)?\s+install\b/i,
  /\byum\s+install\b/i,
  /\bpip\s+install\b/i,
  /\bnpm\s+install\b/i,
  /\|\s*(tee|cat|dd)\s+/i,
  />\s*/i,
  /\bscp\b/i,
  /\bcurl\s+(?!https:\/\/api\.(openai|anthropic)\.com|https:\/\/generativelanguage\.googleapis\.com|https:\/\/api\.xai\.com)/i,
];

const SHELL_ALLOWLIST = new Set(['ls', 'pwd', 'cat', 'echo', 'whoami', 'openai', 'anthropic', 'gcloud', 'xai']);
const PROVIDER_COMMANDS = new Set(['openai', 'anthropic', 'gcloud', 'xai']);
const PROVIDER_HOST_ALLOWLIST = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.xai.com'];

export interface CommandPolicyRequest {
  actor: string;
  roles?: string[];
  scope: 'shell' | 'git' | 'deploy' | 'other';
  command: string;
  args?: string[];
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CommandPolicyDecision {
  allowed: boolean;
  dryRun: boolean;
  reason?: string;
}

export interface PolicySummaryPayload {
  completed_tasks?: string[];
  in_progress?: string[];
  blockers?: string[];
  next_focus?: string[];
  notes?: string;
  meta?: Record<string, unknown>;
}

function resolvePythonBinary(): string | null {
  for (const candidate of PYTHON_BINARIES) {
    try {
      execaSync(candidate, ['--version']);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export class PolicyController {
  private readonly scriptPath: string;
  private readonly statePath: string;
  private readonly historyPath: string;
  private readonly roadmapPath: string;
  private readonly decisionPath: string;
  private readonly abacLogPath: string;
  private initialized = false;
  private directive: string | undefined;
  private readonly pythonBin: string | null;

  constructor(private readonly workspaceRoot: string) {
    this.scriptPath = path.join(workspaceRoot, 'tools', 'wvo_mcp', 'scripts', 'autopilot_policy.py');
    this.statePath = path.join(workspaceRoot, 'state', 'policy', 'autopilot_policy.json');
    this.historyPath = path.join(workspaceRoot, 'state', 'analytics', 'autopilot_policy_history.jsonl');
    this.roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
    this.decisionPath = path.join(workspaceRoot, 'state', 'policy', 'autopilot_last_decision.json');
    this.abacLogPath = path.join(workspaceRoot, 'state', 'analytics', 'policy_abac_events.jsonl');
    this.pythonBin = resolvePythonBinary();
  }

  getDirective(): string | undefined {
    return this.directive;
  }

  isEnabled(): boolean {
    return Boolean(this.pythonBin) && this.initialized;
  }

  async initialize(): Promise<void> {
    if (!this.pythonBin) {
      logWarning('Policy controller disabled: python interpreter not found');
      return;
    }

    try {
      await fs.access(this.scriptPath);
    } catch {
      logWarning('Policy controller script missing; skipping policy integration', {
        script: this.scriptPath,
      });
      return;
    }

    try {
      await fs.mkdir(path.dirname(this.statePath), { recursive: true });
      await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
      await fs.mkdir(path.dirname(this.abacLogPath), { recursive: true });
    } catch {
      // Directories best-effort; failures caught below
    }

    try {
      const { stdout } = await execa(this.pythonBin, [
        this.scriptPath,
        'decide',
        '--state',
        this.statePath,
        '--history',
        this.historyPath,
        '--roadmap',
        this.roadmapPath,
        '--balance',
        path.join(this.workspaceRoot, 'state', 'autopilot_balance.json'),
      ]);

      const trimmed = stdout?.trim();
      if (trimmed) {
        await fs.writeFile(this.decisionPath, trimmed, 'utf-8');
        try {
          const json = JSON.parse(trimmed);
          const directive = typeof json.prompt_directive === 'string' ? json.prompt_directive : undefined;
          this.directive = this.sanitizeDirective(directive);
          logInfo('Policy controller decision loaded', {
            domain: json.domain ?? 'unknown',
            action: json.action ?? 'execute_tasks',
          });
        } catch (error) {
          logWarning('Policy controller decide output was not valid JSON', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.initialized = true;
    } catch (error) {
      logWarning('Policy controller initialization failed; continuing without policy updates', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async evaluateCommandPolicy(request: CommandPolicyRequest): Promise<CommandPolicyDecision> {
    const normalized = request.command.trim();
    const lowerScope = request.scope ?? 'other';

    if (COMMAND_DENY_PATTERNS.some((pattern) => pattern.test(normalized))) {
      await this.logAbacEvent({
        type: 'command_denied',
        reason: 'denylist',
        request,
      });
      return { allowed: false, dryRun: true, reason: 'denylist' };
    }

    if (lowerScope === 'deploy' && !this.hasPrivilegedRole(request, ['release_manager', 'admin'])) {
      await this.logAbacEvent({
        type: 'command_denied',
        reason: 'deploy_requires_release_role',
        request,
      });
      return { allowed: false, dryRun: true, reason: 'release_role_required' };
    }

    if (lowerScope === 'git' && normalized.startsWith('git push') && !this.hasPrivilegedRole(request, ['release_manager', 'admin'])) {
      await this.logAbacEvent({
        type: 'command_denied',
        reason: 'git_push_requires_release_role',
        request,
      });
      return { allowed: false, dryRun: true, reason: 'release_role_required' };
    }

    if (lowerScope === 'shell') {
      const firstToken = normalized.split(/\s+/)[0] ?? '';
      const allowlisted =
        SHELL_ALLOWLIST.has(firstToken) || firstToken.startsWith('git') || firstToken === 'printf';
      if (!allowlisted) {
        await this.logAbacEvent({
          type: 'command_denied',
          reason: 'shell_not_allowlisted',
          request,
        });
        return { allowed: false, dryRun: true, reason: 'not_allowlisted' };
      }
      if (PROVIDER_COMMANDS.has(firstToken) && !request.metadata?.allow_provider_cli) {
        await this.logAbacEvent({
          type: 'command_denied',
          reason: 'provider_cli_requires_supervisor',
          request,
        });
        return { allowed: false, dryRun: true, reason: 'provider_cli_requires_supervisor' };
      }
    }

    let dryRun = true;
    let reason: string | undefined;
    if (lowerScope === 'shell' && request.metadata?.allow_live === true) {
      if (this.hasPrivilegedRole(request, ['admin'])) {
        dryRun = false;
      } else {
        reason = 'forced_dry_run';
      }
    } else if (lowerScope !== 'shell') {
      dryRun = request.dryRun ?? false;
    }

    await this.logAbacEvent({
      type: 'command_allowed',
      dry_run: dryRun,
      reason: reason ?? 'policy_ok',
      request,
    });

    return { allowed: true, dryRun, reason };
  }

  async requireHumanApproval(trigger: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.logAbacEvent({
      type: 'require_human',
      trigger,
      metadata,
    });
    logWarning('PolicyController requires human approval', { trigger, metadata });
  }

  sanitizeContextPayload(payload: string): string {
    return this.sanitizeDirective(payload) ?? '';
  }

  async recordEvent(summary: PolicySummaryPayload): Promise<void> {
    if (!this.pythonBin || !this.initialized) {
      return;
    }

    const payload = summary ?? {};
    try {
      await execa(
        this.pythonBin,
        [
          this.scriptPath,
          'update',
          '--state',
          this.statePath,
          '--history',
          this.historyPath,
          '--roadmap',
          this.roadmapPath,
          '--decision-file',
          this.decisionPath,
        ],
        {
          cwd: this.workspaceRoot,
          input: JSON.stringify(payload),
          stdout: 'ignore',
          stderr: 'ignore',
        }
      );
    } catch (error) {
      logWarning('Policy controller update failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private hasPrivilegedRole(request: CommandPolicyRequest, roles: string[]): boolean {
    if (!request.roles || request.roles.length === 0) {
      return false;
    }
    return request.roles.some((role) => roles.includes(role));
  }

  private async logAbacEvent(entry: Record<string, unknown>): Promise<void> {
    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    try {
      await fs.appendFile(this.abacLogPath, `${JSON.stringify(payload)}\n`, 'utf-8');
    } catch (error) {
      logWarning('Failed to append ABAC log entry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sanitizeDirective(value: string | undefined): string | undefined {
    if (!value) {
      return value;
    }
    let sanitized = value;
    let redacted = false;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
        redacted = true;
      }
    }
    if (redacted) {
      this.logAbacEvent({
        type: 'secret_redacted',
        stage: 'directive',
      }).catch(() => {
        /* ignore */
      });
    }
    return sanitized;
  }
}
