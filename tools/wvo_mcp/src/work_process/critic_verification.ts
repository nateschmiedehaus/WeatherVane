/**
 * Critic Verification for WorkProcess Phase Transitions
 *
 * Ensures that phase artifacts have been reviewed and approved by critics
 * before allowing phase transitions. This provides programmatic enforcement
 * independent of git hooks or CI/CD.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkProcessPhase } from './index.js';

const WORKSPACE_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

export interface CriticApprovalCheck {
  required: boolean;
  artifact: string;
  approved: boolean;
  message: string;
}

/**
 * Check if a phase artifact has been approved by its critic
 * by looking for recent approval in analytics logs
 */
function checkCriticApproval(
  taskId: string,
  artifact: 'strategy' | 'think' | 'design' | 'spec' | 'plan'
): CriticApprovalCheck {
  const artifactPath = join(
    WORKSPACE_ROOT,
    'state',
    'evidence',
    taskId,
    `${artifact}.md`
  );

  // Check if artifact exists
  if (!existsSync(artifactPath)) {
    return {
      required: true,
      artifact: `${artifact}.md`,
      approved: false,
      message: `${artifact}.md not found at ${artifactPath}`
    };
  }

  // Check for approval in analytics log
  const logMap = {
    strategy: 'strategy_reviews.jsonl',
    think: 'thinking_reviews.jsonl',
    design: 'gate_reviews.jsonl',
    spec: 'spec_reviews.jsonl',
    plan: 'plan_reviews.jsonl'
  };

  const logPath = join(WORKSPACE_ROOT, 'state', 'analytics', logMap[artifact]);

  if (!existsSync(logPath)) {
    return {
      required: true,
      artifact: `${artifact}.md`,
      approved: false,
      message: `No ${artifact} reviews found - run npm run ${artifact === 'design' ? 'gate' : artifact}:review ${taskId}`
    };
  }

  // Parse log and find most recent review for this task
  const logContent = readFileSync(logPath, 'utf-8');
  const lines = logContent.trim().split('\n').filter(Boolean);

  // Find most recent review for this task
  let latestReview = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.task_id === taskId) {
        latestReview = entry;
        break;
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  if (!latestReview) {
    return {
      required: true,
      artifact: `${artifact}.md`,
      approved: false,
      message: `No review found for ${taskId} - run npm run ${artifact === 'design' ? 'gate' : artifact}:review ${taskId}`
    };
  }

  if (!latestReview.approved) {
    const concernsCount = latestReview.concerns_count || 0;
    const highSeverity = latestReview.high_severity_count || 0;
    return {
      required: true,
      artifact: `${artifact}.md`,
      approved: false,
      message: `${artifact}.md not approved: ${concernsCount} concerns (${highSeverity} critical) - address and re-run review`
    };
  }

  return {
    required: true,
    artifact: `${artifact}.md`,
    approved: true,
    message: `${artifact}.md approved ✓`
  };
}

function checkArtifactPresence(taskId: string, artifactFile: string): CriticApprovalCheck {
  const artifactPath = join(WORKSPACE_ROOT, 'state', 'evidence', taskId, artifactFile);
  if (!existsSync(artifactPath)) {
    return {
      required: true,
      artifact: artifactFile,
      approved: false,
      message: `${artifactFile} not found at ${artifactPath}`
    };
  }

  return {
    required: true,
    artifact: artifactFile,
    approved: true,
    message: `${artifactFile} present ✓`
  };
}

/**
 * Verify that required critics have approved before allowing phase transition
 *
 * Rules:
 * - Transitioning FROM STRATEGIZE (phase 1): strategy.md must be approved
 * - Transitioning FROM THINK (phase 4): strategy/spec/plan/think artifacts must exist and strategy+think must be approved
 * - Transitioning FROM GATE (phase 5): design.md must be approved
 */
export function verifyCriticApprovals(
  taskId: string,
  fromPhase: WorkProcessPhase | null,
  toPhase: WorkProcessPhase
): { allowed: boolean; checks: CriticApprovalCheck[] } {
  const checks: CriticApprovalCheck[] = [];

  // Define which critics must approve for which phase transitions
  const requirements: Record<string, Array<'strategy' | 'think' | 'design' | 'spec' | 'plan'>> = {
    strategize: ['strategy'],
    think: ['strategy', 'spec', 'plan', 'think'],
    gate: ['design']
  };

  const artifactRequirements: Record<string, string[]> = {
    think: ['strategy.md', 'spec.md', 'plan.md', 'think.md']
  };

  // Check if we're transitioning FROM a phase that requires critic approval
  if (fromPhase && fromPhase in requirements) {
    const requiredArtifacts = requirements[fromPhase];

    for (const artifact of requiredArtifacts) {
      const check = checkCriticApproval(taskId, artifact);
      checks.push(check);
    }
  }

  if (fromPhase && fromPhase in artifactRequirements) {
    for (const artifactFile of artifactRequirements[fromPhase]) {
      checks.push(checkArtifactPresence(taskId, artifactFile));
    }
  }

  // All required checks must be approved
  const allowed = checks.length === 0 || checks.every((c) => c.approved);

  return { allowed, checks };
}

/**
 * Format verification results for error messages
 */
export function formatVerificationError(
  taskId: string,
  fromPhase: WorkProcessPhase,
  toPhase: WorkProcessPhase,
  checks: CriticApprovalCheck[]
): string {
  const failed = checks.filter((c) => !c.approved);

  if (failed.length === 0) return '';

  const messages = [
    `Cannot transition ${taskId} from ${fromPhase} to ${toPhase}:`,
    '',
    ...failed.map((c) => `  ❌ ${c.message}`),
    '',
    'AFP Phase Discipline requires critic approval before proceeding.',
    'Address concerns and re-run reviews, then retry phase transition.'
  ];

  return messages.join('\n');
}
