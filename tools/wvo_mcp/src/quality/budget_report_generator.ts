/**
 * Budget Report Generator
 *
 * Generates markdown budget reports for task evidence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TaskBudgetStatus, PhaseExecution } from '../context/phase_budget_tracker.js';

export interface BudgetReportOptions {
  includeCalculationDetails?: boolean;
  includeWarnings?: boolean;
}

/**
 * Generate budget report markdown
 */
export function generateBudgetReport(
  status: TaskBudgetStatus,
  options: BudgetReportOptions = {}
): string {
  const {
    includeCalculationDetails = true,
    includeWarnings = true,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push(`# Budget Report: ${status.task_id}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  const tokenPercent = Math.round((status.total_tokens_used / status.total_tokens_limit) * 100);
  const latencyPercent = Math.round((status.total_latency_ms / status.total_latency_limit_ms) * 100);

  const statusIcon = status.cumulative_breach_status === 'within' ? '✅' :
                     status.cumulative_breach_status === 'warning' ? '⚠️' : '❌';

  lines.push(`- **Total Tokens**: ${status.total_tokens_used} / ${status.total_tokens_limit} (${tokenPercent}%)`);
  lines.push(`- **Total Latency**: ${Math.round(status.total_latency_ms / 1000)}s / ${Math.round(status.total_latency_limit_ms / 1000)}s (${latencyPercent}%)`);
  lines.push(`- **Budget Status**: ${statusIcon} ${status.cumulative_breach_status.toUpperCase()}`);
  lines.push('');

  // Per-Phase Breakdown
  lines.push('## Per-Phase Breakdown');
  lines.push('');
  lines.push('| Phase       | Tokens Used | Token Limit | Latency (s) | Latency Limit (s) | Status |');
  lines.push('|-------------|-------------|-------------|-------------|-------------------|--------|');

  for (const exec of status.phase_executions) {
    const tokenUtil = Math.round((exec.tokens_used / exec.tokens_limit) * 100);
    const latencyUtil = exec.latency_ms && exec.latency_limit_ms
      ? Math.round((exec.latency_ms / exec.latency_limit_ms) * 100)
      : 0;

    const phaseStatusIcon = exec.breach_status === 'within' ? '✅' :
                           exec.breach_status === 'warning' ? '⚠️' : '❌';

    const estimatedFlag = exec.tokens_estimated ? ' (est)' : '';

    lines.push(
      `| ${exec.phase.padEnd(11)} | ${exec.tokens_used.toString().padStart(11)}${estimatedFlag.padEnd(6)} | ${exec.tokens_limit.toString().padStart(11)} | ` +
      `${Math.round((exec.latency_ms || 0) / 1000).toString().padStart(11)} | ${Math.round(exec.latency_limit_ms / 1000).toString().padStart(17)} | ` +
      `${phaseStatusIcon} ${tokenUtil}% `
    );
  }

  lines.push('');

  // Calculation Details
  if (includeCalculationDetails && status.phase_executions.length > 0) {
    lines.push('## Budget Calculation Details');
    lines.push('');
    lines.push('Budget limits calculated using formula:');
    lines.push('```');
    lines.push('phase_limit = base × complexity_mult × importance_mult × phase_weight');
    lines.push('```');
    lines.push('');
    lines.push('See `config/phase_budgets.yaml` for multipliers and base values.');
    lines.push('');
  }

  // Warnings
  if (includeWarnings) {
    const warnings: string[] = [];
    const breaches: PhaseExecution[] = [];

    for (const exec of status.phase_executions) {
      if (exec.breach_status === 'warning' || exec.breach_status === 'exceeded') {
        breaches.push(exec);
      }
      if (exec.tokens_estimated) {
        warnings.push(`- ${exec.phase}: Token count estimated (model did not report usage)`);
      }
      if (exec.latency_ms === 0) {
        warnings.push(`- ${exec.phase}: Latency tracking failed (clock skew or error)`);
      }
    }

    if (breaches.length > 0) {
      lines.push('## Budget Breaches');
      lines.push('');
      for (const exec of breaches) {
        const tokenUtil = Math.round((exec.tokens_used / exec.tokens_limit) * 100);
        const latencyUtil = exec.latency_ms && exec.latency_limit_ms
          ? Math.round((exec.latency_ms / exec.latency_limit_ms) * 100)
          : 0;

        lines.push(`### ${exec.phase} - ${exec.breach_status?.toUpperCase() || 'UNKNOWN'}`);
        lines.push('');
        lines.push(`- **Token Utilization**: ${tokenUtil}% (${exec.tokens_used} / ${exec.tokens_limit})`);
        lines.push(`- **Latency Utilization**: ${latencyUtil}% (${Math.round((exec.latency_ms || 0) / 1000)}s / ${Math.round(exec.latency_limit_ms / 1000)}s)`);
        lines.push('');
        lines.push('**Potential Causes**:');
        if (tokenUtil > 150) {
          lines.push('- High token usage: Complex analysis, many iterations, or runaway exploration');
        }
        if (latencyUtil > 150) {
          lines.push('- High latency: Slow API responses, network issues, or complex processing');
        }
        lines.push('');
      }
    }

    if (warnings.length > 0) {
      lines.push('## Warnings');
      lines.push('');
      warnings.forEach(w => lines.push(w));
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated: ${new Date().toISOString()}*`);
  lines.push('');
  lines.push('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
  lines.push('');
  lines.push('Co-Authored-By: Claude <noreply@anthropic.com>');

  return lines.join('\n');
}

/**
 * Write budget report to file
 */
export async function writeBudgetReport(
  taskId: string,
  status: TaskBudgetStatus,
  options: BudgetReportOptions = {}
): Promise<string> {
  const reportMarkdown = generateBudgetReport(status, options);

  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const reportPath = path.join(workspaceRoot, 'state', 'evidence', taskId, 'verify', 'budget_report.md');

  // Ensure directory exists
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Write report
  fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

  return reportPath;
}
