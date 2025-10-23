#!/usr/bin/env python3
"""
Debug roadmap sync to understand why tasks aren't being loaded
"""

import subprocess
import sys
from pathlib import Path

workspace = Path(__file__).parent.parent

# Detailed Node.js script with debugging
debug_script = """
const path = require('path');
const fs = require('fs');
const yaml = require('./tools/wvo_mcp/node_modules/yaml');
const { syncRoadmapDocument } = require('./tools/wvo_mcp/dist/orchestrator/roadmap_adapter.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');

const workspaceRoot = process.cwd();

console.log('📂 Workspace:', workspaceRoot);

// Read roadmap.yaml
const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');
console.log('📄 Reading:', roadmapPath);

const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
const roadmap = yaml.parse(roadmapContent);

console.log('📊 Roadmap contains:');
console.log('  - Epics:', roadmap.epics?.length || 0);

if (roadmap.epics) {
  for (const epic of roadmap.epics) {
    console.log(`    - ${epic.id}: ${epic.title} (${epic.status})`);
    const taskCount = epic.milestones?.reduce((sum, m) => sum + (m.tasks?.length || 0), 0) || 0;
    console.log(`      Tasks: ${taskCount}`);
  }
}

// Create StateMachine
console.log('\\n🗄️  Creating StateMachine...');
const sm = new StateMachine(workspaceRoot);

// Check before sync
const beforeCount = sm.getTasks({ status: ['pending', 'in_progress', 'blocked', 'done'] }).length;
console.log(`📈 Tasks in database BEFORE sync: ${beforeCount}`);

// Sync
console.log('\\n🔄 Running syncRoadmapDocument...');
try {
  syncRoadmapDocument(sm, roadmap, { correlationBase: 'debug-sync' });
  console.log('✅ Sync completed without error');
} catch (err) {
  console.error('❌ Sync failed:', err.message);
  console.error(err.stack);
  sm.close();
  process.exit(1);
}

// Check after sync
const afterCount = sm.getTasks({ status: ['pending', 'in_progress', 'blocked', 'done'] }).length;
console.log(`\\n📈 Tasks in database AFTER sync: ${afterCount}`);
console.log(`📊 Delta: ${afterCount - beforeCount} tasks added`);

// Check for specific epic
const mlEpic = sm.getTask('E-ML-REMEDIATION');
if (mlEpic) {
  console.log('\\n✅ E-ML-REMEDIATION found in database:', mlEpic.title);
} else {
  console.log('\\n❌ E-ML-REMEDIATION NOT found in database');
}

// List all epics in database
const epics = sm.getTasks({ status: ['pending', 'in_progress', 'blocked', 'done'] })
  .filter(t => t.type === 'epic');
console.log('\\n🏛️  Epics in database:', epics.length);
for (const epic of epics) {
  console.log(`  - ${epic.id}: ${epic.title}`);
}

// Check for modeling tasks
const modelingTasks = sm.getTasks({ status: ['pending'] })
  .filter(t => t.id.startsWith('T-MLR'));
console.log('\\n🔬 Modeling tasks (T-MLR-*) in database:', modelingTasks.length);
if (modelingTasks.length > 0) {
  for (const task of modelingTasks.slice(0, 5)) {
    console.log(`  - ${task.id}: ${task.title}`);
  }
}

sm.close();
"""

print("🔍 Running detailed sync debug...")
result = subprocess.run(
    ["node", "-e", debug_script],
    cwd=workspace,
    capture_output=True,
    text=True,
    timeout=60
)

print(result.stdout)
if result.stderr:
    print("STDERR:", file=sys.stderr)
    print(result.stderr, file=sys.stderr)

sys.exit(result.returncode)
