# Verification Levels: What Does "Tested" Actually Mean?

**Purpose**: Define 4 clear verification levels to prevent false completion claims

**Problem**: "Tests pass" means different things - from "code compiles" to "production users validated it"

**Solution**: Explicit levels with sharp boundaries

---

## The 4 Verification Levels

### Level 1: Compilation
**What it proves**: Code is syntactically valid
**What it does NOT prove**: Logic works, integrations work, real-world usage possible

**Required at**: IMPLEMENT phase (before claiming "implementation complete")

**How to achieve**:
```bash
npm run build  # TypeScript project
# OR
python -m py_compile file.py  # Python
# OR
gcc file.c  # C
```

**Good evidence**:
- Build command shown with output
- "0 errors, 0 warnings" explicitly stated
- Build artifacts exist (dist/ directory, compiled files)

**Bad evidence**:
- "Build passed" without showing command
- Build succeeded but warnings ignored
- Code compiles but dependencies missing

**Example claim**: "Implementation compiles successfully"

**What you CAN'T claim**: "Implementation works", "Ready for production", "Tested"

---

### Level 2: Smoke Testing
**What it proves**: Core logic works correctly with known inputs
**What it does NOT prove**: Real APIs work, production data works, auth works

**Required at**: VERIFY phase (before moving to REVIEW)

**How to achieve**:
```typescript
// Smoke test example
import { describe, it, expect } from 'vitest';
import { compareAgents } from '../multi_model_runner';

it('calculates success rates correctly', () => {
  const claudeResults = { passed: 4, total_tasks: 5 };  // Known input
  const codexResults = { passed: 3, total_tasks: 5 };   // Known input

  const comparison = compareAgents(claude Results, codexResults);

  expect(comparison.claude_success_rate).toBe(80);  // Known output
  expect(comparison.codex_success_rate).toBe(60);   // Known output
  expect(comparison.diff_percentage).toBe(20);      // Known output
});
```

**Good evidence**:
- Test files exist (`*.test.ts`, `test_*.py`)
- Test execution logs shown
- All tests pass (not just "tests run")
- What was tested explicitly documented
- What was NOT tested explicitly documented

**Bad evidence**:
- Tests exist but never run
- Tests run but no assertions (always pass)
- "Tests pass" but only trivial cases tested
- Tests mock everything (no logic actually validated)

**Example claim**: "Logic validated with smoke tests - 3/3 passing"

**What you CAN claim**: "Core functionality works with known data"
**What you CAN'T claim**: "Works with real APIs", "Production-ready"

**Honest gap documentation required**:
```markdown
## What Was Tested (Level 2 ✅)
- Comparison logic with different success rates
- Edge case: both agents pass all tasks
- Edge case: both agents fail same tasks

## What Was NOT Tested (Level 3 ⏳)
- Real Claude API calls (requires auth)
- Real Codex API calls (requires auth)
- Integration with CLI login system
```

---

### Level 3: Integration Testing
**What it proves**: System works end-to-end with real dependencies
**What it does NOT prove**: Production load handling, long-term reliability

**Required at**: REVIEW phase (or explicitly deferred with justification)

**How to achieve**:
```bash
# Integration test - uses REAL auth, REAL APIs
codex login  # Actual CLI login
claude whoami  # Verify actual auth

# Run with real credentials
bash scripts/run_prompt_evals.sh --mode quick --agent codex  # Real API calls
bash scripts/run_prompt_evals.sh --mode quick --agent claude # Real API calls

# Verify results
test -f results/runs/*.json  # Results actually generated
grep "success_rate" results/runs/*.json  # Real metrics
```

**Good evidence**:
- Real API calls made (not mocked)
- Real auth used (CLI logins, not fake tokens)
- End-to-end workflow executed
- Results show real data (not synthetic)
- Error cases tested (what happens when API fails?)

**Bad evidence**:
- Everything mocked (no real integration)
- "Should work with real APIs" (assumption, not test)
- Only happy path tested (no error cases)
- Auth mechanism assumed (not validated)

**Example claim**: "Integration tested with actual CLI logins and API calls"

**What you CAN claim**: "Works with real system dependencies"
**What you CAN'T claim**: "Production-validated", "User-tested"

**Acceptable deferral**: Level 3 can be deferred with explicit justification

**Valid reasons to defer**:
- "Requires production credentials not available in dev"
- "External API currently unavailable"
- "Depends on task X which isn't complete"

**Invalid reasons to defer**:
- "Don't have time"
- "Probably works"
- "Will test later"

**Deferral template**:
```markdown
## Level 3 Integration: DEFERRED ⏳

**Reason**: Requires production API keys not available in development environment

**Validation plan**: User will test with production credentials before deploying

**Risk**: API integration may have issues not caught by smoke tests

**Mitigation**: Documented auth mechanism, followed existing patterns

**Follow-up**: Create FIX-* task if integration issues found
```

---

### Level 4: Production Validation
**What it proves**: Real users can successfully use the feature
**What it does NOT prove**: Long-term reliability (requires ongoing monitoring)

**Required at**: MONITOR phase (tracked, not blocking)

**How to achieve**:
- User successfully completes workflow
- Telemetry shows successful usage
- No critical bugs reported
- Key metrics hit targets (success rate, latency, cost)

**Good evidence**:
- User testing results documented
- Telemetry/analytics showing real usage
- Success metrics from production
- User feedback incorporated

**Bad evidence**:
- "Deployed to production" (deployment ≠ validation)
- "Looks good to me" (opinion, not data)
- No usage data collected
- Assuming users can figure it out

**Example claim**: "User validated feature works in production environment"

**What you CAN claim**: "Feature works for real users"
**What you CAN'T claim yet**: "Feature is reliable long-term" (need monitoring period)

---

## Quick Reference: When Do I Need Which Level?

| Phase | Minimum Level | What If Insufficient? |
|-------|--------------|----------------------|
| IMPLEMENT → VERIFY | Level 1 (Compilation) | Stay in IMPLEMENT |
| VERIFY → REVIEW | Level 2 (Smoke Testing) | Return to IMPLEMENT |
| REVIEW → PR | Level 3 (Integration) OR explicit deferral | Return to IMPLEMENT/VERIFY |
| MONITOR (tracking) | Level 4 (Production) | Create follow-up tasks |

---

## Common Pitfalls and How to Avoid Them

### Pitfall 1: "Build Passed = Done"
**What happens**: Claim task complete when code only compiles
**Why it's wrong**: Level 1 doesn't prove logic works
**Real example**: IMP-35 Round 1 - build passed, no smoke tests, user had to request redo
**How to fix**: Always create smoke tests (Level 2) before claiming VERIFY complete

### Pitfall 2: "Tests Exist = Tested"
**What happens**: Tests written but never run, or run but don't assert anything
**Why it's wrong**: Level 2 requires tests that actually validate logic
**How to fix**: Show test execution logs, document what each test proves

### Pitfall 3: "Mocked Everything = Integration Tested"
**What happens**: Claim Level 3 when all dependencies are mocked
**Why it's wrong**: Mocks don't prove real system works
**Real example**: IMP-35 auth - assumed API key auth, system uses CLI logins
**How to fix**: Test with at least one real dependency, or defer Level 3 explicitly

### Pitfall 4: "Deployed = Validated"
**What happens**: Deploy to production, assume it works
**Why it's wrong**: Deployment doesn't prove users can use it
**How to fix**: Collect telemetry, get user feedback, measure success metrics

---

## Task-Type-Specific Guidance

### API/Service Integration
- **Level 1**: API client code compiles
- **Level 2**: API client logic tested with mocked responses
- **Level 3**: Actual API calls with real credentials
- **Level 4**: Production traffic handled successfully

**Critical**: Auth mechanism must be validated at Level 3 (don't assume)

### Machine Learning Model
- **Level 1**: Model training script runs without errors
- **Level 2**: Model performance validated on test set (metrics documented)
- **Level 3**: Model inference works in production environment
- **Level 4**: Model predictions used successfully by downstream systems

**Critical**: Performance metrics (accuracy, latency, cost) required at Level 2

### UI Feature
- **Level 1**: UI components compile/render
- **Level 2**: UI interactions tested (clicks, forms, navigation)
- **Level 3**: UI works in target browsers/devices
- **Level 4**: Users successfully complete workflows

**Critical**: Screenshots/videos helpful at all levels

### Infrastructure/DevOps
- **Level 1**: Configuration files valid (linted, type-checked)
- **Level 2**: Infrastructure provisioning tested in dev environment
- **Level 3**: Infrastructure works in staging/production
- **Level 4**: Services running successfully under load

**Critical**: Rollback tested at Level 3

### Research Task (No Code)
- **Level 1**: N/A (no code to compile)
- **Level 2**: Research conclusions validated (sources cited, review conducted)
- **Level 3**: Recommendations tested (prototype built, feasibility confirmed)
- **Level 4**: Recommendations adopted successfully

**Critical**: "Validated" means peer review, not just personal opinion

---

## FAQs

### Q: Do I always need Level 3 before REVIEW?
**A**: No, you can defer Level 3 with explicit justification. But you MUST have Level 2.

### Q: What if I can't achieve Level 2 because dependencies are broken?
**A**: Fix dependencies first, or explicitly document the blocker. Don't claim Level 2 without evidence.

### Q: Can I skip smoke tests if "the code is simple"?
**A**: No. Even simple code needs Level 2 validation. If it's truly simple, tests should be quick to write.

### Q: What counts as a "smoke test"?
**A**: Any test that runs actual code with known inputs and verifies outputs. Unit tests, integration tests (with mocks), property tests all count.

### Q: How many tests do I need for Level 2?
**A**: Enough to validate core logic and edge cases. No specific number, but "1 trivial test" is insufficient.

### Q: Can I claim Level 3 if I manually tested once?
**A**: Yes, manual testing counts if documented. But automated tests are better for repeatability.

### Q: What if the user will test in production (Level 4)?
**A**: That's fine, but document that Level 3 is deferred to user testing. Don't claim Level 3 yourself.

---

## Decision Tree: Which Level Do I Need?

```
START: What phase am I in?

├─ IMPLEMENT
│  └─ Need: Level 1 (Compilation)
│     ├─ Have: Build succeeds → Proceed to VERIFY
│     └─ Don't have: Build fails → Stay in IMPLEMENT
│
├─ VERIFY
│  └─ Need: Level 2 (Smoke Testing)
│     ├─ Have: Tests pass, logic validated → Proceed to REVIEW
│     └─ Don't have: No tests or tests fail → Return to IMPLEMENT
│
├─ REVIEW
│  └─ Need: Level 3 (Integration) OR explicit deferral
│     ├─ Have Level 3: Integration tested → Proceed to PR
│     ├─ Have valid deferral: Justification documented → Proceed to PR
│     └─ Don't have either → Return to IMPLEMENT/VERIFY
│
└─ MONITOR
   └─ Track: Level 4 (Production Validation)
      ├─ Have: User testing successful → Task complete
      └─ Don't have: Create follow-up tasks → Track metrics
```

---

## Real-World Examples

### Case Studies of Verification Failures

**Required reading** before claiming any task complete:

1. **[IMP-35 Round 1: Build Without Validate](examples/verification/case_studies/imp_35_round1.md)**
   - Pattern: Claimed completion with Level 1 (compilation) only
   - Needed: Level 2 (smoke tests)
   - Cost: 2 hours wasted, user frustration, wrong example set
   - Learning: "Build passed" ≠ "task complete"

2. **[IMP-35 Auth: Integration Assumption](examples/verification/case_studies/imp_35_auth.md)**
   - Pattern: Achieved Level 2, assumed Level 3 (integration)
   - Needed: Level 3 testing with actual CLI authentication
   - Cost: Implementation unusable, needs complete rewrite
   - Learning: "Tests pass with mocks" ≠ "works with real system"

### Additional Examples (Coming Soon)

See `docs/autopilot/examples/verification/` for 8 detailed examples of good vs bad validation across different task types (API, ML, UI, auth, research).

---

## Summary

**Remember**:
- **Level 1** = It compiles
- **Level 2** = Logic works (with test data)
- **Level 3** = System works (with real dependencies)
- **Level 4** = Users succeed (in production)

**Golden Rule**: Always document what verification level you achieved AND what level you did NOT achieve.

**When in doubt**: Ask "If this breaks in production, what will I wish I had tested?" Then test that.
