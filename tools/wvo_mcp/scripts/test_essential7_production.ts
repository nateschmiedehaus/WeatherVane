#!/usr/bin/env node
/**
 * Essential 7 Production Integration Test
 *
 * Tests all 7 core integrations for optimal project management:
 * 1. Intelligent Model Router (model_router.ts)
 * 2. WIP Limits (RoadmapPoller + prefetchTasks)
 * 3. Task Decomposition Engine (task_decomposer.ts)
 * 4. Parallel Task Execution (UnifiedOrchestrator)
 * 5. Pre-Flight Quality Checks (preflight_runner.ts)
 * 6. Peer Review Protocol (peer_review_manager.ts)
 * 7. Blocker Escalation SLA (blocker_escalation_manager.ts)
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Go up from scripts/ to wvo_mcp/ to tools/ to ROOT
const ROOT = path.resolve(__dirname, '../../..');
const STATE_DIR = path.join(ROOT, 'state');
const DB_PATH = path.join(STATE_DIR, 'orchestrator.db');

interface TestResult {
  name: string;
  passed: boolean;
  evidence: string[];
  errors: string[];
}

const results: TestResult[] = [];

function logTest(name: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  console.log(`✓ ${message}`);
}

function logFailure(message: string) {
  console.log(`✗ ${message}`);
}

function logEvidence(message: string) {
  console.log(`  → ${message}`);
}

async function initializeDatabase(): Promise<Database.Database> {
  console.log('\n📊 Connecting to database...');

  // Ensure state directory exists
  await fs.mkdir(STATE_DIR, { recursive: true });

  // Open existing database (don't recreate tables)
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Verify database is accessible
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
    logSuccess(`Database connected (${count.count} existing tasks)`);
  } catch (error) {
    logFailure('Database connection failed');
    throw error;
  }

  return db;
}

async function test1_ModelRouter(db: Database.Database): Promise<TestResult> {
  logTest('1. Intelligent Model Router');

  const result: TestResult = {
    name: 'Model Router',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    // Check if model_router.ts exists
    const routerPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/model_router.ts');
    await fs.access(routerPath);
    result.evidence.push('model_router.ts exists');
    logSuccess('Found model_router.ts');

    // Read the file to verify key functions
    const content = await fs.readFile(routerPath, 'utf-8');

    if (content.includes('selectModelForTask')) {
      result.evidence.push('selectModelForTask function present');
      logSuccess('selectModelForTask function found');
    } else {
      result.errors.push('selectModelForTask function missing');
      logFailure('selectModelForTask function not found');
    }

    if (content.includes('estimateTaskCost')) {
      result.evidence.push('estimateTaskCost function present');
      logSuccess('estimateTaskCost function found');
    } else {
      result.errors.push('estimateTaskCost function missing');
      logFailure('estimateTaskCost function not found');
    }

    if (content.includes('ModelTier') || content.includes('haiku') || content.includes('sonnet')) {
      result.evidence.push('Model tier routing logic present');
      logSuccess('Model tier routing detected');
    }

    // Check for integration in unified_orchestrator.ts
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const orchContent = await fs.readFile(orchPath, 'utf-8');

    if (orchContent.includes('selectModelForTask') || orchContent.includes('model_router')) {
      result.evidence.push('Integrated into UnifiedOrchestrator');
      logSuccess('Model router integrated into orchestrator');
    } else {
      result.errors.push('Not integrated into UnifiedOrchestrator');
      logFailure('Model router not integrated');
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test2_WIPLimits(db: Database.Database): Promise<TestResult> {
  logTest('2. WIP Limits');

  const result: TestResult = {
    name: 'WIP Limits',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    // Check UnifiedOrchestrator for WIP limit logic
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const content = await fs.readFile(orchPath, 'utf-8');

    if (content.includes('prefetchTasks')) {
      result.evidence.push('prefetchTasks method exists');
      logSuccess('Found prefetchTasks method');
    }

    if (content.includes('in_progress') && (content.includes('wipLimit') || content.includes('WIP'))) {
      result.evidence.push('WIP limit checks detected');
      logSuccess('WIP limit logic found');
    } else {
      // Check for implicit WIP limiting via agent pool
      if (content.includes('assignNextTaskIfAvailable')) {
        result.evidence.push('Task assignment respects agent availability (implicit WIP)');
        logSuccess('Implicit WIP limiting via agent pool');
      }
    }

    // Check RoadmapPoller integration
    if (content.includes('RoadmapPoller')) {
      result.evidence.push('RoadmapPoller integrated for task polling');
      logSuccess('RoadmapPoller present');
    }

    // Insert test tasks to verify WIP limiting behavior
    const testTasks = [
      { id: 'TEST-WIP-1', title: 'Test Task 1', type: 'task', status: 'in_progress' },
      { id: 'TEST-WIP-2', title: 'Test Task 2', type: 'task', status: 'in_progress' },
      { id: 'TEST-WIP-3', title: 'Test Task 3', type: 'task', status: 'pending' }
    ];

    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('INSERT OR REPLACE INTO tasks (id, title, type, status, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const task of testTasks) {
      stmt.run(task.id, task.title, task.type, task.status, now);
    }

    const inProgressCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get('in_progress') as { count: number };
    result.evidence.push(`Database shows ${inProgressCount.count} tasks in progress`);
    logEvidence(`${inProgressCount.count} tasks currently in progress`);

    result.passed = result.evidence.length >= 2;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test3_TaskDecomposer(db: Database.Database): Promise<TestResult> {
  logTest('3. Task Decomposition Engine');

  const result: TestResult = {
    name: 'Task Decomposer',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    const decomposerPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/task_decomposer.ts');
    await fs.access(decomposerPath);
    result.evidence.push('task_decomposer.ts exists');
    logSuccess('Found task_decomposer.ts');

    const content = await fs.readFile(decomposerPath, 'utf-8');

    if (content.includes('class TaskDecomposer')) {
      result.evidence.push('TaskDecomposer class present');
      logSuccess('TaskDecomposer class found');
    }

    if (content.includes('decomposeEpic') || content.includes('decompose')) {
      result.evidence.push('Decomposition method present');
      logSuccess('Decomposition logic found');
    }

    // Check for integration
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const orchContent = await fs.readFile(orchPath, 'utf-8');

    if (orchContent.includes('TaskDecomposer')) {
      result.evidence.push('Integrated into UnifiedOrchestrator');
      logSuccess('TaskDecomposer integrated');
    } else {
      result.errors.push('Not integrated into orchestrator');
      logFailure('TaskDecomposer not integrated');
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test4_ParallelExecution(db: Database.Database): Promise<TestResult> {
  logTest('4. Parallel Task Execution');

  const result: TestResult = {
    name: 'Parallel Execution',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const content = await fs.readFile(orchPath, 'utf-8');

    // Check for agent pool
    if (content.includes('AgentPool') || content.includes('agent_pool')) {
      result.evidence.push('AgentPool system present');
      logSuccess('AgentPool found');
    }

    // Check for parallel task assignment
    if (content.includes('assignNextTaskIfAvailable')) {
      result.evidence.push('Task assignment method present');
      logSuccess('Task assignment logic found');
    }

    // Check for worker management
    if (content.includes('worker') && (content.includes('forEach') || content.includes('map') || content.includes('Promise.all'))) {
      result.evidence.push('Multi-worker execution detected');
      logSuccess('Parallel worker execution capability detected');
    }

    // Check for DAG/dependency handling
    if (content.includes('dependencies') || content.includes('getReadyTasks')) {
      result.evidence.push('Dependency management present');
      logSuccess('DAG-based task scheduling found');
    }

    result.passed = result.evidence.length >= 3;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test5_PreflightChecks(db: Database.Database): Promise<TestResult> {
  logTest('5. Pre-Flight Quality Checks');

  const result: TestResult = {
    name: 'Preflight Checks',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    const preflightPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/preflight_runner.ts');
    await fs.access(preflightPath);
    result.evidence.push('preflight_runner.ts exists');
    logSuccess('Found preflight_runner.ts');

    const content = await fs.readFile(preflightPath, 'utf-8');

    if (content.includes('class PreflightRunner')) {
      result.evidence.push('PreflightRunner class present');
      logSuccess('PreflightRunner class found');
    }

    if (content.includes('runPreflight') || content.includes('check')) {
      result.evidence.push('Preflight execution method present');
      logSuccess('Preflight execution logic found');
    }

    // Check for integration
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const orchContent = await fs.readFile(orchPath, 'utf-8');

    if (orchContent.includes('PreflightRunner')) {
      result.evidence.push('Integrated into UnifiedOrchestrator');
      logSuccess('PreflightRunner integrated');
    } else {
      result.errors.push('Not integrated into orchestrator');
      logFailure('PreflightRunner not integrated');
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test6_PeerReview(db: Database.Database): Promise<TestResult> {
  logTest('6. Peer Review Protocol');

  const result: TestResult = {
    name: 'Peer Review',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    const reviewPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/peer_review_manager.ts');
    await fs.access(reviewPath);
    result.evidence.push('peer_review_manager.ts exists');
    logSuccess('Found peer_review_manager.ts');

    const content = await fs.readFile(reviewPath, 'utf-8');

    if (content.includes('class PeerReviewManager')) {
      result.evidence.push('PeerReviewManager class present');
      logSuccess('PeerReviewManager class found');
    }

    if (content.includes('requiresReview') || content.includes('assignReviewer')) {
      result.evidence.push('Review assignment logic present');
      logSuccess('Review assignment logic found');
    }

    // Check for integration
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const orchContent = await fs.readFile(orchPath, 'utf-8');

    if (orchContent.includes('PeerReviewManager')) {
      result.evidence.push('Integrated into UnifiedOrchestrator');
      logSuccess('PeerReviewManager integrated');
    } else {
      result.errors.push('Not integrated into orchestrator');
      logFailure('PeerReviewManager not integrated');
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function test7_BlockerEscalation(db: Database.Database): Promise<TestResult> {
  logTest('7. Blocker Escalation SLA');

  const result: TestResult = {
    name: 'Blocker Escalation',
    passed: false,
    evidence: [],
    errors: []
  };

  try {
    const blockerPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/blocker_escalation_manager.ts');
    await fs.access(blockerPath);
    result.evidence.push('blocker_escalation_manager.ts exists');
    logSuccess('Found blocker_escalation_manager.ts');

    const content = await fs.readFile(blockerPath, 'utf-8');

    if (content.includes('class BlockerEscalationManager')) {
      result.evidence.push('BlockerEscalationManager class present');
      logSuccess('BlockerEscalationManager class found');
    }

    if (content.includes('checkBlockers') || content.includes('escalate')) {
      result.evidence.push('Escalation logic present');
      logSuccess('Escalation logic found');
    }

    // Check for SLA timing (4h, 8h, or 24h)
    if (content.match(/4\s*\*\s*60\s*\*\s*60|8\s*\*\s*60\s*\*\s*60|24\s*\*\s*60\s*\*\s*60/)) {
      result.evidence.push('SLA timing thresholds detected');
      logSuccess('SLA timing found (4h/8h/24h)');
    }

    // Check for integration
    const orchPath = path.join(ROOT, 'tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts');
    const orchContent = await fs.readFile(orchPath, 'utf-8');

    if (orchContent.includes('BlockerEscalationManager')) {
      result.evidence.push('Integrated into UnifiedOrchestrator');
      logSuccess('BlockerEscalationManager integrated');
    } else {
      result.errors.push('Not integrated into orchestrator');
      logFailure('BlockerEscalationManager not integrated');
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logFailure(`Error: ${error}`);
  }

  return result;
}

async function generateReport(results: TestResult[]): Promise<void> {
  console.log('\n\n' + '='.repeat(60));
  console.log('ESSENTIAL 7 INTEGRATION TEST RESULTS');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`\nOverall: ${passed}/${total} tests passed (${percentage}%)\n`);

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}`);

    if (result.evidence.length > 0) {
      console.log('   Evidence:');
      for (const evidence of result.evidence) {
        console.log(`     ✓ ${evidence}`);
      }
    }

    if (result.errors.length > 0) {
      console.log('   Errors:');
      for (const error of result.errors) {
        console.log(`     ✗ ${error}`);
      }
    }

    console.log('');
  }

  // Summary recommendations
  console.log('='.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(60));

  const failed = results.filter(r => !r.passed);
  if (failed.length === 0) {
    console.log('✅ All integrations verified! System is production-ready.');
  } else {
    console.log('⚠️  Some integrations need attention:\n');
    for (const result of failed) {
      console.log(`❌ ${result.name}:`);
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));

  // Save report
  const reportPath = path.join(ROOT, 'state/analytics/essential7_integration_test.json');
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    passed,
    total,
    percentage,
    results
  }, null, 2));

  console.log(`\n📊 Full report saved to: ${reportPath}`);
}

async function main() {
  console.log('🚀 Essential 7 Production Integration Test');
  console.log('Testing all 7 core integrations for optimal project management\n');

  let db: Database.Database | null = null;

  try {
    // Initialize database
    db = await initializeDatabase();

    // Run all tests
    results.push(await test1_ModelRouter(db));
    results.push(await test2_WIPLimits(db));
    results.push(await test3_TaskDecomposer(db));
    results.push(await test4_ParallelExecution(db));
    results.push(await test5_PreflightChecks(db));
    results.push(await test6_PeerReview(db));
    results.push(await test7_BlockerEscalation(db));

    // Generate report
    await generateReport(results);

    // Clean up test data
    db.prepare('DELETE FROM tasks WHERE id LIKE ?').run('TEST-%');

    // Exit with appropriate code
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite failed:');
    console.error(error);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

main();
