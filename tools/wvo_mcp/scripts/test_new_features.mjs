#!/usr/bin/env node

/**
 * Smoke test for new orchestration features
 * Tests: CriticReputationTracker, DecisionEvidenceLinker, TaskScheduler enhancements
 */

import { StateMachine } from '../dist/orchestrator/state_machine.js';
import { CriticReputationTracker } from '../dist/orchestrator/critic_reputation_tracker.js';
import { DecisionEvidenceLinker } from '../dist/telemetry/decision_evidence_linker.js';
import { TaskScheduler } from '../dist/orchestrator/task_scheduler.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, '../../..');

console.log('🧪 Smoke Testing New Orchestration Features\n');

try {
  // Test 1: StateMachine initialization
  console.log('✓ Test 1: StateMachine initialization');
  const stateMachine = new StateMachine(workspaceRoot, { readonly: true });
  console.log('  StateMachine created successfully');

  // Test 2: CriticReputationTracker
  console.log('\n✓ Test 2: CriticReputationTracker');
  const reputationTracker = new CriticReputationTracker(stateMachine);
  console.log('  CriticReputationTracker instantiated');

  const allReputations = reputationTracker.getAllReputations();
  console.log(`  Found ${allReputations.critics.length} critics in history`);
  console.log(`  Average confidence: ${(allReputations.averageConfidence * 100).toFixed(1)}%`);

  if (allReputations.critics.length > 0) {
    const topCritic = allReputations.critics[0];
    console.log(`  Top critic: ${topCritic.critic} (confidence: ${(topCritic.confidence * 100).toFixed(1)}%)`);
  }

  // Test 3: DecisionEvidenceLinker
  console.log('\n✓ Test 3: DecisionEvidenceLinker');
  const evidenceLinker = new DecisionEvidenceLinker(stateMachine);
  console.log('  DecisionEvidenceLinker instantiated');

  const summary = evidenceLinker.getSummary(86400000); // 24h
  console.log(`  Decisions in last 24h: ${summary.decisions}`);
  console.log(`  High confidence decisions: ${summary.highConfidenceDecisions}`);
  console.log(`  Average confidence: ${(summary.averageConfidence * 100).toFixed(1)}%`);

  // Test 4: TaskScheduler enhancements
  console.log('\n✓ Test 4: TaskScheduler enhancements');
  const scheduler = new TaskScheduler(stateMachine);
  console.log('  TaskScheduler instantiated');

  const stuckTasks = scheduler.detectStuckTasks(3600000); // 1 hour threshold
  console.log(`  Stuck tasks detected: ${stuckTasks.length}`);

  if (stuckTasks.length > 0) {
    const stuck = stuckTasks[0];
    console.log(`    - ${stuck.task.title}`);
    console.log(`      Stalled for: ${Math.floor(stuck.timeSinceLastEvent / 60000)}min`);
    console.log(`      Recommendation: ${stuck.recommendation}`);
  }

  const velocity = scheduler.getVelocityMetrics(86400000); // 24h
  console.log(`  Velocity metrics:`);
  console.log(`    Completed: ${velocity.completedTasks} tasks`);
  console.log(`    Rate: ${velocity.tasksPerHour.toFixed(2)} tasks/hour`);
  console.log(`    Avg completion time: ${Math.floor(velocity.averageCompletionTime / 1000)}s`);
  console.log(`    In progress: ${velocity.inProgressCount}`);
  console.log(`    Stalled: ${velocity.stalledCount}`);

  // Test 5: Integration test - trace a task if any exist
  console.log('\n✓ Test 5: Integration test');
  const allTasks = stateMachine.getTasks();
  if (allTasks.length > 0) {
    const taskToTrace = allTasks[0];
    console.log(`  Tracing task: ${taskToTrace.title}`);

    const evidence = evidenceLinker.traceTask(taskToTrace.id);
    if (evidence) {
      console.log(`    Evidence nodes: ${evidence.nodes.length}`);
      console.log(`    Events: ${evidence.summary.totalEvents}`);
      console.log(`    Quality checks: ${evidence.summary.qualityChecks}`);
      console.log(`    Decisions: ${evidence.summary.decisions}`);
      if (evidence.timeline.duration) {
        console.log(`    Duration: ${Math.floor(evidence.timeline.duration / 1000)}s`);
      }
    }
  } else {
    console.log('  No tasks found to trace (this is OK for a fresh system)');
  }

  stateMachine.close();
  scheduler.destroy();

  console.log('\n✅ All smoke tests passed!\n');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
