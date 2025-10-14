# Roadmap Analysis: 25 Proposed Improvements

Analysis of proposed MCP and WeatherVane improvements for roadmap inclusion.

## Executive Summary

**Current Status:**
- ✅ **3 items already complete** (1, 5, 6)
- 🔥 **5 critical items** for Phase-4-POLISH (immediate)
- 🎯 **8 high-value items** for Phase-5-OPTIMIZATION (near-term)
- 📦 **9 future enhancements** (post-launch)

**Recommendation:** Add Phase-4-POLISH and Phase-5-OPTIMIZATION to roadmap immediately. Defer future enhancements until WeatherVane v1 launches.

---

## Domain Separation

| Domain        | Epics                                                                                   | Focus                                                                                         |
|---------------|-----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Product**   | E1, E2, E3, E4, E5, E7, E11                                                             | Weather ingestion, allocator & UX, ad automation, resource-aware UX, overall product polish. |
| **MCP Platform** | E6, E8, E9, E10                                                                       | MCP upgrade governance, guardrails, optimisation, cost telemetry, and orchestration safety.  |

Always bundle MCP-platform epics (notably E6 + E10) together when planning, and stage PHASE‑5 work as PHASE‑5A (post-upgrade) vs PHASE‑5B (post-ads automation) so product delivery can continue in parallel.

---

## ✅ Already Complete (3 items)

### #1: Wire Claude MCP transport ✅
**Status:** DONE
**Evidence:** `index-claude.ts:1233-1234` - Transport connected
**Action:** None needed

### #5: Unify server name/version ✅
**Status:** DONE
**Evidence:** `utils/version.ts` exports `SERVER_NAME` and `SERVER_VERSION`
**Action:** None needed

### #6: Replace private field access with getter ✅
**Status:** DONE
**Evidence:** `orchestrator_runtime.ts:130` - `getAgentPool()` exists
**Action:** None needed

---

## 🔥 PHASE-4-POLISH: Critical for Production (5 items)

Must complete before WeatherVane v1 launch. High impact, moderate effort.

### #2: Register real JSON Schemas **(CANCELLED)**
**Status:** ❌ Cancelled 2025-10-11  
**Reason:** MCP SDK expects Zod raw shapes. Converting to JSON Schema broke tool registration and the TypeScript build.  
**Guardrail:** `utils/schema.ts` must continue returning `schema.shape`; see docs/AUTOPILOT_FIXES.md.

---

### #3: Command allow-list [CRITICAL]
**Effort:** 6 hours
**Impact:** HIGH - Security hardening
**Why now:** Deny-lists are bypassable; production requires allow-list
**Implementation:**
```typescript
// executor/guardrails.ts
const ALLOWED_COMMANDS = [
  'npm', 'git', 'python', 'pytest', 'node', 'tsc',
  'make', 'docker', 'bash', 'sh'
];

function isCommandAllowed(cmd: string): boolean {
  const binary = cmd.split(' ')[0];
  return ALLOWED_COMMANDS.includes(binary);
}
```
**Files:** `executor/guardrails.ts`, `executor/command_runner.ts`
**Recommendation:** ⭐ **ADD TO ROADMAP** - Security requirement

---

### #4: Thread correlation IDs [IMPORTANT]
**Effort:** 3 hours
**Impact:** MEDIUM - Debugging & audit trail
**Why now:** Schema supports it; just wire through call sites
**Implementation:**
- Add `correlationId` param to all `stateMachine` mutating methods
- Generate once per MCP request: `crypto.randomUUID()`
- Thread through `createTask`, `transition`, `logEvent`
**Files:** `state_machine.ts`, all tool handlers
**Recommendation:** ⭐ **ADD TO ROADMAP** - Quick win for observability

---

### #7: Compact evidence-pack prompt mode [HIGH VALUE]
**Effort:** 8 hours
**Impact:** HIGH - 50-70% token reduction
**Why now:** Major cost savings; better context fit
**Implementation:**
```typescript
// orchestrator/context_assembler.ts
formatForPrompt(ctx: AssembledContext, mode: 'verbose' | 'compact'): string {
  if (mode === 'compact') {
    return JSON.stringify({
      task: { id: ctx.taskId, title: ctx.taskTitle },
      decisions: ctx.recentDecisions.map(d => d.id),
      files: ctx.relevantFiles,
      quality_issues: ctx.qualityIssues
    }, null, 2);
  }
  // ... existing verbose markdown
}
```
**Files:** `context_assembler.ts`, `claude_code_coordinator.ts`
**Recommendation:** ⭐ **ADD TO ROADMAP** - Major optimization

---

### #13: Claude↔Codex coordinator failover [FINALIZE]
**Effort:** 4 hours
**Impact:** HIGH - Already 80% done, finish integration
**Why now:** Partial implementation exists; complete the vision
**Implementation:**
- Already have `AgentPool`, `OperationsManager`, `ClaudeCodeCoordinator`
- Add coordinator status to `orchestrator_status` tool
- Expose coordinator type in telemetry
**Files:** `agent_pool.ts`, `operations_manager.ts`, `index-orchestrator.ts`
**Recommendation:** ⭐ **ADD TO ROADMAP** - Finish what we started

---

## 🎯 PHASE-5-OPTIMIZATION: High-Value Enhancements (8 items)

Ship after v1 launch. High ROI, moderate-to-high effort.

### #8: Stable prompt headers [COST OPTIMIZATION]
**Effort:** 4 hours
**Impact:** MEDIUM - Enables provider caching, 50-90% cost reduction
**When:** After PHASE-4 complete
**Implementation:**
```typescript
// utils/prompt_headers.ts
export function standardPromptHeader(ctx: PromptHeaderContext): string {
  const headerLines = [
    `# ${SERVER_NAME} v${SERVER_VERSION}`,
    `Project: ${normalise(ctx.projectName)}`,
    `Phase: ${normalise(ctx.projectPhase)}`,
    `Environment: ${normalise(ctx.environment)}`,
    `Prompt Mode: ${ctx.promptMode === 'verbose' ? 'verbose' : 'compact'}`,
    `Agent Lane: ${canonicalAgentLabel(ctx.agentType)} • ${normalise(ctx.agentRole)}`,
    `Intent: ${INTENT_LABELS[ctx.intent]}`,
  ];

  const guardrails = [
    '- Follow instruction priority: system > developer > user > docs.',
    '- Use MCP tools only; avoid unmanaged shell sessions.',
    '- Keep changes scoped and deterministic; match existing conventions.',
    '- Add or update tests when behaviour changes; document rationale when needed.',
    '- Never store secrets or credentials in the repository.',
  ];

  const delivery = [
    '- Prefer project tooling (e.g. make lint, make test) to verify changes.',
    '- Maintain ASCII output and unified diffs for code edits.',
    '- Keep prompts cache-friendly: avoid timestamps, randomness, or volatile data in headers.',
    '- Final reply must satisfy the codex_output_schema JSON contract.',
  ];

  return [
    headerLines.join('\\n'),
    '',
    '## System Guardrails',
    guardrails.join('\\n'),
    '',
    '## Delivery Expectations',
    delivery.join('\\n'),
  ].join('\\n');
}
```
**Recommendation:** 🎯 **DEFER TO PHASE-6** – Phase-5 optimization is parked; move on to WeatherVane product epics and revisit once we operate on usage-based billing.

---

### #9: Batch queue [PERFORMANCE]
**Effort:** 12 hours
**Impact:** MEDIUM - Smooths bursts, better UX
**When:** When hitting rate limits frequently
**Implementation:**
- Priority queue: `interactive` (p0), `background` (p1), `batch` (p2)
- Semaphore per priority: `interactive: 3, background: 2, batch: 1`
- Tools tag themselves: `fs_write` → interactive, `repo.analyze` → batch
**Recommendation:** 🎯 **ADD TO PHASE-5** - UX improvement

---

### #10: Strict output DSL enforcement [QUALITY]
**Effort:** 6 hours
**Impact:** MEDIUM - Reduces retry loops
**When:** After measuring retry rates
**Implementation:**
```typescript
function validateModelOutput(output: string, expected: 'diff' | 'json'): void {
  if (expected === 'diff' && !output.match(/^diff --git/m)) {
    throw new Error('Invalid diff format');
  }
  if (expected === 'json') {
    JSON.parse(output); // Throws on invalid JSON
  }
}
```
**Recommendation:** 🎯 **ADD TO PHASE-5** - Quality improvement

---

### #11: Idempotency keys [RELIABILITY]
**Effort:** 8 hours
**Impact:** MEDIUM - Safe retries
**When:** When observing duplicate operations
**Implementation:**
- Hash `(tool_name, input_json)` → idempotency key
- Cache results for 1 hour
- Return cached result if key matches
**Recommendation:** 🎯 **ADD TO PHASE-5** - Reliability improvement

---

### #12: OpenTelemetry spans [OBSERVABILITY]
**Effort:** 10 hours
**Impact:** HIGH - Production debugging essential
**When:** Before production launch
**Implementation:**
- Wrap all tool handlers with spans
- Export to Jaeger/DataDog/Honeycomb
- Trace: MCP request → tool → provider call → result
**Recommendation:** 🎯 **ADD TO PHASE-5** - Production requirement

---

### #14: Sandbox pooling [PERFORMANCE]
**Effort:** 16 hours
**Impact:** HIGH - 10x faster test runs
**When:** When test latency becomes bottleneck
**Implementation:**
- Pre-warm 3 sandboxes (bwrap or Docker)
- Pool manager: `acquire()` → `release()`
- Install deps once, COW for test runs
**Recommendation:** 🎯 **ADD TO PHASE-5** - Performance win

---

### #15: SQLite FTS5 index [PERFORMANCE]
**Effort:** 6 hours
**Impact:** MEDIUM - Fast code search
**When:** When context assembly becomes slow
**Implementation:**
```sql
CREATE VIRTUAL TABLE code_fts USING fts5(
  file_path, content, language,
  tokenize='porter unicode61'
);
```
**Recommendation:** 🎯 **ADD TO PHASE-5** - Nice optimization

---

### #16: LSP proxy tools [CONTEXT QUALITY]
**Effort:** 20 hours
**Impact:** HIGH - Much better context selection
**When:** When context relevance is insufficient
**Implementation:**
- Spawn tsserver/pyright in background
- Expose MCP tools: `lsp.definition`, `lsp.references`, `lsp.hover`
- Use in context assembler to fetch symbol-aware slices
**Recommendation:** 🎯 **ADD TO PHASE-5** - Major quality improvement

---

## 📦 Future Enhancements (9 items)

Defer until post-v1. Lower priority or product-specific.

### #17: Replay logs & offline repro [DEBUGGING]
**Effort:** 12 hours
**When:** Post-launch, when debugging production issues

### #18: Concurrency & fairness gates [UX]
**Effort:** 8 hours
**When:** When experiencing head-of-line blocking

### #19: HTN plans + Acceptance DSL [PRODUCT]
**Effort:** 40 hours
**When:** WeatherVane v2 - executable plans

### #20: WSJF + risk prioritization [PRODUCT]
**Effort:** 8 hours
**When:** WeatherVane v2 - intelligent prioritization

### #21: CP-SAT scheduling [PRODUCT]
**Effort:** 24 hours
**When:** WeatherVane v2 - optimal scheduling

### #22: Incremental test selection [PERFORMANCE]
**Effort:** 16 hours
**When:** When test suite becomes slow (>5 min)

### #23: ADRs + changelog + PR coach [DOCS]
**Effort:** 12 hours
**When:** When team grows or handoff needed

### #24: "Missed Opportunity" counterfactual [PRODUCT]
**Effort:** 32 hours
**When:** WeatherVane v2 - sales/demo feature

### #25: Knowledge cards + kb.search [QUALITY]
**Effort:** 16 hours
**When:** When hallucinations become frequent

**Recommendation:** 📦 **DEFER** - Focus on core v1 first

---

## Recommended Roadmap Additions

### Update state/roadmap.yaml:

1. Mark **PHASE-4-POLISH** as `done` (all guardrail hardening work shipped on 2025-10-12).
2. Treat **E6 – MCP Blue/Green Governance** and **E10 – MCP Blue/Green Upgrade** as a single upgrade programme: plan them together, share the same kickoff/retro, and execute back-to-back so flag controls, rollback monitors, and observability land in one window. Update task briefs to reference the joint schedule and avoid double booking.
3. Split **PHASE-5-OPTIMIZATION** deliverables into two clear buckets:
   - **PHASE-5A (post-upgrade)** – caching, batch queue, strict output validation, idempotency keys, and telemetry spans that can ship immediately after the E6/E10 bundle closes.
   - **PHASE-5B (post-ads automation)** – sandbox pooling and advanced FTS5 search which depend on ad execution & workload telemetry; mark them as blocked by both the upgrade bundle and the ad automation epic (E5).
   Reflect these groupings in roadmap task notes so autopilot can prioritise PHASE-5A items first once the upgrade bundle is green.
4. Record the new cost optimization epic under a future phase (see recommendation above).

```yaml
PHASE-4-POLISH:
  title: "MCP Production Hardening"
  status: done
  tasks:
    - id: MCP-4.1
      ...
      status: done
    - id: MCP-4.2
      ...
      status: done
    - id: MCP-4.3
      ...
      status: done
    - id: MCP-4.4
      ...
      status: done
    - id: MCP-4.5
      ...
      status: done

PHASE-5-OPTIMIZATION:
  title: "Performance & Observability Enhancements"
  status: blocked
  blocked_by:
    - E10
  tasks:
    - id: MCP-5.1
      title: "Stable prompt headers with provider caching"
      status: pending
    - id: MCP-5.2
      title: "Batch queue for non-urgent prompts"
      status: pending
    - id: MCP-5.3
      title: "Strict output DSL validation (diff/JSON)"
      status: pending
    - id: MCP-5.4
      title: "Idempotency keys for mutating tools"
      status: pending
    - id: MCP-5.5
      title: "OpenTelemetry spans for all operations"
      status: pending
    - id: MCP-5.6
      title: "Sandbox pooling (bwrap/Docker)"
      status: pending
    - id: MCP-5.7
      title: "SQLite FTS5 index for code search"
      status: pending

PHASE-6-COST:
  title: "Usage-Based Optimisations"
  status: draft
  tasks:
    - id: MCP-6.1
      title: "Cost telemetry & budget guardrails"
      status: planned
```
        - "critic:manager_self_check passes"

    - id: MCP-4.5
      title: "Finalize Claude↔Codex coordinator failover"
      type: task
      status: pending
      estimated_complexity: 4
      exit_criteria:
        - "Coordinator status in orchestrator_status tool"
        - "Telemetry includes coordinator type"
        - "Failover tested and documented"
        - "critic:tests passes"

PHASE-5-OPTIMIZATION:
  title: "Performance & Observability Enhancements"
  status: blocked
  blocked_by:
    - PHASE-4-POLISH
  tasks:
    - id: MCP-5.1
      title: "Stable prompt headers with provider caching"
      type: task
      status: pending
      estimated_complexity: 4

    - id: MCP-5.2
      title: "Batch queue for non-urgent prompts"
      type: task
      status: pending
      estimated_complexity: 12

    - id: MCP-5.3
      title: "Strict output DSL validation (diff/JSON)"
      type: task
      status: pending
      estimated_complexity: 6

    - id: MCP-5.4
      title: "Idempotency keys for mutating tools"
      type: task
      status: pending
      estimated_complexity: 8

    - id: MCP-5.5
      title: "OpenTelemetry spans for all operations"
      type: task
      status: pending
      estimated_complexity: 10

    - id: MCP-5.6
      title: "Sandbox pooling (bwrap/Docker)"
      type: task
      status: pending
      estimated_complexity: 16

    - id: MCP-5.7
      title: "SQLite FTS5 index for code search"
      type: task
      status: pending
      estimated_complexity: 6

    - id: MCP-5.8
      title: "LSP proxy tools (tsserver/pyright)"
      type: task
      status: pending
      estimated_complexity: 20
```

---

## Effort Summary

**Phase-4-POLISH:** 25 hours total (5 days)
- Critical for production readiness
- High ROI per hour invested
- Unblocks WeatherVane v1 launch

**Phase-5-OPTIMIZATION:** 82 hours total (10 days)
- Significant performance gains
- Production observability
- Better context quality

**Future Enhancements:** 168+ hours (21+ days)
- Defer until v2 or post-launch
- Product-specific features
- Lower immediate ROI

---

## Decision Matrix

| Priority | Items | Total Effort | When | Impact |
|----------|-------|--------------|------|--------|
| **Already Done** | 3 | 0 hours | ✅ Complete | - |
| **Phase-4-POLISH** | 5 | 25 hours | Immediate | 🔥 Critical |
| **Phase-5-OPTIMIZATION** | 8 | 82 hours | Post-PHASE-4 | 🎯 High |
| **Future** | 9 | 168+ hours | Post-v1 | 📦 Medium |

---

## Final Recommendation

✅ **Add to roadmap now:**
- PHASE-4-POLISH (all 5 items)
- PHASE-5-OPTIMIZATION (all 8 items)

❌ **Defer:**
- Items #17-25 (Future Enhancements)
- Revisit after WeatherVane v1 launches

🎯 **Rationale:**
- Phase-4 items are critical for production safety & compliance
- Phase-5 items deliver major performance/cost improvements
- Future items are valuable but not blockers
- Total investment: 107 hours (~2.5 weeks) for massive ROI

The self-improvement system can execute these autonomously once added to roadmap!
