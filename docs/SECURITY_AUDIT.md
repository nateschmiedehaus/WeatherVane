# T6.2.1 – Credentials Security Audit Plan

## Objective
- Produce a repeatable audit that validates how WeatherVane handles credentials across
  MCP automation, FastAPI services, and Prefect workers.
- Confirm secrets remain encrypted or redacted at rest, are scoped to least privilege
  at runtime, and obey DRY_RUN read-only guarantees during blue/green deploys.
- Deliver the evidence package required to satisfy the roadmap guardrail as part of
  the Security critic gate.

## Success Criteria
- Security critic (`critics_run(security)`) executes without capability skips and
  surfaces no blocking findings.
- `make security` runs the repository secret scanner (`tools/security/run_security_checks.py`)
  and returns clean results (no tracked secret files, no high-risk token signatures).
- Completed artifact set:
  - Inventory spreadsheet (`state/security/credential_catalog.json`) covering owners,
    storage location, rotation SLA, and fallback contact for every credential.
  - Updated runbook entry in `docs/runbooks/security_credentials.md`.
  - Audit report appended to this doc (findings, remediation status, residual risk).
- Blue/green upgrade rehearsal (`tools/wvo_mcp/scripts/run_provider_failover_test.mjs`)
  records DRY_RUN invariants for secret access (no write paths opened, auth.json kept
  sandbox-local).

## Scope & Systems
1. **MCP Automation**
   - Files: `tools/wvo_mcp/src/utils/auth_checker.ts`, `tools/wvo_mcp/scripts/autopilot.sh`,
     `tools/wvo_mcp/state/telemetry/*.jsonl`.
   - Questions:
     - How is `CODEX_HOME/auth.json` created, read, and cleaned up?
     - Does DRY_RUN enforce read-only state and avoid persisting secrets in telemetry?
     - Are CLI allow-lists preventing arbitrary credential exfiltration?
2. **FastAPI Services (`apps/api`)**
   - Modules: `apps/api/core/config.py`, `apps/api/services/*`, `shared/config`.
   - Confirm secrets only enter via environment variables/secret stores.
   - Inspect logging and tracing hooks for accidental secret inclusion.
3. **Worker Jobs (`apps/worker`)**
   - Modules: `apps/worker/maintenance/secrets.py`, `apps/worker/ingestion/*`,
     `apps/worker/pipelines/*`.
   - Validate upstream connectors (Meta, Google, Shopify, Klaviyo) honor rotation SLAs.
   - Ensure Prefect flow artifacts (e.g., `state/worker_runs/`) never persist raw tokens.
4. **Shared Libraries**
   - `shared/libs/connectors`, `shared/storage`, `shared/data_context`.
   - Confirm helper utilities hash or redact secrets before persistence.
5. **Infrastructure & Docs**
   - `docs/SECURITY.md`, `docs/MCP_ORCHESTRATOR.md`, deployment manifests under
     `deployments/`.
   - Verify documented procedures align with actual code paths.

## Deliverables & Artifacts
- **Credential Catalog** – JSON exported via `python apps/worker/maintenance/secrets.py --write-catalog`
  summarising every credential, environment, owner, rotation cadence, and storage medium.
- **Redaction Audit** – Test log demonstrating that telemetry, analytics, and runbooks
  redact secrets (tie into `critics_run(data_quality)` for log scrubs).
- **DRY_RUN Verification** – Execution trace showing MCP canary stays read-only while
  auth material is present.
- **Rotation Calendar** – Embedded schedule in `docs/runbooks/security_credentials.md`
  mapping rotation SLAs to operational alerts (`docs/OBS_ALERTS.md` sync).
- **Findings Register** – Table capturing issues, severity, owner, ETA, and status.

## Roles & Owner Matrix
- **Security Lead (Primary):** @security (drive audit execution, own findings register).
- **MCP Platform Owner:** @mcp (validate automation flows, DRY_RUN enforcement).
- **Product Engineering:** @api, @worker (remediate API/worker findings, update code).
- **Operations:** @ops (ensure rotation calendar and on-call response align with alerts).
- **Reviewer / Sign-off:** CTO + Head of Product; sign the audit report on completion.

## Execution Plan
1. **Preparation (Day 0)**
   - Kick-off review of this plan with owners; align on timeline and required access.
   - Freeze reference snapshot (`weathervane__context_snapshot`) before changes begin.
2. **Inventory & Discovery (Days 1–2)**
   - Run updated secrets validation script (`python apps/worker/maintenance/secrets.py`).
   - Export credential inventory to `state/security/credential_catalog.json`
     using `python apps/worker/maintenance/secrets.py --write-catalog`.
   - Map every secret to code touchpoints (`rg` search, static analysis).
3. **Control Verification (Days 3–4)**
   - Execute DRY_RUN canary using `tools/wvo_mcp/scripts/run_provider_failover_test.mjs`.
   - Inspect MCP telemetry and logs for secret leakage.
   - Review Prefect flow outputs, API logs, and shared storage for redaction coverage.
   - Evaluate rotation hooks against documented SLAs; note exceptions.
4. **Remediation & Retest (Days 5–6)**
   - File change requests for gaps (code, infra, documentation).
   - Re-run targeted pytest/vitest suites touching secret-handling logic.
   - Re-run `critics_run(security, data_quality, manager_self_check)` to ensure coverage.
5. **Report & Sign-off (Day 7)**
   - Append audit summary, findings, and status to this doc.
   - Circulate to owners for approval; gain sign-off and archive evidence in `docs/security`.

## Critics & Validation
- **Primary:** `security` critic (must run post-remediation, attach log to audit report).
- **Supporting:**
  - `manager_self_check` – ensures blue/green canary DRY_RUN protections hold.
  - `data_quality` – validates log redaction and telemetry hygiene.
  - `tests` – pytest/vitest suites referenced above.
  - Pending capabilities: track via `state/critics/security.json`; rerun once profile lifts.

## Open Questions & Risks
- Security critic currently skips due to capability profile; need coordination with infra
  team to unlock before Day 5.
- Autopilot telemetry retains the last 200 operations in JSONL; confirm retention policy
  scrubs aged entries or encrypts at rest.
- Determine whether third-party connectors (Meta, Google) require additional DPA/PII
  handling beyond token storage.
- Ensure contingency plan exists if vault integration slips (short-term mitigations).
