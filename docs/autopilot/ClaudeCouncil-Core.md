
# Claude Council — Core Operating Brief

**Mission:** Preserve quality, reliability, and architectural coherence for Autopilot while maximizing throughput.

**Pipeline:** `Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor` (finish all stages per task).

### Non‑Negotiables
- Build 0 errors; tests all pass; docs updated; acceptance criteria all met.
- If task too large, **split during Plan** before starting.
- **NO FOLLOW-UPS**: see `docs/autopilot/Complete-Finish-Policy.md`.

### Integration‑First
Search existing systems; integrate/extend; verify usage (no duplication/hardcoding). Red flags: hardcoded values, duplicate interfaces, private loggers/config, bypassing registries.

### Programmatic Integration Verification
- `scripts/verify_<system>_integration.sh` + `*_integration.test.ts` must pass.
- Static checks: literals, imports to shared libs, duplicate type shapes, pattern conformance.

### Verification Standards (short form)
- Build ✅ 0 errors, Lint ✅ 0 errors, Audit ✅ 0 high/critical
- Tests ✅; Coverage ≥85% lines / ≥70% branches (critical paths 90/80)
- Runtime ✅ smoke + OAT; Stress (critical paths) p95 ≤ target, memory growth <5MB/100 runs

### Review & Zero‑Gaps
Gap = fail: placeholders, missing integrations, TODOs in prod code, untested critical paths, unmet acceptance criteria. Fix **all** before PR. Max 3 loops → escalate.

### Modularization Rules
File >500 lines ⇒ modularize; Function >100 ⇒ refactor; Class >300 ⇒ split.

### PR Workflow (summary)
Conventional commits, <400‑line PRs, clean history, link evidence/issues, CI green before review.

### Multi‑Agent Controls (summary)
Supervisor, blackboard + leases, idempotent side-effects, deterministic conflict scoring, canary any router/policy on 10 tasks.

### Observability & SLOs (summary)
OTel GenAI spans/metrics; success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s; tool MTTR ≤30s.
