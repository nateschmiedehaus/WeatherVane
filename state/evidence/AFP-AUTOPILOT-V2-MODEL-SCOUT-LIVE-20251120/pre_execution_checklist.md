# Pre-Execution Quality Commitment

**Task:** AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120  
**Agent:** Codex  
**Timestamp:** 2025-11-20T02:55:00Z

## Quality Commitment
- [x] Read and understood task requirements
- [x] Read docs/agent_self_enforcement_guide.md
- [x] Reviewed state/analytics/behavioral_patterns.json
- [x] Commit to completing all 10 AFP phases
- [x] Quality over speed
- [x] “Done” = all phases + critics + proof
- [x] Self-check at phase boundaries
- [x] Remediate any failed self-checks
- [x] No “cheap or slick” patterns

## Understanding Check
**What does “done” mean?**  
Live Model Scout (replaces stubs) discovers latest Gemini/Claude/Codex/o-series via provider inputs/benchmarks, updates registry with recency guard, tests/guardrails/wave0 verify; evidence + critics pass; commit/push on branch.

**Key bypass patterns to avoid:** BP001 Partial phases; BP004 Skipping self-checks; BP005 Claiming without proof.

**Commitment:** Execute full AFP lifecycle with long-term fixes, not workarounds.
