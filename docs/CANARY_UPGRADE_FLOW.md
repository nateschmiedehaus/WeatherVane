# Canary Upgrade Flow & Shadow Validation

## Overview

The canary upgrade harness automates safe, zero-downtime code promotions for the WeatherVane MCP orchestrator. It follows a strict gate sequence with shadow validation to ensure behavior parity between active and canary code.

**Key Principle**: Never promote code to production without proving it behaves identically to the current version under controlled test conditions.

## Architecture

### Components

1. **Upgrade Script** (`tools/wvo_mcp/scripts/mcp_safe_upgrade.sh`)
   - Shell entrypoint that orchestrates the entire upgrade process
   - Delegates to `mcp_safe_upgrade.mjs` for Node.js implementation

2. **Safe Upgrade Implementation** (`tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs`)
   - Runs preflight checks to ensure workspace is ready
   - Creates isolated staging directory with git worktree principles
   - Builds and tests new code in isolation
   - Spawns shadow workers (active + canary) for validation
   - Compares outputs across multiple check types
   - Generates comprehensive upgrade report

3. **Worker Manager** (src/worker/worker_manager.ts)
   - Manages active and canary worker processes
   - Handles blue/green worker switching
   - Enforces DRY_RUN mode during shadow validation
   - Isolates worker environments (workspace root, state directories)

4. **Preflight Checker** (src/upgrade/preflight.ts)
   - Validates git workspace cleanliness
   - Verifies Node.js and npm versions
   - Checks available disk space (≥500MB)
   - Tests SQLite roundtrip capability
   - Probes for sandbox tooling (docker/bwrap)

## Gate Sequence

The upgrade follows a strict four-gate sequence. Each gate must pass before proceeding:

```
┌─────────────┐
│  preflight  │  Workspace validation + version checks
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    build    │  Compile new code + dependencies
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   shadow    │  DRY_RUN validation: active vs canary
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  canary_rdy │  Shadow passed; ready for promotion
└─────────────┘
```

### Gate Definitions

#### 1. Preflight (`preflight`)
**Purpose**: Ensure the workspace is in a valid state for upgrade

**Checks**:
- Git workspace has no uncommitted changes (unless `--allow-dirty`)
- Node.js version satisfies `.nvmrc` or `package.json` engines constraint
- npm version meets minimum required version
- ≥500MB disk space available
- SQLite database is accessible and roundtrip-able
- Sandbox tooling available (docker/bwrap) or sandbox artifact exists

**Failure** → Abort upgrade immediately

**Artifacts**: `preflight.json`

#### 2. Build (`build`)
**Purpose**: Compile new code and prepare artifacts

**Steps**:
1. Build active (current) code: `npm run build` in tools/wvo_mcp
2. Create staging directory (isolated copy)
3. Copy source + state snapshot to staging
4. Sync node_modules to staging
5. Build canary code in staging

**Failure** → Abort upgrade; staging cleaned up

**Artifacts**:
- Active build output in `dist/`
- Canary build output in `tmp/wv-upgrade-<id>/tools/wvo_mcp/dist/`

#### 3. Shadow Validation (`shadow`)
**Purpose**: Verify canary behaves identically to active under test

**Process**:
1. Start active worker in DRY_RUN mode
2. Start canary worker in DRY_RUN mode (from staging)
3. Run identical operations against both workers
4. Compare outputs (normalized for timestamps/IDs)

**Checks Performed** (sequential; stop on first mismatch):
1. `dispatch` - Task dispatch with limit=3
2. `verify` - Verification operation
3. `plan_next` - Get next tasks (limit=3)
4. `orchestrator_status` - Orchestrator status query
5. `autopilot_status` - Autopilot status query

**Output Normalization**:
- Scrub timestamp fields (ISO 8601 dates → `__ISO__`)
- Ignore correlation IDs, PIDs, durations
- Compare structure and non-temporal values

**Result**: JSON diff included if mismatches found

**Warning** → Continue (differences documented) if checks fail
**Pass** → Proceed to promotion

**Artifacts**: `shadow.json` (contains check results + diffs)

#### 4. Canary Ready (`canary_rdy`)
**Purpose**: Signal readiness for live promotion

**Criteria**:
- All previous gates passed
- Shadow validation shows no critical differences (warnings acceptable)
- Artifacts recorded and promoted plan available

**Next Steps**: Manually trigger promotion if desired

## Staging & Isolation

The upgrade uses file-system isolation to prevent state corruption:

```
Workspace Root (active)
├── tools/wvo_mcp/
│   ├── src/
│   ├── dist/ (active build)
│   └── node_modules/
├── state/
│   ├── orchestrator.db (active state)
│   └── context.md (active context)
└── tmp/
    └── wv-upgrade-<id>/  (staging)
        ├── tools/wvo_mcp/
        │   ├── src/ (copied)
        │   ├── dist/ (canary build)
        │   └── node_modules/ (copied)
        └── state/ (snapshot)
            ├── orchestrator.db (copy)
            └── context.md (copy)
```

**Environment Variables** for isolation:
- Active worker: `WVO_WORKSPACE_ROOT=<root>`, `WVO_DRY_RUN=1`
- Canary worker: `WVO_WORKSPACE_ROOT=<staging>`, `WVO_STATE_ROOT=<staging>/state`, `WVO_DRY_RUN=1`

This ensures each worker reads from its own database + state files.

## Promotion Flow (Staged Routing)

**DRY_RUN Phase** (validation):
1. ✅ Shadow checks pass
2. Start canary in DRY_RUN mode
3. Verify read-only behavior
4. Compare outputs with active

**Live Promotion** (if `--promote` flag):
1. Pause external automation
2. Restart canary with `WVO_DRY_RUN=0`
3. Call `WorkerManager.switchToCanary()` to atomically switch routing
4. Monitor health/token metrics ≥10 minutes
5. Flip feature flags sequentially:
   - `PROMPT_MODE='compact'`
   - `SANDBOX_MODE=pooled`
   - `SELECTIVE_TESTS=true`
   - (others as needed)
6. Capture post-promotion metrics snapshot

**Rollback** (if issues detected):
1. Call `WorkerManager.switchToActive()` to restore previous worker
2. Analyze `promotion_plan.json` + metrics for root cause
3. Fix issue + rebuild
4. Re-run upgrade flow

## Output & Artifacts

Each upgrade run produces:

```
experiments/mcp/upgrade/<timestamp>/
├── preflight.json         # Preflight check results + versions
├── shadow.json            # Shadow validation results + diffs
├── promotion_plan.json    # Staged promotion steps + execution log
├── steps.json             # Execution log of all build/test steps
└── report.json            # Consolidated upgrade summary (NEW)
```

### report.json Schema

```json
{
  "upgrade_id": "2025-10-22T15-38-00-000Z",
  "generated_at": "2025-10-22T15:38:05.000Z",
  "status": "passed|warning",
  "summary": {
    "total_steps": 8,
    "passed_steps": 8,
    "failed_steps": 0,
    "skipped_steps": 0,
    "warning_steps": 0
  },
  "shadow_validation": {
    "total_checks": 5,
    "passed_checks": 5,
    "failed_checks": 0,
    "details": [ /* check results */ ]
  },
  "gates": {
    "preflight": "ok|failed",
    "build_current": "ok|failed",
    "build_canary": "ok|failed",
    "test_canary": "ok|failed",
    "shadow_validation": "ok|warning"
  },
  "promotion": {
    "ready": true,
    "plan": { /* promotion_plan.json */ }
  },
  "artifacts": {
    "preflight_path": "preflight.json",
    "shadow_path": "shadow.json",
    "promotion_plan_path": "promotion_plan.json",
    "steps_path": "steps.json"
  }
}
```

## Usage

### Basic Validation (DRY_RUN only)

```bash
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh
```

This:
1. Runs preflight checks
2. Builds both active + canary
3. Runs shadow validation
4. Records report

### With Custom ID

```bash
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --id my-release-v2.0
```

Artifacts recorded in: `experiments/mcp/upgrade/my-release-v2.0/`

### Skip Steps (for testing)

```bash
# Skip preflight (dangerous!)
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --allow-dirty

# Skip npm install (use cached node_modules)
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --skip-install

# Skip tests
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --skip-tests

# Keep staging directory for inspection
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --keep-staging
```

### Promote to Live

```bash
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --promote
```

This:
1. Runs all checks as above
2. After shadow validation passes, promotes canary to active
3. Switches worker routing atomically
4. Records promotion metrics

## Lock File

During upgrade, a single-flight lock is held:

```
state/upgrade.lock
```

```json
{
  "upgrade_id": "2025-10-22T15-38-00-000Z",
  "created_at": "2025-10-22T15:38:00.000Z",
  "hostname": "macbook.local",
  "pid": 12345
}
```

This prevents concurrent upgrades. Lock is automatically removed even on error.

## Guardrails & Safety

### DRY_RUN Enforcement
- During shadow validation, both workers run with `WVO_DRY_RUN=1`
- `WorkerToolRouter` enforces read-only mode for all tools
- Mutating tools throw `DRY_RUN_ERROR` if attempted
- State changes isolated to staging directory SQLite

### Output Normalization
- Temporal fields (timestamps, durations) normalized before comparison
- Correlation IDs and process PIDs ignored
- Focus on functional equivalence, not exact string match

### Staged Rollout
- Shadow validation in DRY_RUN before ANY live change
- Feature flags gated post-promotion for gradual enablement
- Metrics snapshot captured before flag flips
- Ability to rollback via `WorkerManager.switchToActive()`

## Failure Modes & Recovery

### Preflight Failure
**Symptom**: `Preflight failed at <check_name>`

**Fix**:
- Address the check (e.g., commit changes, update Node.js)
- Re-run upgrade script

### Build Failure
**Symptom**: `build-canary` or `build-current` step fails

**Fix**:
- Inspect error in `steps.json`
- Fix code issue
- Re-run upgrade script (will rebuild both)

### Shadow Validation Mismatch
**Symptom**: `shadow_validation` status = `warning` with diffs in `shadow.json`

**Actions**:
- Review the diff in `experiments/mcp/upgrade/<id>/shadow.json`
- If expected (e.g., intentional behavior change), document rationale
- If unintended, fix code + rebuild
- Re-run upgrade script

### Promotion Failure
**Symptom**: `switchToCanary()` fails or health checks decline post-promotion

**Fix**:
- Call `switchToActive()` to restore previous worker
- Analyze metrics for root cause
- Fix issue + rebuild
- Re-run upgrade + promotion

## Testing the Upgrade Flow

### Unit Tests
```bash
npm test -- --testNamePattern="upgrade" -w tools/wvo_mcp
```

Tests cover:
- Preflight validation
- Version constraint parsing
- Output normalization for shadow comparison
- Report generation

### Integration Test
```bash
# Small-scale upgrade with skip flags
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh \
  --allow-dirty \
  --skip-tests \
  --keep-staging
```

Then inspect:
```bash
cat experiments/mcp/upgrade/<id>/report.json | jq
cat experiments/mcp/upgrade/<id>/shadow.json | jq '.[] | select(.ok == false)'
```

### End-to-End (Manual)
1. Make a trivial code change (e.g., version bump comment)
2. Run: `./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh`
3. Verify all gates pass
4. Inspect report.json for clean summary
5. Check shadow.json shows all checks passed

## Integration with Autopilot

The autopilot can trigger upgrades via the `plan_next` → `run_tool` → `dispatch` flow:

1. Include upgrade task in roadmap
2. Autopilot sees task, identifies upgrade harness entrypoint
3. Enqueues: `bash tools/wvo_mcp/scripts/mcp_safe_upgrade.sh [opts]`
4. Worker executes harness, records report
5. Follow-up task verifies report status + decides promotion

Example follow-up task:
```yaml
- name: "Promote upgrade if shadow clean"
  depends_on: "mcp_safe_upgrade"
  condition: "report.shadow_validation.failed_checks == 0"
  action: "mcp_safe_upgrade.sh --promote"
```

## Reference Links

- **MCP Orchestrator Playbook**: docs/MCP_ORCHESTRATOR.md
- **Preflight Implementation**: tools/wvo_mcp/src/upgrade/preflight.ts
- **Worker Manager**: tools/wvo_mcp/src/worker/worker_manager.ts
- **Safe Upgrade Script**: tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs
- **Shell Entrypoint**: tools/wvo_mcp/scripts/mcp_safe_upgrade.sh
