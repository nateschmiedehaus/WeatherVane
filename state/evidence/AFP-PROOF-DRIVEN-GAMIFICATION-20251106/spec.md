# Specification: Proof-Driven Development with Psychological Gamification

**Task ID:** AFP-PROOF-DRIVEN-GAMIFICATION-20251106
**Phase:** SPEC
**Date:** 2025-11-06

## Functional Requirements

### FR1: Phase Decomposition System

**Requirement:** Tasks must automatically decompose into sub-phases that each complete independently.

**Components:**
1. **Task Model Extension**
   - Add `phases` array to task schema
   - Each phase has: id, title, type, status, completedAt, result
   - Parent task tracks overall progress (e.g., "4/6 complete")

2. **Phase Types**
   - `implementation`: Write code
   - `discovery`: Run proof, find issues
   - `improvement`: Fix specific issue
   - `verification`: Final proof check
   - `review`: Critic validation

3. **Auto-Generation**
   - When proof finds issues, auto-generate improvement phases
   - Each issue becomes one improvement phase
   - Final verification phase added after all improvements

**Acceptance Criteria:**
- ✅ Task has `phases` array in data model
- ✅ Each phase can complete independently
- ✅ Progress calculated automatically (completed/total)
- ✅ Failed proof auto-generates improvement phases

### FR2: Discovery Reframing

**Requirement:** Failed proof must be presented as positive "discovery" not negative "failure".

**Components:**
1. **Language Changes**
   - "Proof FAILED" → "Discovery phase complete"
   - "Fix errors" → "Apply improvements"
   - "Remediation" → "Improvement opportunity"
   - "Blocked" → "Discovering requirements"

2. **Positive Framing**
   - "Found 3 issues" → "Discovered 3 improvement opportunities"
   - List issues with ✨ icon (opportunity)
   - Emphasize progress: "Great work finding these!"

3. **Status Model**
   - OLD: pending, in_progress, done, blocked, unproven
   - NEW: pending, in_progress, discovering, improving, proven

**Acceptance Criteria:**
- ✅ No negative language in proof failure messages
- ✅ Issues framed as "opportunities" not "failures"
- ✅ Agents receive positive feedback even when proof fails
- ✅ Status names reflect positive progression

### FR3: Progress Visualization

**Requirement:** Agents must see real-time progress with visual feedback.

**Components:**
1. **Progress Bars**
   - ASCII progress bar: ████████░░ 80%
   - Shows completed/total phases
   - Updates in real-time as phases complete

2. **Completion Metrics**
   - "4/6 steps complete"
   - "Recently completed: ✅ Implementation, ✅ Discovery, ✅ Fix #1"
   - "Current step: ⏳ Fixing issue #2"
   - "Next up: ⬜ Fixing issue #3, ⬜ Final verification"

3. **Session Summary**
   - Track completions across all tasks
   - Show total phases completed this session
   - Highlight productivity

**Acceptance Criteria:**
- ✅ Progress bar displayed after each phase completion
- ✅ Completion metrics shown in real-time
- ✅ Session summary available on demand
- ✅ Visual feedback is encouraging and clear

### FR4: Achievement System

**Requirement:** Agents earn achievements for good behavior, especially iteration.

**Components:**
1. **Agent Stats Tracking**
   - Phases completed this session
   - Issues fixed this session
   - Max iterations on single task
   - First-time proven count
   - Total tasks completed

2. **Achievements**
   - 🔬 "Thorough Tester": 3+ proof iterations on one task
   - 🐛 "Bug Hunter": 20+ issues fixed in session
   - 💎 "Perfectionist": First-time proven (all criteria pass on first try)
   - 💪 "Persistent": 5+ iterations until proven
   - 🏆 "Quality Champion": 10+ tasks proven in session

3. **Achievement Display**
   - Unlock notification with icon and description
   - Progress toward next achievement
   - Summary in session stats

**Acceptance Criteria:**
- ✅ Stats tracked across session
- ✅ Achievements unlock when conditions met
- ✅ Notification shown when achievement unlocked
- ✅ Multiple achievements possible per session
- ✅ Achievements reward iteration (not just speed)

### FR5: Auto-Verification System

**Requirement:** Proof must run automatically when agent claims "ready to prove".

**Components:**
1. **Proof Criteria Parser**
   - Read plan.md and extract proof criteria
   - Parse build, test, runtime, integration, manual checks
   - Convert to executable checks

2. **Automated Execution**
   - Run build check: `npm run build`
   - Run test check: `npm test`
   - Run runtime checks if defined
   - Run integration checks if defined
   - Check manual criteria completion

3. **Result Processing**
   - If all pass: mark "proven", generate verify.md
   - If any fail: mark "discovering", generate improvement phases
   - Log all results to analytics

**Acceptance Criteria:**
- ✅ Proof runs automatically (agent doesn't trigger manually)
- ✅ All criteria from plan.md are executed
- ✅ Results are objective (no agent self-assessment)
- ✅ verify.md auto-generated with evidence
- ✅ Failed criteria auto-generate improvement phases

### FR6: Remediation Task Auto-Generation

**Requirement:** Failed proof must auto-create improvement tasks.

**Components:**
1. **Issue Extraction**
   - Parse proof failure output
   - Extract specific failures (build errors, test failures, etc.)
   - Categorize by severity

2. **Improvement Task Generation**
   - Each issue becomes one improvement phase
   - Title: "Improvement: [issue description]"
   - Context: error message, expected vs actual, guidance
   - Link to parent task

3. **Roadmap Integration**
   - Add improvement phases to task
   - Update parent task status to "discovering"
   - Block final verification until improvements complete

**Acceptance Criteria:**
- ✅ Each proof failure generates improvement phase
- ✅ Improvement phases have clear context
- ✅ Phases linked to parent task
- ✅ Final verification blocked until improvements done
- ✅ Agent doesn't manually create remediation tasks

## Non-Functional Requirements

### NFR1: Performance
- Phase completion tracking: <10ms overhead
- Progress bar rendering: <50ms
- Achievement checking: <100ms per phase
- Total overhead per task: <1 second

### NFR2: Usability
- Progress visualization clear and encouraging
- Language consistently positive
- No confusion about "what to do next"
- Achievements feel rewarding not patronizing

### NFR3: Reliability
- Auto-verification never skips checks
- Improvement phases always generated from failures
- Progress tracking never loses state
- Achievement unlocks never miss conditions

### NFR4: Maintainability
- Phase types easily extendable
- Achievement conditions in config (not hardcoded)
- Language reframing centralized (one place to change)
- Proof criteria parser handles new formats

### NFR5: Compatibility
- Works with existing Wave 0 runner
- Integrates with current roadmap.yaml schema
- Backward compatible with tasks without phases
- Can run alongside old verification system during migration

## Acceptance Criteria (Overall)

### Must Have (MVP)
1. ✅ Tasks decompose into phases automatically
2. ✅ Failed proof generates improvement phases automatically
3. ✅ Progress bar shows after each completion
4. ✅ Language is consistently positive (no "failed" messaging)
5. ✅ verify.md auto-generated from proof execution
6. ✅ Achievement system tracks and unlocks rewards

### Should Have (Phase 2)
7. ✅ Session summary shows total productivity
8. ✅ Achievement progress visible ("15/20 fixes to Bug Hunter")
9. ✅ Multiple proof criteria types supported (build, test, runtime, integration)
10. ✅ Manual check tracking for non-automated criteria

### Could Have (Future)
11. ✅ Visual dashboard for achievements
12. ✅ Leaderboard across agents (if multiple agents)
13. ✅ Custom achievement conditions per project
14. ✅ Integration with CI/CD for production feedback

## Success Metrics

### Primary Metrics
- **Verification gap: 78% → 0%** (all tasks have proof)
- **Agent iteration rate: <1 avg → 3+ avg** (embrace iteration)
- **Time to proven: May increase 20-30%** (acceptable for quality)

### Secondary Metrics
- Achievement unlock rate: >50% of sessions unlock ≥1 achievement
- Progress bar engagement: Agents reference progress in messages
- Iteration sentiment: Agents use positive language about iteration
- Proof failure rate: Expect 80%+ initial proof to fail (finding issues is good!)

### Quality Metrics
- Production bug rate: Decrease by 50%+ over 3 months
- Test coverage: Increase to 80%+ for new code
- Edge case coverage: Increase significantly (measurable via test cases)

## Validation Plan

### Unit Testing
- Phase decomposition logic
- Progress calculation
- Achievement condition checking
- Language reframing transformations

### Integration Testing
- Full task lifecycle: pending → discovering → improving → proven
- Multi-iteration workflow
- Achievement unlocking across phases
- verify.md generation from proof results

### Live Testing
- Deploy to Wave 0 with TaskFlow test tasks
- Monitor agent behavior (do they iterate willingly?)
- Track achievement unlocks
- Collect agent feedback (via analytics)

### Success Criteria for Validation
- Wave 0 completes 10 TaskFlow tasks with 0% verification gap
- At least 3 tasks require 3+ iterations (agents don't skip)
- Achievement system unlocks ≥5 achievements across test run
- No agent complaints about "too many steps" in logs

## Out of Scope (This Task)

### Not Included
- Multi-critic validation (Layer 2 defense) - future task
- Production feedback loop (Layer 3) - future task
- Critic training from failures - future task
- Visual dashboard UI - future task
- Integration with external CI/CD - future task

### Rationale
This task focuses on **Layer 1 (structural + psychological foundation)**. Additional layers will be added in subsequent tasks after validation.

## References

- strategy.md: Root cause analysis and approach
- AGENTS.md: Current AFP 10-phase lifecycle
- tools/wvo_mcp/src/wave0/runner.ts: Current Wave 0 implementation
- state/roadmap.yaml: Current task schema
