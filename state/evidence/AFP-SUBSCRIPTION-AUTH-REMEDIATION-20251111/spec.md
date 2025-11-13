# SPEC: Subscription Auth Remediation

**Task ID:** AFP-SUBSCRIPTION-AUTH-REMEDIATION-20251111
**Phase:** SPEC (2/10)

## Acceptance Criteria

### Functional Requirements

1. **FR1: Remove Broken llm_chat Tool**
   - DELETE: `tools/wvo_mcp/src/tools/llm_chat.ts`
   - DELETE: llm_chat tool registration from `tools/wvo_mcp/src/index.ts`
   - DELETE: llmChatInput schema from `tools/wvo_mcp/src/tools/input_schemas.ts`
   - Result: MCP server no longer exposes broken llm_chat tool

2. **FR2: Remove Incorrect Documentation**
   - DELETE: `docs/SUBSCRIPTION_CREDENTIALS.md` (entire file)
   - DELETE: Credentials section from `CLAUDE.md` (lines 1-20 approx)
   - DELETE: Credentials section from `AGENTS.md` (lines 1-20 approx)
   - Result: No references to wrong credential locations (`~/.claude.json`, `~/.codex/auth.json`)

3. **FR3: Remove Test Artifacts**
   - DELETE: `state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/` (entire directory)
   - Result: No misleading "proof" artifacts based on wrong architecture

### Non-Functional Requirements

1. **NFR1: Build Success**
   - `cd tools/wvo_mcp && npm run build` completes with 0 errors
   - TypeScript compilation succeeds

2. **NFR2: Pure Deletion**
   - Git diff shows ONLY deletions
   - Zero lines added (pure via negativa)
   - Net LOC: Negative (massive deletion)

3. **NFR3: No Broken References**
   - No import statements referencing deleted files
   - No dangling references to llm_chat tool
   - Clean git status after deletion

## Out of Scope

- **NOT fixing credential system** - that's a separate task if needed
- **NOT documenting real account manager** - that can come later
- **NOT implementing new features** - pure deletion only

## Success Metrics

### Quantitative

- **Deletions:** ~500+ lines deleted
- **Additions:** 0 lines
- **Files removed:** 4 total (llm_chat.ts, SUBSCRIPTION_CREDENTIALS.md, test directory, parts of 3 others)
- **Build errors:** 0 (must build cleanly)
- **Test failures:** 0 new failures

### Qualitative

- System returns to pre-regression working state
- No misleading documentation remains
- Clear git history showing reversion

## Verification Plan

1. Delete files
2. Run build: `cd tools/wvo_mcp && npm run build`
3. Check for dangling references: `grep -r "llm_chat" tools/wvo_mcp/src/`
4. Verify documentation clean: `grep -r "\.claude\.json\|\.codex/auth" docs/ CLAUDE.md AGENTS.md`
5. Commit with clear reversion message
6. Confirm git diff shows pure deletion

## Dependencies

None - pure deletion has no dependencies.

## Risks

**Low Risk** - Deletion is safer than addition
- If llm_chat wasn't being used (it's broken), removing it can't break existing functionality
- Documentation removal can't break code
- Pure deletion is reversible via git

## Timeline

- IMPLEMENT: 10 minutes (file deletions)
- VERIFY: 5 minutes (build + checks)
- REVIEW: 5 minutes (git diff inspection)
- **Total: 20 minutes**

## Next Phase

PLAN: Design deletion approach and verification tests.
