# Good Example: Auth Integration with CLI Testing

**Task**: Implement multi-provider authentication for eval harness

**Verification Level Achieved**: Level 3 (Integration with actual CLI auth)

---

## Implementation

```typescript
import { AuthChecker } from '../utils/auth_checker';

class MultiProviderRunner {
  async run(providers: string[]) {
    const authChecker = new AuthChecker();

    // Validate all providers authenticated before running
    for (const provider of providers) {
      const auth = provider === 'claude'
        ? await authChecker.checkClaudeCodeAuth()
        : await authChecker.checkCodexAuth();

      if (!auth.authenticated) {
        throw new Error(`${provider} not authenticated. Run: ${provider} login`);
      }
    }

    // Now safe to run with real credentials
    return this.execute(providers);
  }
}
```

---

## Verification Steps

### Level 1: Compilation ✅
```bash
npm run build  # 0 errors
```

### Level 2: Smoke Testing ✅
```typescript
describe('MultiProviderRunner', () => {
  it('validates all providers authenticated', async () => {
    const mockAuthChecker = {
      checkClaudeCodeAuth: () => Promise.resolve({ authenticated: true, user: 'test@example.com' }),
      checkCodexAuth: () => Promise.resolve({ authenticated: true, user: 'test@example.com' })
    };

    const runner = new MultiProviderRunner({ authChecker: mockAuthChecker });
    await expect(runner.run(['claude', 'codex'])).resolves.not.toThrow();
  });

  it('throws error if provider not authenticated', async () => {
    const mockAuthChecker = {
      checkClaudeCodeAuth: () => Promise.resolve({ authenticated: false }),
      checkCodexAuth: () => Promise.resolve({ authenticated: true })
    };

    const runner = new MultiProviderRunner({ authChecker: mockAuthChecker });
    await expect(runner.run(['claude', 'codex']))
      .rejects
      .toThrow('claude not authenticated. Run: claude login');
  });
});
```

### Level 3: Integration Testing ✅
```bash
# Test with REAL CLI authentication
./scripts/test_auth_integration.sh
```

```bash
#!/bin/bash
# test_auth_integration.sh

echo "Testing with real CLI authentication..."

# Check if actually logged in
claude whoami || { echo "❌ Not logged in to Claude"; exit 1; }
codex status || { echo "❌ Not logged in to Codex"; exit 1; }

# Run with real auth
npm run test:integration -- multi_provider_runner.integration.test.ts

echo "✅ Integration test passed with real CLI auth"
```

**Integration test**:
```typescript
describe('MultiProviderRunner - Real Auth', () => {
  it('works with actual CLI credentials', async () => {
    // No mocks - uses real AuthChecker with real credential files
    const runner = new MultiProviderRunner();

    await expect(runner.run(['claude', 'codex'])).resolves.not.toThrow();
  });

  it('validates real credential files exist', async () => {
    const authChecker = new AuthChecker();

    const claudeAuth = await authChecker.checkClaudeCodeAuth();
    expect(claudeAuth.authenticated).toBe(true);
    expect(claudeAuth.user).toBeTruthy();

    const codexAuth = await authChecker.checkCodexAuth();
    expect(codexAuth.authenticated).toBe(true);
    expect(codexAuth.user).toBeTruthy();
  });
});
```

**Output**:
```
Testing with real CLI authentication...
✓ Logged in to Claude as user@example.com
✓ Logged in to Codex as user@example.com

Running integration tests...
✓ works with actual CLI credentials (2.1s)
✓ validates real credential files exist (0.3s)

✅ Integration test passed with real CLI auth
```

---

## What Was Tested

### Level 2 ✅
- Auth validation logic with mocked checker
- Error messages when not authenticated
- Provider iteration logic

### Level 3 ✅
- Actual CLI authentication (`claude whoami`, `codex status`)
- Real credential files in ~/.claude/ and ~/.codex/
- AuthChecker integration with real system

### Level 4 ⏳
- Production user workflows
- Long-term credential expiry handling
- Multi-user scenarios

---

## Why This is Good

### Tested Real Auth Mechanism
- Didn't assume API keys - tested actual CLI logins
- Validated credential files in home directories
- Ran `claude whoami` and `codex status` commands

### Integration Script
- Created `test_auth_integration.sh` for repeatable testing
- Tests fail immediately if not logged in
- Proves auth mechanism works end-to-end

### Honest Gap Documentation
- Level 3 achieved (real integration tested)
- Level 4 explicitly deferred to production monitoring
- No assumptions about how auth "probably works"

---

## Key Takeaway

**Never assume auth mechanism** - test with actual system (CLI commands, credential files, real logins). Level 3 requires integration with real dependencies, not just mocked auth checks.
