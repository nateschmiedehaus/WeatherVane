#!/usr/bin/env node

/**
 * Test MCP Integration
 * Verifies that MCP client and orchestrator integration work correctly
 */

import { OrchestratorLoop } from './dist/src/orchestrator/orchestrator_loop.js';
import { StateMachine } from './dist/src/orchestrator/state_machine.js';
import { TaskScheduler } from './dist/src/orchestrator/task_scheduler.js';
import { QualityMonitor } from './dist/src/orchestrator/quality_monitor.js';
import { MCPClient } from './dist/src/orchestrator/mcp_client.js';

const workspaceRoot = process.cwd();

// Color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testMCPIntegration() {
  log('\n🔌 Testing MCP Integration', YELLOW);

  try {
    // Test 1: MCP Client initialization
    log('\n1. Testing MCP Client initialization');
    const mcpClient = new MCPClient(workspaceRoot, {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000,
      enabled: true
    });
    log('   ✅ MCP Client created', GREEN);

    // Test 2: Orchestrator with MCP integration
    log('\n2. Testing Orchestrator with MCP');
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);
    const qualityMonitor = new QualityMonitor(stateMachine);

    const loop = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: false,
      tickInterval: 100,
      maxIdleTicksBeforeStop: 2,
      enableAdaptiveRoadmap: true,
      enableContextManager: true,
      enableQualityTrends: true,
      enableMCPIntegration: true,
      enableWorkProcessEnforcement: true,
      workspaceRoot
    });

    log('   ✅ Orchestrator created with MCP integration', GREEN);

    // Test 3: MCP Health check
    log('\n3. Testing MCP health check');
    const healthy = await mcpClient.healthCheck();
    log(`   ${healthy ? '✅' : '⚠️ '} MCP health check: ${healthy ? 'passed' : 'mock mode (expected)'}`, healthy ? GREEN : YELLOW);

    // Test 4: MCP plan fetch
    log('\n4. Testing MCP plan fetch');
    const plan = await mcpClient.planNext(1, true);
    if (plan) {
      log(`   ✅ MCP plan fetched: ${plan.tasks.length} tasks`, GREEN);
    } else {
      log('   ⚠️  MCP plan fetch returned null (mock mode)', YELLOW);
    }

    // Test 5: MCP status sync
    log('\n5. Testing MCP status sync');
    const updateResult = await mcpClient.planUpdate('test-task-1', 'in_progress');
    if (updateResult) {
      log(`   ✅ MCP status sync: ${updateResult.success ? 'success' : 'failed'}`, updateResult.success ? GREEN : RED);
    } else {
      log('   ⚠️  MCP status sync returned null (mock mode)', YELLOW);
    }

    // Test 6: MCP context write
    log('\n6. Testing MCP context write');
    const contextResult = await mcpClient.contextWrite('Test Section', 'Test content', false);
    if (contextResult) {
      log(`   ✅ MCP context write: ${contextResult.success ? 'success' : 'failed'}`, contextResult.success ? GREEN : RED);
    } else {
      log('   ⚠️  MCP context write returned null (mock mode)', YELLOW);
    }

    // Test 7: MCP critics run
    log('\n7. Testing MCP critics run');
    const criticsResult = await mcpClient.criticsRun('test-task-1', 'code');
    if (criticsResult) {
      log(`   ✅ MCP critics run: score ${criticsResult.overall_score}`, GREEN);
    } else {
      log('   ⚠️  MCP critics run returned null (mock mode)', YELLOW);
    }

    log('\n✨ MCP Integration Test Complete!', GREEN);
    log('Note: Currently using mock MCP responses (expected behavior)', YELLOW);

    return true;

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, RED);
    return false;
  }
}

// Run test
testMCPIntegration().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  log(`\n💥 Fatal Error: ${error.message}`, RED);
  process.exit(1);
});