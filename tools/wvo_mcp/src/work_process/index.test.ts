import { describe, expect, it, afterEach, afterAll } from 'vitest';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import {
  WORK_PROCESS_PHASES,
  WorkProcessEnforcer,
  assertLedgerCompleteness,
  type WorkProcessPhase,
} from './index.js';

const makeClock = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2025, 0, 1, 0, 0, tick++));
};

const WORKSPACE_ROOT = path.resolve(process.cwd());
const EVIDENCE_ROOT = path.join(WORKSPACE_ROOT, 'state', 'evidence');
const ANALYTICS_ROOT = path.join(WORKSPACE_ROOT, 'state', 'analytics');

const LOG_FILES: Record<'strategy' | 'think' | 'design' | 'spec' | 'plan', string> = {
  strategy: 'strategy_reviews.jsonl',
  think: 'thinking_reviews.jsonl',
  design: 'gate_reviews.jsonl',
  spec: 'spec_reviews.jsonl',
  plan: 'plan_reviews.jsonl',
};

const logSnapshots = new Map<string, string | null>();
const tasksToCleanup = new Set<string>();

const PHASE_ARTIFACTS: Partial<Record<WorkProcessPhase, string>> = {
  strategize: 'strategy.md',
  spec: 'spec.md',
  plan: 'plan.md',
  think: 'think.md',
  implement: 'implement.md',
  verify: 'verify.md',
  review: 'review.md',
  pr: 'pr.md',
  monitor: 'monitor.md',
};

const evidencePathForPhase = (taskId: string, phase: WorkProcessPhase): string => {
  const fileName = PHASE_ARTIFACTS[phase] ?? `${phase}.md`;
  return path.join('state', 'evidence', taskId, fileName);
};

async function ensurePhaseArtifact(taskId: string, phase: WorkProcessPhase, filename?: string): Promise<void> {
  const relativePath = filename ?? evidencePathForPhase(taskId, phase);
  const absolutePath = path.join(WORKSPACE_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  if (!existsSync(absolutePath)) {
    await writeFile(absolutePath, generatePhaseTemplate(phase, taskId), 'utf8');
  }
}

const ARTIFACT_PHASE_MAP: Record<'strategy' | 'spec' | 'plan' | 'think' | 'design', WorkProcessPhase> = {
  strategy: 'strategize',
  spec: 'spec',
  plan: 'plan',
  think: 'think',
  design: 'implement',
};

async function seedCriticApprovals(taskId: string, artifacts: Array<'strategy' | 'think' | 'design' | 'spec' | 'plan'>) {
  tasksToCleanup.add(taskId);

  for (const artifact of artifacts) {
    const phase = ARTIFACT_PHASE_MAP[artifact];
    await ensurePhaseArtifact(taskId, phase, path.join('state', 'evidence', taskId, `${artifact}.md`));

    const logPath = path.join(ANALYTICS_ROOT, LOG_FILES[artifact]);
    if (!logSnapshots.has(logPath)) {
      logSnapshots.set(logPath, existsSync(logPath) ? await readFile(logPath, 'utf8') : null);
    }

    const entry = {
      task_id: taskId,
      approved: true,
      concerns_count: 0,
      high_severity_count: 0,
      summary: `${artifact} review approved (seeded)`,
      timestamp: new Date().toISOString(),
    };

    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }
}

afterEach(async () => {
  for (const taskId of tasksToCleanup) {
    await rm(path.join(EVIDENCE_ROOT, taskId), { recursive: true, force: true });
  }
  tasksToCleanup.clear();
});

afterAll(async () => {
  for (const [logPath, snapshot] of logSnapshots) {
    if (snapshot === null) {
      await rm(logPath, { force: true });
    } else {
      await writeFile(logPath, snapshot, 'utf8');
    }
  }
  logSnapshots.clear();
});

function generatePhaseTemplate(phase: WorkProcessPhase, taskId: string): string {
  const title = phase.charAt(0).toUpperCase() + phase.slice(1);
  switch (phase) {
    case 'strategize':
      return `# Strategy for ${taskId}\n\n## Problem Statement\n- Seeded detail\n\n## Root Cause Analysis\n- Seeded root cause\n\n## Success Criteria\n- Seeded criteria\n`;
    case 'spec':
      return `# Specification for ${taskId}\n\n## Requirements\n- Requirement 1\n\n## Non-Functional Requirements\n- Performance target\n\n## Success Criteria\n- Criteria overview\n`;
    case 'plan':
      return `# Plan for ${taskId}\n\n## Work Plan\n- Step 1\n\n## Milestones\n- Milestone 1\n\n## Risks\n- Risk note\n\n## Verification Strategy\n- Verification outline\n`;
    case 'think':
      return `# Thinking for ${taskId}\n\n## Analysis\n- Considerations\n\n## Options\n- Option A\n`;
    default:
      return `# ${title} for ${taskId}\n\nGenerated automatically for tests.\n`;
  }
}

describe('WorkProcessEnforcer', () => {
  it('enforces sequential phases and builds hash chain', async () => {
    const enforcer = WorkProcessEnforcer.createInMemory(makeClock());
    const taskId = 'T-001';

    await seedCriticApprovals(taskId, ['strategy', 'spec', 'plan', 'think']);
    await ensurePhaseArtifacts(taskId, WORK_PROCESS_PHASES);

    for (const phase of WORK_PROCESS_PHASES) {
      await enforcer.recordTransition({
        taskId,
        phase,
        actorId: 'agent',
        evidencePath: evidencePathForPhase(taskId, phase),
      });
    }

    await expect(
      enforcer.recordTransition({
        taskId,
        phase: 'monitor',
        actorId: 'agent',
        evidencePath: 'state/evidence/redundant',
      }),
    ).rejects.toThrow(/already completed/);

    const ledger = await enforcer.getLedger(taskId);
    expect(ledger).toHaveLength(WORK_PROCESS_PHASES.length);
    assertLedgerCompleteness(ledger);
    expect(ledger[0].previousHash).toBeNull();
    expect(ledger[1].previousHash).toBe(ledger[0].hash);
  });

  it('requires orderly transitions and handles backtracks', async () => {
    const enforcer = WorkProcessEnforcer.createInMemory(makeClock());
    const taskId = 'T-002';

    await seedCriticApprovals(taskId, ['strategy']);
    await ensurePhaseArtifacts(taskId, ['strategize', 'spec', 'plan', 'think']);

    await enforcer.recordTransition({
      taskId,
      phase: 'strategize',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'strategize'),
    });
    await expect(
      enforcer.recordTransition({ taskId, phase: 'implement', actorId: 'agent', evidencePath: 'e/implement.md' }),
    ).rejects.toThrow(/Expected spec/);

    await enforcer.recordTransition({
      taskId,
      phase: 'spec',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'spec'),
    });
    await enforcer.recordTransition({
      taskId,
      phase: 'plan',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'plan'),
    });
    await enforcer.recordTransition({
      taskId,
      phase: 'think',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'think'),
    });

    await enforcer.requestBacktrack({
      taskId,
      targetPhase: 'spec',
      reason: 'Evidence gap',
      actorId: 'agent',
      evidencePath: 'e/backtrack.md',
    });

    await expect(
      enforcer.recordTransition({ taskId, phase: 'plan', actorId: 'agent', evidencePath: 'e/new-plan.md' }),
    ).rejects.toThrow(/backtracking to spec/);

    await enforcer.recordTransition({
      taskId,
      phase: 'spec',
      actorId: 'agent',
      evidencePath: 'e/spec-v2.md',
    });

    const ledger = await enforcer.getLedger(taskId);
    expect(ledger.at(-1)?.phase).toBe('spec');
    expect(ledger.filter((entry) => entry.backtrack)).toHaveLength(1);
  });

  it('blocks implement transition when upstream artifacts missing', async () => {
    const enforcer = WorkProcessEnforcer.createInMemory(makeClock());
    const taskId = 'T-003';

    await seedCriticApprovals(taskId, ['strategy', 'think']);
    await ensurePhaseArtifacts(taskId, ['strategize', 'spec', 'plan', 'think']);

    await enforcer.recordTransition({
      taskId,
      phase: 'strategize',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'strategize'),
    });
    await enforcer.recordTransition({
      taskId,
      phase: 'spec',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'spec'),
    });
    await enforcer.recordTransition({
      taskId,
      phase: 'plan',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'plan'),
    });
    await enforcer.recordTransition({
      taskId,
      phase: 'think',
      actorId: 'agent',
      evidencePath: evidencePathForPhase(taskId, 'think'),
    });

    await expect(
      enforcer.recordTransition({
        taskId,
        phase: 'implement',
        actorId: 'agent',
        evidencePath: evidencePathForPhase(taskId, 'implement'),
      }),
    ).rejects.toThrow(/spec:review/i);
    await expect(
      enforcer.recordTransition({
        taskId,
        phase: 'implement',
        actorId: 'agent',
        evidencePath: evidencePathForPhase(taskId, 'implement'),
      }),
    ).rejects.toThrow(/plan:review/i);
  });
});
async function ensurePhaseArtifacts(taskId: string, phases: Iterable<WorkProcessPhase>): Promise<void> {
  for (const phase of phases) {
    await ensurePhaseArtifact(taskId, phase);
  }
}
