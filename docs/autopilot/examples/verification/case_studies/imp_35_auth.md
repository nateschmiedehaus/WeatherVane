# Case Study: IMP-35 Auth - Integration Assumption

**Task**: IMP-35 Round 2 (Multi-Agent Testing)
**Date**: 2025-10-30
**Phase**: IMPLEMENT
**Issue**: Achieved Level 2, needed Level 3 - assumed auth mechanism without testing

---

## What Was Claimed

"Multi-agent testing works with Claude and Codex"

**Evidence provided**:
- Logic tested with smoke tests (Level 2 ✅)
- Comparison algorithm validated with known inputs
- Edge cases covered (0%, 100%, equal rates)
- Test suite passes (3/3 tests)

**Claimed verification level**: Level 2 (Smoke Testing) + assumed Level 3 (Integration)

---

## What Was Actually Needed

**Required verification level**: Level 3 (Integration Testing) with actual authentication

**Why Level 3 needed**:
- Multi-agent testing requires **real** API calls to Claude and Codex
- Authentication mechanism must be **validated**, not assumed
- System integration depends on how credentials are managed
- Can't test real prompts without real authentication

---

## User Feedback (CRITICAL CORRECTION)

> "also no like i said we are not using API keys we are using monthly subscription logins which are already in the system so go back and do that."

**Translation**:
- System uses CLI-based authentication (`codex login`, `claude` CLI)
- NOT SDK-based authentication with ANTHROPIC_API_KEY / OPENAI_API_KEY
- Authentication system already exists, should have been discovered and used
- Implementation made incorrect assumption about auth mechanism

---

## Root Cause Analysis

### What Went Wrong

**Assumption**: "Authentication works via API keys passed to SDKs"

**Reality**: System uses CLI-based logins with credential storage in home directories

**Incorrect implementation**:
```typescript
// multi_model_runner.ts (WRONG)
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Assumed this would work:
const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY  // ❌ WRONG
});

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY     // ❌ WRONG
});
```

**What should have been used**:
```bash
# CLI-based authentication (CORRECT)
codex login              # Stores credentials in ~/.codex/
claude whoami            # Uses credentials in ~/.claude/

# System already has:
# - auth_checker.ts: validates CLI authentication
# - browser_login_tracker.ts: tracks CLI login sessions
# - credentials_manager.ts: loads from CLI credential files
```

### Why This Happened

1. **Skipped DISCOVER phase**: Didn't investigate existing auth system
2. **Assumed familiar pattern**: Used SDK auth because it's common
3. **No integration test**: Didn't actually try to call APIs with real auth
4. **Mocked everything**: Tests mocked API responses, never validated real calls
5. **Ignored existing code**: auth_checker.ts and browser_login_tracker.ts were there but not consulted

---

## Cost of This Failure

### Immediate Impact
- **Implementation unusable**: Can't actually run multi-agent tests
- **Needs complete rewrite**: SDK auth approach must be replaced with CLI
- **Wasted effort**: ~3 hours implementing wrong auth mechanism
- **User had to correct**: Should have been caught in DISCOVER or VERIFY

### Verification Gap
**What was tested (Level 2)**:
- ✅ Comparison logic with mocked results
- ✅ Success rate calculation
- ✅ Edge case handling

**What was NOT tested (Level 3)**:
- ❌ Actual API calls to Claude
- ❌ Actual API calls to Codex
- ❌ Authentication flow
- ❌ Credential loading
- ❌ Integration with CLI login system

### Missed Opportunity
- System already had full auth infrastructure
- auth_checker.ts validates both Codex and Claude CLI auth
- browser_login_tracker.ts tracks login sessions
- credentials_manager.ts loads from environment OR encrypted storage
- **All of this was ready to use, just needed to be discovered**

---

## How Existing System Actually Works

### CLI-Based Authentication

**Codex authentication**:
```bash
# User logs in via CLI
codex login

# Credentials stored in:
~/.codex/credentials.json
# OR
~/.codex/auth.json

# Validation:
codex status  # Shows "Logged in as user@example.com"
```

**Claude authentication**:
```bash
# User logs in via CLI
claude login

# Credentials stored in:
~/.claude/session.json
# OR
~/.claude/config.json

# Validation:
claude whoami  # Shows user info
```

### Existing Auth Infrastructure

**auth_checker.ts** (lines 45-80):
```typescript
private async checkCodexAuth(): Promise<{
  authenticated: boolean;
  user?: string;
  error?: string;
}> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const credentialCandidates = [
    path.join(codexHome, "credentials.json"),
    path.join(codexHome, "auth.json"),
  ];

  // Try to get Codex status via CLI
  const { stdout } = await execAsync("codex status 2>&1 || true");
  if (stdout.includes("Logged in") || stdout.includes("authenticated")) {
    // User is authenticated via CLI
    return { authenticated: true, user: extractedUser };
  }

  // Fallback: check credential files directly
  for (const candidate of credentialCandidates) {
    if (fs.existsSync(candidate)) {
      const data = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      // Validate credential structure
      return { authenticated: true, user: data.user };
    }
  }

  return { authenticated: false };
}
```

**browser_login_tracker.ts** (lines 120-150):
```typescript
async function resolveCodexIdentity(): Promise<string | undefined> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const candidates = ['credentials.json', 'auth.json'];

  for (const candidate of candidates) {
    const credPath = path.join(codexHome, candidate);
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      return data.email || data.user || data.username;
    }
  }

  return undefined;
}

async function resolveClaudeIdentity(): Promise<string | undefined> {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const sessionPath = path.join(configDir, 'session.json');

  if (fs.existsSync(sessionPath)) {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    return data.user?.email || data.email;
  }

  return undefined;
}
```

**This infrastructure was ready to use** - just needed to:
1. Import AuthChecker
2. Call checkCodexAuth() and checkClaudeCodeAuth()
3. Use CLI commands for actual LLM calls
4. Or use credentials from home directories

---

## How It Should Have Been Implemented

### Correct Approach (Option 1: Use CLI Commands)
```typescript
// multi_model_runner.ts (CORRECT)
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function callClaude(prompt: string): Promise<string> {
  // Use claude CLI command
  const { stdout } = await execAsync(`claude -p "${prompt}"`);
  return stdout;
}

async function callCodex(prompt: string): Promise<string> {
  // Use codex CLI command
  const { stdout } = await execAsync(`codex -p "${prompt}"`);
  return stdout;
}
```

### Correct Approach (Option 2: Integrate with AuthChecker)
```typescript
// multi_model_runner.ts (CORRECT)
import { AuthChecker } from '../utils/auth_checker';

async function runMultiAgentTest() {
  const authChecker = new AuthChecker();

  // Validate authentication before running
  const claudeAuth = await authChecker.checkClaudeCodeAuth();
  if (!claudeAuth.authenticated) {
    throw new Error('Claude CLI authentication required. Run: claude login');
  }

  const codexAuth = await authChecker.checkCodexAuth();
  if (!codexAuth.authenticated) {
    throw new Error('Codex CLI authentication required. Run: codex login');
  }

  // Now safe to make calls using CLI or credentials from home dirs
  // ...
}
```

### Level 3 Integration Test
```typescript
// multi_model_runner.integration.test.ts (NEW)
describe('Multi-agent integration tests', () => {
  it('validates CLI authentication works', async () => {
    const authChecker = new AuthChecker();

    const claudeAuth = await authChecker.checkClaudeCodeAuth();
    expect(claudeAuth.authenticated).toBe(true);
    expect(claudeAuth.user).toBeTruthy();

    const codexAuth = await authChecker.checkCodexAuth();
    expect(codexAuth.authenticated).toBe(true);
    expect(codexAuth.user).toBeTruthy();
  });

  it('can make actual API call to Claude', async () => {
    const result = await callClaude('Say hello');
    expect(result).toContain('hello');  // Validate real response
  });

  it('can make actual API call to Codex', async () => {
    const result = await callCodex('Say hello');
    expect(result).toContain('hello');  // Validate real response
  });
});
```

---

## Lessons Learned

### For Agents

**NEVER assume how existing systems work**. Always:
1. **Search for existing implementations** (`grep -r "auth" src/`)
2. **Read existing auth/config code** before implementing
3. **Test with real integration** before claiming Level 3
4. **Ask user if unsure** about auth mechanism

**DISCOVER phase is critical**:
- What auth system already exists?
- How do users currently authenticate?
- What credential files exist?
- What CLI commands are available?

### For Work Process

**DISCOVER phase must include**:
- [ ] Search for existing auth implementations
- [ ] Identify credential storage locations
- [ ] Document CLI commands vs SDK usage
- [ ] Test authentication manually

**VERIFY phase must test integration**:
- [ ] Not just "logic works with mocks"
- [ ] But "system works with real dependencies"
- [ ] Authentication tested with actual CLI logins
- [ ] At least one end-to-end test with real API calls

**Red flags requiring extra verification**:
- 🚩 Using SDKs when system has CLI tools
- 🚩 Requiring API keys when user says "subscription logins"
- 🚩 Implementing auth when auth system exists
- 🚩 All tests mocked (no real integration)

---

## Prevention: How Verification Levels Help

### Level 2 vs Level 3 Distinction

**Level 2 (what we achieved)**:
- ✅ Core logic works with known inputs
- ✅ Comparison algorithm correct
- ✅ Edge cases handled
- **Proves**: Logic is correct
- **Does NOT prove**: Integration works

**Level 3 (what we needed)**:
- ✅ Real CLI authentication works
- ✅ Real API calls succeed
- ✅ End-to-end workflow executes
- **Proves**: System works with real dependencies
- **Does NOT prove**: Handles production load

### Honest Gap Documentation

If we had documented verification gaps honestly:

```markdown
## What Was Tested (Level 2 ✅)
- Comparison logic with different success rates
- Edge case: both agents pass all tasks
- Edge case: both agents fail same tasks

## What Was NOT Tested (Level 3 ⏳)
- Real Claude API calls (requires auth) ⚠️
- Real Codex API calls (requires auth) ⚠️
- Integration with CLI login system ⚠️
- **ASSUMPTION: API key auth will work** ← RED FLAG

## Why Level 3 Deferred
- **Don't have API keys in dev environment**
  ↑ WRONG REASON - should have investigated actual auth
```

**This would have triggered**: "Wait, why don't we have API keys? How does auth actually work?"

### Detection

With verification levels, this failure would have been caught:
```bash
# Pre-REVIEW check
bash scripts/check_verification_level.sh IMP-35

# Output:
# ⚠️  WARNING: Claims integration tested but all tests use mocks
# Found: Tests with mocked API responses (Level 2)
# Missing: Integration test with real API calls (Level 3)
# Missing: Authentication validation
# Recommendation: Test with actual CLI auth or explicitly defer Level 3
```

---

## Applicability to Other Tasks

**This pattern applies to any integration**:
- Database connections (mock queries ≠ real DB works)
- External APIs (mocked responses ≠ real API calls work)
- File systems (in-memory ≠ actual file I/O works)
- Authentication (assumed mechanism ≠ tested mechanism)

**Key questions for Level 3**:
1. "How does this system ACTUALLY work?" (not "how do I think it works")
2. "What existing code handles this?" (search before implementing)
3. "Can I test this end-to-end with real dependencies?"
4. "What assumptions am I making that could be wrong?"

**For auth specifically**:
- Don't assume API keys unless you see API keys in the code
- Don't assume SDK auth unless system uses SDKs
- Check for CLI tools (`codex`, `claude`, `aws`, `gcloud`)
- Look for credential files in home directories
- Read existing auth code before implementing new auth

---

## Status: Needs Fix

**Current state**: Implementation uses wrong auth mechanism (SDK + API keys)

**Required fix**:
1. Remove SDK imports (Anthropic, OpenAI) from multi_model_runner.ts
2. Integrate with AuthChecker to validate CLI authentication
3. Use CLI commands OR credentials from home directories for API calls
4. Update scripts to check for CLI auth instead of API keys
5. Create Level 3 integration test with actual CLI logins
6. Test end-to-end with real `codex login` and `claude` CLI

**Will be fixed after META-TESTING-STANDARDS complete** as concrete application of verification standards.

---

## References

- IMP-35 Round 2 evidence: `state/evidence/IMP-35/round2/`
- Incorrect implementation: `tools/wvo_mcp/src/evals/multi_model_runner.ts`
- Existing auth system: `tools/wvo_mcp/src/utils/auth_checker.ts`
- Login tracking: `tools/wvo_mcp/src/utils/browser_login_tracker.ts`
- Credentials: `tools/wvo_mcp/src/utils/credentials_manager.ts`
- Verification taxonomy: `docs/autopilot/VERIFICATION_LEVELS.md`

---

## Summary

**Pattern**: Integration assumption (achieving Level 2, assuming Level 3)

**Cost**: Implementation unusable, needs complete rewrite, 3 hours wasted

**Root Cause**: Skipped DISCOVER, assumed familiar pattern, mocked everything, didn't test real integration

**Fix**: Use existing CLI auth system, test with real logins

**Prevention**: DISCOVER existing systems, document Level 3 gaps honestly, test with real dependencies

**Key Learning**: "Tests pass with mocks" ≠ "works with real system" - Level 3 requires actual integration testing
