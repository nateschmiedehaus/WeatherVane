# REVIEW: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: REVIEW

---

## Review Scope

This is an **adversarial review** of the research and design work. Goal: Challenge assumptions, identify gaps, assess quality.

**Reviewing**:
- Design soundness (framework architecture)
- Completeness (are all 33 critics addressable?)
- Feasibility (can follow-up implementation succeed?)
- Risk assessment (what can go wrong?)

**Recommendation**: APPROVE / REVISE / REJECT

---

## Design Quality Assessment

### 1. Framework Architecture (Score: 8/10)

#### Strengths ✅

**1.1 Template Method Pattern** (implementation.md lines 33-52)
- Clear lifecycle: captureArtifacts → analyzeArtifacts → formatReport
- Minimal interface: only 2 abstract methods required
- Reusable infrastructure: artifact management, error handling, scoring

**1.2 Graceful Error Handling** (implementation.md lines 122-135)
- Never throws, always returns report
- Errors converted to issues with suggestions
- Non-blocking for critic framework

**1.3 Session Isolation** (implementation.md lines 141-148)
- Unique session ID per run
- Prevents race conditions
- Clean separation of artifacts

#### Weaknesses ⚠️

**1.1 Framework Complexity Risk** (THINK line 353-368)
- BaseObserver is ~400 lines (PLAN line 18)
- Concerns:
  - **Q**: Is this too complex for initial adopters?
  - **A**: Mitigated by templates and examples, but still a learning curve

**1.2 Python Subprocess Overhead** (implementation.md lines 73, 935-1021)
- Data observer spawns Python script
- Performance observer uses flamegraph.pl
- Concerns:
  - **Q**: Will subprocess spawn latency be acceptable?
  - **A**: Time budgets account for this (3-5 minutes), but adds complexity

**1.3 No Async Execution** (THINK line 357-380)
- All observations run synchronously
- Concerns:
  - **Q**: Will this block autopilot for 10+ minutes (infra tests)?
  - **A**: Deferred to Phase 2, acceptable for Phase 1

**Assessment**: Architecture is sound but introduces learning curve. Mitigations in place.

**Recommendation**: ✅ APPROVE with monitoring

---

### 2. Domain Coverage (Score: 9/10)

#### Strengths ✅

**2.1 All 5 Domains Designed**
- API: Latency, errors, load testing ✅
- Database: Query profiling, N+1 detection ✅
- Performance: CPU, memory, flamegraphs ✅
- Data: Drift, leakage, distributions ✅
- Infrastructure: Chaos tests, failover ✅

**2.2 Domain-Specific Observable Artifacts**
- Each domain has clear "what to observe" guidance
- Examples: API traces, EXPLAIN plans, CPU profiles, KL divergence, recovery time

**2.3 Configuration Flexibility** (implementation.md lines 220-336)
- Per-domain thresholds
- Sensible defaults
- Override mechanism

#### Weaknesses ⚠️

**2.1 Domain Expertise Required** (THINK line 369-399, SPEC line 357-361)
- Statistical tests (KL divergence, residual analysis) require ML knowledge
- Query optimization (index suggestions) requires DB knowledge
- Concerns:
  - **Q**: Can implementers without domain expertise succeed?
  - **A**: Start simple (basic heuristics), iterate. Risk accepted in THINK.

**2.2 No UX/Product Domain**
- PLAN Phase 4 defers UX observation (lines 314-348)
- Concerns:
  - **Q**: Are we leaving critical domains unobserved?
  - **A**: 33 affected critics include UX critics, but Phase 4 is medium priority

**Assessment**: Domain coverage is comprehensive for high-priority areas. UX deferred but planned.

**Recommendation**: ✅ APPROVE

---

### 3. Configuration Schema (Score: 9/10)

#### Strengths ✅

**3.1 Zod Validation** (implementation.md lines 152-347)
- Runtime type safety
- Clear error messages
- TypeScript type generation

**3.2 Discriminated Union** (implementation.md line 343)
- `domain` field determines schema type
- Type-safe, compile-time checked

**3.3 Sensible Defaults** (implementation.md lines 168-175)
- timeout_ms: 60000 (1 minute)
- capability_profile: 'standard'
- retention_days: 7

**3.4 Examples Match Schemas** (verify.md lines 126-165)
- YAML examples validated against Zod schemas
- All fields consistent

#### Weaknesses ⚠️

**3.1 No Schema Versioning** (Gap)
- What happens when schema changes?
- Old configs will break if fields are removed
- Concerns:
  - **Q**: How do we handle schema evolution?
  - **A**: Not addressed in design. **MINOR GAP**

**Mitigation**: Add `schema_version` field to BaseConfigSchema

**3.2 No Config Hot-Reload** (Out of scope, but worth noting)
- Changing config requires restart
- Acceptable for Phase 1

**Assessment**: Schema design is strong. Minor gap on versioning.

**Recommendation**: ✅ APPROVE with suggested fix

---

### 4. Migration Templates (Score: 8/10)

#### Strengths ✅

**4.1 Step-by-Step Template** (implementation.md lines 1117-1264)
- 6 clear steps
- Before/After code examples
- Test commands provided

**4.2 Quick Reference** (implementation.md lines 1266-1313)
- One-page format
- Time estimates (30 min to 4 hours)

**4.3 Copy-Paste Ready**
- Code snippets are complete
- TypeScript syntax valid

#### Weaknesses ⚠️

**4.1 No Troubleshooting Section** (Gap)
- What if observation fails?
- What if config validation fails?
- Concerns:
  - **Q**: Will developers get stuck on common issues?
  - **A**: **MINOR GAP** - Should add troubleshooting FAQ

**Suggested Additions**:
- "Observer fails with ENOENT" → Check dependencies installed
- "Config validation error" → Check YAML syntax, field types
- "Observation times out" → Increase timeout_ms or skip with SKIP flag

**4.2 No Windows Support** (THINK line 96-111)
- Templates assume Bash
- Concerns:
  - **Q**: What about Windows developers?
  - **A**: Documented limitation (severity: medium). Acceptable.

**Assessment**: Templates are actionable. Minor gap on troubleshooting.

**Recommendation**: ✅ APPROVE with suggested additions

---

### 5. Implementation Feasibility (Score: 7/10)

#### Strengths ✅

**5.1 Time Estimates Realistic** (PLAN lines 142-177)
- Phase 1: 16-20 hours (foundation)
- Phase 2: 24-30 hours (API, Perf, DB)
- Total: 92-118 hours
- Based on forecast_stitch precedent (STRATEGIZE line 22)

**5.2 Phased Approach** (PLAN lines 137-177)
- Phase 1 unblocks Phases 2-5
- Phases 2-5 can run in parallel
- Mitigates risk of monolithic implementation

**5.3 Prior Art Referenced** (STRATEGIZE lines 20-31)
- forecast_stitch pattern proven successful
- Python monitoring scripts exist

#### Weaknesses ⚠️

**5.1 No Prototype/Proof-of-Concept** (Gap)
- Design is untested
- Concerns:
  - **Q**: Will BaseObserver interface work in practice?
  - **A**: **MODERATE GAP** - Recommend quick PoC before full implementation

**Mitigation**: Implement APIObserver first (Phase 2, highest priority), validate framework

**5.2 Python Dependencies Not Documented** (Gap)
- Data observer needs: pandas, matplotlib, scipy
- Performance observer needs: flamegraph.pl
- Concerns:
  - **Q**: How do we ensure dependencies are installed?
  - **A**: **MINOR GAP** - Document in README or config dependencies field

**Mitigation**: Add `dependencies` array to config schema (implementation.md line 183)

**5.3 No Integration Tests** (Out of scope for research task)
- Can't verify BaseObserver works with critic framework
- Acceptable for research phase, but risk for implementation phase

**Assessment**: Implementation is feasible but carries risk without PoC.

**Recommendation**: ✅ APPROVE with PoC recommendation

---

### 6. Risk Assessment (Score: 8/10)

#### Addressed Risks ✅

**6.1 Framework Complexity** (THINK line 353-368)
- Mitigation: Minimal interface (2 methods), templates, examples
- Status: ✅ Mitigated

**6.2 Domain Expertise Gaps** (THINK line 369-399)
- Mitigation: Start simple, iterate, copy existing patterns
- Status: ✅ Accepted risk with mitigation

**6.3 Performance Overhead** (THINK line 401-416)
- Mitigation: Time budgets, capability profiles, async in Phase 2
- Status: ✅ Mitigated

**6.4 Artifact Disk Bloat** (THINK line 418-454)
- Mitigation: 7-day cleanup, 100MB limits, compression
- Status: ✅ Mitigated

#### Unaddressed Risks ⚠️

**6.1 Schema Evolution** (Gap from Section 3)
- Risk: Breaking changes to config schema
- Impact: Old configs break, manual migration required
- Severity: Medium
- **Recommendation**: Add schema versioning

**6.2 Integration Failures** (Gap)
- Risk: BaseObserver doesn't integrate with existing critic framework
- Impact: Framework redesign required
- Severity: High
- **Recommendation**: Validate with PoC before full implementation

**6.3 Multi-Agent Coordination** (THINK line 512-524, deferred)
- Risk: Two agents run same observer simultaneously
- Impact: Race conditions, corrupted artifacts
- Severity: Low (session isolation mitigates most issues)
- **Recommendation**: Acceptable for Phase 1, add locks in Phase 2 if needed

**Assessment**: Most risks mitigated. Two minor gaps identified.

**Recommendation**: ✅ APPROVE with gap fixes

---

## Adversarial Questioning

### Question 1: Is the framework over-engineered?

**Challenge**: Do we really need a full framework? Why not just implement 33 individual scripts (forecast_stitch pattern)?

**Answer from STRATEGIZE** (lines 84-135):
- Individual scripts: 2-3 hours × 33 critics = 66-99 hours
- Framework approach: 16-20 hours (foundation) + 76-98 hours (observers) = 92-118 hours
- Cost is similar, but framework provides:
  - Consistent reporting
  - Shared artifact management
  - Easier maintenance (DRY principle)

**Verdict**: Framework is justified by consistency and maintainability benefits.

---

### Question 2: Will developers actually use the migration templates?

**Challenge**: Templates are comprehensive, but will developers follow 6-step process? Or will they copy-paste and hack?

**Evidence**:
- Forecast stitch pattern worked (STRATEGIZE line 22)
- Templates provide before/after examples
- Quick reference card for rapid lookup

**Concerns**:
- No enforcement mechanism (developers can skip steps)
- No automated migration script

**Verdict**: Templates are necessary but not sufficient. Recommend:
- Add CI check: Warn if critic returns null command()
- Track migration progress: Dashboard showing 0/33 → 33/33 progress

---

### Question 3: Are time budgets realistic?

**Challenge**: SPEC line 270-275 sets budgets:
- API: <2 minutes
- Database: <1 minute
- Performance: <5 minutes
- Data: <3 minutes
- Infrastructure: <10 minutes

**Are these achievable?**

**Evidence**:
- Forecast stitch runs in ~30 seconds (based on CRIT-PERF-FORECASTSTITCH-RESOLUTION.md)
- API load test: 30s × 50 concurrent = realistic
- Database EXPLAIN: ~1-5s per query, 10 queries = <1 min ✅
- Performance profiling: 60s sample + 10s flamegraph = <2 min ✅
- Data drift: Depends on dataset size (could exceed 3 min for large data)

**Concerns**:
- Data observer may need >3 minutes for large datasets
- Infrastructure chaos tests may need >10 minutes for full recovery

**Verdict**: Budgets are reasonable for most cases. Recommend:
- Make timeouts configurable per critic
- Add SKIP mode for low capability profile

---

### Question 4: What about the 33 affected critics?

**Challenge**: Design assumes all 33 critics fit one of 5 domains. Is this true?

**Evidence from STRATEGIZE** (lines 38-46):
- performance_observation.ts → Performance domain ✅
- api_observation.ts → API domain ✅
- database_observation.ts → Database domain ✅
- data_observation.ts → Data domain ✅
- infrastructure_observation.ts → Infrastructure domain ✅

**But also mentioned** (PLAN line 242):
- "design_system" critic → UX domain (deferred to Phase 4)
- "org_pm" critic → Process domain (may not fit any domain)

**Concerns**:
- Are there critics that don't fit any of the 5 domains?
- What happens to them?

**Verdict**: Most critics fit 5 domains. Outliers can:
- Use BaseObserver with custom logic
- Remain with `return null` if not critical
- Create new domain in Phase 5 (Infrastructure/Meta)

---

### Question 5: Is the design too coupled to forecast_stitch pattern?

**Challenge**: Design heavily references forecast_stitch as prior art. Is this limiting innovation?

**Evidence**:
- forecast_stitch uses Python script + JSON output (STRATEGIZE line 54)
- BaseObserver uses similar pattern but generalizes it
- Domain-specific logic is pluggable

**Differences from forecast_stitch**:
- forecast_stitch: Single-purpose script
- BaseObserver: Generic framework with plugins

**Verdict**: Pattern is reused, but framework generalizes it appropriately. Not over-coupled.

---

## Gaps Identified

### Gap 1: Schema Versioning (Priority: Medium)

**Issue**: No `schema_version` field in config schema

**Impact**: Breaking changes to schema will break old configs

**Recommendation**:
```typescript
const BaseConfigSchema = z.object({
  schema_version: z.string().default('1.0.0'),
  criticName: z.string(),
  // ... rest of schema
});
```

**Severity**: Medium (will bite us during schema evolution)

---

### Gap 2: No Proof-of-Concept (Priority: High)

**Issue**: Design is untested, BaseObserver interface unvalidated

**Impact**: Risk of framework redesign if interface doesn't work in practice

**Recommendation**: Implement APIObserver first (Phase 2, highest priority) to validate framework before implementing other domains

**Severity**: High (could delay entire implementation)

---

### Gap 3: Python Dependencies Undocumented (Priority: Low)

**Issue**: Data/Performance observers need Python packages (pandas, matplotlib, scipy)

**Impact**: Observations will fail if dependencies missing

**Recommendation**: Document in README or add `dependencies` field to config with installation instructions

**Severity**: Low (easy to fix, covered by pre-flight checks)

---

### Gap 4: No Troubleshooting Guide (Priority: Low)

**Issue**: Migration templates don't include troubleshooting

**Impact**: Developers may get stuck on common issues

**Recommendation**: Add troubleshooting FAQ to MIGRATION_TEMPLATE.md

**Severity**: Low (can be added iteratively)

---

## Strengths Summary

1. ✅ **Comprehensive Design**: All 5 domains fully designed
2. ✅ **Clear Architecture**: BaseObserver pattern is sound
3. ✅ **Actionable Templates**: Step-by-step migration guide
4. ✅ **Risk Mitigation**: Most risks identified and mitigated
5. ✅ **Phased Approach**: Enables parallel implementation
6. ✅ **Prior Art**: Leverages proven forecast_stitch pattern
7. ✅ **Documentation**: 3,094 lines of high-quality docs
8. ✅ **Configuration**: Zod schemas with validation
9. ✅ **Graceful Degradation**: Error handling, no blocking failures
10. ✅ **Extensibility**: Easy to add new domains

---

## Weaknesses Summary

1. ⚠️ **No PoC**: Design untested, interface unvalidated
2. ⚠️ **Schema Versioning Gap**: Config evolution not addressed
3. ⚠️ **Domain Expertise**: Initial observations may be shallow
4. ⚠️ **Python Dependencies**: Undocumented, may cause failures
5. ⚠️ **No Async Execution**: May block autopilot for long observations
6. ⚠️ **Learning Curve**: Framework complexity may slow adoption

---

## Quality Score

**Overall Design Quality**: 8.2/10

**Breakdown**:
- Framework Architecture: 8/10
- Domain Coverage: 9/10
- Configuration Schema: 9/10
- Migration Templates: 8/10
- Implementation Feasibility: 7/10
- Risk Assessment: 8/10

**Justification**:
- Strong foundation (8-9/10 in most areas)
- Main concern: No PoC to validate interface (lowers feasibility score)
- Minor gaps addressable in follow-up

---

## Recommendation

### ✅ **APPROVE WITH CONDITIONS**

**Conditions**:

1. **MUST: Implement PoC (APIObserver)** (Phase 2 start)
   - Validate BaseObserver interface works with critic framework
   - Verify reporting format integrates with state management
   - Time estimate: 8-10 hours
   - Rationale: Mitigates implementation feasibility risk

2. **SHOULD: Add schema versioning** (Phase 1)
   - Add `schema_version` field to BaseConfigSchema
   - Time estimate: 1 hour
   - Rationale: Prevents future breaking changes

3. **SHOULD: Document Python dependencies** (Phase 1)
   - Create deps/requirements.txt or document in README
   - Time estimate: 1 hour
   - Rationale: Prevents observation failures

4. **COULD: Add troubleshooting FAQ** (Phase 2)
   - Extend MIGRATION_TEMPLATE.md with common issues
   - Time estimate: 2 hours
   - Rationale: Improves developer experience

**Total Condition Cost**: 12-14 hours (acceptable overhead for 92-118 hour project)

---

## Next Steps

1. **PR Phase**: Create evidence commit with all documentation
2. **MONITOR Phase**: Document completion summary
3. **Follow-Up Task**: Create CRIT-PERF-GLOBAL-9dfa06.2 (Implement framework + PoC)

---

## Comparison to Prior Art

### IMP-FUND-05 (Playwright Guard) Review

From `state/evidence/IMP-FUND-05-playwright-guard/review.md`:
- **Quality Score**: 8.5/10
- **Recommendation**: APPROVE with Minor Follow-Ups
- **Gaps**: Documentation (medium), Network error testing (low)

### This Task (CRIT-PERF-GLOBAL-9dfa06.1) Review

- **Quality Score**: 8.2/10
- **Recommendation**: APPROVE WITH CONDITIONS
- **Gaps**: No PoC (high), Schema versioning (medium), Dependencies (low)

**Comparison**:
- IMP-FUND-05 had implementation + testing (higher confidence)
- CRIT-PERF-GLOBAL-9dfa06.1 is design-only (requires PoC validation)
- Both have ~8/10 scores with minor gaps
- This task has larger scope (5 domains vs 1 guard script)

---

## Learnings

### Learning 1: Design-Only Tasks Need PoC Validation

**Issue**: Research task designed framework without implementation
**Risk**: Interface may not work in practice

**Prevention**: Always pair research tasks with small PoC implementation (e.g., Phase 1 + one domain observer)

**Applicability**: All future research/design tasks

---

### Learning 2: Schema Versioning Should Be Default

**Issue**: Config schema has no versioning
**Risk**: Breaking changes will break old configs

**Prevention**: Add `schema_version` field to all config schemas from day 1

**Applicability**: All configuration systems

---

### Learning 3: Python Integration Needs Dependency Docs

**Issue**: Python scripts need packages, but not documented
**Risk**: "ModuleNotFoundError" at runtime

**Prevention**: Always document Python dependencies in requirements.txt or README

**Applicability**: All Python integrations

---

## References

- **STRATEGIZE**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/strategize.md`
- **SPEC**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/spec.md`
- **PLAN**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/plan.md`
- **THINK**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/think.md`
- **IMPLEMENT**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/implementation.md`
- **VERIFY**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/verify.md`
- **Adversarial Review Guide**: `docs/autopilot/Adversarial-Review.md`
- **Prior Art**: `state/evidence/IMP-FUND-05-playwright-guard/review.md`
