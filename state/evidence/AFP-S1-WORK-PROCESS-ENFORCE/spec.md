# Spec: AFP-S1-WORK-PROCESS-ENFORCE

## Acceptance Criteria

### AC1: Pre-Commit Hook Verifies Phase Artifacts

**Given:** A commit attempt with implementation files (src/, tools/, etc.)
**When:** Pre-commit hook runs
**Then:**
- Hook checks for existence of required phase artifacts in `state/evidence/[TASK-ID]/`
- Verifies all upstream phases complete before current phase
- Blocks commit if required artifacts missing
- Provides clear error message listing missing artifacts

**Validation:**
```bash
# Attempt commit with implementation but no GATE
git add src/new_feature.ts
git commit -m "feat: new feature"
# Expected: BLOCKED with error "Missing required phase: design.md (GATE)"
```

---

### AC2: Phase Sequence Validation

**Given:** A commit with implementation files
**When:** Pre-commit hook validates phase sequence
**Then:**
- Cannot commit IMPLEMENT phase without STRATEGIZE, SPEC, PLAN, THINK, GATE complete
- Cannot commit without design.md if task requires GATE (>1 file OR >20 LOC)
- Sequence enforced: STRATEGIZE → SPEC → PLAN → THINK → GATE → IMPLEMENT → VERIFY → REVIEW → PR

**Validation:**
```bash
# Create only strategy.md and implement
mkdir -p state/evidence/TEST-TASK
echo "strategy" > state/evidence/TEST-TASK/strategy.md
echo "code" > src/test.ts
git add state/evidence/TEST-TASK/strategy.md src/test.ts
git commit -m "test"
# Expected: BLOCKED - missing spec.md, plan.md, think.md, design.md
```

---

### AC3: GATE Phase Enforcement for Complex Tasks

**Given:** A commit changing >1 file OR >20 net LOC
**When:** Pre-commit hook detects implementation files
**Then:**
- Requires `design.md` exists in evidence directory
- design.md must contain Five Forces analysis
- design.md must have via negativa section
- design.md must have alternatives considered (2-3 minimum)
- Blocks commit if design.md missing or incomplete

**Validation:**
```bash
# Attempt multi-file change without design.md
echo "// File 1" > src/file1.ts
echo "// File 2" > src/file2.ts
git add src/file1.ts src/file2.ts
git commit -m "feat: multi-file change"
# Expected: BLOCKED - "GATE required: >1 file changed. Create design.md"
```

---

### AC4: Evidence Directory Auto-Detection

**Given:** A commit with changed files
**When:** Pre-commit hook runs
**Then:**
- Detects task ID from commit message (AFP-*, TASK-*, etc.)
- Looks up evidence directory: `state/evidence/[TASK-ID]/`
- If no task ID in commit message, prompts for it
- Falls back to checking all recent evidence directories if ambiguous

**Validation:**
```bash
git commit -m "feat(guardrails): Add check [AFP-S1-GUARDRAILS]"
# Expected: Hook checks state/evidence/AFP-S1-GUARDRAILS/
```

---

### AC5: Clear Error Messages and Remediation Guidance

**Given:** Phase artifact validation fails
**When:** Pre-commit hook blocks commit
**Then:**
- Error message lists specific missing artifacts
- Provides remediation steps (which phase to complete next)
- Shows template location for missing artifact
- Displays current phase progress

**Validation:**
```bash
# Blocked commit shows:
❌ BLOCKED: Missing required phase artifacts

Task: AFP-TEST-TASK
Evidence path: state/evidence/AFP-TEST-TASK/

Missing phases:
  ❌ SPEC: spec.md not found
  ❌ PLAN: plan.md not found
  ❌ THINK: think.md not found
  ❌ GATE: design.md not found

Remediation:
  1. Create spec.md using: cp docs/templates/spec_template.md state/evidence/AFP-TEST-TASK/spec.md
  2. Complete spec.md (define acceptance criteria)
  3. Continue with PLAN phase

See MANDATORY_WORK_CHECKLIST.md for full work process.
```

---

### AC6: Roadmap Task Completion Enforcement

**Given:** A commit in PR phase with task evidence complete
**When:** Pre-commit hook detects PR phase or commit message contains "chore(roadmap)"
**Then:**
- Hook verifies task exists in `state/roadmap.yaml`
- Hook verifies task status is NOT already "done"
- Hook verifies all required evidence artifacts exist
- If committing roadmap update: verifies status change is valid (pending→done, in_progress→done)
- Blocks commit if trying to mark task done without complete evidence

**Validation:**
```bash
# Attempt to mark task done without evidence
git add state/roadmap.yaml
# (Changed AFP-TEST-TASK status to "done")
git commit -m "chore(roadmap): Mark AFP-TEST-TASK as done"
# Expected: BLOCKED - "Evidence incomplete: missing verify.md, review.md"

# With complete evidence
mkdir -p state/evidence/AFP-TEST-TASK
touch state/evidence/AFP-TEST-TASK/{strategy,spec,plan,think,design,verify,review}.md
git add state/roadmap.yaml
git commit -m "chore(roadmap): Mark AFP-TEST-TASK as done"
# Expected: SUCCESS - all evidence verified
```

---

### AC7: Bypass Mechanism for Emergency Fixes

**Given:** Critical production hotfix needed
**When:** User explicitly bypasses with `--no-verify`
**Then:**
- Commit succeeds but logs bypass to `state/analytics/work_process_bypasses.jsonl`
- Log includes: timestamp, task ID, bypassed phases, commit SHA, reason (from commit message)
- Weekly report generated showing all bypasses for review

**Validation:**
```bash
git commit --no-verify -m "hotfix: critical bug [EMERGENCY]"
# Expected: Commit succeeds, logged to bypasses.jsonl
```

---

## Functional Requirements

### FR1: Phase Artifact Detection

**Pre-commit hook must detect and validate:**

| Phase | Required Artifact | Location | Required Fields |
|-------|------------------|----------|-----------------|
| STRATEGIZE | strategy.md | state/evidence/[TASK]/strategy.md | Problem statement, root cause, decision |
| SPEC | spec.md | state/evidence/[TASK]/spec.md | Acceptance criteria (2+ ACs) |
| PLAN | plan.md | state/evidence/[TASK]/plan.md | Via negativa, files to change, LOC estimate |
| THINK | think.md | state/evidence/[TASK]/think.md | Edge cases (5+), failure modes (3+) |
| GATE | design.md | state/evidence/[TASK]/design.md | Five Forces, complexity analysis |
| IMPLEMENT | src files | (implementation files) | N/A |
| VERIFY | verify.md | state/evidence/[TASK]/verify.md | AC validation results |
| REVIEW | review.md | state/evidence/[TASK]/review.md | Phase compliance, quality check |

**Content validation (for GATE):**
- design.md must contain: "COHERENCE", "ECONOMY", "LOCALITY", "VISIBILITY", "EVOLUTION"
- design.md must contain: "Via Negativa" or "via negativa"
- design.md must contain: "Alternatives" and list 2+ options

---

### FR2: Task ID Extraction

**From commit message:**
- Pattern: `[AFP-[A-Z0-9-]+]` or `[TASK-[A-Z0-9-]+]` or similar
- Examples: `[AFP-S1-GUARDRAILS]`, `[TASK-123]`, `[REMEDIATION-456]`

**Fallback strategies:**
1. Look for evidence directory with recent modifications
2. Check git branch name for task ID
3. Prompt user for task ID if ambiguous

---

### FR3: Phase Sequence Rules

**Strict sequence enforcement:**

```
STRATEGIZE → SPEC → PLAN → THINK → GATE* → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR

* GATE required only if:
  - Files changed > 1, OR
  - Net LOC > 20 (context-aware: tests get 3.0x multiplier)
```

**Relaxed rules (allowed):**
- Documentation-only commits (*.md in docs/) - no phase artifacts required
- Chore commits (package.json, lock files) - no phase artifacts required
- Test-only commits (if <150 LOC effective) - can skip GATE

---

### FR4: Roadmap Task Completion Validation

**When marking task as done in `state/roadmap.yaml`:**

1. **Extract task ID from roadmap change:**
   - Parse git diff for status change (pending→done or in_progress→done)
   - Extract task ID from changed lines

2. **Verify evidence completeness:**
   - Check `state/evidence/[TASK-ID]/` exists
   - Required artifacts (minimum):
     - strategy.md (STRATEGIZE phase)
     - spec.md (SPEC phase)
     - plan.md (PLAN phase)
     - think.md (THINK phase)
     - verify.md (VERIFY phase)
     - review.md (REVIEW phase)
   - Conditional artifacts:
     - design.md (required if GATE phase applies: >1 file OR >20 LOC)

3. **Prevent duplicate completion:**
   - Check if task already marked "done"
   - Block if status already "done" (cannot re-done a task)
   - Allow transitions: pending→done, in_progress→done
   - Block invalid transitions: done→pending

4. **Clear error on failure:**
```
❌ BLOCKED: Cannot mark task as done

Task: AFP-S1-TEST
Evidence path: state/evidence/AFP-S1-TEST/

Missing required artifacts:
  ❌ verify.md (VERIFY phase)
  ❌ review.md (REVIEW phase)

Remediation:
  1. Complete VERIFY phase (verify.md)
  2. Complete REVIEW phase (review.md)
  3. Then mark task as done in roadmap

Cannot mark task complete without full evidence trail.
```

---

### FR5: Bypass Logging

**Bypass event logged to:** `state/analytics/work_process_bypasses.jsonl`

**Log schema:**
```json
{
  "timestamp": "2025-11-05T14:30:00Z",
  "task_id": "AFP-S1-HOTFIX",
  "bypassed_phases": ["spec", "plan", "think", "gate"],
  "commit_sha": "abc123def456",
  "commit_message": "hotfix: critical bug [EMERGENCY]",
  "files_changed": ["src/critical.ts"],
  "net_loc": 5,
  "reason": "EMERGENCY",
  "author": "claude-council"
}
```

---

## Non-Functional Requirements

### NFR1: Performance

- Pre-commit hook execution: <2 seconds
- File existence checks: <100ms
- Content validation (GATE): <500ms
- No network calls (all local validation)

### NFR2: Reliability

- Hook must never crash (catch all errors)
- If validation fails unexpectedly, allow commit with warning
- Log validation errors to `state/analytics/hook_errors.jsonl`
- Provide clear exit codes (0=pass, 1=blocked, 2=error)

### NFR3: Maintainability

- Hook script: <300 LOC (shell script)
- Clear functions for each validation step
- Extensible for future phase additions
- Well-documented with inline comments

### NFR4: User Experience

- Error messages: Plain English, actionable
- Progress indicators: Show which phases complete
- Template paths: Absolute paths users can copy-paste
- No false positives (documentation commits should pass)

---

## Constraints

1. **Shell script only** - No Node.js/TypeScript in hook (simpler, faster)
2. **No remote calls** - All validation local
3. **Backward compatible** - Existing commits without evidence still work
4. **Opt-in initially** - Can be disabled per-repository (transition period)
5. **POSIX compliant** - Works on macOS and Linux

---

## Out of Scope

1. **Retrospective enforcement** - Not checking old commits
2. **WorkProcessEnforcer integration** - Keep ledger separate (future task)
3. **Automated phase generation** - Not auto-creating artifacts
4. **Web UI** - CLI-only validation
5. **IDE integration** - Pre-commit hook only
6. **Phase content AI review** - Only structure validation, not quality

---

## Test Coverage Requirements

### Unit Tests (Shell Script)

**Test cases:**
1. Detect task ID from commit message
2. Find evidence directory
3. Check file existence (all phase artifacts)
4. Validate phase sequence
5. Detect GATE requirement (file count, LOC threshold)
6. Parse design.md for required sections
7. Generate error messages
8. Log bypasses
9. Handle missing evidence directory
10. Handle malformed commit messages

### Integration Tests (Git Workflow)

**Test scenarios:**
1. Commit with all phases complete → SUCCESS
2. Commit missing SPEC → BLOCKED
3. Commit missing GATE (>1 file) → BLOCKED
4. Commit with --no-verify → SUCCESS + logged
5. Documentation-only commit → SUCCESS (no validation)
6. Chore commit → SUCCESS (no validation)
7. Multi-file commit without design.md → BLOCKED
8. Single-file commit <20 LOC → SUCCESS (no GATE required)

### Behavior Tests (Real Workflow)

**Scenarios:**
1. Complete AFP-S1 task end-to-end with enforcement enabled
2. Attempt to skip PLAN phase → blocked, add plan.md → success
3. Attempt multi-file change → blocked for GATE → add design.md → success

---

## Dependencies

**Existing files:**
- `.githooks/pre-commit` (enhancement target)
- `MANDATORY_WORK_CHECKLIST.md` (reference documentation)
- `docs/templates/design_template.md` (template reference)
- `state/evidence/` (evidence directory structure)

**Tools required:**
- Git (obviously)
- Bash 4.0+ or Zsh
- Standard POSIX utilities (grep, awk, sed, wc)

---

## Success Metrics

**Immediate:**
- ✅ Pre-commit hook blocks incomplete phase sequences
- ✅ All test cases pass (unit + integration)
- ✅ Zero false positives in first 10 commits
- ✅ Error messages clear and actionable

**Long-term:**
- 100% phase compliance for all new tasks
- <5% bypass rate (only true emergencies)
- Zero agent bypasses caught (enforcement effective)
- Retrospective shows complete evidence trails

---

## Implementation Notes

### Hook Enhancement Strategy

**Current `.githooks/pre-commit`:**
- Already has LOC enforcement
- Already has AFP/SCAS checks
- Need to add: Phase artifact validation

**Integration approach:**
- Add phase validation after LOC checks
- Reuse task ID detection logic
- Keep existing override mechanism
- Add bypass logging

### Error Message Templates

**Template structure:**
```
❌ BLOCKED: [Reason]

Task: [TASK-ID]
Evidence path: [path]

Current phase progress:
  ✅ STRATEGIZE: strategy.md
  ✅ SPEC: spec.md
  ❌ PLAN: plan.md not found
  ❌ THINK: think.md not found
  ❌ GATE: design.md not found

Remediation:
  [Step-by-step instructions]

See MANDATORY_WORK_CHECKLIST.md for full work process.
```

---

**Spec Date:** 2025-11-05
**Author:** Claude Council
**Status:** Ready for PLAN phase
