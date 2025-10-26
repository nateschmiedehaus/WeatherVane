#!/usr/bin/env bash
#
# Test all 3 Codex tiers work correctly
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "Testing Codex Tier Resolution..."
echo ""

# Test the UnifiedOrchestrator with Codex preference
export CODEX_HOME="$ROOT/.accounts/codex/codex_personal"
export CLAUDE_CONFIG_DIR="$ROOT/.accounts/claude/claude_primary"
export AGENT_COUNT=3
export PREFERRED_ORCHESTRATOR="codex"
export WORKSPACE_ROOT="$ROOT"

node -e "
const { UnifiedOrchestrator } = require('./tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');
const { resolveCodexCliOptions } = require('./tools/wvo_mcp/dist/models/codex_cli.js');

console.log('=== Testing Model Resolution ===\\n');

// Test high tier (orchestrator)
const highRes = resolveCodexCliOptions('codex-5-high');
console.log('Orchestrator (high):');
console.log('  Model:', highRes.model);
console.log('  Config Overrides:', highRes.configOverrides);
console.log('');

// Test medium tier (workers)
const mediumRes = resolveCodexCliOptions('codex-5-medium');
console.log('Worker (medium):');
console.log('  Model:', mediumRes.model);
console.log('  Config Overrides:', mediumRes.configOverrides);
console.log('');

// Test low tier (critics)
const lowRes = resolveCodexCliOptions('codex-5-low');
console.log('Critic (low):');
console.log('  Model:', lowRes.model);
console.log('  Config Overrides:', lowRes.configOverrides);
console.log('');

async function testOrchestrator() {
  console.log('=== Testing UnifiedOrchestrator Agent Spawning ===\\n');

  const state = new StateMachine(process.env.WORKSPACE_ROOT);
  const orchestrator = new UnifiedOrchestrator(state, {
    agentCount: 3,
    preferredOrchestrator: 'codex',
    workspaceRoot: process.env.WORKSPACE_ROOT,
    codexHome: process.env.CODEX_HOME,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
  });

  await orchestrator.start();

  const status = orchestrator.getState();

  console.log('Orchestrator Agent:');
  console.log('  Model:', status.orchestrator?.config.model);
  console.log('  Provider:', status.orchestrator?.config.provider);
  console.log('');

  console.log('Worker Agents:');
  status.workers.forEach((w, i) => {
    console.log(\`  Worker \${i}: \${w.config.model} (\${w.config.provider})\`);
  });
  console.log('');

  console.log('Critic Agents:');
  status.critics.forEach((c, i) => {
    console.log(\`  Critic \${i}: \${c.config.model} (\${c.config.provider})\`);
  });
  console.log('');

  await orchestrator.stop();

  // Verify expected tiers
  const expectedOrchModel = status.orchestrator?.config.provider === 'codex' ? 'codex-5-high' : 'claude-sonnet-4.5';
  const orcActual = status.orchestrator?.config.model;

  if (orcActual === expectedOrchModel) {
    console.log('✅ Orchestrator tier: CORRECT');
  } else {
    console.error(\`❌ Orchestrator tier: Expected \${expectedOrchModel}, got \${orcActual}\`);
    process.exit(1);
  }

  // Check worker tiers
  const codexWorkers = status.workers.filter(w => w.config.provider === 'codex');
  if (codexWorkers.length > 0) {
    const allMedium = codexWorkers.every(w => w.config.model === 'codex-5-medium');
    if (allMedium) {
      console.log('✅ Worker tiers: CORRECT (all Codex workers use medium)');
    } else {
      console.error('❌ Worker tiers: Some Codex workers not using medium tier');
      process.exit(1);
    }
  }

  // Check critic tiers
  const codexCritics = status.critics.filter(c => c.config.provider === 'codex');
  if (codexCritics.length > 0) {
    const allLow = codexCritics.every(c => c.config.model === 'codex-5-low');
    if (allLow) {
      console.log('✅ Critic tiers: CORRECT (all Codex critics use low)');
    } else {
      console.error('❌ Critic tiers: Some Codex critics not using low tier');
      process.exit(1);
    }
  }

  console.log('');
  console.log('🎉 All tier assignments correct!');
}

testOrchestrator().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
"
