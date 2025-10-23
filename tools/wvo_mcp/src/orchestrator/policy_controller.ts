/**
 * PolicyController - Thin wrapper around the legacy autopilot_policy.py script.
 *
 * The bash autopilot loop relied on this controller to maintain rolling policy
 * state (state/policy/autopilot_policy.json) and append history entries to
 * state/analytics/autopilot_policy_history.jsonl.  The unified orchestrator
 * needs the same hook so supervisors keep their guardrail visibility.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execa, execaSync } from 'execa';
import { logInfo, logWarning } from '../telemetry/logger.js';

const PYTHON_BINARIES = ['python3', 'python'];

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
  private initialized = false;
  private directive: string | undefined;
  private readonly pythonBin: string | null;

  constructor(private readonly workspaceRoot: string) {
    this.scriptPath = path.join(workspaceRoot, 'tools', 'wvo_mcp', 'scripts', 'autopilot_policy.py');
    this.statePath = path.join(workspaceRoot, 'state', 'policy', 'autopilot_policy.json');
    this.historyPath = path.join(workspaceRoot, 'state', 'analytics', 'autopilot_policy_history.jsonl');
    this.roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
    this.decisionPath = path.join(workspaceRoot, 'state', 'policy', 'autopilot_last_decision.json');
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
          this.directive = typeof json.prompt_directive === 'string' ? json.prompt_directive : undefined;
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
}
