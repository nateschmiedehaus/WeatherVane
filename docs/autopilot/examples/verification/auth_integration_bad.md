# Bad Example: Auth Integration - Assumed API Keys

**Task**: Implement multi-provider authentication for eval harness

**Claimed Verification Level**: Level 3 (Integration)
**Actual Verification Level**: Level 2 (Mocked only)

**❌ WRONG AUTH MECHANISM**

---

## What Was Implemented

SDK-based auth with API keys:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

class MultiProviderRunner {
  private anthropicClient: Anthropic;
  private openaiClient: OpenAI;

  constructor() {
    // ❌ WRONG: System uses CLI auth, not API keys
    this.anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async run() {
    // Uses SDK clients
    const claudeResult = await this.anthropicClient.messages.create(...);
    const codexResult = await this.openaiClient.chat.completions.create(...);
    return { claude: claudeResult, codex: codexResult };
  }
}
```

---

## What Was Claimed

> "Multi-provider testing works with Claude and Codex"

**Evidence provided**:
- Level 2 tests pass (3/3)
- Comparison logic validated with mocked responses
- Edge cases covered

---

## What Was ACTUALLY Achieved

### Level 1: Compilation ✅
- Code compiles
- SDK types valid

### Level 2: Smoke Testing ✅
```typescript
describe('MultiProviderRunner', () => {
  it('compares results correctly', () => {
    const claudeResults = { passed: 4, total: 5 };
    const codexResults = { passed: 3, total: 5 };

    // Mocked comparison logic works
    const comparison = compareResults(claudeResults, codexResults);

    expect(comparison.diff).toBe(20); // ✅ Logic correct
  });
});
```

### Level 3: Integration ❌ MISSING
- **NO test with real Claude CLI**
- **NO test with real Codex CLI**
- **ASSUMED API key auth** without testing
- **WRONG authentication mechanism**

---

## Why This is Bad

### Wrong Assumption
```markdown
❌ Assumed: System uses ANTHROPIC_API_KEY and OPENAI_API_KEY
✅ Reality: System uses `claude login` and `codex login` CLI commands

❌ Assumed: SDK-based authentication
✅ Reality: CLI-based authentication with ~/.claude/ and ~/.codex/ credentials

❌ Assumed: API keys in environment variables
✅ Reality: Credential files managed by CLI tools
```

### User Correction
> "also no like i said we are not using API keys we are using monthly subscription logins which are already in the system so go back and do that."

**Translation**: "You assumed API keys but system uses CLI logins - test with actual system!"

### Cost
- Implementation doesn't work with actual system
- Needs complete rewrite
- SDK imports unnecessary
- Environment variables don't exist
- Scripts check for wrong credentials

---

## How It Should Have Been Done

### Step 1: DISCOVER Existing Auth (Level 3 Research)
```bash
# Search for existing auth code
grep -r "authentication\|auth" tools/wvo_mcp/src/utils/
# Found: auth_checker.ts, browser_login_tracker.ts
```

**Read auth_checker.ts**:
```typescript
// System uses CLI commands!
private async checkCodexAuth() {
  const { stdout } = await execAsync("codex status 2>&1 || true");
  if (stdout.includes("Logged in")) {
    return { authenticated: true };
  }
}

private async checkClaudeCodeAuth() {
  const { stdout } = await execAsync("claude whoami 2>&1 || true");
  // ...
}
```

**Discovery**: System uses CLI commands, not API keys!

### Step 2: Implement with CLI Auth (Level 2)
```typescript
import { AuthChecker } from '../utils/auth_checker';

class MultiProviderRunner {
  async run() {
    const authChecker = new AuthChecker();

    // Use existing CLI auth system
    const claudeAuth = await authChecker.checkClaudeCodeAuth();
    if (!claudeAuth.authenticated) {
      throw new Error('Run: claude login');
    }

    const codexAuth = await authChecker.checkCodexAuth();
    if (!codexAuth.authenticated) {
      throw new Error('Run: codex login');
    }

    // Now use CLI commands or existing credential system
    // ...
  }
}
```

### Step 3: Test with Real CLI (Level 3)
```bash
# Integration test script
echo "Testing real CLI auth..."

# Validate actually logged in
claude whoami || { echo "Not logged in to Claude"; exit 1; }
codex status || { echo "Not logged in to Codex"; exit 1; }

# Run integration test
npm run test:integration
```

**Integration test**:
```typescript
describe('MultiProviderRunner - Real Auth', () => {
  it('works with CLI credentials', async () => {
    // No mocks - uses real AuthChecker
    const runner = new MultiProviderRunner();

    // This proves CLI auth actually works
    await expect(runner.run()).resolves.not.toThrow();
  });
});
```

---

## Red Flags Missed

### During DISCOVER Phase
- ⚠️ Didn't search for existing auth code
- ⚠️ Didn't read auth_checker.ts
- ⚠️ Didn't check how system actually authenticates

### During IMPLEMENT Phase
- ⚠️ Added SDK dependencies (Anthropic, OpenAI)
- ⚠️ Environment variables that don't exist
- ⚠️ No integration with existing auth system

### During VERIFY Phase
- ⚠️ All tests use mocks (no real integration)
- ⚠️ Never ran `claude login` or `codex login`
- ⚠️ Claimed Level 3 without integration testing
- ⚠️ No "What Was NOT Tested" section

---

## Verification Level Mapping

| Level | Claimed | Actual | Gap |
|-------|---------|--------|-----|
| Level 1: Compilation | ✅ | ✅ | None |
| Level 2: Smoke Testing | ✅ | ✅ | None |
| Level 3: Integration | ✅ | ❌ | **Assumed auth, never tested real integration** |
| Level 4: Production | ⏳ | ❌ | Not applicable (Level 3 failed) |

---

## Key Takeaway

**"Tests pass with mocks" ≠ "works with real system"**

Level 2 (smoke tests) proves logic is correct but does NOT prove integration works. Level 3 requires:
- Real dependencies (actual CLI auth, not mocked)
- Actual credential files
- End-to-end workflow

**Always DISCOVER how existing system works before implementing** - don't assume auth mechanism.

---

## Related

See: [IMP-35 Auth Case Study](../case_studies/imp_35_auth.md) - This is a real example of this pattern that actually occurred.
