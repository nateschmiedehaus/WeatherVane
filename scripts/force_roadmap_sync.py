#!/usr/bin/env python3
"""
Force sync roadmap.yaml to orchestrator.db

This script manually syncs tasks from state/roadmap.yaml into the SQLite database.
Use this when the autopilot is not finding tasks despite roadmap.yaml being updated.
"""

import subprocess
import sys
from pathlib import Path

# Get workspace root
workspace = Path(__file__).parent.parent
state_dir = workspace / "state"
roadmap_yaml = state_dir / "roadmap.yaml"
orchestrator_db = state_dir / "orchestrator.db"

print(f"🔄 Syncing roadmap to database...")
print(f"  Roadmap: {roadmap_yaml}")
print(f"  Database: {orchestrator_db}")

# Check files exist
if not roadmap_yaml.exists():
    print(f"❌ Error: {roadmap_yaml} not found")
    sys.exit(1)

if not orchestrator_db.exists():
    print(f"❌ Error: {orchestrator_db} not found")
    sys.exit(1)

# Use Node.js to call the TypeScript sync function
sync_script = """
const path = require('path');
const { syncRoadmapFile } = require('./tools/wvo_mcp/dist/orchestrator/roadmap_adapter.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');

const workspaceRoot = process.cwd();
const sm = new StateMachine(workspaceRoot);

syncRoadmapFile(sm, workspaceRoot).then(() => {
  console.log('✅ Roadmap synced successfully');

  // Show stats
  const pending = sm.getTasks({ status: ['pending'] });
  console.log(`📊 Database now has ${pending.length} pending tasks`);

  sm.close();
  process.exit(0);
}).catch(err => {
  console.error('❌ Sync failed:', err.message);
  sm.close();
  process.exit(1);
});
"""

try:
    result = subprocess.run(
        ["node", "-e", sync_script],
        cwd=workspace,
        capture_output=True,
        text=True,
        timeout=30
    )

    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    if result.returncode == 0:
        print("\n✅ Sync complete! You can now run autopilot again.")
    else:
        print(f"\n❌ Sync failed with exit code {result.returncode}")
        sys.exit(result.returncode)

except subprocess.TimeoutExpired:
    print("❌ Sync timed out after 30 seconds")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error running sync: {e}")
    sys.exit(1)
