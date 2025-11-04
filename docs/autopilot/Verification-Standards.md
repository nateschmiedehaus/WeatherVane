
# Verification Standards (7‑Stage Loop)

**Goal:** Prove behavior, reliability, and integration—before merge.

## 1 — Methodology‑Specific
Run the chosen Strategize plan (fixtures/harness/property/benchmark/chaos). Save artifacts.

## 2 — Build (0 errors)
Treat warnings as errors in CI.

## 3 — Tests
All tests pass; coverage ≥85% lines / ≥70% branches; critical paths 90/80.  
Follow [UNIVERSAL_TEST_STANDARDS.md](UNIVERSAL_TEST_STANDARDS.md).

## 4 — Audit (Dependencies)
0 high/critical vulnerabilities.

## 5 — Lint (ALL scopes; zero‑tolerance)
Run all lint scripts; 6‑point checklist enforced.

## 6 — Runtime (E2E / Smoke)
Execute real flow with realistic data; resources within budget; logs clean.

## 7 — Stress (Critical Components)
Apply categories & targets per [Stress‑Testing.md](Stress-Testing.md).

**Exit:** All 7 stages pass; artifacts attached to PR.
