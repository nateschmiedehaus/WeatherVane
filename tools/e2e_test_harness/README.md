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

### Run Full E2E Test Suite
```bash
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
4. Verify credentials: Ensure Claude CLI is authenticated

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