# PLAN: Subscription Auth Remediation

**Task ID:** AFP-SUBSCRIPTION-AUTH-REMEDIATION-20251111
**Phase:** PLAN (3/10)

## Approach: Pure Deletion via Git Revert

### Strategy

Use `git revert` to cleanly undo the three problematic commits:
1. `f24f73a76` - "docs: Complete subscription auth proof summary"
2. `7673eb2f3` - "test: Verify Claude Code subscription auth works"
3. `86db8a2aa` - "docs: Add subscription credentials guide for all agents"

**Why revert vs manual deletion?**
- Preserves git history (shows mistake + correction)
- Atomic operation (all-or-nothing)
- Generates clean revert commit
- No risk of missing files

**Alternative:** Manual file deletion
- More granular control
- Can see exact changes before committing
- Better for learning what went wrong

**Decision:** Use manual deletion with git tracking for this remediation to ensure we understand every change.

## Files to Modify

### Deletions

1. **tools/wvo_mcp/src/tools/llm_chat.ts** (DELETE ENTIRE FILE)
   - 98 lines
   - Broken llm_chat implementation

2. **tools/wvo_mcp/src/tools/input_schemas.ts** (PARTIAL DELETE)
   - Remove llmChatInput schema export
   - Estimate: ~15 lines

3. **tools/wvo_mcp/src/index.ts** (PARTIAL DELETE)
   - Remove: `import { llmChat } from "./tools/llm_chat.js";`
   - Remove: `import { llmChatInput } from "./tools/input_schemas.js";`
   - Remove: llmChatSchema definition
   - Remove: server.registerTool("llm_chat", ...) block (~28 lines)
   - Estimate: ~30 lines total

4. **docs/SUBSCRIPTION_CREDENTIALS.md** (DELETE ENTIRE FILE)
   - 327 lines
   - Entirely incorrect documentation

5. **CLAUDE.md** (PARTIAL DELETE)
   - Remove credentials section (lines ~3-20 after mission statement)
   - Keep rest of file intact
   - Estimate: ~17 lines

6. **AGENTS.md** (PARTIAL DELETE)
   - Remove credentials section (lines ~3-20 after header)
   - Keep rest of file intact
   - Estimate: ~17 lines

7. **state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/** (DELETE ENTIRE DIRECTORY)
   - claude_test_results.md (146 lines)
   - PROOF_SUMMARY.md (277 lines)
   - Total: 423 lines

### LOC Estimate

**Total Deletion:** ~927 lines
**Total Addition:** 0 lines
**Net LOC:** -927 (massive deletion)

**AFP/SCAS Compliance:** ✅ PERFECT (pure via negativa)

## Verification Tests

### Pre-IMPLEMENT Baseline

```bash
# Confirm current state is broken
cd tools/wvo_mcp
npm run build 2>&1 | tee /tmp/pre_remediation_build.log

# Check for llm_chat references
grep -r "llm_chat" src/ | wc -l > /tmp/pre_llm_chat_refs.txt

# Check for wrong credential references
grep -r "\.claude\.json\|\.codex/auth\.json" ../../docs/ ../../CLAUDE.md ../../AGENTS.md | wc -l > /tmp/pre_cred_refs.txt
```

### Post-IMPLEMENT Verification

```bash
# 1. Build must succeed
cd tools/wvo_mcp
npm run build
# Expected: 0 errors

# 2. No llm_chat references remain
grep -r "llm_chat" src/
# Expected: 0 results (or only in comments/strings if any)

# 3. No wrong credential locations documented
grep -r "\.claude\.json\|\.codex/auth\.json" ../../docs/ ../../CLAUDE.md ../../AGENTS.md
# Expected: 0 results

# 4. Test directory gone
ls -la ../../state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/
# Expected: No such file or directory

# 5. Files deleted
ls -la src/tools/llm_chat.ts
# Expected: No such file or directory

ls -la ../../docs/SUBSCRIPTION_CREDENTIALS.md
# Expected: No such file or directory

# 6. Git diff shows pure deletion
git diff --stat
# Expected: All lines show deletions only (no additions)

# 7. TypeScript compilation clean
npx tsc --noEmit
# Expected: 0 errors
```

### Automated Test Script

Create `scripts/verify_subscription_remediation.sh`:
```bash
#!/bin/bash
set -e

echo "=== Subscription Auth Remediation Verification ==="

cd "$(dirname "$0")/.."

echo "1. Building WVO MCP..."
cd tools/wvo_mcp
npm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build succeeded"

echo "2. Checking for llm_chat references..."
if grep -r "llm_chat" src/ 2>/dev/null; then
  echo "❌ Found llm_chat references"
  exit 1
fi
echo "✅ No llm_chat references"

echo "3. Checking for wrong credential docs..."
cd ../..
if grep -r "\.claude\.json\|\.codex/auth\.json" docs/ CLAUDE.md AGENTS.md 2>/dev/null; then
  echo "❌ Found wrong credential references"
  exit 1
fi
echo "✅ No wrong credential references"

echo "4. Checking deleted files..."
if [ -f "docs/SUBSCRIPTION_CREDENTIALS.md" ]; then
  echo "❌ SUBSCRIPTION_CREDENTIALS.md still exists"
  exit 1
fi
if [ -f "tools/wvo_mcp/src/tools/llm_chat.ts" ]; then
  echo "❌ llm_chat.ts still exists"
  exit 1
fi
if [ -d "state/evidence/SUBSCRIPTION-AUTH-TEST-20251111" ]; then
  echo "❌ Test directory still exists"
  exit 1
fi
echo "✅ All files deleted"

echo ""
echo "=== ✅ ALL VERIFICATION CHECKS PASSED ==="
```

## Implementation Steps

1. **Delete llm_chat tool** (3 files)
   ```bash
   rm tools/wvo_mcp/src/tools/llm_chat.ts
   # Edit input_schemas.ts to remove llmChatInput
   # Edit index.ts to remove llm_chat registration
   ```

2. **Delete incorrect documentation** (3 files)
   ```bash
   rm docs/SUBSCRIPTION_CREDENTIALS.md
   # Edit CLAUDE.md to remove credentials section
   # Edit AGENTS.md to remove credentials section
   ```

3. **Delete test artifacts** (1 directory)
   ```bash
   rm -rf state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/
   ```

4. **Verify build**
   ```bash
   cd tools/wvo_mcp && npm run build
   ```

5. **Run verification script**
   ```bash
   bash scripts/verify_subscription_remediation.sh
   ```

6. **Commit changes**
   ```bash
   git add -A
   git commit -m "revert: Remove broken subscription auth implementation

   CRITICAL REVERSION - fixes two critical regressions:

   1. Broken llm_chat tool (architectural impossibility)
      - tools/wvo_mcp/src/tools/llm_chat.ts required mcpClient parameter
      - But MCP server tools CANNOT have mcpClient (they ARE the server)
      - Tool was called FROM Claude Code, not calling TO Claude Code
      - Resulted in every Wave 0 AI call failing

   2. Incorrect credential documentation
      - docs/SUBSCRIPTION_CREDENTIALS.md documented wrong locations
      - Real system uses .accounts/codex/*, .accounts/claude/*
      - Real system uses state/accounts.yaml + account_manager.py
      - Documentation pollution in CLAUDE.md and AGENTS.md

   DELETIONS:
   - tools/wvo_mcp/src/tools/llm_chat.ts (98 lines)
   - tools/wvo_mcp/src/tools/input_schemas.ts (partial, ~15 lines)
   - tools/wvo_mcp/src/index.ts (partial, ~30 lines)
   - docs/SUBSCRIPTION_CREDENTIALS.md (327 lines)
   - CLAUDE.md (partial, ~17 lines)
   - AGENTS.md (partial, ~17 lines)
   - state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/ (423 lines)

   Total deletion: ~927 lines
   Total addition: 0 lines (pure via negativa)

   Reverts commits:
   - f24f73a76 docs: Complete subscription auth proof summary
   - 7673eb2f3 test: Verify Claude Code subscription auth works
   - 86db8a2aa docs: Add subscription credentials guide for all agents

   Pattern: Critical Reversion
   Deleted: 927 lines (broken code + wrong docs)

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

## Risks & Mitigations

### Risk 1: Breaking other code that uses llm_chat

**Likelihood:** Low
**Impact:** Medium
**Mitigation:** Search for all references before deletion
**Verification:** Grep for llm_chat in codebase

### Risk 2: Missing some credential references

**Likelihood:** Low
**Impact:** Low
**Mitigation:** Thorough grep for credential paths
**Verification:** Automated verification script

### Risk 3: Build failures after deletion

**Likelihood:** Very Low
**Impact:** Low (easily fixed)
**Mitigation:** Test build immediately after deletion
**Verification:** `npm run build` in verification steps

## Rollback Plan

If something goes wrong:
```bash
# Revert the reversion (restore broken code)
git revert HEAD

# Or cherry-pick specific parts
git checkout HEAD~1 -- path/to/file
```

## Next Phase

THINK: Analyze edge cases and failure modes.
