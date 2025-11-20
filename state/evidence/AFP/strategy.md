# Strategy: AFP (Meta)

**Purpose**  
Provide a standing strategic frame for AFP-governed work so every downstream task inherits clear intent, guardrails, and success criteria.

**Goal**  
Make AFP the default operating system for all tasks: every change follows STRATEGIZE→MONITOR with critics, evidence, guardrails, and no bypasses.

**Current Problem**  
Fragmented adherence: some tasks ship with partial phases, stale audits, or missing guardrail runs. This erodes trust and blocks automation.

**Scope**  
- Applies to all AFP-tagged tasks (Wave0 autopilot + manual).  
- Covers lifecycle discipline (10 phases), evidence quality, critics, guardrails, hygiene (git, audits), and remediation of bypass patterns.

**Success Criteria**  
1. 100% tasks have complete phase evidence (STRATEGIZE→MONITOR) with critics logged.  
2. Guardrail monitor green before PR/merge; daily audit fresh (<24h).  
3. No bypass patterns (BP001–BP005) detected; remediation tasks opened if found.  
4. Git hygiene: feature branches only; commit:check clean; ≤5 files/≤150 net LOC per micro-batch or documented split.  
5. Live checks (wave0, tests) executed or blocked-for-cause with evidence.

**Strategy**  
- **Standardize**: Enforce templates for strategy/spec/plan/think/design with critics; auto-run reviewers on staged artifacts.  
- **Instrument**: Require guardrail monitor + commit:check + daily audit; block merges when stale.  
- **Contain**: Use feature branches; forbid main pushes; document dirty states and lock handling.  
- **Remediate**: When bypass or failures occur, open AFP-<TASK>-REMEDIATION tasks with full AFP cycles.  
- **Adapt**: Refresh model/tooling registries regularly; keep SCAS traits (feedback, redundancy, observability) explicit in architecture and evidence.

**Risks & Mitigations**  
- Risk: Reviewer fatigue → Mitigate with concise, high-signal artifacts and automated reviewers.  
- Risk: Guardrail failures from repo drift → Run monitors early; isolate changes; document external dirtiness.  
- Risk: Live-run fragility (wave0 locks/missing assets) → Treat as blockers, not bypasses; log and schedule remediation tasks.  
- Risk: Scope creep beyond 5 files/150 LOC → Split tasks; favor deletion/simplification.

**Next Actions**  
- Keep daily audit current; rerun guardrail monitor on each AFP task.  
- Track remediation tasks in roadmap; close once guardrails/tests green.  
- Periodically review bypass patterns and update training/templates.
