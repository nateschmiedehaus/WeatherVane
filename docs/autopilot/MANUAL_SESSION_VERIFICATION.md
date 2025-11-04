# Manual Session Verification Checklist

**For**: Manual Claude Code sessions (outside structured autopilot workflow)
**NOT for**: Autopilot loops (use [WORK_PROCESS.md](docs/autopilot/WORK_PROCESS.md) instead)

---

## When to Use This

- One-off bug fixes
- User-requested features
- Quick explorations/PoCs
- Manual sessions outside autopilot

**Key principle**: Same quality standards ([verification levels](docs/autopilot/VERIFICATION_LEVELS.md)), lighter process

---

## Quick Checklist Template (Copy-Paste This)

```markdown
# Manual Session Verification

**Task**: [Brief description]
**Date**: [YYYY-MM-DD]

## Verification Level Achieved
- [ ] Level 1: Compilation ✅
- [ ] Level 2: Smoke Testing ✅/❌
- [ ] Level 3: Integration Testing ✅/❌/⏳ DEFERRED

## What Was Tested (Level 2 ✅)
- [What you tested with real execution]
- [Edge cases covered]

## What Was NOT Tested (Level 3 ⏳)
- [What you didn't test]
- [Why deferred]

## Deferral Justification (if Level 3 deferred)
**Reason**: [e.g., "No production credentials available"]
**Validation plan**: [How it will be validated later]
**Risk**: [What could go wrong]
**Mitigation**: [Risk reduction steps]

---

**Reference**: [VERIFICATION_LEVELS.md](docs/autopilot/VERIFICATION_LEVELS.md)
```

---

## Minimum Documentation

**Required**:
- Level achieved (1, 2, or 3)
- What was tested
- What was NOT tested
- Deferral justification (if Level 3 deferred)

**Optional**:
- Full evidence structure (state/evidence/)
- STRATEGIZE→MONITOR phases
- Detailed acceptance criteria

---

## Examples

### Example 1: Quick Bug Fix

```markdown
# Manual Session Verification

**Task**: Fix typo in error message (apps/web/src/components/ErrorDisplay.tsx)
**Date**: 2025-10-30

## Verification Level Achieved
- [x] Level 1: Compilation ✅
- [x] Level 2: Smoke Testing ✅
- [ ] Level 3: Integration Testing ⏳ DEFERRED

## What Was Tested (Level 2 ✅)
- Component compiles: npm run build → 0 errors
- Error message renders correctly (manual inspection in dev mode)
- Text is readable with correct spelling
- Changed "occured" → "occurred"

## What Was NOT Tested (Level 3 ⏳)
- Error display in production environment
- Error display with different error types (network, validation, auth)
- Accessibility with screen readers
- All code paths that trigger this error message

## Deferral Justification
**Reason**: Typo fix is low-risk, production testing not required for display text
**Validation plan**: Will be validated by next user who encounters this error (passive validation)
**Risk**: LOW - Worst case: Still readable but slightly awkward phrasing
**Mitigation**: Reviewed text with user before committing

---

**Verification Level**: Level 2 (Smoke Testing)
```

---

### Example 2: User-Requested Feature (Full Verification)

```markdown
# Manual Session Verification

**Task**: Add dark mode toggle to settings page
**Date**: 2025-10-30

## Verification Level Achieved
- [x] Level 1: Compilation ✅
- [x] Level 2: Smoke Testing ✅
- [x] Level 3: Integration Testing ✅

## What Was Tested (Level 2 ✅)
- Component compiles: npm run build → 0 errors
- Toggle renders correctly
- Clicking toggle changes theme (light → dark → light)
- State persists across page refresh
- Unit tests pass: npm test -- DarkModeToggle.test.tsx

## What Was Tested (Level 3 ✅)
- Tested in real browser (Chrome, Firefox, Safari)
- Dark mode applies to entire application (not just settings page)
- Theme preference saved to localStorage
- Works with keyboard navigation (accessibility)
- Contrast ratios meet WCAG AA standards
- Visual regression tests captured screenshots

## What Was NOT Tested
- Performance with complex pages (1000+ DOM nodes)
- Theme persistence across different devices
- Edge cases: Multiple tabs open, theme sync

---

**Verification Level**: Level 3 (Integration Testing)
```

---

### Example 3: Exploration/Proof of Concept

```markdown
# Manual Session Verification

**Task**: Prototype new caching algorithm for forecast data
**Date**: 2025-10-30

## Verification Level Achieved
- [x] Level 1: Compilation ✅
- [x] Level 2: Smoke Testing ✅
- [ ] Level 3: Integration Testing ⏳ DEFERRED

## What Was Tested (Level 2 ✅)
- Algorithm compiles and runs
- Cache hit/miss logic works with known test data
- Eviction policy (LRU) works correctly
- Unit tests pass with mocked dependencies
- Benchmarked with synthetic data: ~10ms lookup time

## What Was NOT Tested (Level 3 ⏳)
- Integration with real forecast API
- Production-scale data volume (millions of entries)
- Concurrent access patterns
- Cache invalidation in distributed system
- Memory usage under sustained load

## Deferral Justification
**Reason**: This is a proof-of-concept / exploration, not production code yet
**Validation plan**: If PoC is approved, will create full task (IMPLEMENT-CACHE-001) with Level 3 testing
**Risk**: MEDIUM - If deployed without further testing, could cause memory issues or stale data
**Mitigation**: Clearly marked as PoC in code comments, not deployed to production

---

**Verification Level**: Level 2 (Smoke Testing) - PoC only, not production-ready
```

---

## Common Deferrals (Level 3)

**Valid reasons to defer Level 3**:
- **No production credentials available**: Can't test with real API without keys
- **External dependency down**: API under maintenance, can't test integration
- **Depends on incomplete task**: Blocked by another task not done yet
- **PoC/Exploration only**: Not intended for production (yet)
- **Emergency hotfix**: Fix first, validate later (document this explicitly)
- **Low-risk change**: Typo, comment, documentation (minimal production impact)

**NOT valid reasons**:
- "Don't have time" (make time or don't claim done)
- "Seems like it works" (test it)
- "Too hard to test" (find a way or defer the task)

---

## Quick Decision Tree

**Is this production code?**
- **Yes** → Minimum Level 2, Level 3 or explicit deferral required
- **No (PoC/exploration)** → Level 1-2 sufficient, document "not production-ready"

**Is integration critical?**
- **Yes (API, auth, data)** → Level 3 required or explicit deferral
- **No (typo, comment)** → Level 2 sufficient, defer Level 3

**Can I test integration now?**
- **Yes** → Do it (Level 3)
- **No, valid blocker** → Defer with justification
- **No, too lazy** → Not acceptable

---

## Word Count

**Checklist + guidance**: ~450 words
**With examples**: ~1,000 words
**Time to fill out checklist**: 3-5 minutes

---

**Reference**: [VERIFICATION_LEVELS.md](docs/autopilot/VERIFICATION_LEVELS.md) for full level definitions
