# WeatherVane Autopilot Runbook

## 1. Prerequisites
- Install the OpenAI Codex CLI and ensure it is on your `PATH`.
  - Example: `npm install -g @openai/codex-cli`
  - Verify with `codex --version`.
- Install Python dependencies (`pip install -r requirements.txt`) so the account manager and YAML checks can run.
- Build the MCP bundle once: `npm run build --prefix tools/wvo_mcp` (automatically re-run if missing).

### Account Registration Mode
- Run `ACCOUNT_SETUP=1 make mcp-autopilot` to launch the guided account enrollment flow.
- The wizard updates `state/accounts.yaml` (CLI profiles) and `state/accounts.env` (API keys).
- When prompted, you can:
  1. Configure Codex accounts and run `codex login` without leaving the terminal.
  2. Enter Anthropic, GLM, and Gemini API keys (stored in `state/accounts.env`) and toggle preview providers.
- Optionally run provider smoke tests directly from the wizard; any API provider you configure can be verified immediately.
- After the wizard exits, source `state/accounts.env` in your shell before running the autopilot: `source state/accounts.env`.
- The autopilot automatically loads `state/accounts.env` when present, so subsequent runs inherit the credentials without extra shell commands.

## 2. Account Configuration
1. Populate `state/accounts.yaml` with at least one Codex account entry:
   ```yaml
   codex:
     - id: codex_primary
       email: your@email.com
       profile: weathervane_orchestrator
       label: primary
   ```
2. Optionally add Claude Code accounts under `claude:` if you rely on the fallback.
3. Run `CODEX_HOME=<path from accounts.yaml> codex login` for each Codex account.
4. Confirm credentials with `CODEX_HOME=<path> codex login status`; the autopilot will refuse to start until accounts are valid and authenticated.

## 3. Launching the Autopilot
- Standard long-running session:
  ```bash
  make mcp-autopilot
  ```
- Key environment toggles:
  | Variable | Default | Purpose |
  |----------|---------|---------|
  | `WVO_AUTOPILOT_ONCE` | `0` | Set to `1` for a single diagnostic cycle. |
  | `WVO_CODEX_WORKERS` | `3` | Number of Codex agents to launch (e.g., `WVO_CODEX_WORKERS=5 make mcp-autopilot`). |
| `STOP_ON_BLOCKER` | `0` | Leave `0` to keep looping when blockers are logged. |
| `WVO_AUTOPILOT_ALLOW_OFFLINE_FALLBACK` | `0` | Enable only when you want guarded failures to bail out immediately. |

You can also request a worker count inline, e.g. `make mcp-autopilot=3`, which now forwards to `WVO_CODEX_WORKERS=3` (and `AGENTS=3`) automatically.

The `WORKERS=<n>` Make variable sets both `WVO_CODEX_WORKERS` and the MCP agent prompt count, so `make mcp-autopilot WORKERS=4` spins up four Codex engineers.

## 4. Continuous Operations
- The loop now defaults to continuous mode. The run only stops if you press `Ctrl+C`, trigger a fatal failure, or explicitly set `WVO_AUTOPILOT_ONCE=1`.
- Offline fallback blockers are automatically cleared from `state/tmp` before the next cycle, preventing repeated “blocked” summaries.
- MCP artifacts are rebuilt automatically if `tools/wvo_mcp/dist/index.js` is missing.
- Weather validation telemetry/runbooks update automatically after each successful cycle, and meta critics are expected to reopen finished work or add remediation tasks when regressions appear (see [Meta-Critique & Refactor Playbook](docs/META_CRITIQUE_GUIDE.md)). Batch meta critiques—run them after meaningful increments instead of after every tiny change to avoid endless loops.
- New providers (GLM, Gemini, Claude variants) are staged-off by default. Use the provider smoke tests (`npm run providers:smoke -- --include-staging`) before enabling any preview provider via environment flags. See [Provider Staging & Smoke Tests](docs/PROVIDER_STAGING.md).

## 5. Troubleshooting Checklist
1. **Codex CLI not found** – install the CLI and re-run `codex login`.
2. **Accounts template created** – fill in `state/accounts.yaml` with real emails (no `example.com` placeholders).
3. **Authentication mismatch** – run `CODEX_HOME=<home> codex logout` and then `codex login` with the correct email.
4. **MCP build failures** – run `npm run build --prefix tools/wvo_mcp` and inspect the console output for compilation errors.
5. **Network issues** – ensure `chatgpt.com` and `api.openai.com` are reachable from the host machine.

## 6. Useful Commands
```bash
# Regenerate MCP bundle and restart the worker
./scripts/restart_mcp.sh

# Quick connectivity + auth smoke test
WVO_AUTOPILOT_SMOKE=1 make mcp-autopilot

# Tail autopilot logs
tail -f /tmp/wvo_autopilot.log
```

Following this runbook keeps the autopilot online, loops continuously through tasks, and respects your chosen concurrency level.

## 7. Weather Sensitivity Simulation Checklist
- **Cold start:** ensure `storage/seeds/open_meteo/chicago_il_daily.parquet` exists (refresh via the synthetic helper when missing) so the autopilot seeds real Open-Meteo history instead of the procedural fallback.
- **Scenario seeding:** call `seed_synthetic_brand_portfolio(lake_root)` to populate the five-brand portfolio; it now defaults to 1,095 days per brand and persists products, ads, promos, and weather.
- **Regression signal:** run `PYTHONPATH=. pytest tests/model/test_weather_brand_scenarios.py -q` whenever modeling logic or synthetic data changes to verify snow-, precip-, heat-, and neutral-brand sensitivities.
- **Honesty check:** execute `PYTHONPATH=. pytest tests/apps/model/test_train.py -k weather_fit -q` (or enqueue `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` if the sandboxed NumPy build segfaults) to confirm baseline training reports the new `weather_fit` classification.
- **Roadmap loop:** if either test fails, record the regression against roadmap task `T13.3.1` (weather shock synthetic control) and rerun the integrity suite after applying fixes so Atlas/Director Dana have artifacts for follow-up.
