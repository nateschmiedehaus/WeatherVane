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
- Parse docs (`docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/STACK.md`, `agent.md`) to seed `state/roadmap.yaml`.
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
| `manager_self_check` | Every cadence (at least daily) | `node tools/wvo_mcp/scripts/check_manager_state.mjs <workspace>` | Context updated in ≤12h, "Next actions" present, roadmap retains actionable tasks | `state/critics/manager_self_check.json` |

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
