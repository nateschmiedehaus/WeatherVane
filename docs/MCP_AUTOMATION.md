# WeatherVane MCP Autopilot Guide

Follow this playbook to run the WeatherVane Orchestrator (WVO) automatically, keep Codex sessions resilient, and maximise the critic coverage regardless of capability profile.

---

## 1. One-time Setup
1. Install dependencies:
   ```bash
   make mcp-build
   ```
2. Register the MCP server with Codex:
   ```bash
   make mcp-register
   ```
   This command is idempotent; rerun whenever you rebuild `dist/`.
3. (Optional) Add execute permission to the helper script:
   ```bash
   chmod +x tools/wvo_mcp/scripts/run_with_codex.sh
   ```

---

## 2. Launch Codex with Orchestrator Profile

Create or update your Codex profile (e.g. `~/.codex/config.toml`):
```toml
[profiles.weathervane_orchestrator]
base_instructions = "/absolute/path/to/docs/WeatherVane MCP Orchestrator — Master System Prompt.md"
approval_policy = "never"
sandbox = "workspace-write"
include_plan_tool = true
cwd = "/absolute/path/to/WeatherVane"
```

Start an orchestrated session:
```bash
make mcp-auto
```
or
```bash
tools/wvo_mcp/scripts/run_with_codex.sh
```

---

## 3. Daily Operating Loop
1. **Pull tasks** — `plan.next` lists the highest-priority roadmap work (`state/roadmap.yaml` powers this).
2. **Execute** — use `fs.write`, `cmd.run`, and `artifact.record` to implement code, tests, docs, and experiments.
3. **Validate** — run critics (now tagged with the git SHA they inspected):
   ```json
   {"critics": ["build", "tests", "data_quality", "design_system", "health_check", "human_sync"]}
   ```
   Results are written to `state/critics/<critic>.json`; each file includes the `git_sha` and timestamp so you can skip redundant runs when nothing has changed.
4. **Log context** — update decisions and risks via `context.write`.
5. **Queue heavy work** — offload multi-minute jobs via `heavy_queue_enqueue` (include command + notes). Use `heavy_queue_list` to monitor progress and `heavy_queue_update` to mark completion while mainline tasks continue.
6. **Snapshot frequently** — call `context.snapshot` before long commands or when Codex nears its context limit.
7. **Hydrate on restart** — when you relaunch Codex, the server auto-loads `state/checkpoint.json` and `state/context.md` so you resume without manual steps. Autopilot usage is also logged to `state/telemetry/usage.jsonl` for long-term trend analysis.

### Surprise QA Cadence
- `state/autopilot.yaml` tracks when the orchestrator last performed a surprise QA audit, along with recent history.
- Use `autopilot_status` to read the ledger at the start of a session and `autopilot_record_audit` to log each audit (include `task_id`, `focus`, and notes). The autopilot prompt references this file so audits are spread across epics instead of clustering.

### Lightweight Health Checks & Human Sync
- The `health_check` critic runs fast sanity commands (`make lint`, optionally `make test` on high capability) to catch regressions without invoking the full suite.
- The `human_sync` critic refreshes `docs/STATUS.md` with a timestamped digest generated from `state/context.md` and the latest roadmap fragment, keeping stakeholders informed even while the loop runs unattended.

### Non-interactive automation (codex exec)
- Use `codex exec "<prompt>" --full-auto --sandbox danger-full-access` for scripted runs; combine with `--json` or `--output-schema` to harvest structured results.
- Resume prior runs with `codex exec resume --last "<follow-up>"` to continue conversations without resetting flags.
- When running headless (CI, cron), export `CODEX_API_KEY=<token>` or run `codex login` once and rely on stored credentials.

---

## 4. Handling Codex Capability Levels
Set `CODEX_PROFILE=low|medium|high` before launching the server or Codex session.

| Profile | Behaviour | Typical Use |
| ------- | ---------- | ------------ |
| `low` | Skips heavy critics, batches file writes, runs minimal commands. | Limited sandbox or resource-constrained environments. |
| `medium` | Default workflow: build/tests critics, selective data checks. | Standard development. |
| `high` | Enables all critics (data quality, causal, allocator, design, exec), longer simulations, deep profiling. | Full CI runs, release readiness. |

The server annotates critic outputs with the profile so audit trails remain intact.

---

## 5. Automatic Test Execution
- When Codex or collaborators request tests, trigger:
  ```json
  {"critics": ["build", "tests"]}
  ```
  or
  ```json
  {"cmd": "make test"}
  ```
- If a command fails due to policy limits, the server logs the failure and creates remediation entries in `state/roadmap.yaml`.
- Schedule periodic self-audits with `manager_self_check` to ensure the orchestrator keeps context fresh and the roadmap actionable. This critic verifies `state/context.md` is updated within 12 hours, that “Next actions” exist, and that the roadmap still has non-complete tasks.

---

## 6. Ensuring “Never-Fail” Operation
- Rebuild `dist/` whenever you update `src/` (`make mcp-build` already runs `npm install` + `npm run build`).
- Use `codex logs` (or `cmd_run`) when debugging. Outputs persist in `state/critics/org_pm.json` if the org critic is enabled.
- Keep `state/context.md` ≤1,000 words; the server appends summaries automatically. If the file grows too large, snapshot and truncate manually while archiving the previous log.
- Before shutting down or switching tasks, call `context.snapshot` so a clean checkpoint exists.
- Guardrails: the orchestrator blocks destructive commands (e.g., `sudo`, `rm -rf /`, `git reset --hard`, directory escapes). If a command is refused, you’ll receive the guardrail message via `cmd.run`.
- Codex configuration: manage defaults in `~/.codex/config.toml`. For frictionless approvals, mark the repo trusted:
  ```toml
  [projects."/absolute/path/to/WeatherVane"]
  trust_level = "trusted"
  ```
  and tune models, sandbox, or plan behavior under `[profiles.weathervane_orchestrator]`.
- Authentication: `codex login` (ChatGPT account) or export `CODEX_API_KEY` for automation and non-interactive `codex exec` jobs.
- For CI pipelines, prefer `codex exec --full-auto --sandbox danger-full-access --json` to capture deterministic logs while respecting guardrails.

---

## 7. Next Enhancements (Optional)
- Configure a LaunchAgent or systemd service to start `tools/wvo_mcp/scripts/run_with_codex.sh` on boot.
- Wire GitHub MCP (if available) to automate PR/issue management alongside the filesystem server.
- Extend critics with bespoke commands (`make ux-lint`, `python scripts/causal_sensitivity.py`) as components ship.

With this setup, the WeatherVane Orchestrator runs as an always-on manager: it plans work, edits code, runs tests on demand, survives Codex context resets, and enforces the quality bar across engineering, design, science, and executive review.
