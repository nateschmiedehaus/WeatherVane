#!/usr/bin/env node
/**
 * Test that UnifiedOrchestrator syncs roadmap on startup
 */

import { UnifiedOrchestrator } from '../tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js';
import { StateMachine } from '../tools/wvo_mcp/dist/orchestrator/state_machine.js';

const workspaceRoot = process.cwd();

console.log('🧪 Testing UnifiedOrchestrator roadmap sync on startup\n');

// Create state machine
const stateMachine = new StateMachine(workspaceRoot);

// Count tasks before
const beforeCount = stateMachine.getTasks({ status: ['pending'] }).length;
console.log(`📊 Tasks before orchestrator start: ${beforeCount} pending`);

// Create orchestrator
const orchestrator = new UnifiedOrchestrator(stateMachine, {
  agentCount: 3,
  preferredOrchestrator: 'claude',
  workspaceRoot,
  codexHome: process.env.CODEX_HOME,
  claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
});

console.log('🚀 Starting UnifiedOrchestrator...\n');

try {
  await orchestrator.start();

  // Count tasks after
  const afterCount = stateMachine.getTasks({ status: ['pending'] }).length;
  console.log(`\n📊 Tasks after orchestrator start: ${afterCount} pending`);

  if (afterCount > beforeCount) {
    console.log(`✅ SUCCESS: Roadmap sync added ${afterCount - beforeCount} tasks`);
  } else if (afterCount === beforeCount && afterCount > 0) {
    console.log(`✅ SUCCESS: Roadmap already in sync (${afterCount} pending tasks)`);
  } else {
    console.log(`❌ WARNING: No pending tasks found after sync`);
  }

  // Check for modeling tasks specifically
  const modelingTasks = stateMachine.getTasks({ status: ['pending'] })
    .filter(t => t.id.startsWith('T-MLR'));

  console.log(`\n🔬 Modeling tasks (T-MLR-*): ${modelingTasks.length}`);
  if (modelingTasks.length > 0) {
    console.log('   First 3:');
    for (const task of modelingTasks.slice(0, 3)) {
      console.log(`   - ${task.id}: ${task.title}`);
    }
    console.log('\n✅ Modeling tasks are available for execution!');
  } else {
    console.log('❌ No modeling tasks found');
  }

  await orchestrator.stop();
  stateMachine.close();

  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  stateMachine.close();
  process.exit(1);
}
