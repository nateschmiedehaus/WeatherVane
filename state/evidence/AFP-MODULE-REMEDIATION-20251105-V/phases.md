# AFP-MODULE-REMEDIATION-20251105-V Phase Notes

## STRATEGIZE
- Autopilot stuck because `npm run test --prefix tools/wvo_mcp` fails in four suites, so ProofSystem sets every Wave 0 task to `blocked`.  
- Root causes captured in strategy.md: template drift (`domain_expert_reviewer`), guardrail catalog path math, work-process fixtures missing evidence files, ML critic parser unfinished.  
- Stakeholders: Wave 0 operators, ProcessCritic/guardrail owners, Director Dana, downstream module remediation tasks.

## SPEC
- Success criteria enumerated in spec.md: all four suites green, guardrail catalog loads from repo root, work-process tests use real evidence stubs, ML critic parser returns bools, full `npm run test` passes, Wave 0 completes at least one task afterward.  
- Non-functional: ≤5 files, ≤150 net LOC, no weakening of guardrails, documentation updates (followups table) + Wave 0 evidence.

## PLAN
- Approach: add workspace-root helper for guardrail tests, temp evidence fixtures for work-process suite, restore reviewer templates + aggregator output, wire ML critic parser, run Wave 0.  
- Files + testing strategy + autopilot command captured in plan.md; risk table lists workspace detection + temp dir cleanup as key hazards.

## THINK
- Edge cases (workspace detection failure, temp dir leaks, autopilot run still blocked) and failure modes documented in think.md.  
- Assumptions recorded (catalog exists, enforcer accepts custom root, etc.); mitigation includes explicit errors + cleanup hooks.
