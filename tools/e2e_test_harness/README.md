# E2E Online Testing Module

Complete end-to-end testing infrastructure with operator monitoring and automatic error recovery.

## Features

- **Isolated Test Environment**: Tests run in `/tmp/e2e_test_state` with complete isolation
- **Operator Monitoring**: Watches for errors, infinite loops, and applies automatic fixes
- **GOL Task Chaining**: Tasks E2E-GOL-T1 → T2 → T3 with proper dependencies
- **Auto-Recovery**: Detects and fixes common issues without manual intervention
- **Git Integration**: All changes tracked and pushed to GitHub
- **Zero Manual Intervention**: Fully autonomous operation

## Architecture

```
┌─────────────────────────────────────┐
│         E2E Test Runner             │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │   Operator Monitor           │    │
│  │   - Error detection          │    │
│  │   - Auto-recovery            │    │
│  │   - Resource monitoring      │    │
│  └──────────────┬──────────────┘    │
│                 │                    │
│  ┌──────────────▼──────────────┐    │
│  │   Test Orchestrator          │    │
│  │   - Environment setup        │    │
│  │   - Task execution           │    │
│  │   - Progress monitoring      │    │
│  └──────────────┬──────────────┘    │
│                 │                    │
│  ┌──────────────▼──────────────┐    │
│  │   Wave 0 + MCP Server        │    │
│  │   - Isolated instances       │    │
│  │   - Custom state root        │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Installation

```bash
cd tools/e2e_test_harness
npm install
```

## Usage

> ⚠️ **Live Agents & Network Required**
>
> The harness is only a *true* E2E test when live Codex/Claude agents can reach their backends.
> The runner now performs an outbound connectivity probe before launching; if the check fails it aborts early instead of wasting time on a dry-run.
> After a successful run, artefacts from `/tmp/e2e_test_state/logs/` are mirrored into `state/logs/` so you can inspect or execute them directly from the repo.

### Run Full E2E Test Suite
```bash
# Requires live Codex/Claude agents with network access – without them this harness is only a local dry-run.
# Expect 20–30 minutes when running all five tasks end-to-end with real agents.
npm test
```

### Run Quick Test (Single Cycle)
```bash
npm run test:quick
```

### Run Components Individually
```bash
# Start operator monitor only
npm run test:monitor

# Run orchestrator only
npm run test:orchestrator
```

### Clean Test State
```bash
npm run clean
```

### Autopilot-Only Mode & Provider Tagging

Autopilot runs should prove that Claude and Codex can each finish the roadmap without human help:

```bash
# Claude-only run
E2E_AUTOPILOT_ONLY=1 \
E2E_LOG_EXPORT_TAG=CLAUDE-ROLES \
FORCE_PROVIDER=claude \
E2E_PRESERVE_STATE=1 \
npm test

# Codex-only run
E2E_AUTOPILOT_ONLY=1 \
E2E_LOG_EXPORT_TAG=CODEX-ROLES \
FORCE_PROVIDER=codex \
E2E_PRESERVE_STATE=1 \
npm test
```

- `E2E_AUTOPILOT_ONLY=1` locks `state/logs/<TAG>` read-only and records a tamper-evident hash. If files change between runs the harness aborts.
- `FORCE_PROVIDER` tells Wave 0 to refuse provider fallbacks. Supported values: `claude`, `codex`.
- `E2E_LOG_EXPORT_TAG` mirrors `/tmp/e2e_test_state/logs` into `state/logs/<TAG>` so each provider’s evidence lives beside its provenance.

### Launching Wave 0 Artefacts

After a run completes (and artefacts land under `state/logs/<TAG>`), you can launch the user-facing tools directly from the repo:

```bash
# Tier 6 CLI (from repo root)
node ./state/logs/<TAG>/E2E-GOL-T6/cli_gol.js

# Tier 7 Desktop Launcher
./state/logs/<TAG>/E2E-GOL-T7/run_gol.sh
```

Replace `<TAG>` with the export tag you passed (e.g., `CLAUDE-ROLES`). In autopilot-only mode both directories are marked read-only; remove them entirely before rerunning rather than editing files in place.

## Error Patterns & Auto-Fixes

The operator monitor detects and fixes:

| Error Pattern | Detection | Auto-Fix |
|--------------|-----------|----------|
| YAML indentation | `bad indentation` | Fix indentation automatically |
| MCP PID lock | `Another MCP server` | Remove stale lock, kill process |
| Module not found | `Cannot find module` | Install missing module |
| TypeScript error | `TS\d+:` | Rebuild TypeScript |
| Infinite loop | `same cycle \d+ times` | Kill process, restart with limits |
| Memory leak | `heap out of memory` | Force GC, restart processes |
| Git conflict | `CONFLICT` | Accept current changes |
| NPM error | `npm ERR!` | Clear cache, reinstall |
| Timeout | `timeout` | Kill hung processes, restart |
| Process crash | `segmentation fault` | Clean up, full restart |

## Test Tasks

### E2E-GOL-T1: Basic Glider Pattern
- Initialize glider pattern
- Compute one generation
- Save output for next task

### E2E-GOL-T2: Multi-Generation Evolution
- Load pattern from T1
- Compute 10 generations
- Verify state transitions

### E2E-GOL-T3: Pattern Analysis
- Load history from T2
- Detect cycles
- Generate statistics report

### E2E-GOL-T4: Oscillator Diagnostics
- Analyze blinker, toad, beacon, and glider seeds
- Measure cycle length, displacement, and density trends
- Persist JSON + text summaries for downstream validation

### E2E-GOL-T5: Stability Forecasting
- Extend simulation timeline using T2 history
- Compute peak/min/average live-cell counts plus stability index
- Record long-horizon forecast in forecast.txt/report.json

### E2E-GOL-T6: Interactive CLI Experience
- Produce a runnable `cli_gol.js` script plus instructions
- Support editing cells, stepping generations, running multi-step simulations
- Provide preset patterns (glider/blinker/toad/beacon) and inline help for the command set

### E2E-GOL-T7: Desktop Launcher
- Emit a shell script (`run_gol.sh`) that opens a local browser window with a GOL grid (no terminal UI)
- Include HTML/JS assets with mouse-driven controls (toggle cells, start/pause, presets, clear)
- Document usage in `instructions.txt` so a user can run the program via a single command

## Success Criteria

- ✅ 95%+ test success rate
- ✅ Full suite completes in < 10 minutes
- ✅ Tasks chain properly
- ✅ Zero manual intervention
- ✅ All changes in GitHub

## Monitoring & Logs

Test execution logs are saved to:
- `/tmp/e2e_test_state/e2e_test.log` - Main test log
- `/tmp/e2e_test_state/logs/` - Task-specific logs
- `/tmp/e2e_test_state/e2e_test_report.json` - Final report

## Troubleshooting

If tests fail repeatedly:

1. Check environment: `node run_e2e_tests.mjs` (validates prerequisites)
2. Clean state: `npm run clean`
3. Check MCP build: `cd ../wvo_mcp && npm run build`
4. Verify authentication:
   - **Uses monthly subscriptions**, NOT API keys
   - Claude: Verify `.accounts/claude/claude_primary` accessible (symlink to `~/.claude`)
   - Codex: Verify `.accounts/codex/codex_personal` accessible (symlink to `~/.codex`)
   - See [`../../docs/AUTH_POLICY.md`](../../docs/AUTH_POLICY.md) for details

## Development

To extend the test harness:

1. Add error patterns to `operator_monitor.mjs`
2. Add fixes to the `fixes` Map
3. Add new test tasks to GOL roadmap in `orchestrator.mjs`
4. Update success criteria as needed

## Architecture Decisions

- **Process Isolation**: Each component runs in separate process for stability
- **State Isolation**: Custom `WVO_STATE_ROOT` prevents production interference
- **Git Branch**: Tests use `test/e2e-harness` branch for isolation
- **Monitoring**: Continuous monitoring with 5-second intervals
- **Recovery**: Max 3 retries per task before failing

## Future Enhancements

- [ ] Parallel task execution
- [ ] Performance benchmarking
- [ ] Coverage reporting
- [ ] Visual test progress UI
- [ ] Historical trend analysis
- [ ] Slack/email notifications
