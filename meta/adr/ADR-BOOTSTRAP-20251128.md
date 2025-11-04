# ADR-BOOTSTRAP-20251128 — MVP Bootstrap Budget Adjustment

- **Status:** Proposed
- **Date:** 2025-11-04
- **Steward:** autopilot-core
- **Context:** AFP-AUTOPILOT-MVP-STRANGLER-20251115 requires scaffolding for supervisor, agents, libs, and adapters. The default guardrail budget (max_new_files=4, max_loc_added=400) prevents even minimal stubs, halting the roadmap (DPS, Memory Core, Reflex integration).

## Decision
Temporarily expand creation limits to **max_new_files=12** and **max_loc_added=1200** for tasks tagged `#BOOTSTRAP` that directly implement the four MVP sub-scaffolds:
1. AFP-MVP-SUPERVISOR-SCAFFOLD
2. AFP-MVP-AGENTS-SCAFFOLD
3. AFP-MVP-LIBS-SCAFFOLD
4. AFP-MVP-ADAPTERS-SCAFFOLD

Conditions:
- Each sub-task must stay within its scoped LOC/file target and cite reuse/deletion plans to offset new code.
- All commits created under this ADR must include `#BOOTSTRAP` in the message to allow entropy adjustments.
- Evidence per sub-task: structure/dep/ownership checks with logs under `state/evidence/AFP-BOOTSTRAP-UNBLOCK-20251128/verify/<subtask>/`.
- Budgets revert automatically once the MVP demo passes CI and the steward closes this ADR.

## Consequences
- Enables incremental merging while respecting AFP-SCAS constraints.
- Requires follow-up to ensure adapters retire legacy code within 90 days (TTL on graveyard entries).
- Entropy watchdog must subtract #BOOTSTRAP commits when analyzing net LOC until sunset.

## Sunset
- **Sunset trigger:** `autopilot_mvp` demo passes CI with supervisor/agents/libs/adapters integrated and AFP-DPS-BUILD-20251116 succeeds.
- **Action:** steward files `ADR-BOOTSTRAP-20251128` update marking status "Superseded", resets guardrail budgets to defaults (max_new_files=4, max_loc_added=400), and removes #BOOTSTRAP allowances.
