#!/usr/bin/env node

/**
 * Integration test for Phase 3 Intelligence Features
 * Tests AdaptiveRoadmap, ContextManager, and QualityTrends
 *
 * Connection to WeatherVane Purpose:
 * - Verifies autonomous operation capabilities needed for 24/7 weather data ingestion
 * - Ensures quality tracking for maintaining <5% forecast error
 * - Tests context assembly for intelligent model selection
 */

import { StateMachine } from './dist/src/orchestrator/state_machine.js';
import { TaskScheduler } from './dist/src/orchestrator/task_scheduler.js';
import { QualityMonitor } from './dist/src/orchestrator/quality_monitor.js';
import { OrchestratorLoop } from './dist/src/orchestrator/orchestrator_loop.js';
import { AdaptiveRoadmap } from './dist/src/orchestrator/adaptive_roadmap.js';
import { ContextManager } from './dist/src/orchestrator/context_manager.js';
import { QualityTrendsAnalyzer } from './dist/src/orchestrator/quality_trends.js';
import { ContextAssembler } from './dist/src/orchestrator/context_assembler.js';
import path from 'path';
import fs from 'fs';

// Test configuration
const workspaceRoot = process.cwd();
const testResults = {
  passed: [],
  failed: [],
  startTime: Date.now()
};

// Color codes
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

/**
 * Test 1: AdaptiveRoadmap Extension
 */
async function test1_AdaptiveRoadmap() {
  log('\n📋 Test 1: AdaptiveRoadmap Extension', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);
    const contextAssembler = new ContextAssembler(stateMachine, workspaceRoot);
    const adaptiveRoadmap = new AdaptiveRoadmap(stateMachine, contextAssembler);

    // Create some initial tasks
    for (let i = 0; i < 5; i++) {
      stateMachine.createTask({
        id: `test-roadmap-${Date.now()}-${i}`,
        title: `Initial task ${i}`,
        type: 'task',
        status: i < 2 ? 'done' : 'pending'
      });
    }

    // Check if extension triggers (should not - we have enough tasks)
    const extended = await adaptiveRoadmap.checkAndExtend();

    log(`  Tasks before: 5`);
    log(`  Extended: ${extended}`);
    log(`  Should extend when <25% tasks remain`);

    // Mark more tasks as done
    const tasks = stateMachine.getTasks({ status: ['pending'] });
    for (const task of tasks.slice(0, 2)) {
      stateMachine.transition(task.id, 'done');
    }

    // Now check again (should extend)
    const extendedAgain = await adaptiveRoadmap.checkAndExtend();

    if (!extended && extendedAgain) {
      testPass('AdaptiveRoadmap Extension');
    } else {
      testFail('AdaptiveRoadmap Extension', 'Extension logic not working correctly');
    }

  } catch (error) {
    testFail('AdaptiveRoadmap Extension', error.message);
  }
}

/**
 * Test 2: ContextManager Assembly
 */
async function test2_ContextManager() {
  log('\n📋 Test 2: ContextManager Assembly', YELLOW);

  try {
    const contextManager = new ContextManager(workspaceRoot);

    // Create a test task
    const task = {
      id: 'test-context-1',
      title: 'Implement weather API integration',
      description: 'Connect to OpenWeather API for real-time data',
      type: 'task',
      status: 'pending'
    };

    // Test minimal context
    const minimalContext = contextManager.assembleContext(task, 'minimal');
    if (!minimalContext || minimalContext.contextSize > 51200) {
      throw new Error('Minimal context too large or missing');
    }

    // Test detailed context
    const detailedContext = contextManager.assembleContext(task, 'detailed');
    if (!detailedContext || detailedContext.contextSize > 204800) {
      throw new Error('Detailed context too large or missing');
    }

    // Test comprehensive context
    const comprehensiveContext = contextManager.assembleContext(task, 'comprehensive');
    if (!comprehensiveContext) {
      throw new Error('Comprehensive context missing');
    }

    log(`  Minimal context: ${minimalContext.contextSize} bytes`);
    log(`  Detailed context: ${detailedContext.contextSize} bytes`);
    log(`  Comprehensive context: ${comprehensiveContext.contextSize} bytes`);

    testPass('ContextManager Assembly');

  } catch (error) {
    testFail('ContextManager Assembly', error.message);
  }
}

/**
 * Test 3: QualityTrends Recording
 */
async function test3_QualityTrends() {
  log('\n📋 Test 3: QualityTrends Recording', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const qualityTrends = new QualityTrendsAnalyzer(stateMachine, workspaceRoot);

    // Record some test scores
    const scores = [0.85, 0.87, 0.83, 0.89, 0.91, 0.88];

    for (let i = 0; i < scores.length; i++) {
      await qualityTrends.recordScore({
        taskId: `test-quality-${Date.now()}-${i}`,
        score: scores[i],
        timestamp: Date.now() - (i * 60000), // Spread over time
        agentType: 'test',
        category: 'code'
      });
    }

    // Analyze trends
    const trends = await qualityTrends.analyzeTrends('hourly');

    if (!trends || trends.sampleCount !== scores.length) {
      throw new Error(`Expected ${scores.length} samples, got ${trends?.sampleCount}`);
    }

    log(`  Recorded ${scores.length} quality scores`);
    log(`  Average score: ${trends.averageScore.toFixed(3)}`);
    log(`  Trend: ${trends.trend}`);

    // Check for degradation (should not trigger with improving scores)
    const alerts = await qualityTrends.checkForDegradation();
    log(`  Degradation alerts: ${alerts.length}`);

    // Clean up
    qualityTrends.close();

    testPass('QualityTrends Recording');

  } catch (error) {
    testFail('QualityTrends Recording', error.message);
  }
}

/**
 * Test 4: OrchestratorLoop Integration
 */
async function test4_OrchestratorIntegration() {
  log('\n📋 Test 4: OrchestratorLoop Integration', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);
    const qualityMonitor = new QualityMonitor(stateMachine);

    // Create loop with intelligence enabled
    const loop = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: false,
      tickInterval: 100,
      maxIdleTicksBeforeStop: 2,
      enableTelemetry: false,
      enableAdaptiveRoadmap: true,
      enableContextManager: true,
      enableQualityTrends: true,
      workspaceRoot
    });

    // Add a test task
    stateMachine.createTask({
      id: `test-integration-${Date.now()}`,
      title: 'Test intelligence integration',
      type: 'task',
      status: 'pending'
    });

    // Start the loop
    await loop.start();

    // Let it run for a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!loop.isRunning()) {
      throw new Error('Loop stopped unexpectedly');
    }

    // Stop the loop
    await loop.stop();

    log(`  Loop ran with all intelligence features enabled`);
    log(`  No errors during execution`);

    testPass('OrchestratorLoop Integration');

  } catch (error) {
    testFail('OrchestratorLoop Integration', error.message);
  }
}

/**
 * Test 5: Feature Flags
 */
async function test5_FeatureFlags() {
  log('\n📋 Test 5: Feature Flags', YELLOW);

  try {
    const stateMachine = new StateMachine(workspaceRoot);
    const scheduler = new TaskScheduler(stateMachine);
    const qualityMonitor = new QualityMonitor(stateMachine);

    // Test with all features disabled
    const loopDisabled = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: true,
      enableAdaptiveRoadmap: false,
      enableContextManager: false,
      enableQualityTrends: false
    });

    // Test with selective features
    const loopSelective = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: true,
      enableAdaptiveRoadmap: true,
      enableContextManager: false,
      enableQualityTrends: true
    });

    log(`  Created loops with various feature flag configurations`);
    log(`  All configurations instantiated successfully`);

    testPass('Feature Flags');

  } catch (error) {
    testFail('Feature Flags', error.message);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n' + '='.repeat(60), YELLOW);
  log('🧪 Intelligence Features Integration Tests', YELLOW);
  log('Purpose: Verify autonomous operation for WeatherVane', YELLOW);
  log('='.repeat(60) + '\n', YELLOW);

  // Run all tests
  await test1_AdaptiveRoadmap();
  await test2_ContextManager();
  await test3_QualityTrends();
  await test4_OrchestratorIntegration();
  await test5_FeatureFlags();

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

  // Connection to WeatherVane goals
  log('🎯 Intelligence Features Support:', YELLOW);
  log('  • AdaptiveRoadmap → Autonomous 24/7 operation', GREEN);
  log('  • ContextManager → Better forecast model selection', GREEN);
  log('  • QualityTrends → Maintain <5% forecast error', GREEN);

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n💥 Fatal Error: ${error.message}`, RED);
  process.exit(1);
});