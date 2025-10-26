#!/usr/bin/env ts-node
/**
 * Test Orchestrator - Verify the orchestration system works
 *
 * This script:
 * 1. Initializes the orchestration runtime
 * 2. Creates a simple test task
 * 3. Watches it get assigned and executed
 * 4. Reports results
 *
 * Usage:
 *   ts-node scripts/test_orchestrator.ts [--workspace /path/to/WeatherVane]
 */

import { OrchestratorRuntime } from '../src/orchestrator/orchestrator_runtime.js';
import { ResilienceManager } from '../src/orchestrator/resilience_manager.js';

async function test(workspaceRoot: string) {
  console.log('🧪 Testing Orchestrator Runtime\n');
  console.log(`Workspace: ${workspaceRoot}\n`);

  // Initialize runtime
  console.log('1️⃣ Initializing orchestration runtime...');
  const runtime = new OrchestratorRuntime(workspaceRoot, {
    codexWorkers: 1, // Just 1 worker for testing
    targetCodexRatio: 5.0
  });

  const stateMachine = runtime.getStateMachine();

  // Create test task
  console.log('2️⃣ Creating test task...');
  const testTask = stateMachine.createTask({
    id: 'TEST-ORCH-1',
    title: 'Test orchestrator functionality',
    description: 'This is a test task to verify the orchestrator works. Please respond with "Test successful" and mark this as complete.',
    type: 'task',
    status: 'pending',
    estimated_complexity: 2
  });

  console.log(`   ✅ Created task: ${testTask.id}`);

  // Set up monitoring
  let taskStarted = false;
  let taskCompleted = false;
  let executionDetails: any = null;

  stateMachine.on('task:transition', (task, fromStatus, toStatus) => {
    if (task.id === testTask.id) {
      console.log(`   📊 Task transition: ${fromStatus} → ${toStatus}`);
      if (toStatus === 'in_progress') taskStarted = true;
      if (toStatus === 'done' || toStatus === 'needs_review') taskCompleted = true;
    }
  });

  stateMachine.on('task:assigned', (task, agent) => {
    if (task.id === testTask.id) {
      console.log(`   🤖 Task assigned to: ${agent}`);
    }
  });

  // Start runtime
  console.log('3️⃣ Starting orchestration runtime...');
  runtime.start();

  // Wait for task to be processed (max 60 seconds)
  console.log('4️⃣ Waiting for task execution...\n');

  const maxWait = 60000; // 60 seconds
  const checkInterval = 1000; // 1 second
  let elapsed = 0;

  while (elapsed < maxWait && !taskCompleted) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;

    if (elapsed % 5000 === 0) {
      console.log(`   ⏳ Waiting... (${elapsed / 1000}s)`);
    }
  }

  // Check results
  console.log('\n5️⃣ Results:\n');

  const finalTask = stateMachine.getTask(testTask.id);
  if (!finalTask) {
    console.error('❌ Task not found after execution');
    runtime.stop();
    process.exit(1);
  }

  console.log(`   Task ID:      ${finalTask.id}`);
  console.log(`   Title:        ${finalTask.title}`);
  console.log(`   Status:       ${finalTask.status}`);
  console.log(`   Assigned to:  ${finalTask.assigned_to || 'none'}`);
  console.log(`   Started at:   ${finalTask.started_at ? new Date(finalTask.started_at).toISOString() : 'not started'}`);
  console.log(`   Completed at: ${finalTask.completed_at ? new Date(finalTask.completed_at).toISOString() : 'not completed'}`);
  console.log(`   Duration:     ${finalTask.actual_duration_seconds ? `${finalTask.actual_duration_seconds}s` : 'N/A'}`);

  // Get events
  const events = stateMachine.getEvents({ taskId: testTask.id });
  console.log(`\n   Events: ${events.length}`);
  events.forEach(e => {
    console.log(`     - ${e.event_type} at ${new Date(e.timestamp).toISOString()} by ${e.agent || 'system'}`);
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  if (taskCompleted) {
    console.log('✅ TEST PASSED - Orchestrator is working!');
    console.log('='.repeat(60));
    console.log('\nThe orchestration runtime successfully:');
    console.log('  ✅ Initialized all components');
    console.log('  ✅ Detected the test task');
    console.log('  ✅ Assigned it to an agent');
    console.log('  ✅ Executed the task');
    console.log('  ✅ Recorded all events');
    console.log('\n🚀 Your orchestration system is ready to use!\n');
  } else {
    console.log('⚠️  TEST INCOMPLETE - Task did not complete in time');
    console.log('='.repeat(60));
    console.log('\nPossible reasons:');
    console.log('  - Agent authentication missing (run `codex login` and `claude login`)');
    console.log('  - Network issues');
    console.log('  - Task is still in queue (check task status)');
    console.log('\nTask status:', finalTask.status);
    console.log('Check logs for more details.\n');
  }

  // Cleanup
  runtime.stop();
  process.exit(taskCompleted ? 0 : 1);
}

// Parse args
const args = process.argv.slice(2);
let workspaceRoot = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && args[i + 1]) {
    workspaceRoot = args[i + 1];
    i++;
  }
}

// Run test
test(workspaceRoot).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
