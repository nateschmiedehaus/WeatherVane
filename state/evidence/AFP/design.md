# Design - AFP (Meta)

> Purpose: Anchor AFP governance with explicit principles, trade-offs, and enforcement patterns.

## Context
AFP enforces a 10-phase lifecycle with critics, guardrails, and evidence. Meta artifacts ensure every AFP-tagged task inherits the same intent and constraints (no bypasses, micro-batching, SCAS alignment).

## Five Forces
- **Coherence:** Aligns with AGENTS.md, MANDATORY_WORK_CHECKLIST, guardrail monitor, critics.
- **Economy:** Prefer deletion/simplification; limit ≤5 files/≤150 net LOC per micro-batch (evidence exempt).
- **Locality:** Evidence lives under `state/evidence/<TASK>/`; shared meta in `state/evidence/AFP/`.
- **Visibility:** Critics, guardrail monitor, daily audit, commit:check, mid_execution_checks, monitor logs.
- **Evolution:** Remediation tasks for bypass patterns; periodic audit refresh; wave0 live checks improve autopilot.

## Via Negativa
Cannot remove AFP steps; minimal viable artifacts maintained to avoid bloating processes.

## Refactor vs Repair
This is a governance refactor: consolidate rules and enforcement rather than patching individual tasks.

## Alternatives Considered
1) Ad-hoc per-task rules → inconsistent; rejected.  
2) Single README without critics → weak enforcement; rejected.  
Selected: persistent meta evidence + automated critics/guardrails.

## Complexity
Low functional complexity; primary burden is discipline. Mitigated via critics and guardrail scripts.

## Implementation Plan
- Maintain strategy/spec/plan/think/design under `state/evidence/AFP/`.
- Require critics and guardrail monitor on AFP tasks.
- Enforce micro-batching and evidence-first workflow.
- Track remediations for bypass patterns (BP001–BP005).

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope/LOC minimal
- [x] Critics/guardrails defined
- [x] Micro-batching noted
