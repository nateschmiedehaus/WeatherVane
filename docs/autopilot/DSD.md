# Desired State Declaration (DSD)

- **Mission & OKRs** – Captures the top-level intent for Unified Autopilot along with measurable OKRs. The control plane treats these as the ultimate source of truth during reconciliation.
- **Policies** – Security, integrity, governance, context budgets, router lock, and resolution rules live alongside the DSD so reconcilers can validate every run against the latest guardrails. Modifying these files requires a governance PR (RFC + ADR).
- **Roadmap hierarchy** – Epics → Stories → Tasks encoded declaratively with acceptance criteria, budgets, and statuses. Roadmap reconcilers compare the desired hierarchy against observed repo/GitHub state and issue operations (add/decompose/move/etc.) to close drift.
- **SLOs & KPIs** – Each SLO (time-to-green, changed-lines coverage, canary pass-rate, incident MTTR) is declared with thresholds. Reconcilers read CI telemetry/observability data and open work (or tighten budgets) when targets are missed.
- **Capacity & Cost** – Declares team velocity hints plus per-state token/time budgets so the cost reconcilers can optimize router choices and escalate when spend exceeds plan.
- **Release trains** – Declarative cadence (name, interval, next cut) so autoscrum can forecast readiness.

## Files & Structure

- `state/dsd/desired_state.yaml` – canonical desired state.
- `state/dsd/schemas/*.json` – strict JSON schemas validated on every run.
- `state/dsd/policies/*.yaml` – policy overlays (security, integrity, governance, context budgets, router lock, resolution).
- `state/dsd/snapshots/<timestamp>.yaml` – event-sourced snapshots taken before/after reconcile loops for audit/rollback.

All changes to the DSD or policy overlays must go through an RFC/ADR and a governance PR. Reconciliation attests to the SHA of the canonical files and halts (opening an incident PR) if tampering is detected.

## Lifecycle

1. **Load** – `desired_state_loader.ts` validates the DSD against the schema/invariants.
2. **Observe** – `observe.ts` gathers the actual state (roadmap, quality SLOs, costs, incidents).
3. **Plan** – Reconcilers compute drift and produce idempotent action plans.
4. **Apply** – Plans are executed via MCP tools + agents; snapshots and events are recorded.
5. **Attest** – Dashboards and ledger entries prove convergence; autoscrum reruns on schedule.
