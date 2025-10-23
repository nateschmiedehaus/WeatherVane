#!/usr/bin/env bash
#
# Test single task execution with fixed models
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "Testing single task execution with UnifiedOrchestrator"
echo ""

export CODEX_HOME="$ROOT/.accounts/codex/codex_personal"
export CLAUDE_CONFIG_DIR="$ROOT/.accounts/claude/claude_primary"
export AGENT_COUNT=3
export PREFERRED_ORCHESTRATOR="codex"
export WORKSPACE_ROOT="$ROOT"
export MAX_ITERATIONS=1

# Create a simple test task in the database
sqlite3 state/orchestrator.db <<SQL
DELETE FROM tasks WHERE id = 'TEST-SINGLE-TASK';
INSERT INTO tasks (id, title, type, status, created_at)
VALUES ('TEST-SINGLE-TASK', 'Echo test message to verify execution', 'simple_task', 'pending', strftime('%s', 'now'));
SQL

echo "✅ Created test task: TEST-SINGLE-TASK"
echo ""

# Run orchestrator with minimal output
node -e "
const { UnifiedOrchestrator } = require('./tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');

async function test() {
  const state = new StateMachine(process.env.WORKSPACE_ROOT);
  const orchestrator = new UnifiedOrchestrator(state, {
    agentCount: 3,
    preferredOrchestrator: 'codex',
    workspaceRoot: process.env.WORKSPACE_ROOT,
    codexHome: process.env.CODEX_HOME,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
  });

  console.log('Starting orchestrator...');
  await orchestrator.start();

  const status = orchestrator.getState();
  console.log('Orchestrator:', status.orchestrator?.config.model);
  console.log('Workers:', status.workers.length);
  console.log('Critics:', status.critics.length);
  console.log('');

  // Get the test task
  const tasks = state.getTasks({ status: ['pending'] });
  if (tasks.length === 0) {
    console.error('❌ No pending tasks found');
    process.exit(1);
  }

  const task = tasks.find(t => t.id === 'TEST-SINGLE-TASK') || tasks[0];
  console.log('Executing task:', task.id, '-', task.title);
  console.log('');

  const start = Date.now();
  const result = await orchestrator.executeTask(task);
  const duration = Date.now() - start;

  console.log('');
  console.log('Result:', result.success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('Duration:', (duration / 1000).toFixed(1), 'seconds');
  if (result.output) {
    console.log('Output (first 200 chars):', result.output.substring(0, 200));
  }
  if (result.error) {
    console.error('Error:', result.error);
  }

  await orchestrator.stop();
  process.exit(result.success ? 0 : 1);
}

test().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Test PASSED - Agents are working!"
else
  echo "❌ Test FAILED - Check errors above"
fi

exit $EXIT_CODE
