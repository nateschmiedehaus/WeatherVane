# Phase 1 – Model Lockdown & Router Policy: Gap Analysis

**Status**: In Progress
**Date**: 2025-10-26
**Owner**: Claude Council

## Phase 1 Requirements (from RECOVERY_PLAYBOOK.md)

1. **Discovery/catalog** – Implement `model_discovery.ts`, emitting allow-listed catalog JSON per run
2. **router_policy.ts** – Central table for capability priorities, escalation thresholds, fallback rules
3. **Router hardening** – Consume policy module, enforce allow-list, log every decision, add fast_code/long_context/cheap_batch escalation heuristics
4. **Tests** – Vitest suites for discovery filtering + router ranking

## Current State Analysis

### ✅ COMPLETE

| Component | Status | Evidence |
|-----------|--------|----------|
| `router_lock.ts` | ✅ Complete | Defines allow-lists, ban-lists, guard assertions (lines 1-51) |
| `model_policy.yaml` | ✅ Complete | Full catalog with capability tags, routing, escalation (lines 1-98) |
| `router_policy.ts` | ✅ Complete | Loads YAML, normalizes capabilities, thresholds (lines 1-188) |
| `model_discovery.ts` (orchestrator) | ✅ Complete | Discovery with allow-list guards, ban detection (lines 1-220) |
| `model_router.ts` | ✅ Complete | Router with policy consumption, escalation, logging (lines 1-759) |
| `MODEL_ROUTING_POLICY.md` | ✅ Complete | Comprehensive documentation (lines 1-65) |
| Router lock enforcement tests | ✅ Complete | `router_lock_enforcement.test.ts` validates policy/lock sync |
| Router policy guard tests | ✅ Complete | `router_policy_guard.test.ts` blocks hard-coded models |
| Router policy load tests | ✅ Complete | `router_policy.test.ts` validates YAML parsing |

### ⚠️ GAPS IDENTIFIED

| Gap | Priority | Impact | Blocker? |
|-----|----------|--------|----------|
| No tests for `model_discovery.ts` | HIGH | Can't verify discovery filtering, ban detection | ❌ No |
| No tests for `model_router.ts` | HIGH | Can't verify ranking, escalation, circuit-breaker logic | ❌ No |
| Router decision logging not traced to OTEL | MEDIUM | Telemetry gaps in decision journal | ❌ No |
| No integration test for discovery→router flow | MEDIUM | End-to-end validation missing | ❌ No |

## Required Work Items

### 1. Create comprehensive tests for `model_discovery.ts`

**Acceptance Criteria:**
- ✅ Test allow-list filtering (banned models rejected)
- ✅ Test ban detection (Google/xAI env vars trigger guards)
- ✅ Test catalog output format (schema validation)
- ✅ Test fallback notes when SDK unavailable
- ✅ Test resource URI generation
- ✅ Test run ID normalization
- ✅ All tests pass with 0 errors

**Files to Create:**
- `tools/wvo_mcp/src/orchestrator/__tests__/model_discovery.test.ts`

### 2. Create comprehensive tests for `model_router.ts`

**Acceptance Criteria:**
- ✅ Test model ranking (reasoning > code > context > latency > price)
- ✅ Test capability tag resolution (state → tags)
- ✅ Test escalation (verify failures → reasoning_high)
- ✅ Test circuit breaker (provider cooldown)
- ✅ Test long context threshold enforcement
- ✅ Test fast_code escalation based on file count
- ✅ Test decision logging
- ✅ Test catalog loading (discovery vs policy fallback)
- ✅ Test allow-list enforcement
- ✅ All tests pass with 0 errors

**Files to Create:**
- `tools/wvo_mcp/src/orchestrator/__tests__/model_router.test.ts`

### 3. Enhance router decision logging

**Acceptance Criteria:**
- ✅ Router emits structured logs with taskId, state, tags, model, provider
- ✅ Decision logger callback is invoked with complete RouterDecisionLog
- ✅ Verify logs can be traced to OTEL spans (optional integration)

**Files to Modify:**
- `tools/wvo_mcp/src/orchestrator/model_router.ts` (already logs at line 399-408)
- No changes needed unless OTEL integration is required

### 4. Create integration test (discovery → router → decision)

**Acceptance Criteria:**
- ✅ Test end-to-end flow: discovery → catalog → router → pickModel
- ✅ Verify allow-list enforced throughout pipeline
- ✅ Verify decision log captures source (discovery vs policy)

**Files to Create:**
- `tools/wvo_mcp/src/orchestrator/__tests__/model_routing_integration.test.ts`

## Verification Checklist

Before marking Phase 1 complete:

- [ ] All tests created and passing
- [ ] Build completes with 0 errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] No audit vulnerabilities (`npm audit`)
- [ ] Documentation updated (already complete)
- [ ] Decision journal entry created

## Timeline Estimate

- **model_discovery.test.ts**: 30 minutes
- **model_router.test.ts**: 45 minutes
- **Integration test**: 20 minutes
- **Verification loop**: 15 minutes
- **Total**: ~2 hours

## Dependencies

- None (all infrastructure exists)

## Risks

- Low: Infrastructure is complete, only testing/validation needed

## Success Metrics

- Phase 1 requirements 100% complete
- Test coverage for router system ≥ 80%
- All verification checks pass
- Zero hard-coded model references outside router system
