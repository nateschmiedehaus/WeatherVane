#!/usr/bin/env bash
#
# Test all 3 Codex tiers with Codex-only setup
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "Testing Codex-Only Tier Assignment..."
echo ""

export CODEX_HOME="$ROOT/.accounts/codex/codex_personal"
export AGENT_COUNT=5  # Need 5 agents to get multiple workers/critics
export PREFERRED_ORCHESTRATOR="codex"
export WORKSPACE_ROOT="$ROOT"

node -e "
const { UnifiedOrchestrator } = require('./tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');
const { CodexExecutor } = require('./tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');

async function test() {
  const state = new StateMachine(process.env.WORKSPACE_ROOT);

  // Create orchestrator with only Codex
  const orchestrator = new UnifiedOrchestrator(state, {
    agentCount: 5,
    preferredOrchestrator: 'codex',
    workspaceRoot: process.env.WORKSPACE_ROOT,
    codexHome: process.env.CODEX_HOME,
    // No claudeConfigDir - force Codex-only
  });

  await orchestrator.start();

  const status = orchestrator.getState();

  console.log('=== Agent Assignment (Codex Only) ===\\n');

  console.log('Orchestrator:');
  console.log('  ID:', status.orchestrator?.id);
  console.log('  Model:', status.orchestrator?.config.model);
  console.log('  Provider:', status.orchestrator?.config.provider);
  console.log('');

  console.log('Workers (' + status.workers.length + '):');
  status.workers.forEach((w, i) => {
    console.log(\`  \${i + 1}. \${w.id}: \${w.config.model} (\${w.config.provider})\`);
  });
  console.log('');

  console.log('Critics (' + status.critics.length + '):');
  status.critics.forEach((c, i) => {
    console.log(\`  \${i + 1}. \${c.id}: \${c.config.model} (\${c.config.provider})\`);
  });
  console.log('');

  // Verify tiers
  const orch = status.orchestrator;
  const workers = status.workers;
  const critics = status.critics;

  let passed = true;

  // Check orchestrator
  if (orch?.config.model === 'gpt-5-codex-high' && orch?.config.provider === 'codex') {
    console.log('✅ Orchestrator: HIGH tier (gpt-5-codex-high)');
  } else {
    console.error(\`❌ Orchestrator: Expected gpt-5-codex-high, got \${orch?.config.model}\`);
    passed = false;
  }

  // Check workers
  const codexWorkers = workers.filter(w => w.config.provider === 'codex');
  if (codexWorkers.length > 0) {
    const allMedium = codexWorkers.every(w => w.config.model === 'gpt-5-codex-medium');
    if (allMedium) {
      console.log(\`✅ Workers: MEDIUM tier (\${codexWorkers.length} Codex workers)\`);
    } else {
      console.error('❌ Workers: Not all using medium tier');
      workers.forEach(w => console.log(\`   - \${w.id}: \${w.config.model}\`));
      passed = false;
    }
  } else {
    console.log('⚠️  Workers: No Codex workers (all Claude)');
  }

  // Check critics
  const codexCritics = critics.filter(c => c.config.provider === 'codex');
  if (codexCritics.length > 0) {
    const allLow = codexCritics.every(c => c.config.model === 'gpt-5-codex-low');
    if (allLow) {
      console.log(\`✅ Critics: LOW tier (\${codexCritics.length} Codex critics)\`);
    } else {
      console.error('❌ Critics: Not all using low tier');
      critics.forEach(c => console.log(\`   - \${c.id}: \${c.config.model}\`));
      passed = false;
    }
  } else {
    console.log('⚠️  Critics: No Codex critics (all Claude)');
  }

  await orchestrator.stop();

  console.log('');
  if (passed) {
    console.log('🎉 All Codex tiers assigned correctly!');
    process.exit(0);
  } else {
    console.error('❌ Tier assignment FAILED');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
"
