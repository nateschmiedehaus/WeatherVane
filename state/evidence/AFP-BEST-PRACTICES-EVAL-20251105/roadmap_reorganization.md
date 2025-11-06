# Strategic Roadmap Reorganization Proposal

**Date:** 2025-11-05
**Issue:** AFP-HIERARCHICAL-WORK-PROCESSES-20251105 added as monolithic task; conflicts with existing structure
**Solution:** Break into strategic subtasks, integrate with WAVE-5/W5.M1, update dependencies

---

## Current Problems

1. **Duplication**: AFP-ROADMAP-MUTATION-API listed as pending task (line 569) but already implemented in my Task 1
2. **Monolithic task**: AFP-HIERARCHICAL-WORK-PROCESSES-20251105 bundles 4 distinct subtasks (1500 LOC)
3. **Poor sequencing**: Dependencies unclear, no phasing strategy
4. **Missing integration**: Best practices tasks not placed in roadmap structure

---

## Strategic Reorganization

### WAVE-5, M5.M1: Institutionalise Autonomy Operations

**Strategic intent:** Enable autopilot to evolve itself continuously

**Current tasks** (lines 557-715):
- AFP-ROADMAP-SCHEMA → AFP-ROADMAP-MUTATION-API → AFP-ROADMAP-GUARDRAILS → AFP-ROADMAP-VALIDATION
- AFP-QUALITY-METRICS → AFP-FEEDBACK-LOOP → AFP-SELF-REFACTOR
- AFP-LESSON-PERSISTENCE
- AFP-HIERARCHICAL-WORK-PROCESSES-20251105 (monolithic)
- AFP-W5-MONITORING-DECK → AFP-W5-EXIT-READINESS

**Issues with current structure:**
1. AFP-ROADMAP-MUTATION-API is pending but already done (Task 1)
2. Hierarchical work processes is one huge task, should be phased
3. Best practices not integrated

---

### Proposed Reorganization

#### Phase 1: Roadmap Automation Foundation (DONE + in progress)

**AFP-ROADMAP-SCHEMA** (existing, pending)
- Status: Should be pending
- JSON schema for roadmap
- Dependencies: AFP-W4-EXIT-READINESS

**AFP-ROADMAP-MUTATION-API** (existing, but DONE)
- Status: **DONE** (completed as Task 1 of hierarchical work processes)
- Files: `tools/wvo_mcp/src/orchestrator/roadmap_mutations.ts` (462 LOC)
- Tests: `roadmap_mutations.test.ts` (315 LOC, 10/10 passing)
- Commit: db831ea59
- **Action:** Update status to 'done', reference commit

**AFP-ROADMAP-GUARDRAILS** (existing, pending)
- Status: **PARTIALLY DONE** (dependency validation, conflict detection, rate limiting already in mutation API)
- Remaining work: Fuzz tests, alerts
- Dependencies: AFP-ROADMAP-MUTATION-API (now done)
- **Action:** Update to reflect partial completion

---

#### Phase 2: Work Process Foundation (NEW - break out from monolithic task)

**AFP-WORK-PROCESS-SCHEMA** (new subtask)
- Status: **DONE** (completed as Task 1)
- Files: `tools/wvo_mcp/src/schemas/work_process_schema.ts` (501 LOC)
- Commit: db831ea59
- Dependencies: None
- Exit criteria:
  - [x] TypeScript types for hierarchical processes
  - [x] Meta-review types
  - [x] Template evolution types
  - [x] Process enforcement types

**AFP-WORK-PROCESS-EXECUTOR** (new subtask)
- Status: pending
- Dependencies: AFP-WORK-PROCESS-SCHEMA
- Deliverables:
  - hierarchical_executor.ts (~300 LOC)
  - Meta-review analyzer
  - Integration tests
- Exit criteria:
  - [ ] Task set process executes (6 phases)
  - [ ] Epic process executes (7 phases)
  - [ ] Meta-review runs automatically
  - [ ] Remediation tasks created
- **Codex-friendly:** Executor logic is model-agnostic

**AFP-WORK-PROCESS-TEMPLATES** (new subtask)
- Status: pending
- Dependencies: AFP-WORK-PROCESS-EXECUTOR
- Deliverables:
  - docs/templates/task_set_process_template.md (~100 LOC)
  - docs/templates/epic_process_template.md (~100 LOC)
  - docs/templates/evidence_template/ enhancements (tasks.md, context.md)
- Exit criteria:
  - [ ] Templates exist and documented
  - [ ] A/B testing framework defined
  - [ ] Metrics collection integrated
- **Best practice integration:** Enhanced evidence template from best practices eval

**AFP-PROCESS-ENFORCEMENT** (new subtask)
- Status: pending
- Dependencies: AFP-WORK-PROCESS-TEMPLATES
- Deliverables:
  - ProcessEnforcementCritic (~150 LOC)
  - Pre-commit hook enhancements (~100 LOC)
  - Helper scripts (~100 LOC)
  - Test-and-fix loop (from best practices)
- Exit criteria:
  - [ ] ProcessEnforcementCritic validates compliance
  - [ ] Pre-commit hooks enforce
  - [ ] Test-and-fix loop prevents bad commits
- **Best practice integration:** Test-and-fix loop from evaluation

---

#### Phase 3: Self-Improvement Loop (reorganize existing)

**AFP-QUALITY-METRICS** (existing, keep as-is)
- Measures process effectiveness
- Feeds into meta-review

**AFP-FEEDBACK-LOOP** (existing, keep as-is)
- Consumes quality metrics
- Creates improvement tasks

**AFP-TEMPLATE-EVOLUTION** (new subtask, extracted from monolithic)
- Status: pending
- Dependencies: AFP-FEEDBACK-LOOP, AFP-WORK-PROCESS-TEMPLATES
- Deliverables:
  - A/B testing implementation
  - Statistical significance testing
  - Auto-rollback logic
  - Template versioning
- Exit criteria:
  - [ ] Templates can evolve incrementally (max 20% change)
  - [ ] A/B testing works
  - [ ] Auto-rollback on degradation
  - [ ] Cooldown enforced (1 week)

**AFP-SELF-REFACTOR** (existing, keep as-is)
- Demonstrates end-to-end capability

**AFP-LESSON-PERSISTENCE** (existing, keep as-is)
- Memory across sessions

---

#### Phase 4: Best Practices Integration (NEW tasks from evaluation)

**AFP-PROPERTY-BASED-TESTING** (high priority)
- Status: **PARTIALLY DONE** (added to UNIVERSAL_TEST_STANDARDS.md)
- Remaining: Install fast-check, write property tests for mutation API
- Dependencies: None
- Exit criteria:
  - [x] Documentation added to test standards
  - [ ] fast-check installed in wvo_mcp
  - [ ] 3+ property tests written for mutation API
  - [ ] Integrated into CI
- **Universal:** Model-agnostic

**AFP-VISUAL-REFERENCE-WORKFLOW** (high priority)
- Status: pending
- Dependencies: None (screenshot tools already exist)
- Deliverables: Documentation in CLAUDE.md
- Exit criteria:
  - [ ] Workflow documented
  - [ ] Integration with design_system critic
  - [ ] Example screenshots in docs
- **Universal:** Model-agnostic

**AFP-SKILLS-SYSTEM** (high priority, Claude-only)
- Status: pending
- Dependencies: None
- Deliverables:
  - UserPromptSubmit hook (~100 LOC)
  - skill-rules.json (~50 LOC)
  - 3-5 example skills (~150 LOC)
- Exit criteria:
  - [ ] Hook-based auto-activation working
  - [ ] Progressive disclosure pattern implemented
  - [ ] Token usage measured (expect 40-60% savings)
- **Claude-specific**
- **Codex alternative:** Progressive disclosure in CLAUDE.md (manual activation)

**AFP-UTILITY-SCRIPTS** (medium priority)
- Status: pending
- Dependencies: None
- Deliverables: tools/scripts/ library
- Exit criteria:
  - [ ] test-auth-route.js
  - [ ] format-code.sh
  - [ ] check-quality.sh
- **Universal:** Model-agnostic

---

## Proposed Task Sequence (W5.M1)

```yaml
milestones:
  - id: W5.M1
    title: Institutionalise autonomy operations
    status: in_progress
    tasks:
      # Foundation (schema + mutation)
      - AFP-ROADMAP-SCHEMA (pending)
      - AFP-ROADMAP-MUTATION-API (DONE ✅)
      - AFP-ROADMAP-GUARDRAILS (partially done, update)
      - AFP-ROADMAP-VALIDATION (pending)

      # Work process foundation
      - AFP-WORK-PROCESS-SCHEMA (DONE ✅)
      - AFP-WORK-PROCESS-EXECUTOR (pending)
      - AFP-WORK-PROCESS-TEMPLATES (pending)
      - AFP-PROCESS-ENFORCEMENT (pending)

      # Quality & feedback
      - AFP-QUALITY-METRICS (pending)
      - AFP-FEEDBACK-LOOP (pending)
      - AFP-TEMPLATE-EVOLUTION (pending, new)

      # Capabilities
      - AFP-SELF-REFACTOR (pending)
      - AFP-LESSON-PERSISTENCE (pending)

      # Best practices (universal)
      - AFP-PROPERTY-BASED-TESTING (partially done)
      - AFP-VISUAL-REFERENCE-WORKFLOW (pending)
      - AFP-UTILITY-SCRIPTS (pending)

      # Best practices (Claude-specific, separate milestone?)
      - AFP-SKILLS-SYSTEM (pending)

      # Monitoring
      - AFP-W5-MONITORING-DECK (pending)
      - AFP-W5-EXIT-READINESS (blocked)
```

---

## Dependency Graph (Critical Path)

```
AFP-W4-EXIT-READINESS
    ↓
AFP-ROADMAP-SCHEMA
    ↓
AFP-ROADMAP-MUTATION-API (DONE ✅)
    ↓
AFP-ROADMAP-GUARDRAILS ──→ AFP-ROADMAP-VALIDATION
    ↓
AFP-WORK-PROCESS-SCHEMA (DONE ✅)
    ↓
AFP-WORK-PROCESS-EXECUTOR
    ↓
AFP-WORK-PROCESS-TEMPLATES ←─ AFP-PROPERTY-BASED-TESTING (parallel)
    ↓
AFP-PROCESS-ENFORCEMENT
    ↓
AFP-QUALITY-METRICS ──→ AFP-FEEDBACK-LOOP
    ↓                        ↓
AFP-TEMPLATE-EVOLUTION ←────┘
    ↓
AFP-SELF-REFACTOR
    ↓
AFP-W5-EXIT-READINESS
```

---

## Actions Required

### 1. Update existing tasks
- [ ] AFP-ROADMAP-MUTATION-API: Change status to 'done', add commit reference
- [ ] AFP-ROADMAP-GUARDRAILS: Update description to reflect partial completion
- [ ] AFP-HIERARCHICAL-WORK-PROCESSES-20251105: **REMOVE** (replaced by subtasks)

### 2. Add new subtasks (replacing monolithic task)
- [ ] AFP-WORK-PROCESS-SCHEMA (mark as done)
- [ ] AFP-WORK-PROCESS-EXECUTOR
- [ ] AFP-WORK-PROCESS-TEMPLATES
- [ ] AFP-PROCESS-ENFORCEMENT
- [ ] AFP-TEMPLATE-EVOLUTION

### 3. Add best practices tasks
- [ ] AFP-PROPERTY-BASED-TESTING (mark as partially done)
- [ ] AFP-VISUAL-REFERENCE-WORKFLOW
- [ ] AFP-UTILITY-SCRIPTS
- [ ] AFP-SKILLS-SYSTEM (with Codex alternative noted)

### 4. Document Codex alternatives
For Claude-specific features, add "Codex alternative:" section:
- **Skills System** → Progressive disclosure in CLAUDE.md (manual)
- **Planning Mode** → STRATEGIZE phase (already universal)
- **/catchup** → Read summary.md directly

---

## Benefits of This Reorganization

1. **Clear phasing**: Foundation → Execution → Evolution → Best Practices
2. **No duplication**: Marks completed work as done
3. **Better dependencies**: Clear critical path
4. **Model-agnostic**: Codex alternatives documented
5. **Incremental delivery**: Each subtask ships independently
6. **Best practices integrated**: Universal practices prioritized

---

## Next Steps

1. Apply this reorganization to state/roadmap.yaml
2. Update task statuses to reflect current progress
3. Commit reorganized roadmap
4. Continue with AFP-WORK-PROCESS-EXECUTOR (next pending task)

---

**Prepared by:** Claude Council
**Date:** 2025-11-05
**Status:** Ready for roadmap update
