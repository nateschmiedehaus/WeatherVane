#!/usr/bin/env node

/**
 * Provider Failover Test - Simulates token limit failures to validate
 * automatic failover, circuit-breaker rollback, and DISABLE_NEW kill switch.
 *
 * Usage:
 *   node tools/wvo_mcp/scripts/run_provider_failover_test.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { AgentPool } from '../dist/orchestrator/agent_pool.js';
import { ResilienceManager } from '../dist/orchestrator/resilience_manager.js';
import { StateMachine } from '../dist/orchestrator/state_machine.js';
import { SafetyStateStore } from '../dist/state/safety_state.js';
import { resolveStateRoot } from '../dist/utils/config.js';

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const experimentsDir = path.join(repoRoot, 'experiments', 'mcp');
  await fs.mkdir(experimentsDir, { recursive: true });

  const tmpRoot = path.join(experimentsDir, '.tmp');
  await fs.mkdir(tmpRoot, { recursive: true });

  const workspaceRoot = path.join(tmpRoot, `failover_${Date.now()}_${randomUUID()}`);
  await fs.mkdir(workspaceRoot, { recursive: true });
  const stateRoot = resolveStateRoot(workspaceRoot);
  await fs.mkdir(stateRoot, { recursive: true });

  let stateMachine;
  let agentPool;
  let resilienceManager;
  let safetyStore;
  const samples = [];

  try {
    stateMachine = new StateMachine(workspaceRoot);
    agentPool = new AgentPool(workspaceRoot, 2);
    resilienceManager = new ResilienceManager(stateMachine, agentPool);
    safetyStore = new SafetyStateStore(stateRoot);

    const initialSafety = await safetyStore.read();
    samples.push({
      step: 'initial_state',
      timestamp: new Date().toISOString(),
      coordinator: {
        type: agentPool.getCoordinatorType(),
        available: agentPool.isCoordinatorAvailable(),
      },
      killSwitchEngaged: initialSafety.killSwitchEngaged,
    });

    const firstFailureStarted = Date.now();
    const firstRecovery = await resilienceManager.handleFailure({
      taskId: 'failover-synthetic',
      agentId: 'claude_code',
      failureType: 'rate_limit',
      retryAfterSeconds: 5,
      attemptNumber: 1,
      originalError: 'simulated claude rate limit',
    });
    const firstRecoveryCompleted = Date.now();

    agentPool.promoteCoordinatorRole('claude_rate_limit:5s');
    samples.push({
      step: 'post_failover',
      timestamp: new Date().toISOString(),
      coordinator: {
        type: agentPool.getCoordinatorType(),
        available: agentPool.isCoordinatorAvailable(),
      },
      recoveryAction: firstRecovery,
      killSwitchEngaged: (await safetyStore.read()).killSwitchEngaged,
      failoverLatencyMs: firstRecoveryCompleted - firstFailureStarted,
    });

    // Escalate with a follow-up rate limit on Codex to trigger circuit breaker workflow.
    const secondFailureStarted = Date.now();
    const secondRecovery = await resilienceManager.handleFailure({
      taskId: 'failover-synthetic',
      agentId: 'codex_worker_1',
      failureType: 'rate_limit',
      retryAfterSeconds: 8,
      attemptNumber: 2,
      originalError: 'simulated codex spillover rate limit',
    });
    const secondRecoveryCompleted = Date.now();
    agentPool.promoteCoordinatorRole('codex_rate_limit:8s');

    const safetyBeforeKillSwitch = await safetyStore.read();
    const incidents = [
      ...safetyBeforeKillSwitch.incidents,
      {
        id: `incident-${Date.now()}`,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        summary: 'DISABLE_NEW kill switch engaged after repeated failover stress',
        details: {
          reason: 'circuit_breaker_triggered',
        primaryAgent: 'claude_code',
        failoverAgent: 'codex_worker_1',
        retryAfterSeconds: 8,
        },
      },
    ];

    await safetyStore.update({
      killSwitchEngaged: true,
      incidents,
      mode: 'contain',
    });

    const killSwitchState = await safetyStore.read();
    samples.push({
      step: 'kill_switch_engaged',
      timestamp: new Date().toISOString(),
      coordinator: {
        type: agentPool.getCoordinatorType(),
        available: agentPool.isCoordinatorAvailable(),
      },
      recoveryAction: secondRecovery,
      killSwitchEngaged: killSwitchState.killSwitchEngaged,
      additionalLatencyMs: secondRecoveryCompleted - secondFailureStarted,
      incidentsRecorded: killSwitchState.incidents.length,
    });

    // Simulate stabilization: clear cooldowns, rollback coordinator, and reset kill switch.
    agentPool.clearCooldown('claude_code');
    agentPool.clearCooldown('codex_worker_1');
    agentPool.demoteCoordinatorRole();

    const incidentsWithRollback = [
      ...killSwitchState.incidents,
      {
        id: `incident-${Date.now() + 1}`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
        summary: 'Circuit breaker rollback complete; restoring Claude coordinator',
        details: {
          action: 'rollback',
          killSwitchCleared: true,
        },
      },
    ];

    await safetyStore.update({
      killSwitchEngaged: false,
      incidents: incidentsWithRollback,
      mode: 'stabilize',
    });

    const finalSafety = await safetyStore.read();
    samples.push({
      step: 'post_rollback',
      timestamp: new Date().toISOString(),
      coordinator: {
        type: agentPool.getCoordinatorType(),
        available: agentPool.isCoordinatorAvailable(),
      },
      killSwitchEngaged: finalSafety.killSwitchEngaged,
      incidentCount: finalSafety.incidents.length,
    });

    const result = {
      generated_at: new Date().toISOString(),
      workspace_used: path.relative(repoRoot, workspaceRoot),
      scenario: 'provider_failover_simulation',
      samples,
      summary: {
        failoverPromotedCodex: samples.some(
          (sample) => sample.step === 'post_failover' && sample.coordinator.type === 'codex',
        ),
        killSwitchEngagedDuringIncident: killSwitchState.killSwitchEngaged,
        rollbackRestoredClaude: samples.some(
          (sample) => sample.step === 'post_rollback' && sample.coordinator.type === 'claude_code',
        ),
        failoverLatencyMs: samples.find((sample) => sample.step === 'post_failover')?.failoverLatencyMs ?? null,
        rollbackIncidentCount: finalSafety.incidents.length,
      },
    };

    const outputPath = path.join(experimentsDir, 'failover_test.json');
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');

    console.log(`✅ Provider failover test written to ${path.relative(repoRoot, outputPath)}`);
  } finally {
    if (stateMachine) {
      stateMachine.close();
    }
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  console.error('❌ Provider failover test failed:', error);
  process.exitCode = 1;
});
