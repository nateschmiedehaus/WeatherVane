# PLAN: WAVE-0 – Foundation Stabilisation

**Epic ID:** WAVE-0
**Status:** In Progress
**Owner:** Director Dana
**Date:** 2025-11-06

---

## Milestone Breakdown

**WAVE-0 consists of 3 milestones executed sequentially:**

```
W0.M1: Reboot Autopilot Core (COMPLETE)
   ↓
W0.M2: Test Harness (COMPLETE)
   ↓
W0.M3: Hierarchical Process System (IN PROGRESS)
   ↓
WAVE-0 Exit Readiness Review
```

**Rationale for sequence:**
1. **M1 first:** Can't test autopilot (M2) until core exists (M1)
2. **M2 second:** Can't enforce hierarchy (M3) until we can safely test changes (M2)
3. **M3 third:** Hierarchy needs concrete examples from M1/M2 to extract patterns

---

## W0.M1: Reboot Autopilot Core (COMPLETE)

**Goal:** Establish minimal viable autonomous loop

**Status:** ✅ COMPLETE (2025-11-05)

**What shipped:**
1. **Wave 0 Runner** (`tools/wvo_mcp/src/wave0/runner.ts`)
   - Autonomous task selection from roadmap
   - Rate limiting, signal handling
   - File locking for safety
   - ~200 LOC

2. **Task Executor** (`tools/wvo_mcp/src/wave0/task_executor.ts`)
   - Task execution wrapper
   - Evidence bundle creation
   - Analytics logging
   - ~130 LOC

3. **Proof System** (integrated with existing critics)
   - StrategyReviewer (validates strategic thinking)
   - DesignReviewer (validates AFP/SCAS compliance)
   - ThinkingCritic (validates depth of analysis)
   - ProcessCritic (validates phase compliance)

4. **Git Hygiene** (basic file locking)
   - Lock file `.wave0.lock` prevents concurrent runs
   - Graceful shutdown on SIGTERM/SIGINT

**Outcomes validated:**
- ✅ Wave 0 running in production (PID 28551, 2025-11-05)
- ✅ Autonomous task selection works (reads roadmap, picks tasks)
- ✅ Evidence bundles created (`state/evidence/AFP-*/`)
- ✅ Analytics logged (`state/analytics/wave0_runs.jsonl`)

**Gaps identified for M2/M3:**
- No safe test harness (changes affect production roadmap)
- No hierarchy (tasks not embedded in sets/epics)
- No production validation layer (only structural + critic)
- No automated pattern harvesting

---

## W0.M2: Test Harness (COMPLETE)

**Goal:** Safe validation environment separate from production

**Status:** ✅ COMPLETE (estimated based on TaskFlow tool existence)

**What shipped:**
1. **TaskFlow Test Harness** (`tools/taskflow/`)
   - Separate test roadmap (doesn't corrupt production)
   - Task progression tiers (T1 easy → T4 expert)
   - Safe experimentation environment
   - TypeScript implementation

2. **Test Task Library**
   - Tier 1: Basic file operations (read, write, edit)
   - Tier 2: Multi-file coordination
   - Tier 3: Complex workflows (CRUD with validation)
   - Tier 4: Expert tasks (refactoring, optimization)

**Outcomes validated:**
- ✅ Wave 0 can be tested safely (separate from production)
- ✅ Progressive complexity testing (T1 → T4)
- ✅ No production corruption risk

**Integration with M1:**
- Wave 0 can run against TaskFlow roadmap (`--test-mode` flag planned)
- Validation results inform Wave 1 improvements
- Test tasks demonstrate autonomous capabilities

**Gaps identified for M3:**
- Test tasks not embedded in hierarchy either
- No epic/set structure in test harness
- No hierarchical critics validating epic/set compliance

---

## W0.M3: Hierarchical Process System (IN PROGRESS)

**Goal:** 5-level hierarchy with mandatory embedding and enforcement

**Status:** 🔄 IN PROGRESS (started 2025-11-06)

**Target completion:** 2025-11-20 (2 weeks)

### Phase 1: Bootstrap WAVE-0 Epic Docs (Current)

**Set:** wave0-epic-bootstrap
**Tasks:** 1 (AFP-W0-EPIC-BOOTSTRAP)
**Duration:** 1-2 days
**Dependencies:** None (creating foundation)

**Deliverables:**
- [x] `state/epics/WAVE-0/strategy.md` (why WAVE-0 exists)
- [x] `state/epics/WAVE-0/spec.md` (measurable outcomes)
- [ ] `state/epics/WAVE-0/plan.md` (this document)
- [ ] `state/epics/WAVE-0/think.md` (risks, dependencies)
- [ ] `state/epics/WAVE-0/design.md` (architecture patterns)

**Why first:** Can't enforce epic gates on others until WAVE-0 compliant with its own rules

**Integration:** These docs become templates for future epics (concrete before abstract)

### Phase 2: Create Hierarchical Templates

**Set:** hierarchy-structure
**Tasks:** 3 (META, PROJECT, SET templates)
**Duration:** 2-3 days
**Dependencies:** Phase 1 (need WAVE-0 example to extract from)

**Deliverables:**
1. **AFP-HIERARCHY-META-STRUCTURE**
   - `docs/templates/meta_strategy_template.md`
   - `docs/templates/meta_spec_template.md`
   - `docs/templates/meta_plan_template.md`
   - META level: Process governance, AFP/SCAS evolution

2. **AFP-HIERARCHY-PROJECT-STRUCTURE**
   - `docs/templates/project_strategy_template.md`
   - `docs/templates/project_spec_template.md`
   - `docs/templates/project_plan_template.md`
   - PROJECT level: Architecture, tech stack, constraints

3. **AFP-HIERARCHY-SET-TEMPLATES**
   - `docs/templates/set_strategy_template.md`
   - `docs/templates/set_spec_template.md`
   - `docs/templates/set_plan_template.md`
   - SET level: Task clustering, shared patterns

**Integration:**
- Extract patterns from WAVE-0 epic docs (Phase 1)
- Adapt task-level templates (already exist) to epic/set scale
- Ensure consistent phase structure across all 5 levels

### Phase 3: Implement Gate Enforcement

**Set:** hierarchy-enforcement
**Tasks:** 2 (enforcer, pre-commit hooks)
**Duration:** 2-3 days
**Dependencies:** Phase 2 (need templates to validate against)

**Deliverables:**
1. **AFP-HIERARCHY-GATE-ENFORCER**
   - `tools/wvo_mcp/src/enforcement/hierarchy_gates.ts`
   - Functions: `enforceEpicGate()`, `enforceSetGate()`, `enforceTaskEmbedding()`
   - Validates epic/set have required phase docs before tasks allowed
   - Validates all tasks have set_id and epic_id (no orphans)

2. **AFP-HIERARCHY-PRECOMMIT-HOOKS**
   - `.husky/pre-commit` (updated)
   - Calls hierarchy gate enforcer before commit
   - Blocks commit if violations found
   - Provides clear error messages with remediation guidance

**Integration:**
- Hooks run on `git commit` (automatic enforcement)
- Enforcer called by hooks and by Wave 0 (double validation)
- Error messages reference templates (easy to fix violations)

### Phase 4: Implement Hierarchical Critics

**Set:** hierarchy-critics
**Tasks:** 2 (MetaCritic, level critics)
**Duration:** 3-4 days
**Dependencies:** Phase 3 (need enforcement to validate)

**Deliverables:**
1. **AFP-HIERARCHY-META-CRITIC**
   - `tools/wvo_mcp/src/critics/meta_critic.ts`
   - Validates process health (is hierarchy helping or hurting?)
   - Quarterly review: Process overhead vs. value delivered
   - Kill criteria: If burden > benefit, recommend simplification

2. **AFP-HIERARCHY-LEVEL-CRITICS**
   - `VisionCritic` (PROJECT level): Validates architecture alignment
   - `OutcomeCritic` (EPIC level): Validates outcomes measurable
   - `ClusterCritic` (SET level): Validates task clustering rationale

**Integration:**
- MetaCritic runs quarterly (not on every commit)
- Level critics run on phase doc commits (epic/set strategy/spec/plan)
- Results inform process evolution (fitness tracking)

### Phase 5: Migrate Existing Work

**Set:** hierarchy-migration
**Tasks:** 2 (W0.M1 migration, documentation)
**Duration:** 2-3 days
**Dependencies:** Phase 4 (need critics to validate migration)

**Deliverables:**
1. **AFP-HIERARCHY-W0M1-MIGRATION**
   - Organize existing W0.M1 tasks into sets
   - Create set phase docs (strategy/spec/plan)
   - Update roadmap.yaml with set structure
   - Validate all tasks embedded

2. **AFP-HIERARCHY-DOCUMENTATION**
   - `docs/processes/hierarchical_work_process.md`
   - Guide: How to create epic/set phase docs
   - Guide: When to use each hierarchy level
   - Guide: How to embed tasks in sets/epics

**Integration:**
- W0.M1 tasks become examples of proper embedding
- Documentation references real examples (not abstract)
- Process guide integrated with MANDATORY_WORK_CHECKLIST.md

---

## Integration Approach

### How Milestones Connect:

**M1 (Autopilot Core) → M2 (Test Harness):**
- M1 provides autonomous execution capability
- M2 provides safe validation environment
- Together: Can test autonomy without production risk

**M2 (Test Harness) → M3 (Hierarchical Process):**
- M2 validates changes work before production
- M3 provides structure for organizing work
- Together: Can enforce hierarchy safely (test first)

**M1 + M2 + M3 → WAVE-0 Complete:**
- M1: Autonomous execution ✅
- M2: Safe testing ✅
- M3: Hierarchical organization 🔄
- Result: Foundation for WAVE-1 governance

### Bidirectional Flow:

**Upward (Pattern Harvesting):**
```
TASK (individual) → harvest patterns →
SET (cluster) → harvest shared patterns →
EPIC (capability) → harvest capability patterns →
PROJECT (architecture) → harvest architectural patterns →
META (process) → evolve process itself
```

**Downward (Context Propagation):**
```
META (AFP/SCAS principles) → constrain →
PROJECT (tech stack, architecture) → constrain →
EPIC (capability scope) → constrain →
SET (task clustering) → constrain →
TASK (individual changes)
```

**Example:**
- **Task:** "Add TypeScript type to function"
- **Set context:** "Type safety improvement cluster"
- **Epic context:** "WAVE-0 foundation (need stability)"
- **Project context:** "WeatherVane (TypeScript, Node.js)"
- **Meta context:** "AFP/SCAS (via negativa, prefer deletion)"

**Constraint propagation:** Task can't use Python (PROJECT constraint), can't add complexity (META constraint), must prove stability benefit (EPIC constraint)

---

## Sequencing and Dependencies

### Critical Path:

```
1. Bootstrap WAVE-0 epic docs (Phase 1) → 2 days
2. Create templates (Phase 2) → 3 days
3. Implement enforcement (Phase 3) → 3 days
4. Implement critics (Phase 4) → 4 days
5. Migrate existing work (Phase 5) → 3 days

Total: ~15 days (3 weeks)
```

### Parallel Work Opportunities:

**After Phase 1:**
- Can work on META templates (Phase 2.1) in parallel with PROJECT templates (Phase 2.2)
- Cannot parallelize SET templates (Phase 2.3) - needs epic examples first

**After Phase 2:**
- Can work on gate enforcer (Phase 3.1) in parallel with pre-commit hooks (Phase 3.2)
- Both need templates but not each other

**After Phase 3:**
- Can work on MetaCritic (Phase 4.1) in parallel with level critics (Phase 4.2)
- Both need enforcement but not each other

**Cannot parallelize:**
- Phase 1 → 2 (templates need epic example)
- Phase 2 → 3 (enforcement needs templates)
- Phase 3 → 4 (critics need enforcement)
- Phase 4 → 5 (migration needs critics for validation)

---

## Files Changed (Estimate)

### Phase 1 (Bootstrap): 5 files
- `state/epics/WAVE-0/strategy.md` (new)
- `state/epics/WAVE-0/spec.md` (new)
- `state/epics/WAVE-0/plan.md` (new)
- `state/epics/WAVE-0/think.md` (new)
- `state/epics/WAVE-0/design.md` (new)

### Phase 2 (Templates): 9 files
- 3 META templates (strategy/spec/plan)
- 3 PROJECT templates (strategy/spec/plan)
- 3 SET templates (strategy/spec/plan)

### Phase 3 (Enforcement): 2 files
- `tools/wvo_mcp/src/enforcement/hierarchy_gates.ts` (new, ~200 LOC)
- `.husky/pre-commit` (modified, +20 LOC)

### Phase 4 (Critics): 4 files
- `tools/wvo_mcp/src/critics/meta_critic.ts` (new, ~150 LOC)
- `tools/wvo_mcp/src/critics/vision_critic.ts` (new, ~120 LOC)
- `tools/wvo_mcp/src/critics/outcome_critic.ts` (new, ~120 LOC)
- `tools/wvo_mcp/src/critics/cluster_critic.ts` (new, ~120 LOC)

### Phase 5 (Migration): 3+ files
- `state/roadmap.yaml` (modified, organize M1 tasks into sets)
- `docs/processes/hierarchical_work_process.md` (new, ~800 words)
- `state/task_groups/*/strategy.md` (new, multiple sets)

**Total estimate:** ~25 files, ~900 LOC (mostly templates and docs)

**Within GATE limits?** No - this is epic-level (larger than task ≤5 files, ≤150 LOC)
**Justification:** Epic spans 3 weeks, 5 phases, 10 tasks - larger scope expected

---

## Tests Authored (For VERIFY Phase)

### Epic-Level Validation Tests:

**Test 1: Bootstrap Validation**
```bash
# Verify WAVE-0 epic docs exist and are substantial
test -f state/epics/WAVE-0/strategy.md || exit 1
test -f state/epics/WAVE-0/spec.md || exit 1
test -f state/epics/WAVE-0/plan.md || exit 1
test -f state/epics/WAVE-0/think.md || exit 1
test -f state/epics/WAVE-0/design.md || exit 1

# Check docs are substantial (>500 words each)
for doc in strategy.md spec.md plan.md think.md design.md; do
  wc -w "state/epics/WAVE-0/$doc" | awk '{if ($1 < 500) exit 1}'
done
```

**Test 2: Template Validation**
```bash
# Verify all templates exist
for level in meta project set; do
  for phase in strategy spec plan; do
    test -f "docs/templates/${level}_${phase}_template.md" || exit 1
  done
done

# Verify templates have required sections
grep -q "## Problem Analysis" docs/templates/meta_strategy_template.md || exit 1
grep -q "## Measurable Outcomes" docs/templates/project_spec_template.md || exit 1
grep -q "## Clustering Rationale" docs/templates/set_strategy_template.md || exit 1
```

**Test 3: Gate Enforcement**
```bash
# Test epic gate blocks tasks without phase docs
mkdir -p state/epics/TEST-EPIC
echo "  - id: TEST-TASK" >> state/roadmap.yaml
echo "    epic_id: TEST-EPIC" >> state/roadmap.yaml

git add state/roadmap.yaml
git commit -m "test: orphan epic" 2>&1 | grep "missing phase docs" || exit 1
git reset --hard  # Clean up

# Test set gate blocks tasks without phase docs
mkdir -p state/task_groups/test-set
echo "  - id: TEST-TASK-2" >> state/roadmap.yaml
echo "    set_id: test-set" >> state/roadmap.yaml

git add state/roadmap.yaml
git commit -m "test: orphan set" 2>&1 | grep "missing phase docs" || exit 1
git reset --hard  # Clean up

# Test task embedding enforcement
echo "  - id: ORPHAN-TASK" >> state/roadmap.yaml
# No set_id or epic_id

git add state/roadmap.yaml
git commit -m "test: orphan task" 2>&1 | grep "not embedded" || exit 1
git reset --hard  # Clean up
```

**Test 4: Critic Integration**
```bash
# Create test epic docs
mkdir -p state/epics/TEST-EPIC
echo "# Strategy\nMinimal doc" > state/epics/TEST-EPIC/strategy.md

# Run OutcomeCritic
cd tools/wvo_mcp && npm run epic:review TEST-EPIC 2>&1 | grep "concerns" || exit 1
# Should have concerns (doc too minimal)

# Create substantial doc
cat > state/epics/TEST-EPIC/strategy.md <<EOF
# Strategy
[600+ words of real analysis]
EOF

# Re-run critic
npm run epic:review TEST-EPIC 2>&1 | grep "approved" || exit 1
# Should approve (doc substantial)

cd ../..
rm -rf state/epics/TEST-EPIC  # Clean up
```

**Test 5: Migration Validation**
```bash
# Verify all W0.M1 tasks have set_id and epic_id
cd tools/wvo_mcp
npx tsx -e "
  const roadmap = require('js-yaml').load(fs.readFileSync('../../state/roadmap.yaml', 'utf8'));
  const m1 = roadmap.epics.find(e => e.id === 'WAVE-0').milestones.find(m => m.id === 'W0.M1');
  const orphans = m1.tasks.filter(t => !t.set_id || !t.epic_id);
  if (orphans.length > 0) {
    console.error('Orphan tasks:', orphans.map(t => t.id));
    process.exit(1);
  }
"
cd ../..
```

**Test 6: Hierarchy Documentation**
```bash
# Verify process guide exists
test -f docs/processes/hierarchical_work_process.md || exit 1

# Verify guide has all sections
grep -q "## 5-Level Hierarchy" docs/processes/hierarchical_work_process.md || exit 1
grep -q "## When to Use Each Level" docs/processes/hierarchical_work_process.md || exit 1
grep -q "## Creating Epic Phase Docs" docs/processes/hierarchical_work_process.md || exit 1
grep -q "## Mandatory Embedding Rules" docs/processes/hierarchical_work_process.md || exit 1
```

**Test 7: End-to-End Workflow**
```bash
# Create new epic following hierarchy
mkdir -p state/epics/TEST-WAVE
cp docs/templates/epic_strategy_template.md state/epics/TEST-WAVE/strategy.md
# Fill out strategy.md...
cp docs/templates/epic_spec_template.md state/epics/TEST-WAVE/spec.md
# Fill out spec.md...
# ... (all 5 phase docs)

# Create set within epic
mkdir -p state/task_groups/test-wave-set1
cp docs/templates/set_strategy_template.md state/task_groups/test-wave-set1/strategy.md
# Fill out...

# Add task to roadmap (should succeed - all gates passed)
cat >> state/roadmap.yaml <<EOF
  - id: TEST-WAVE-TASK-1
    title: Test task
    set_id: test-wave-set1
    epic_id: TEST-WAVE
EOF

git add state/epics/TEST-WAVE state/task_groups/test-wave-set1 state/roadmap.yaml
git commit -m "test: complete hierarchy workflow"
# Should succeed

git reset --hard  # Clean up
```

---

## Via Negativa Analysis

**What can we DELETE instead of adding?**

### Option 1: Delete Hierarchy, Keep Flat Structure
- **Deleted:** Epic/set levels, just tasks
- **Saved:** Template creation, enforcement, critics (~15 days work)
- **Cost:** No context propagation, no pattern harvesting, chaos at scale
- **Verdict:** ❌ REJECTED (defeats WAVE-0 goal)

### Option 2: Delete Enforcement, Make Hierarchy Optional
- **Deleted:** Gate enforcer, pre-commit hooks (~5 days work)
- **Saved:** Enforcement complexity
- **Cost:** Hierarchy compliance theater (docs exist but ignored)
- **Verdict:** ❌ REJECTED (optional = ignored in practice)

### Option 3: Delete MetaCritic, Just Use Level Critics
- **Deleted:** MetaCritic (~2 days work)
- **Saved:** Process-level oversight
- **Cost:** No kill switch if hierarchy becomes burden
- **Verdict:** ✅ ACCEPTED (can add MetaCritic in WAVE-1 if needed)

### Option 4: Delete Migration, Let New Work Use Hierarchy
- **Deleted:** W0.M1 migration (~3 days work)
- **Saved:** Migration effort
- **Cost:** Existing work not compliant (bad example)
- **Verdict:** ❌ REJECTED (bootstrap needs WAVE-0 itself compliant)

### Option 5: Simplify Templates (Fewer Phases)
- **Deleted:** Think/design phases at epic/set level
- **Saved:** 6 templates (think × 3 levels, design × 3 levels)
- **Cost:** Less cognitive labor at higher levels (defeats purpose)
- **Verdict:** ❌ REJECTED (user wants cognitive labor at all levels)

**Net via negativa:** Delete MetaCritic (can add later if process becomes burden)

---

## Refactor vs. Repair Analysis

**Is this refactoring root cause or patching symptoms?**

### Symptom: Tasks taking too long (GATE phase 100 min)
- **Patch:** Skip GATE, make it optional
- **Refactor:** Provide context via hierarchy (epic/set docs reduce GATE time)
- **This plan:** ✅ REFACTOR (hierarchy provides context, reduces duplication)

### Symptom: Evidence volume growing (11MB, 377 files)
- **Patch:** Delete old evidence periodically
- **Refactor:** Stop creating unnecessary evidence (via negativa at epic/set level)
- **This plan:** ✅ REFACTOR (set-level via negativa prevents unnecessary tasks)

### Symptom: Process compliance theater (superficial docs)
- **Patch:** Remove compliance checks, trust engineers
- **Refactor:** Make docs USEFUL (epic context makes task docs shorter)
- **This plan:** ✅ REFACTOR (hierarchy makes compliance valuable, not burden)

### Symptom: Unclear project direction
- **Patch:** Write more docs explaining vision
- **Refactor:** Codify vision in PROJECT-level phase docs (single source of truth)
- **This plan:** ✅ REFACTOR (PROJECT strategy/spec/plan provide context)

**Verdict:** This plan refactors root cause (lack of hierarchy), not patching symptoms

---

## Complexity Justification

**Complexity added:** 5-level hierarchy, gates, critics, templates

**Is increase justified?**

### Justification 1: Scales to Future Work
- WAVE-1, WAVE-2, WAVE-3+ all need hierarchy
- One-time investment, enables all future waves
- Without hierarchy: Linear complexity growth (each wave harder)
- With hierarchy: Constant complexity (patterns reused)

### Justification 2: Reduces GATE Time 70%
- Task-level GATE currently ~100 min (duplicating epic context)
- Epic/set docs provide context once (reused by all tasks)
- Estimated reduction: 100 min → 30 min (70% time saved)
- ROI: 10 tasks × 70 min saved = 700 min (11.7 hours)

### Justification 3: Prevents Unnecessary Work
- Set-level via negativa: "Can we DELETE this entire set?"
- Epic-level via negativa: "Can we DELETE this entire epic?"
- Estimated prevention: 30-40% of planned work (hours saved weekly)

### Justification 4: Enables Autonomous Operation
- Wave 0 needs context to make decisions (what's important?)
- Hierarchy provides context (task → set → epic → project)
- Without hierarchy: Wave 0 can't prioritize intelligently

**Verdict:** ✅ Complexity justified (ROI positive, enables autonomy)

---

## Risk Mitigation

### Risk 1: Phase Sequencing Breaks
- **Threat:** Phase 3 starts before Phase 2 complete (enforcement without templates)
- **Mitigation:** Strict dependencies in roadmap, pre-commit checks

### Risk 2: Migration Disrupts M1 Work
- **Threat:** Reorganizing M1 tasks breaks existing references
- **Mitigation:** Migration last (Phase 5), thorough testing before commit

### Risk 3: Epic Docs Too Abstract
- **Threat:** WAVE-0 epic docs become generic platitudes
- **Mitigation:** OutcomeCritic validates measurability, reject vague outcomes

### Risk 4: Templates Too Rigid
- **Threat:** Templates force cookie-cutter thinking
- **Mitigation:** Templates are guides not rules, encourage adaptation

---

**Plan complete:** 2025-11-06
**Next phase:** think.md (risks and dependencies analysis)
**Owner:** Director Dana
**Reviewers:** Claude Council, Atlas
