# WeatherVane Task Blueprint

Every roadmap entry must include the following sections so contributors and critics share the same expectations:

## Requirements
- What user/customer problem are we solving?
- What constraints or scope boundaries exist (out of scope items, dependencies, domain guardrails)?

## Standards
- Product/design quality expectations (copy tone, accessibility, performance budgets, visual language).
- Engineering standards (testing targets, logging, observability, telemetry, security).
- Domain-specific benchmarks (ML metrics, API latency, UX clarity, etc.).

## Implementation Plan
- Concrete steps broken into small increments (brief → build → critique → evidence loop).
- Tools/commands to run (e.g. Playwright, Vitest, Pytest, ML benchmark scripts).
- Ownership or secondary reviewers if multiple disciplines are involved.

## Deliverables
- Code artifacts (files/services/modules updated or created).
- Documentation/supporting materials (screenshots, experiment reports, context notes).
- Proof of validation (test suites, critics run IDs, evaluation metrics).

## Integration Points
- APIs, services, datasets, or telemetry streams touched by this work.
- Contract/schema changes and downstream consumers to notify.
- Operational hooks (alerts, CI workflows, deployment steps) that must be updated.
- Data flow diagram or written description showing how data moves through the updated components (sources, transformations, outputs, consumers).

## Evidence
- Links to Playwright reports, experiment metrics, or screenshots stored under `state/artifacts/**`.
- References to `state/context.md` entries logging decisions, follow-ups, and open questions.

Use this template when drafting or refining tasks in `state/roadmap.yaml`, GitHub issues, or internal planning docs. Tasks missing any section are not considered ready for assignment.***
