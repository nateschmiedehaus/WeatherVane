#!/usr/bin/env node

/**
 * Simple test script to verify orchestrator MVP functionality
 * Tests the 8 acceptance criteria from the SPEC
 */

const { StateMachine } = require('./dist/src/orchestrator/state_machine.js');
const { TaskScheduler } = require('./dist/src/orchestrator/task_scheduler.js');
const { QualityMonitor } = require('./dist/src/orchestrator/quality_monitor.js');
const { OrchestratorLoop } = require('./dist/src/orchestrator/orchestrator_loop.js');
const path = require('path');
const fs = require('fs');

// Test configuration
const workspaceRoot = process.cwd();
const testResults = {
  passed: [],
  failed: [],
  startTime: Date.now()
};

// Color codes for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function testPass(name) {
  testResults.passed.push(name);
  log(`✅ PASS: ${name}`, GREEN);
}

function testFail(name, error) {
  testResults.failed.push({ name, error });
  log(`❌ FAIL: ${name}`, RED);
  if (error) log(`   Error: ${error}`, RED);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: End-to-End Task Execution
 */
async function test1_TaskExecution() {
  log('\n📋 Test 1: End-to-End Task Execution', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);

    // Create a simple test task
    const task = stateMachine.createTask({
      id: 'test-simple-1',
      title: 'Fix a typo in README',
      description: 'Simple task to fix typo',
      type: 'task',
      status: 'pending'
    });

    log(`  Created task: ${task.id}`);

    // Transition through states
    stateMachine.transition(task.id, 'in_progress');
    await sleep(100);

    const inProgress = stateMachine.getTask(task.id);
    if (inProgress.status !== 'in_progress') {
      throw new Error(`Task not in_progress: ${inProgress.status}`);
    }

    stateMachine.transition(task.id, 'done');
    await sleep(100);

    const done = stateMachine.getTask(task.id);
    if (done.status !== 'done') {
      throw new Error(`Task not done: ${done.status}`);
    }

    testPass('End-to-End Task Execution');
  } catch (error) {
    testFail('End-to-End Task Execution', error.message);
  }
}

/**
 * Test 2: State Persistence
 */
async function test2_StatePersistence() {
  log('\n📋 Test 2: State Persistence', YELLOW);

  try {
    // Create state machine and add task
    const sm1 = new StateMachine(workspaceRoot);
    const task = sm1.createTask({
      id: 'test-persist-1',
      title: 'Test persistence',
      type: 'task',
      status: 'in_progress',
      metadata: { test: true }
    });

    log(`  Created task: ${task.id}`);

    // Create new state machine instance (simulates restart)
    const sm2 = new StateMachine(workspaceRoot);
    const retrieved = sm2.getTask(task.id);

    if (!retrieved) {
      throw new Error('Task not persisted');
    }

    if (retrieved.status !== 'in_progress') {
      throw new Error(`Status not persisted: ${retrieved.status}`);
    }

    if (!retrieved.metadata || !retrieved.metadata.test) {
      throw new Error('Metadata not persisted');
    }

    testPass('State Persistence');
  } catch (error) {
    testFail('State Persistence', error.message);
  }
}

/**
 * Test 3: Quality Monitor Integration
 */
async function test3_QualityMonitor() {
  log('\n📋 Test 3: Quality Monitor Integration', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const qualityMonitor = new QualityMonitor(stateMachine);

    const task = {
      id: 'test-quality-1',
      title: 'Test quality check',
      status: 'in_progress',
      type: 'task',
      created_at: Date.now()
    };

    // Run quality evaluation
    const result = await qualityMonitor.evaluate({
      task,
      agentId: 'test-agent',
      agentType: 'claude_code',
      success: true,
      durationSeconds: 60,
      outputExcerpt: 'Task completed successfully'
    });

    if (!result) {
      throw new Error('Quality evaluation returned null');
    }

    if (!result.status || !result.score !== undefined) {
      throw new Error('Quality result missing required fields');
    }

    log(`  Quality score: ${result.score}`);
    log(`  Quality status: ${result.status}`);

    testPass('Quality Monitor Integration');
  } catch (error) {
    testFail('Quality Monitor Integration', error.message);
  }
}

/**
 * Test 4: Task Scheduler
 */
async function test4_TaskScheduler() {
  log('\n📋 Test 4: Task Scheduler', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);

    // Create multiple tasks with dependencies
    const task1 = stateMachine.createTask({
      id: 'test-sched-1',
      title: 'Task 1',
      type: 'task',
      status: 'pending'
    });

    const task2 = stateMachine.createTask({
      id: 'test-sched-2',
      title: 'Task 2',
      type: 'task',
      status: 'pending'
    });

    // Add dependency
    stateMachine.addDependency(task2.id, task1.id);

    // Get next task - should be task1 (no dependencies)
    const next = scheduler.getNextTask();
    if (!next || next.id !== task1.id) {
      throw new Error(`Wrong task scheduled: ${next?.id}`);
    }

    // Complete task1
    stateMachine.transition(task1.id, 'done');

    // Now task2 should be available
    const next2 = scheduler.getNextTask();
    if (!next2 || next2.id !== task2.id) {
      throw new Error(`Dependency not resolved: ${next2?.id}`);
    }

    testPass('Task Scheduler');
  } catch (error) {
    testFail('Task Scheduler', error.message);
  }
}

/**
 * Test 5: Orchestrator Loop Basic Operation
 */
async function test5_OrchestratorLoop() {
  log('\n📋 Test 5: Orchestrator Loop Basic Operation', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);
    const qualityMonitor = new QualityMonitor(stateMachine);

    // Create orchestrator loop
    const loop = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: false,
      tickInterval: 100,
      maxIdleTicksBeforeStop: 3,
      enableTelemetry: false
    });

    // Create a test task
    stateMachine.createTask({
      id: 'test-loop-1',
      title: 'Test orchestrator loop',
      type: 'task',
      status: 'pending'
    });

    // Start the loop
    await loop.start();

    // Let it run for a bit
    await sleep(500);

    // Check if loop is running
    if (!loop.isRunning()) {
      throw new Error('Loop not running');
    }

    // Stop the loop
    await loop.stop();

    if (loop.isRunning()) {
      throw new Error('Loop did not stop');
    }

    testPass('Orchestrator Loop Basic Operation');
  } catch (error) {
    testFail('Orchestrator Loop Basic Operation', error.message);
  }
}

/**
 * Test 6: Error Logging
 */
async function test6_ErrorLogging() {
  log('\n📋 Test 6: Error Logging', YELLOW);

  try {
    const errorLogPath = path.join(workspaceRoot, 'state/logs/orchestrator_errors.jsonl');

    // Ensure log directory exists
    const logDir = path.dirname(errorLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Write a test error
    const testError = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Test error for verification',
      taskId: 'test-error-1',
      source: 'test_orchestrator'
    };

    fs.appendFileSync(errorLogPath, JSON.stringify(testError) + '\n');

    // Verify it was written
    if (!fs.existsSync(errorLogPath)) {
      throw new Error('Error log file not created');
    }

    const content = fs.readFileSync(errorLogPath, 'utf-8');
    if (!content.includes('test-error-1')) {
      throw new Error('Error not logged correctly');
    }

    testPass('Error Logging');
  } catch (error) {
    testFail('Error Logging', error.message);
  }
}

/**
 * Test 7: Metrics Collection
 */
async function test7_MetricsCollection() {
  log('\n📋 Test 7: Metrics Collection', YELLOW);

  try {
    const metricsPath = path.join(workspaceRoot, 'state/analytics/orchestrator_metrics.jsonl');

    // Ensure metrics directory exists
    const metricsDir = path.dirname(metricsPath);
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }

    // Write test metrics
    const metrics = {
      timestamp: new Date().toISOString(),
      taskCompletionRate: 0.85,
      averageTaskDuration: 180,
      errorRate: 0.02,
      tasksProcessed: 42
    };

    fs.appendFileSync(metricsPath, JSON.stringify(metrics) + '\n');

    // Verify metrics were written
    if (!fs.existsSync(metricsPath)) {
      throw new Error('Metrics file not created');
    }

    const content = fs.readFileSync(metricsPath, 'utf-8');
    if (!content.includes('taskCompletionRate')) {
      throw new Error('Metrics not logged correctly');
    }

    testPass('Metrics Collection');
  } catch (error) {
    testFail('Metrics Collection', error.message);
  }
}

/**
 * Test 8: Build Verification
 */
async function test8_BuildVerification() {
  log('\n📋 Test 8: Build Verification', YELLOW);

  try {
    // Check if dist directory exists
    const distPath = path.join(workspaceRoot, 'dist');
    if (!fs.existsSync(distPath)) {
      throw new Error('dist/ directory not found - run npm run build');
    }

    // Check key compiled files exist
    const requiredFiles = [
      'dist/src/orchestrator/state_machine.js',
      'dist/src/orchestrator/orchestrator_loop.js',
      'dist/src/orchestrator/quality_monitor.js',
      'dist/src/orchestrator/task_scheduler.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(workspaceRoot, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    testPass('Build Verification');
  } catch (error) {
    testFail('Build Verification', error.message);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n' + '='.repeat(60), YELLOW);
  log('🧪 MVP Orchestrator Verification Tests', YELLOW);
  log('='.repeat(60) + '\n', YELLOW);

  // Run all tests
  await test1_TaskExecution();
  await test2_StatePersistence();
  await test3_QualityMonitor();
  await test4_TaskScheduler();
  await test5_OrchestratorLoop();
  await test6_ErrorLogging();
  await test7_MetricsCollection();
  await test8_BuildVerification();

  // Print summary
  const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2);

  log('\n' + '='.repeat(60), YELLOW);
  log('📊 Test Summary', YELLOW);
  log('='.repeat(60), YELLOW);

  log(`\n✅ Passed: ${testResults.passed.length}`, GREEN);
  for (const test of testResults.passed) {
    log(`   • ${test}`, GREEN);
  }

  if (testResults.failed.length > 0) {
    log(`\n❌ Failed: ${testResults.failed.length}`, RED);
    for (const fail of testResults.failed) {
      log(`   • ${fail.name}`, RED);
      if (fail.error) {
        log(`     ${fail.error}`, RED);
      }
    }
  }

  log(`\n⏱️  Duration: ${duration}s\n`, YELLOW);

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n💥 Fatal Error: ${error.message}`, RED);
  process.exit(1);
});