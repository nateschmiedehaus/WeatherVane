# THINK: Subscription Auth Remediation

**Task ID:** AFP-SUBSCRIPTION-AUTH-REMEDIATION-20251111
**Phase:** THINK (4/10)

## Edge Cases

### Edge Case 1: Other code imports llm_chat

**Scenario:** Some file imports `llm_chat` function
**Detection:** `grep -r "import.*llm_chat" tools/wvo_mcp/src/`
**Impact:** TypeScript compilation error
**Mitigation:** Search before deletion, fix any imports
**Likelihood:** Low (llm_chat is new and broken)

### Edge Case 2: Input schema used elsewhere

**Scenario:** `llmChatInput` schema referenced in other tools
**Detection:** `grep -r "llmChatInput" tools/wvo_mcp/src/`
**Impact:** TypeScript compilation error
**Mitigation:** Search before deletion
**Likelihood:** Very Low (schema was only for this tool)

### Edge Case 3: Documentation links to deleted files

**Scenario:** Other docs link to `SUBSCRIPTION_CREDENTIALS.md`
**Detection:** `grep -r "SUBSCRIPTION_CREDENTIALS" docs/`
**Impact:** Broken documentation links
**Mitigation:** Search and remove links
**Likelihood:** Low (file is new)

### Edge Case 4: Git conflicts

**Scenario:** Someone else modified these files concurrently
**Detection:** Git merge conflict on commit
**Impact:** Manual conflict resolution needed
**Mitigation:** Pull latest before starting, work on feature branch
**Likelihood:** Low (on feature branch already)

## Failure Modes

### Failure Mode 1: Incomplete deletion leaves dangling references

**Symptom:** TypeScript errors after deletion
**Root cause:** Missed an import or reference
**Detection:** `npm run build` fails
**Recovery:**
```bash
# Find all references
grep -r "llm_chat" tools/wvo_mcp/src/
# Delete remaining references
# Rebuild
```

### Failure Mode 2: Partial credential doc removal

**Symptom:** Wrong credential info still in CLAUDE.md or AGENTS.md
**Root cause:** Removed wrong lines or missed some
**Detection:** `grep -r "\.claude\.json" CLAUDE.md AGENTS.md`
**Recovery:**
```bash
# Check the diff carefully
git diff CLAUDE.md AGENTS.md
# Edit files to remove ALL credential sections
```

### Failure Mode 3: Pre-commit hooks block commit

**Symptom:** Git hooks fail on commit attempt
**Root cause:** Hooks detect issues (good!)
**Detection:** Hook error messages
**Recovery:**
- Read hook feedback carefully
- Fix the issues (likely missing design.md for this task)
- Do NOT use `--no-verify` unless absolutely necessary

### Failure Mode 4: Breaking existing Wave 0 functionality

**Symptom:** Wave 0 stops working after deletion
**Root cause:** Something was using llm_chat despite it being broken
**Detection:** Wave 0 runtime errors
**Recovery:**
- Check what was calling llm_chat
- Find alternative approach (or this confirms it was unused)

## Complexity Analysis

### Current Complexity (Before Deletion)

**Files involved:** 7
- 3 source files (llm_chat.ts, input_schemas.ts, index.ts)
- 3 documentation files
- 1 test evidence directory

**Lines of code:** ~927 lines of broken/wrong content

**Dependencies:**
- llm_chat.ts → input_schemas.ts (schema)
- index.ts → llm_chat.ts (import)
- index.ts → input_schemas.ts (schema import)
- Documentation → wrong credential locations

**Complexity metrics:**
- Cyclomatic complexity: N/A (deletion)
- Coupling: Moderate (3-file chain)
- Cohesion: Low (broken architecture)

### Post-Deletion Complexity

**Files involved:** 0 (deleted)
**Lines of code:** 0
**Dependencies:** 0

**Complexity change:** -100% (pure simplification)

### AFP/SCAS Score

**Via Negativa:** 10/10 (pure deletion)
**Refactor vs Repair:** 10/10 (not repair - complete removal)
**Complexity:** 10/10 (dramatic decrease)
**LOC:** 10/10 (-927 lines)
**Pattern reuse:** 10/10 (deletion pattern)

**Overall AFP/SCAS:** 10.0/10 (PERFECT)

This is the ideal AFP task - pure deletion that simplifies the system.

## Security Considerations

### Security Issue 1: Credential exposure in git history

**Risk:** Wrong credential locations are in git history forever
**Impact:** Medium (misleading but not exposing actual secrets)
**Mitigation:** None needed - git history shows the mistake and correction
**Note:** No actual credentials were committed, just wrong paths

### Security Issue 2: Broken auth mechanism

**Risk:** llm_chat failing might be a security feature (no auth = no access)
**Impact:** Already broken, deletion doesn't change security posture
**Mitigation:** System returns to previous state (which was working)

## Performance Considerations

**Build time:** Slightly faster (fewer files to compile)
**Bundle size:** Smaller (fewer modules)
**Runtime:** No change (tool wasn't working anyway)

## AFP/SCAS Validation

### Via Negativa Check

✅ **PERFECT** - Deleting 927 lines, adding 0

### Refactor vs Repair Check

✅ **PERFECT** - Not repairing broken code, removing it entirely

### Complexity Check

✅ **PERFECT** - Complexity decreases to zero (removed system)

### LOC Check

✅ **PERFECT** - Net -927 lines (massive deletion)

### Pattern Check

✅ **EXCELLENT** - Following reversion pattern for critical bugs

## What Could Go Wrong?

### Scenario 1: We're wrong and llm_chat is actually used

**Evidence against:**
- User says "llm_chat no longer works at all"
- Tool throws error on every call
- If it's broken and throwing errors, it's not being used successfully

**Mitigation:** Search codebase for actual usage

### Scenario 2: Documentation removal breaks onboarding

**Evidence against:**
- Documentation is wrong anyway
- Better to have no docs than wrong docs
- Real account manager docs exist in pr21 branch

**Mitigation:** Can add correct docs later (separate task)

### Scenario 3: We miss some files in deletion

**Mitigation:** Comprehensive grep searches
**Recovery:** Easy to delete more files later

## Decision Tree

```
START: Critical regression found
  ↓
Q: Can we repair llm_chat?
  → NO: Architectural impossibility (MCP server can't have mcpClient)
  ↓
Q: Can we salvage the documentation?
  → NO: Documents wrong credential locations entirely
  ↓
Q: Should we delete everything?
  → YES: Pure via negativa, returns system to working state
  ↓
Q: What's the risk?
  → LOW: Broken code wasn't being used (it throws errors)
  ↓
DECISION: Delete all broken/wrong code and documentation
```

## Mitigation Strategies

### Strategy 1: Thorough search before deletion

```bash
# Search for all llm_chat references
grep -r "llm_chat" tools/wvo_mcp/src/
grep -r "llmChat" tools/wvo_mcp/src/

# Search for credential doc references
grep -r "SUBSCRIPTION_CREDENTIALS" .
grep -r "\.claude\.json\|\.codex/auth" docs/ CLAUDE.md AGENTS.md
```

### Strategy 2: Incremental verification

1. Delete source code → build → verify
2. Delete documentation → check links → verify
3. Delete test artifacts → final verification

### Strategy 3: Automated test script

Create comprehensive verification script (already in PLAN)

### Strategy 4: Git safety net

Work on feature branch, easy to revert if needed

## Confidence Assessment

**Confidence in approach:** 99%
- Pure deletion is safest refactoring
- Broken code confirmed by user
- Wrong documentation confirmed by user
- No dependencies on this code (it's new and broken)

**Remaining 1% uncertainty:**
- Possibility we missed a reference somewhere
- Mitigated by comprehensive grepping

## Next Phase

Design phase (GATE) - create design.md with AFP/SCAS analysis.
