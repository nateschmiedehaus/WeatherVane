# SPEC Phase: Wire Critical Wave 0 Processes Into Agent Boot Sequence

**Task ID:** AFP-DOC-EMBEDDING-20251105
**Date:** 2025-11-05
**Phase:** SPEC
**Depends On:** strategy.md (9/9 AFP/SCAS approved)

---

## REQUIREMENTS

### Functional Requirements

#### FR1: STRATEGIZE Phase Integration
**Requirement:** CLAUDE.md and AGENTS.md must reference STRATEGY_INTERROGATION_FRAMEWORK.md in STRATEGIZE phase section

**Specific Placement:**
- Within existing STRATEGIZE phase (phase 1) section
- Before or at the beginning of phase description
- Clear imperative: "MUST READ before starting STRATEGIZE"

**Exact Wording:** (to be refined in PLAN)
```markdown
**Before beginning STRATEGIZE, read:** `docs/orchestration/STRATEGY_INTERROGATION_FRAMEWORK.md`

This framework defines the 5 mandatory interrogations:
1. Necessity - Should task exist?
2. Intent - True problem vs. stated requirement
3. Scope - Right scope?
4. Alternatives - 3-5 options explored
5. Alignment - AFP/SCAS 7/9 minimum

**Minimum time investment:** 15-30 minutes deep research
```

**Files to Modify:**
- CLAUDE.md (phase 1 STRATEGIZE section)
- AGENTS.md (phase 1 STRATEGIZE section - identical text)

#### FR2: VERIFY Phase Integration
**Requirement:** CLAUDE.md and AGENTS.md must reference AUTOPILOT_VALIDATION_RULES.md in VERIFY phase section

**Specific Placement:**
- Within existing VERIFY phase (phase 7) section
- Add new subsection: "Autopilot-Specific Verification"
- Emphasis on live-fire validation

**Exact Wording:** (to be refined in PLAN)
```markdown
### Autopilot-Specific Verification

**⚠️ CRITICAL for autopilot/AI agent code:**

**Build passing is NEVER EVER EVER satisfactory for autopilot.**

**Required:** Read `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`

**Minimum validation:**
- Live-fire execution on 10+ real production tasks
- Success rate ≥80%
- Failure modes documented
- Learnings captured

**Autopilot = autonomous development by AI agents:**
- Agents select tasks (decision-making)
- Agents write code (code generation)
- Agents execute work (autonomous operation)
- Without human intervention (true autonomy)

Anything less = automation, not autopilot.
```

**Files to Modify:**
- CLAUDE.md (phase 7 VERIFY section)
- AGENTS.md (phase 7 VERIFY section - identical text)

#### FR3: Evolutionary Roadmap Context
**Requirement:** Add brief section explaining Wave-based development philosophy

**Specific Placement:**
- New subsection under "Work Process" or near GATE phase explanation
- Or add to existing autopilot sections if they exist

**Exact Wording:** (to be refined in PLAN)
```markdown
### Evolutionary Development (Wave 0 Philosophy)

**For autopilot and complex autonomous systems:**

Development proceeds in **waves** with mandatory validation gates:

**Wave Structure:**
1. Implement minimal viable wave
2. Deploy to production
3. **[VALIDATION GATE]** - Live-fire test on 10+ real tasks
4. Analyze learnings (what worked/broke/missing)
5. Define next wave scope (based on gaps, not speculation)

**Key principle:** Can't define Wave N+1 without Wave N production learnings.

**See:** `state/evidence/AFP-WAVE0-AUTOPILOT-20251105/ROADMAP_RESTRUCTURING_REQUIRED.md`

This applies wherever autopilot is a dependency.
```

**Files to Modify:**
- CLAUDE.md (add section or expand existing autopilot guidance)
- AGENTS.md (identical text)

#### FR4: Synchronization Requirement
**Requirement:** CLAUDE.md and AGENTS.md must have identical additions

**Verification:**
- Git diff shows same line additions to both files
- No divergence in wording, structure, or emphasis
- User requirement: "when you update claude.md agents.md always needs a corresponding update"

---

### Non-Functional Requirements

#### NFR1: Readability
- Additions must not disrupt existing document flow
- Use existing formatting conventions (markdown headers, emphasis)
- Keep language clear and actionable

#### NFR2: Maintainability
- Use references to authoritative docs, not inline duplication
- If source docs change, references remain valid
- No hard-coded content that requires parallel updates

#### NFR3: Discoverability
- Agents must encounter references at natural decision points
- STRATEGIZE phase → see interrogation framework
- VERIFY phase → see validation rules
- Planning autopilot work → see evolutionary process

#### NFR4: Conciseness
- ≤50 lines total additions per file
- No verbose explanations (save for referenced docs)
- Get to the point quickly

#### NFR5: Build Compatibility
- Changes must not break any existing tooling
- Markdown syntax must be valid
- No orphaned links or broken references

---

## SUCCESS CRITERIA

### Phase-Level Criteria

**STRATEGIZE Phase:**
- [ ] CLAUDE.md phase 1 mentions STRATEGY_INTERROGATION_FRAMEWORK.md
- [ ] AGENTS.md phase 1 mentions STRATEGY_INTERROGATION_FRAMEWORK.md (identical wording)
- [ ] Reference is clear, imperative, and actionable
- [ ] Placement is at beginning of STRATEGIZE phase

**VERIFY Phase:**
- [ ] CLAUDE.md phase 7 has "Autopilot-Specific Verification" subsection
- [ ] AGENTS.md phase 7 has "Autopilot-Specific Verification" subsection (identical)
- [ ] AUTOPILOT_VALIDATION_RULES.md is referenced
- [ ] "Build passing is NEVER sufficient" is emphasized
- [ ] Autopilot definition is clear (autonomous development by agents)

**Evolutionary Process:**
- [ ] CLAUDE.md has Wave-based development section
- [ ] AGENTS.md has Wave-based development section (identical)
- [ ] ROADMAP_RESTRUCTURING_REQUIRED.md is referenced
- [ ] Wave structure (implement → validate → learn → define next) is explained
- [ ] Scoped to "autopilot and complex autonomous systems"

**Synchronization:**
- [ ] CLAUDE.md and AGENTS.md have identical additions
- [ ] No divergence in wording, structure, or emphasis
- [ ] Git diff confirms parallelism

### Technical Criteria

**Build:**
- [ ] Markdown syntax is valid
- [ ] No broken links
- [ ] Files can be read without errors

**Integration:**
- [ ] Additions fit naturally into existing structure
- [ ] No disruption to existing content
- [ ] Document flow is preserved

**Quality:**
- [ ] ≤50 lines added per file
- [ ] No duplication of full doc contents
- [ ] Clear, actionable language

---

## SCOPE

### In Scope
- Modify CLAUDE.md (3 sections)
- Modify AGENTS.md (3 sections, identical to CLAUDE.md)
- Add references to 3 critical docs
- Add brief context for when to consult each doc
- Ensure synchronization

### Out of Scope
- Creating new documentation (already done)
- Modifying referenced docs (AUTOPILOT_VALIDATION_RULES.md, etc.)
- Updating other agent instruction files
- Implementing pre-commit hooks (future task)
- Restructuring existing CLAUDE.md/AGENTS.md content
- Adding full doc contents inline (rejected in STRATEGIZE)

### Edge Cases
- If STRATEGIZE phase section is too short, may need slight restructuring
- If VERIFY phase doesn't exist, create it (unlikely - should exist)
- If autopilot sections already exist, enhance rather than duplicate

---

## ACCEPTANCE CRITERIA

### User Story
**As an agent (Claude Council, Codex, Atlas),**
**I want** critical Wave 0 processes referenced in my primary instruction files,
**So that** I discover and apply interrogations, validation rules, and evolutionary philosophy at key decision points.

### Acceptance Tests

**Test 1: STRATEGIZE Phase Discovery**
- **Given:** Agent starts STRATEGIZE phase
- **When:** Agent reads CLAUDE.md or AGENTS.md phase 1 section
- **Then:** Agent sees reference to STRATEGY_INTERROGATION_FRAMEWORK.md
- **And:** Agent understands 5 interrogations are mandatory
- **And:** Agent knows to invest 15-30 minutes in deep research

**Test 2: VERIFY Phase Discovery (Autopilot)**
- **Given:** Agent completes autopilot implementation
- **When:** Agent reads VERIFY phase section
- **Then:** Agent sees "Build passing is NEVER sufficient" warning
- **And:** Agent understands live-fire validation is required
- **And:** Agent knows to read AUTOPILOT_VALIDATION_RULES.md

**Test 3: Evolutionary Process Discovery**
- **Given:** Agent is planning autopilot work
- **When:** Agent reads evolutionary development section
- **Then:** Agent understands wave structure (implement → validate → learn → define)
- **And:** Agent knows to reference ROADMAP_RESTRUCTURING_REQUIRED.md
- **And:** Agent applies wave-based approach to autopilot tasks

**Test 4: Synchronization**
- **Given:** CLAUDE.md has been updated
- **When:** Compare CLAUDE.md and AGENTS.md additions
- **Then:** Both files have identical new content
- **And:** No divergence in wording or structure

---

## DEPENDENCIES

### Upstream (Must Exist Before)
- ✅ STRATEGY_INTERROGATION_FRAMEWORK.md exists
- ✅ AUTOPILOT_VALIDATION_RULES.md exists
- ✅ ROADMAP_RESTRUCTURING_REQUIRED.md exists
- ✅ CLAUDE.md exists with 10-phase structure
- ✅ AGENTS.md exists with 10-phase structure

### Downstream (Will Be Impacted)
- Agents reading CLAUDE.md will see new references
- Agents reading AGENTS.md will see new references
- Future STRATEGIZE phases will apply interrogations
- Future autopilot implementations will do live-fire validation
- Future autopilot planning will use wave structure

### Parallel (Related Work)
- Wave 0 currently running (PID 28551) - no changes needed
- Roadmap restructuring (future task) - this task is prerequisite
- Pre-commit hooks (future task) - this task documents rules to enforce

---

## CONSTRAINTS

### Hard Constraints
- MUST update both CLAUDE.md and AGENTS.md identically (user requirement)
- MUST NOT duplicate full doc contents (maintainability)
- MUST NOT break existing document structure
- MUST keep additions ≤50 lines per file

### Soft Constraints
- SHOULD maintain existing tone and style
- SHOULD use existing markdown conventions
- SHOULD place references at natural decision points
- SHOULD be clear and actionable

---

## RISKS

**Risk 1: Existing sections are too long**
- **Likelihood:** Low (CLAUDE.md is well-structured)
- **Impact:** Medium (may need to split sections)
- **Mitigation:** If needed, create subsections rather than disrupt flow

**Risk 2: Wording diverges between CLAUDE.md and AGENTS.md**
- **Likelihood:** Medium (manual editing error)
- **Impact:** High (violates user requirement)
- **Mitigation:** Copy-paste identical text, verify with git diff

**Risk 3: References become outdated**
- **Likelihood:** Low (docs are stable)
- **Impact:** Low (references still valid even if docs move)
- **Mitigation:** Use relative paths from repo root

---

## METRICS

### Quantitative
- Lines added: ≤50 per file (target: 30-40)
- Files modified: 2 (CLAUDE.md, AGENTS.md)
- References added: 3 (STRATEGY_INTERROGATION_FRAMEWORK, AUTOPILOT_VALIDATION_RULES, ROADMAP_RESTRUCTURING_REQUIRED)
- Duplication: 0 (use references, not copies)

### Qualitative
- Clarity: Can agent immediately understand what to do?
- Actionability: Does agent know when to consult referenced docs?
- Integration: Do additions feel natural, not bolted-on?

---

## DEFINITION OF DONE

**Task is complete when:**

1. **CLAUDE.md modified:**
   - [ ] STRATEGIZE phase references STRATEGY_INTERROGATION_FRAMEWORK.md
   - [ ] VERIFY phase has autopilot-specific subsection
   - [ ] Evolutionary development section added

2. **AGENTS.md modified:**
   - [ ] Identical additions to CLAUDE.md
   - [ ] All 3 references present
   - [ ] No divergence in wording

3. **Quality checks:**
   - [ ] Markdown syntax valid
   - [ ] No broken links
   - [ ] ≤50 lines per file
   - [ ] git diff confirms synchronization

4. **Verification:**
   - [ ] Build passes (if any build checks exist)
   - [ ] Files readable without errors
   - [ ] Changes committed with proper evidence

---

**SPEC Phase Complete**
**Next Phase:** PLAN (design exact placement and wording)
