# WeatherVane MCP Orchestrator (WVO) Design

Defines the Model Context Protocol (MCP) server that runs the autonomous **WeatherVane Orchestrator** described in the master system prompt. The design anchors on the existing repository layout (`apps/`, `shared/`, `docs/`, `infra/`, `tests/`, `storage/`) and codifies the planning, execution, and multi-critic feedback loops required to ship WeatherVane end-to-end without human-in-the-loop intervention.

---

## 1. Mandate & Operating Posture
- **Role**: Senior project/program manager × Staff+ engineer × data/ML scientist × causal inference researcher × product/UX designer.
- **Mission**: Deliver WeatherVane across ingest → modeling → allocation → dashboards → CI, while producing reproducible artifacts, documentation, and telemetry.
- **Autonomy**: Run continuously until stop conditions (credentials, legal/compliance, security red flag, tool failure) are met. Never wait for confirmation when the environment is healthy.
- **Non-negotiables**: Reproducibility (seeded runs, logged versions), least-privilege security, temporal causality (no leakage), honest UX copy, coverage ≥85%, deterministic Plan/Do/Check/Act loop.

---

## 2. High-level Architecture
Textual component diagram:

```
┌─────────────────────────────┐
│ MCP Transport (JSON-RPC)    │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ SessionManager              │ manages MCP sessions & routing
├──────────────┬──────────────┤
│ StateStore   │              │ persists roadmap/context/checkpoints
│  - roadmap   │              │ (backed by `state/`)
│  - context   │              │
│  - checkpoints              │
├──────────────┼──────────────┤
│ PlannerEngine│ builds epics → milestones → tasks
├──────────────┼──────────────┤
│ Executor     │ orchestrates tool calls (fs/git/shell/fetch/memory)
├──────────────┼──────────────┤
│ CriticSuite  │ multi-loop feedback (lint, tests, DQ, causal, UX...)
├──────────────┼──────────────┤
│ TelemetryBus │ emits logs, metrics, artifacts (`experiments/`, `docs/`)
└──────────────┴──────────────┘
               │
        External MCP tools
```

- **SessionManager**: Implements the MCP server skeleton (TypeScript or Python). Registers WVO tools and enforces sandbox/approval settings forwarded from the client.
- **StateStore**: CRUD interface for `state/roadmap.yaml`, `state/context.md`, `state/checkpoint.json`, and structured critic outputs under `state/critics/`.
- **PlannerEngine**: Synthesises tasks from docs (e.g., `docs/ROADMAP.md`, `docs/STACK.md`) and repository state. Maintains dependency graph, estimates, exit criteria.
- **Executor**: Provides high-level operations (`run_command`, `apply_patch`, `open_file`, `write_file`, `search`, etc.) backed by MCP tool adapters; respects sandbox/approval policy.
- **Guardrails**: Shell execution enforces workspace confinement and blocks destructive commands (`sudo`, `rm -rf /`, `git reset --hard`, `.git` deletion) while still allowing full access inside the repository.
- **CriticSuite**: Composes modular critics (build, tests, data quality, leakage, causal, forecast, allocator, UX, security, cost). Each critic exposes `prepare → execute → assess → record`.
- **TelemetryBus**: Streams run metadata to `experiments/`, writes structured run logs (JSONL), updates docs (`docs/CHANGELOG.md`, `docs/ADR/`), and optionally emits events to external services when the MCP client supports them.

---

## 3. Tooling Surface (MCP Tools)
Custom MCP tool namespace: `weathervane.orchestrator`. Each tool runs within workspace-write sandbox by default and escalates only when necessary.

| Tool | Purpose | Input | Output | Backing behavior |
| --- | --- | --- | --- | --- |
| `plan.next` | Retrieve & prioritise upcoming tasks | `{limit?, filters?}` | Ordered task list with metadata | Reads `state/roadmap.yaml`, cross-checks repo diff (`git status`), surfaces blockers |
| `plan.update` | Amend roadmap entries | `{task_id, fields{status,eta,owner,notes}}` | Updated task payload | Writes roadmap file, appends decision log |
| `context.write` | Update running context summary | `{section, content, append?}` | Acknowledgement | Writes `state/context.md`; ensures ≤1,000 words |
| `context.snapshot` | Persist checkpoint | `{reason}` | Path to snapshot file | Serialises `state/checkpoint.json` with open tasks, failing critics, commit hash |
| `fs.read` | Read repository file fragment | `{path, start?, end?}` | File text | Wraps filesystem MCP adapter with repo-relative safeguards |
| `fs.write` | Write/update file | `{path, content, mode}` | Result (success, diff) | Uses apply_patch semantics, updates plan with required critics |
| `cmd.run` | Execute shell command | `{cmd, workdir?, env?, timeout?}` | Stdout/stderr, exit code | Calls `bash -lc`, attaches logs, triggers critics |
| `critics.run` | Execute one or more critics | `{critics[], mode}` | Per-critic status, artifacts | Runs lint/tests/etc., stores outputs under `state/critics/<critic>.json` |
| `artifact.record` | Register artifact | `{type, path, metadata}` | Artifact id | Adds entries to `experiments/` or `docs/`, updates roadmap exit criteria |
| `decision.record` | Append ADR/context entry | `{title, summary, impact}` | Path to update | Writes `docs/adr/ADR-<slug>.md` or inline note in `state/context.md` |

The server may also proxy to existing MCP servers (`filesystem`, `git`, `fetch`, `memory`) by launching them internally or delegating via subtools when the client lacks them.

---

## 4. Control Loop (PDCA with Double-Loop Learning)

### Plan
- Parse docs (`docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/STACK.md`, `AGENTS.md`) to seed `state/roadmap.yaml`.
- Expand epics → milestones → tasks with owners = `WVO`, estimates, dependencies, exit criteria, and critic requirements.
- For each cycle, select smallest viable vertical slice that moves epic state forward; prefer tasks that unblock critical paths (ingest → features → models → allocator → UX → CI).

### Do
- Execute tasks using repository-native workflows:
  - Code: `fs.write`, `apply_patch`, or scaffolding under `apps/`, `shared/`, `weathervane/`.
  - Data/experiments: run Prefect flows (`python apps/worker/run.py ...`), ingestion scripts, or modelling notebooks under `experiments/`.
  - Docs: update `README.md`, `docs/`, runbook files.
- Every Do step logs to `state/context.md` and registers artifacts via `artifact.record`.

### Check
- Trigger `critics.run` suite per task exit criteria. Minimum baseline: lint (`make lint`), tests (`make test`), type checks (mypy/pyright if configured), coverage report, data quality assertions.
- Special loops:
  - Leakage auditor runs feature timestamp diff, ensures embargo windows.
  - Causal critic executes placebo tests, heterogeneity sanity checks.
  - Forecast stitch critic validates observation vs forecast alignment.
  - Allocator critic stress-tests constraints/regret.
  - UX critic runs Storybook/Playwright snapshots when front-end touched.
  - Security critic runs secret scan (`detect-secrets`, `pip-audit`, `npm audit`).
  - Cost/perf critic captures runtime + memory metrics, API call counts.
- Results persisted in `state/critics/<name>.json` with `status`, `diagnostics`, `artifacts`.

### Act
- If all required critics succeed: update roadmap to mark task complete, prepare merge instructions, update `docs/CHANGELOG.md`, tag release via `git` MCP tool if configured.
- On failure: auto-create remediation tasks with blocking status, append to roadmap, record summary in `state/context.md`, optionally open GitHub issues via `git` MCP tool.

---

## 5. Quality Governance & Standards

To satisfy WeatherVane’s ambition for world-class execution, WVO enforces layered standards spanning organisation, design, engineering, science, and executive stewardship. The MCP server encodes these standards as critic contracts, checklists, and escalation paths:

- **Organisational & PM Excellence**: Every task must map to roadmap objectives with measurable exit criteria, stakeholder notes, risk registers, and dependency tracking. Burn-down and velocity metrics live under `state/critics/org_pm.json`.
- **Conceptual & Product Strategy**: ADRs and decision logs capture product reasoning, ensure customer outcomes, and quantify trade-offs. Narrative quality is reviewed before shipping major features.
- **Technical & Computational Rigor**: Code paths undergo linting, testing, type-checking, performance profiling, and algorithmic complexity review. Optimisation targets are documented with before/after benchmarks.
- **Academic & Scientific Validation**: Modeling and causal claims require citations, reproducible notebooks, statistical power checks, and sensitivity analyses. Findings are logged with DOIs or canonical references where available.
- **Design, UX, and Aesthetic Standards**: UI/UX updates run through storybook snapshots, accessibility audits, heuristics reviews, and branding consistency checks. Visual outputs must meet brand guidelines.
- **Startup CEO / Executive Review**: Strategic impact, runway implications, customer commitments, and GTM alignment are evaluated on each release, captured in an executive summary critic.

These expectations are codified via critic modules so that deviations trigger automatic remediation tasks.

---

## 6. Critics & Feedback Modules

| Critic | Trigger | Commands / Checks | Exit Criteria | Artifacts |
| --- | --- | --- | --- | --- |
| `build` | Code or config change | `make lint`, formatters | No lint errors; format diff clean | `state/critics/build.json` |
| `tests` | Python/TS code change | `make test`, targeted pytest/Jest | All tests pass; coverage ≥85% or documented waiver | Coverage XML/HTML |
| `typecheck` | Python/TS modules | `mypy apps/ shared/`, `pyright apps/web` | No type errors | Type logs |
| `data_quality` | Ingest/feature/model tasks | Custom Polars/DuckDB checks, schema validators | Missingness, drift, anomaly thresholds met | Reports under `experiments/dq/` |
| `leakage` | Feature/model changes | Rolling-origin CV, feature timestamp diff | No future data usage; embargo satisfied | `experiments/leakage/<ts>.json` |
| `causal` | Modeling/allocator | Placebo tests, DR learner diagnostics | Sensitivity within tolerances; HTES consistent | `experiments/causal/` |
| `forecast_stitch` | Weather ingest/feature tasks | Alignment checks, nowcast/forecast blending asserts | Timestamp alignment ± tolerance; doc update | Logs + doc snippet |
| `allocator` | Policy changes | Stress tests, regret bounds, guardrail sweeps | All guardrails maintained; regret ≤ threshold | `experiments/policy/` |
| `ux` | Frontend/UI | Storybook build, a11y lint, heuristics script | No WCAG blockers; snapshot diff reviewed | Screenshots JSON |
| `security` | Any change | Secret scan, dependency audit | No high vulns or documented waivers | `state/critics/security.json` |
| `cost_perf` | Long-running ops | Profiling hooks, Prefect metrics | Runtime/memory within budgets | `experiments/perf/` |
| `design_system` | Front-end visuals, docs, dashboards | Visual regression tests, design token validator, brand guideline lint, accessibility eval | Visual deltas approved; WCAG AA maintained; tokens in sync with design library | `state/critics/design_system.json`, snapshots |
| `org_pm` | Any roadmap/task updates | Validate roadmap linkage, dependency health, risk register updates, cycle metrics | All tasks trace to roadmap; blockers captured; next actions recorded | `state/critics/org_pm.json`, burn-down chart |
| `academic_rigor` | Modeling, causal, or scientific claims | Notebook reproducibility run, citation checker, statistical power & sensitivity analysis | Re-run succeeds; references documented; diagnostics within thresholds | `experiments/academic/<ts>/report.json`, citations file |
| `exec_review` | Release candidates, major milestones | Compose CEO-level brief (strategy, KPIs, runway impact), checklist for customer commitments, GTM readiness | Executive summary approved; OKRs updated; go/no-go logged | `state/critics/exec_review.json`, summary memo |
| `manager_self_check` | _Retired 2025-10-17_ | _n/a_ | Autopilot now enforces context freshness via roadmap grooming; critic left for historical telemetry only | `state/critics/manager_self_check.json` |

Critics are modular classes under `tools/wvo_mcp/critics/` and may be run selectively depending on the touched paths (path-based routing).

---

## 7. State & Persistence

Directory: `state/`

```
state/
  roadmap.yaml          # authoritative plan
  context.md            # ≤1,000 words running log (decisions, risks, next actions)
  checkpoint.json       # latest checkpoint for crash recovery
  critics/
    build.json
    tests.json
    ...
```

### `state/roadmap.yaml` schema (excerpt)
```yaml
epics:
  - id: E1
    title: "Ingest & Weather"
    milestones:
      - id: M1.1
        title: "Seed connectors & DQ harness"
        tasks:
          - id: T1.1.1
            title: "Implement Open-Meteo connector"
            owner: WVO
            estimate_hours: 6
            status: pending  # pending | in_progress | blocked | done
            dependencies: []
            exit_criteria:
              - critic: build
              - critic: tests
              - doc: docs/weather/connector.md
```

### `state/context.md` structure
```
# WeatherVane Orchestrator Context (<=1000 words)
- Current focus: <epic/milestone/task>
- Decisions since last snapshot: ...
- Risks / blockers: ...
- Next actions (<=5 bullet list): ...
```

### `state/checkpoint.json`
```json
{
  "timestamp": "2024-07-02T11:45:00Z",
  "git": {
    "branch": "main",
    "commit": "abc123"
  },
  "active_task": "T1.1.1",
  "open_tasks": ["T1.1.1", "T1.1.2"],
  "failing_critics": ["tests"],
  "notes": "pytest failing due to missing fixture; fix in progress."
}
```

Checkpoints are written on context overflow, before long-running commands, and prior to MCP session termination.

---

## 8. Repository Integration
- **Code Execution**: Leverage Make targets (`make api`, `make worker`, `make lint`, `make test`, `make smoke-context`) and direct scripts (`python apps/worker/run.py`, Prefect deployments).
- **Docs**: Update `README.md`, `docs/*.md`, `docs/adr/` per milestone. Ensure architecture diagrams in `docs/ARCHITECTURE.md` stay in sync.
- **Tests**: Run `tests/` mirroring structure; add new suites alongside modules in `apps/`, `shared/`.
- **Data Artifacts**: Store intermediate outputs under `storage/`, `experiments/`, `tmp/` while respecting retention policies.
- **CI/Infra**: Integrate with `infra/k8s`, `infra/terraform` for deployment automation.
- **Observability**: Write pipeline metrics to `storage/metadata/` and `observability/` directories per existing conventions.
- **Git Sync**: When the autopilot completes a cycle it now stages tracked changes, commits with a summary-derived message, and pushes to `${WVO_AUTOPILOT_GIT_REMOTE:-origin}/${WVO_AUTOPILOT_GIT_BRANCH:-main}`. Set `WVO_AUTOPILOT_GIT_SYNC=0` to disable, or `WVO_AUTOPILOT_GIT_SKIP_PATTERN` (defaults to `.clean_worktree`) to block pushes when nested worktrees are present.
- **State Ledger & Runtime Roots**:
  - Runtime artefacts now resolve through `WVO_STATE_ROOT` (defaults to `<workspace>/state`). Set this path to relocate critic evidence, telemetry, and checkpoints outside the git tree without changing code.
  - Workers also honour `WVO_WORKSPACE_ROOT`; point it at a staged checkout when running canary/shadow validations so SQLite paths, relative reads, and temp artifacts stay isolated from the active workspace.
  - Each autopilot cycle records a snapshot in `state/journal/state_ledger.jsonl` capturing file hashes/byte counts. Use it for deterministic replays and audit trails.
  - All stores/critics respect the state root. MCP writes to the ledger, telemetry, and critics directories even when the state lives on another volume.
- **Tool Manifest**:
  - Call `tool_manifest` via MCP to fetch metadata about each tool (schema id, estimated cost, prerequisites, postconditions). The manifest lives at `tools/wvo_mcp/config/tool_manifest.json` and is cached automatically.
  - Planners can consume this manifest to schedule work without hardcoding capabilities.
- **Offline Product Cycle**:
  - When Codex/Claude are unreachable, run `scripts/run_product_cycle.py`. It calls the MCP worker directly, pulls the next product-domain tasks, and appends an offline summary to `state/context.md`.
  - This script relies solely on the local worker entrypoint, so it works even when `WVO_AUTOPILOT_OFFLINE=1` or DNS is unavailable.

Path routing rules help the MCP server choose critics:
- `apps/api`, `shared/`: trigger build/tests/typecheck/security critics.
- `apps/web`: add ux critic, storybook run.
- `apps/worker`, `shared/feature_store`: add data_quality, leakage, causal, forecast critics.
- `shared/policy`, `apps/api/policy`: add allocator critic.
- `docs/`: ensure doc lint/consistency (optionally vale/markdownlint).

---

## 9. Implementation Blueprint

Directory to add: `tools/wvo_mcp/`

```
tools/wvo_mcp/
  package.json            # if TypeScript implementation
  tsconfig.json
  README.md               # quickstart, MCP registration instructions
  src/
    index.ts              # entry point, registers MCP tools
    session.ts            # SessionManager
    state/
      roadmap_store.ts
      context_store.ts
      checkpoint_store.ts
    planner/
      planner_engine.ts
      roadmap_parser.ts
    executor/
      command_runner.ts
      file_ops.ts
    critics/
      base.ts
      build.ts
      tests.ts
      ...
    telemetry/
      logger.ts
      artifact_registry.ts
    utils/
      path_filters.ts
      config.ts
```

Alternative Python layout:
```
tools/wvo_mcp/
  pyproject.toml
  src/weathervane_mcp/
    __init__.py
    server.py
    session_manager.py
    state/...
```

**Recommendation**: Start with TypeScript + `@modelcontextprotocol/sdk` because:
- Integrates cleanly with existing `npx` workflow (mirrors docs snippet).
- Simplifies packaging for clients like VS Code, Cursor, Cline.
- Enables strong typing for tool schemas and easier JSON Schema validation.

Regardless of language, provide:
- Configuration file `tools/wvo_mcp/config.example.json` referencing master prompt.
- Scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run test` (Vitest).
- GitHub CI workflow in `infra/ci/wvo-mcp.yml` to lint/test the server.
- See also `docs/MCP_AUTOMATION.md` for setup, Codex profiles, and auto-run guidance.

---

## 10. Codex CLI Awareness & Mode Adaptation

WVO must adapt behaviour to the Codex CLI environment it runs within. The MCP server should:

1. **Maintain a Codex Command Registry** – expose metadata for all Codex CLI commands so the planner can select the right action. At minimum include:
   - `codex mcp-server`
   - `codex session`
   - `codex reply`
   - `codex plan`
   - `codex tools`
   - `codex config`
   - `codex logs`
   - `codex prune`
   Provide command descriptions, required flags, approval implications, and expected outputs in `tools/wvo_mcp/src/executor/codex_commands.ts` (or Python equivalent).

2. **Detect Codex Capability Level** – read from environment variable (e.g., `CODEX_PROFILE`, `CODEX_CAPABILITY`) or MCP session metadata; default to **medium** if unspecified.

3. **Adjust Strategy Per Level**:
   - **Low**: Minimise heavy commands; batch edits; prefer read-only operations; disable optional critics; avoid launching background services.
   - **Medium**: Default workflow; run baseline critics; schedule heavy computations during low-usage windows; throttle external calls.
   - **High**: Enable full critic suite, deep simulations, and long-running experiments; parallelise where safe; raise resource monitoring.

4. **Surface Level-Aware Decisions** – log capability-driven adjustments in `state/context.md` and annotate critic results (e.g., `state/critics/tests.json`) with the capability flag.

5. **Fail-Safe** – if the detected capability conflicts with required work (e.g., low profile but task requires high resources), automatically enqueue a roadmap task to escalate or request approval.

6. **CLI Health Checks** – Before major sessions, run `auth_status` to confirm compatibility; capture outputs under `state/critics/org_pm.json` or telemetry logs.

7. **Test Command Awareness** – When Codex (or collaborators) requests specific tests, the MCP server parses the instruction, verifies availability (e.g., `make test`, targeted pytest commands), and runs them automatically via `cmd.run` if sandbox policy allows. If execution is not possible (capability mismatch, missing dependencies, approval blocked), the server documents the limitation in `state/context.md`, creates a remediation task in the roadmap, and proceeds with alternative verification steps.

8. **Session Resilience & Context Recovery** – The server monitors conversation length and, when Codex signals or the session approaches window limits, writes an up-to-date checkpoint (`state/checkpoint.json`) plus condensed summary in `state/context.md`. It can then start a fresh Codex chat using `codex mcp-server` or `codex session` with the same base instructions, hydrate state from the checkpoint, and continue execution autonomously.

9. **Command Escalation & Automation** – Maintain a playbook for when Codex refuses to run a command (e.g., due to approval policy). The server retries with `with_escalated_permissions` when allowed; otherwise, it records the block, notifies via roadmap/task, and selects the nearest feasible action (e.g., static analysis instead of integration tests). For unattended workflows, prefer `codex exec --full-auto --sandbox danger-full-access` with JSON output so runs can be resumed via `codex exec resume --last` if needed.

Document these behaviours in `tools/wvo_mcp/README.md` so operators understand how to tune Codex profiles.

---

## 11. Zero-downtime Self-Upgrade Roadmap (Milestone M6.4)

Short answer: **Yes**—the MCP can upgrade itself during a live run, only enable features after they prove safe, and do so with zero downtime plus automatic rollback. The roadmap entries under `E6 > M6.4` capture the implementation work required to make this real while ensuring anti-kill safeguards.

### 11.1 Architecture Overview

- **Front-end (stable)**: The MCP server process that owns STDIO transport and tool registry; it never restarts during routine upgrades.
- **Back-end workers (swappable)**: Child processes wired over IPC. You may run two in parallel:
  - `active` serves traffic.
  - `canary` runs the new code in shadow mode.
- **Runtime feature flags**: Stored in SQLite rather than env vars so toggles occur live.
- **Canary harness**: Builds the new worker, runs it beside the active worker, and promotes only after shadow checks succeed.

### 11.2 Live Feature Flags (`T6.4.1`)

Environment toggles now live in the `settings` table inside `state/orchestrator.db`. The orchestrator state machine creates the table and seeds defaults (including the `DISABLE_NEW` kill switch) on boot:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  val TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  metadata JSON
);

CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);
```

Default values mirror `DEFAULT_LIVE_FLAGS` in `tools/wvo_mcp/src/state/live_flags.ts`. The runtime wires a hot-reloading `LiveFlags` poller (500 ms interval) that reads the snapshot from SQLite and collapses to legacy defaults whenever `DISABLE_NEW=1`, ensuring the kill switch takes effect immediately.

A lightweight CLI wraps the store for operators:

```bash
ts-node tools/wvo_mcp/scripts/live_flags.ts list
ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE verbose
ts-node tools/wvo_mcp/scripts/live_flags.ts kill-switch on
```

Internally the `LiveFlags` instance is created by `OrchestratorRuntime` and injected into every subsystem (coordinator, context assembler, operations manager, quality monitor, etc.), so flag flips propagate without restarts.

### 11.3 Blue/Green Worker Manager (`T6.4.2`)

Add a `WorkerManager` that keeps the front-end process stable while managing active and canary workers.

```ts
import { fork } from "node:child_process";
import { EventEmitter } from "node:events";

type RpcReq = { id: string, method: string, params: any };
type RpcRes = { id: string, ok: boolean, result?: any, error?: string };

class Worker extends EventEmitter {
  private child: any;
  private pending = new Map<string,(r:RpcRes)=>void>();
  public readonly tag: "active"|"canary";
  public ready = false;

  constructor(entryJs: string, env: Record<string,string>, tag:"active"|"canary") {
    super();
    this.tag = tag;
    this.child = fork(entryJs, { env: { ...process.env, ...env }});
    this.child.on("message", (m: any) => this.onMsg(m));
    this.child.on("exit", (code: number) => { this.ready = false; this.emit("exit", code); });
  }
  onMsg(m: any) {
    if (m?.type === "ready") { this.ready = true; this.emit("ready"); return; }
    if (m?.id && this.pending.has(m.id)) { const cb = this.pending.get(m.id)!; this.pending.delete(m.id); cb(m); }
  }
  async call(method: string, params: any): Promise<any> {
    if (!this.ready) throw new Error(`Worker ${this.tag} not ready`);
    const id = Math.random().toString(36).slice(2);
    const p = new Promise<RpcRes>((res)=>this.pending.set(id, res));
    this.child.send({ id, method, params } satisfies RpcReq);
    const r = await p;
    if (!r.ok) throw new Error(r.error || "worker_error");
    return r.result;
  }
  stop() { try { this.child.kill("SIGTERM"); } catch {} }
}

export class WorkerManager {
  private active?: Worker;
  private canary?: Worker;

  startActive(entryJs="dist/worker.js") {
    this.active = new Worker(entryJs, { WVO_ROLE: "active" }, "active");
    return new Promise<void>((ok)=> this.active!.once("ready", ()=> ok()));
  }
  startCanary(entryJs="dist-next/worker.js", dry=true) {
    this.canary = new Worker(entryJs, { WVO_ROLE: "canary", WVO_DRY_RUN: dry ? "1":"0" }, "canary");
    return new Promise<void>((ok)=> this.canary!.once("ready", ()=> ok()));
  }
  getActive() { if (!this.active) throw new Error("no_active_worker"); return this.active; }
  async switchToCanary(): Promise<void> {
    if (!this.canary?.ready) throw new Error("canary_not_ready");
    const old = this.active;
    this.active = this.canary;
    this.canary = undefined;
    if (old) old.stop();
  }
}
export const workers = new WorkerManager();
```

Tool handlers call `workers.getActive().call(...)`, enabling atomic swaps when the canary is certified.

### 11.4 Worker Entrypoint & DRY_RUN Safeguards (`T6.4.3`)

Create a worker entry that routes RPCs, honours runtime flags, and blocks mutations in dry-run mode.

```ts
import { liveFlags } from "./runtime/live_flags.js";
import { orchestrator } from "./runtime/orchestrator_runtime.js";

process.send?.({ type: "ready" });

process.on("message", async (m: any) => {
  const { id, method, params } = m || {};
  if (!id) return;
  try {
    const out = await route(method, params);
    process.send?.({ id, ok: true, result: out });
  } catch (e: any) {
    process.send?.({ id, ok: false, error: String(e?.message ?? e) });
  }
});

async function route(method: string, params: any) {
  const flags = liveFlags.get();
  if (process.env.WVO_DRY_RUN === "1") {
    if (method === "applyPatch" || method === "mutateState") {
      throw new Error("dry_run_no_mutation");
    }
  }
  switch (method) {
    case "health": return { ok: true, flags };
    case "plan":   return orchestrator.plan(params, flags);
    case "dispatch": return orchestrator.dispatch(params, flags);
    case "runTool":  return orchestrator.runTool(params, flags);
    case "verify":   return orchestrator.verify(params, flags);
    case "report.mo": return orchestrator.moReport(params, flags);
    default: throw new Error("unknown_method");
  }
}
```

### 11.5 Canary Harness & Promotion Flow (`T6.4.4`)

Upgrade script runs the flow end-to-end with automatic rollback on any failure.

```ts
async function safeUpgrade({ patchPath }: { patchPath: string }) {
  await sh("git worktree add ../wv-next");
  await sh("cp " + patchPath + " ../wv-next/upgrade.patch");
  await sh("cd ../wv-next && git checkout -b chore/canary && git apply upgrade.patch");
  await sh("cd ../wv-next && npm ci && npm run build && npm test");

  await workers.startCanary("../wv-next/dist/worker.js", /*dry=*/true);

  await workers.getActive().call("health", {});
  await workers["canary"]?.call("health", {});
  await workers["canary"]?.call("plan", samplePlanInput());
  await workers["canary"]?.call("report.mo", sampleMoInput());

  await workers.switchToCanary();

  await workers.startCanary("../wv-next/dist/worker.js", /*dry=*/false);
  await workers.switchToCanary();

  return { ok: true };
}
```

Any error leaves the original worker active and surfaces a structured failure.

### 11.6 Feature Flag Gating (`T6.4.5`)

| Feature | Location | Proof before enabling |
| --- | --- | --- |
| Compact prompts + stable header | Planner/context builder | Run `plan` in canary, inspect prompts, flip `PROMPT_MODE='compact'` |
| Sandbox pool (bwrap/docker) | Executor | Execute read-only commands in pool during dry run, verify outputs, flip `SANDBOX_MODE='pool'` |
| Strict output DSL + idempotency | Tool handlers | Generate outputs in canary, validate formatting, then route apply through v2 implementation |
| WSJF scheduler + WIP lanes | Scheduler | Shadow plan backlog, diff vs legacy, flip `SCHEDULER_MODE='wsjf'` |
| Selective tests | Verifier | Run impacted test selection in canary, flip `SELECTIVE_TESTS='1'` |
| Danger gates & approvals | Verifier | Compute risk in shadow mode, flip `DANGER_GATES='1'` |
| Missed Opportunity engine | Reporter | Produce sample report with fixtures, flip `MO_ENGINE='1'` |
| OpenTelemetry spans | Front-end + worker | Enable in canary, confirm exports, flip `OTEL_ENABLED='1'` |
| Minimal UI | Separate process | Can start/stop independently; flag can log readiness |

> **Implementation status:** Compact evidence-pack prompts now ship by default. Use `ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE verbose` to restore the legacy markdown payload during debugging or staged rollbacks.

### 11.7 Safe Write-Protection for Canary (`T6.4.3`)

- Open SQLite using `file:state.db?mode=ro` whenever `WVO_DRY_RUN=1`.
- Wrap filesystem writes so apply/commit commands fail fast during dry runs.
- Sandbox canary with `--network none` and refuse `git commit`, `fs.write`, or `applyPatch` until promoted.

Violations throw `dry_run_no_mutation`, keeping the active worker untouchable.

### 11.8 Runtime Tool Registration (`T6.4.6`)

- Keep tool names stable (e.g., `repo.apply_patch`) and route internally to legacy or v2 handlers based on flags.
- Optionally pre-register v2 tools and return `{ error: "disabled" }` until flags flip.
- Provide `settings.update` admin MCP tool so operators adjust flags without restarts.

### 11.9 Flag Management Workflow (`T6.4.6`)

```ts
await db.prepare(
  "UPDATE settings SET val=?, updated_at=CURRENT_TIMESTAMP WHERE key=?"
).run(val, key);
```

Both workers poll `settings` so flips apply within 500 ms and survive process swaps.

### 11.10 Failure Paths & Automatic Rollback (`T6.4.7`)

- Build/test failures in the staged worktree → promotion aborted.
- Canary not ready within timeout → abort.
- Shadow checks diverge → abort.
- Post-promotion health degradation → automatic switch back to standby worker and reset of flags (including flipping `DISABLE_NEW=1`).

### 11.11 Operator Checklist (`M6.4` Summary)

1. Add new modules (`live_flags.ts`, `worker_manager.ts`, `worker_entry.ts`) and seed SQLite table.
2. Route MCP tool handlers through the worker proxy.
3. Start the active worker under manager control.
4. During upgrade: create worktree, apply patch, build/test, spawn canary in `DRY_RUN=1`.
5. Run shadow checks (`health`, `plan`, `report.mo`) and compare outputs.
6. Switch routing to canary, restart without `DRY_RUN`, and switch again for final promotion.
7. Flip feature flags one at a time after proof.
8. Monitor health; if thresholds breach, auto-rollback and set `DISABLE_NEW=1`.

### 11.12 Assurance

With blue/green workers, live flags, DRY_RUN safeguards, and auto-rollback, the MCP upgrades itself mid-flight and keeps the session alive even if the new code fails. The new roadmap milestone ensures these capabilities ship with clear exit criteria and anti-kill protections.

---

### 11.13 Tight Integration Playbook (Steps 0–15)

Use this playbook when implementing or operating the zero-downtime upgrade path. Each step maps directly to roadmap milestone `M6.4`.

#### Step 0 — Non-negotiable invariants
- Build new code in a separate worktree (`../wv-next`).
- Promotion requires four gates: build ✓ → unit ✓ → selfchecks ✓ → canary READY ✓; any failure aborts.
- Tool handlers never throw; they always return `{ error: "<msg>" }` on failure.
- Canary booted with `DRY_RUN=1`, DB opened read-only, and all writes/network calls blocked.
- Ship a single behavioral change per upgrade (one flag flip, tool swap, or migration).
- Keep the previous worker alive until the new worker survives the observation window.

#### Step 1 — Preconditions & single-flight lock
- Assert `git status` clean, Node/npm match `.nvmrc`/`package.json`, sandbox tooling (Docker/bwrap) available, disk free ≥500 MB, and SQLite responds to `BEGIN; ROLLBACK;`.
- Ensure no concurrent upgrade by checking `state/upgrade.lock`; create it before work, remove it on both success and failure.

```bash
printf "%s\n" "$(date -Is)" > state/upgrade.lock
```

Use `ts-node tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts` to enforce these checks.
The script acquires `state/upgrade.lock` while running and records the outcome under
`experiments/mcp/upgrade/<timestamp>/preflight.json`, including the four gate placeholders
(`build → unit → selfchecks → canary_ready`).

#### Step 2 — IPC protocol (front-end ↔ worker)
- Requests: `{ "id": "<uuid>", "method": "plan|dispatch|runTool|verify|report.mo|health", "params": { ... } }`.
- Responses: `{ "id": "<uuid>", "ok": true, "result": { ... } }` or `{ "id": "<uuid>", "ok": false, "error": "string" }`.
- Worker announces `{ "type": "ready" }` once booted.
- Enforce a 30 s timeout per RPC (configurable). On timeout, return `{ error: "worker_timeout" }` and increment the error counter.

#### Step 3 — Health, heartbeats, circuit-breakers
- Send `health` every 2 s; three consecutive failures trip the circuit, triggering rollback and `DISABLE_NEW=1`.
- SLOs: health RTT p95 <100 ms; interactive `runTool` p95 <400 ms; `plan` p95 <3 s.
- Error budget: rollback if `{ error: ... }` exceeds 5 % of calls over any 2 min observation after a switch.

#### Step 4 — DRY_RUN guarantees
- Start canary with `WVO_DRY_RUN=1`.
- Open SQLite via `file:state/state.db?mode=ro`.
- Disable network/shell writes; `applyPatch`, `fs.write`, `git commit`, etc. must respond with `{ error: "dry_run_no_mutation" }`.

#### Step 5 — Safe schema migrations
- Follow expand → cutover → contract pattern; dual-write during cutover; drop legacy structures only after ≥48 h of clean operation.
- Validate migrations in the staged worktree’s private DB copy before the front-end touches the live DB.

#### Step 6 — Blue/green worker switch sequence
1. `git worktree add ../wv-next`; apply patch; `npm ci`; `npm run build`; `npm test`.
2. `await workers.startCanary("../wv-next/dist/worker.js", /*dry=*/true);`
3. Shadow calls: `health`, `plan`, `report.mo`; compare outputs against active worker.
4. Route read-only traffic to the dry canary for ~60 s while logging diffs.
5. Spawn live canary (`dry=false`) and call `switchToCanary()` again.
6. Observe for 10 min; if SLOs or error budgets breach, `routeBackToPreviousWorker()` and set `DISABLE_NEW=1`.
7. Keep old worker alive for at least 30 min as hot standby before termination.
8. When observation passes, automatically mark the upgrade as stable, clear `state/upgrade.lock`, persist new flags, and retire the old worker after the standby window without manual intervention.

#### Step 7 — Tool handler safety contract
- Validate inputs (AJV), enforce shell allow-list, invoke `callWorker`, catch exceptions, and return `{ error }`.
- Wrap calls in OTel spans when enabled; never leak exceptions past the registration wrapper.

```ts
registerToolSafe(server, "repo.apply_patch", PatchInput, { description: "Apply diff" }, async (input) => {
  if (!isAllowedDiff(input.diff)) return { error: "diff_not_allowed" };
  try {
    return await callWorker("runTool", { name: "repo.apply_patch", args: input });
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
});
```

#### Step 8 — Live flags API
- Read via `const flags = liveFlags.get();`
- Write through the admin tool using:

```sql
UPDATE settings
   SET val = ?, updated_at = CURRENT_TIMESTAMP
 WHERE key = ?;
```

- Flip only one flag per upgrade; emergency shutdown uses `UPDATE settings SET val='1' WHERE key='DISABLE_NEW';`.

#### Step 9 — Determinism checks per feature
- Compact prompts: assert header present and body JSON parses.
- Sandbox pool: compare outputs (regex equivalence) with legacy executor.
- Strict DSL/idempotency: ensure diffs match `^@@ ` or `^diff --git`; JSON outputs parse.
- WSJF scheduler: verify ≥80 % overlap with legacy task ordering.
- Selective tests: impacted set must be non-empty; otherwise fall back to full suite.
- MO engine: confirm CSV/PDF artifacts exist and are non-zero sized.
- Abort flag flip on any mismatch.

#### Step 10 — Resource & time limits
- Default timeout 30 s; allow 120 s for `tests.run` and `report.mo`.
- Lane concurrency caps: interactive ≤2, batch ≤2; throttle batch to 1 if worker RSS >1.5× baseline for 60 s.
- Sandbox pool size 2–3 per workspace.

#### Step 11 — Observability
- Emit OTel attributes (or structured logs) with `task.id`, `task.type`, `lane`, `method`, `ok`, `error`, `duration.ms`, `risk.score`, `changed.paths.count`, `tests.count`.
- Example fallback log:

```json
{"ts":"2025-10-11T01:23:45Z","span":"tool:tests.run","ok":true,"duration.ms":321,"lane":"interactive","task.id":"T6.4.9"}
```

#### Step 12 — Automated rollback
- Trigger rollback on heartbeat trip, error-budget breach, determinism failure, or manual `DISABLE_NEW=1`.
- Steps: `routeBackToPreviousWorker()`, reset flags to defaults (including `DISABLE_NEW=1`), log `rollback_complete`, keep failed worker alive for post-mortem.

#### Step 13 — Post-switch self-checks
- Run `health`, `plan → dispatch` on fixture (with call-level DRY_RUN), `repo.read_file`, `tests.run -k smoke`, `report.mo`.
- Require `{ error: ... }` rate <1 %, no DB write errors, no sandbox failures.
- Rollback if any check violates thresholds.

#### Step 14 — Operator commands
- Provide MCP tools: `upgrade.applyPatch(path)`, `flags.set(key,val)`, `route.switchToCanary()`, `route.backToPrevious()`, `health.summary()`, `panic.disableNew()`.
- All commands return structured `{ ok, result|error }` envelopes; no thrown exceptions.

#### Step 15 — Final flag flip order
1. Promote worker (dry → live) per Step 6.
2. Flip flags one at a time, running determinism checks between each:
   - `PROMPT_MODE=compact`
   - `SANDBOX_MODE=pool`
   - Switch single tool to v2 (strict DSL/idempotent apply)
   - `SCHEDULER_MODE=wsjf`
   - `SELECTIVE_TESTS=1`
   - `MO_ENGINE=1`
   - `DANGER_GATES=1`
   - `OTEL_ENABLED=1`
   - `UI_ENABLED=1`
3. Observe for 10 min; if clean, mark upgrade “stable”; otherwise rollback route and flags.
4. When stable, the MCP keeps the promoted worker and flag set active going forward—no operator action required.

---

## 11. Interaction with External MCP Servers
- Launch bundled MCP servers (`filesystem`, `git`, `fetch`, `memory`) when the client does not supply them. Expose them via proxy tools or instruct the client to configure them separately (`docs/MCP_ORCHESTRATOR.md` cross-references quick-start JSON).
- Provide a helper CLI (`npx wvo-mcp bootstrap`) that writes the recommended `mcp.json` snippet and `.prompt/wvo.md` file from the master instructions.

---

## 12. Rollout & Verification Plan

| Phase | Goals | Key Tasks | Exit Criteria |
| --- | --- | --- | --- |
| 0. Bootstrap | Establish directories & scaffolding | Create `state/`, add `.gitkeep`; generate roadmap/context templates; scaffold `tools/wvo_mcp` project | Server compiles; roadmap/context exist with seed entries |
| 1. Core Transport | Stand up MCP server | Implement `SessionManager`, register `plan.*`, `context.*`, `fs.*`, `cmd.run` tools | Server responds to ping; can read/write state files |
| 2. Planner + Executor | Make WVO productive | Parse docs into roadmap; implement `Executor` wrappers for command/file ops; add path-based critic hints | WVO can open repo, plan tasks, edit files |
| 3. Critics v1 | Baseline feedback loops | Implement build/tests/typecheck critics; wire to Make targets; persist outputs | After code change, `critics.run` executes baseline suite |
| 4. Advanced Critics | Data/causal/allocator/UX loops | Add domain-specific critics, integrate with worker scripts & dashboards | Critics produce artifacts; gating enforced |
| 5. Telemetry & Docs | Observability & guidance | Emit logs/metrics; update docs (`README`, `docs/`), add ADR for MCP architecture | Telemetry stored under `experiments/`; docs published |
| 6. CI & Release | Automated quality | Add CI workflow; publish package via npm or internal registry; tag release | CI green; versioned package available; change logged |

---

## 13. Next Actions (for WVO Implementation)
1. Scaffold `state/` directory and populate `roadmap.yaml`, `context.md`, `checkpoint.json` template.
2. Add `tools/wvo_mcp/` project with TypeScript skeleton, package scripts, and README referencing configuration snippets.
3. Implement `plan.next`, `plan.update`, `context.write`, and core filesystem/command wrappers.
4. Wire baseline critics (build/tests/typecheck/security) invoking existing Make targets; persist results.
5. Extend critics suite for data quality, leakage, causal validation, forecast stitching, allocator stress tests, UX, and cost/perf.
6. Document MCP usage in `README.md` and `docs/` (cross-link this design), provide bootstrap prompt file instructions.
7. Integrate MCP server checks into CI and developer onboarding; ensure reproducible telemetry and seed management.

---

This document should be kept in sync with implementation progress. Update sections (especially critics, roadmap schema, tool list) as the MCP server evolves.
