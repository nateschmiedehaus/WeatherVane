
# Integration‑First & Programmatic Verification

## Protocol: Search → Integrate → Verify

**Search (5–10 min)**  
Terms: `registry`, `discovery`, `model`, `queue`, `scheduler`, `worker`, `job`, `cache`, `auth`, `config`, `logger`  
Commands:
```bash
grep -R "registry\|discovery\|model" src/
rg "queue|scheduler|worker|job" src/
```

**Integrate (not duplicate)**  
Use/extend shared utilities; align with interfaces; never hardcode values that belong to registries.

**Verify (programmatic)**  
Script + tests must prove: called, propagated, **used**, shared utils imported, no duplicate types, logs attribute source, negative‑path exists.

## Red Flags
Hardcoded values; duplicate interfaces; bypassed shared logger/config/cache; inconsistent patterns.

## Example: ComplexityRouter
Fix: query ModelRegistry/Discovery → pass through runners → agents use `modelSelection ?? fallback`.

## 8‑Check Script Template
See `docs/autopilot/examples/verify_system_integration.sh`.

## Evidence-Gated Phase Transitions

WorkProcessEnforcer advances only when each phase produces required artifacts. Every checklist item is persisted to the phase ledger (`state/process/ledger.jsonl`) and verified before a new lease is issued.

| Phase | Required artifacts | Validation |
| --- | --- | --- |
| **STRATEGIZE** | Problem statement, approach selection, purpose link (`docs/autopilot/strategy.md` or journal entry) | Non-empty doc; journal anchor present; ledger hash recorded. |
| **SPEC** | Acceptance criteria, success metrics, definition of done (`docs/autopilot/spec.md`) | Checklist populated; referenced in journal; attested in ledger. |
| **PLAN** | Task breakdown, estimates, dependencies (`docs/autopilot/plan.md`) | Plan hash stored; dependencies resolved; lease closed with artifact path. |
| **THINK** | Alternatives, risks, edge cases (`docs/autopilot/think.md` / journal “### Team Panel”) | Required when ambiguity flag set; risk coverage noted; ledger entry cites doc. |
| **IMPLEMENT** | Code diff + targeted tests/docs | Changed files tracked; unit tests touch modified symbols; coverage delta captured. |
| **VERIFY** | Test matrix outputs (unit/integration/e2e), lint/type/security/license logs, signed report | All gates green; artifacts archived under `resources://`; counterexamples retained. |
| **REVIEW** | Reviewer rubric JSON with line comments + risk/rollback | Rubric passes thresholds; verdict stored; Critical follow-ups logged if any. |
| **PR** | PR description with evidence links, prompt signature attestation, CI results | CI green; ledger hash + signature included; link persists in journal. |
| **MONITOR** | Smoke results (`state/monitoring/smokes.jsonl`), SLO metrics, escalation notes | Success ≥95% tracked; loop rate ≤2%; MTTR ≤30s; discrepancies logged and linked. |

Phase checklists are extensible per task type; overrides come from Atlas manifest entries or roadmap metadata and are included in the ledger metadata block.

## Playwright & UI Verification

- Playwright harness lives under `apps/web/playwright/` with runner `apps/web/scripts/run_playwright.sh`.
- CI must install browsers (`npx --yes --prefix tools/wvo_mcp playwright install chromium --with-deps`) before Verify runs; missing browsers block phase advancement.
- Capture traces/screenshots when UI diffs occur and link the artifacts in Verify + Monitor ledger entries.
