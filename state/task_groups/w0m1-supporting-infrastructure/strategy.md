# STRATEGY: w0m1-supporting-infrastructure

**Set ID:** w0m1-supporting-infrastructure
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Supervisor and agents (Set A) provide orchestration, but they need supporting systems to function effectively:
- **Shared libraries:** Common utilities reused across agents (logging, file I/O, validation)
- **Adapters:** Interface to external systems (MCP, roadmap, git, critics)
- **Dynamic Prompt System (DPS):** Context-aware prompts for agent decision-making
- **Memory Core:** Agent context persistence and retrieval

**Current state:**
- Utilities scattered across codebase (duplication)
- No clean adapter layer (agents directly call external systems)
- Static prompts (not context-aware)
- No memory system (agents start from scratch every time)

**Pain points:**
1. **Code duplication** - Every agent reimplements file I/O, logging, validation
2. **Tight coupling** - Agents directly depend on external system APIs (hard to test, brittle)
3. **Context-blind decisions** - Agents don't adapt behavior based on history
4. **No memory** - Agents lose context between tasks (can't learn)

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Rapid MVP development led to inline implementations
- No time to extract common patterns into libraries
- Direct dependencies easier short-term than adapter pattern
- Memory/prompts deferred as "nice to have"

**Systemic:**
- No clear separation of concerns (business logic mixed with infrastructure)
- Missing abstraction layers
- No design review enforcing patterns

**The core issue:** **Infrastructure sprawl - every component reinvents infrastructure instead of reusing foundation**

---

## Goal / Desired Outcome

**Build reusable infrastructure layer:**

### 1. Shared Libraries Operational
- Common utilities extracted: logging, file I/O, validation, error handling
- Type-safe interfaces
- Unit tested independently
- Documented with examples

**Measurable:** Agents import @wvo/libs, 0 duplicated utility code

### 2. Adapters Operational
- Clean interfaces to external systems: MCP, roadmap, git, critics
- Adapters isolate external dependencies
- Easy to mock for testing
- Consistent error handling

**Measurable:** Agents use adapters, 0 direct external system calls

### 3. Dynamic Prompt System Operational
- Context-aware prompts adjust to situation
- Template library for common patterns
- Variables populated from context (task type, history, constraints)
- Versioned prompt storage

**Measurable:** Agents request prompts from DPS, prompts include context variables

### 4. Memory Core Operational
- Agent working memory (current task context)
- Short-term memory (recent task history)
- Long-term memory (learned patterns, decisions)
- Query interface (retrieve relevant context)

**Measurable:** Agents read/write memory, memory persists between tasks

---

## Strategic Urgency

**Why now?**

1. **Unblocks agents** - Set A created agents, but they need infrastructure to be effective
2. **Prevents technical debt** - Extract now before duplication spreads further
3. **Enables evolution** - DPS and memory enable agents to improve over time
4. **Testing foundation** - Adapters enable comprehensive testing (Set C needs this)

**Without this work:**
- Agents functional but primitive (no context, no learning)
- Code duplication compounds
- Hard to test (no adapters to mock)
- Agent capabilities plateau (no memory/dynamic prompts)

**With this work:**
- Agents context-aware and adaptive
- Clean architecture (reusable infrastructure)
- Easy to test (adapter pattern)
- Agent capabilities can evolve (memory + learning)

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Duplicated utility code → single shared library
- Direct external system calls → adapter layer
- Hardcoded prompts → dynamic generation
- Context-less agents → memory-backed agents

**What are we ADDING?**
- Shared libraries (~500 LOC)
- Adapters (~400 LOC)
- DPS (~300 LOC)
- Memory core (~400 LOC)

**Is the addition justified?**
- **Yes:** Eliminates duplication (deletes more than adds over time)
- **Yes:** Enables testing (adapters mockable)
- **Yes:** Enables learning (memory + DPS)
- **Yes:** Foundation for all future agents

### COHERENCE (Match Terrain)

**Reusing proven patterns:**
- Adapter pattern (Gang of Four)
- Repository pattern (DDD - memory storage)
- Template method (DPS prompt generation)
- Utility library (standard practice - lodash, etc.)

### LOCALITY (Related near)

**Related work together:**
- All libraries in `tools/wvo_mcp/src/libs/`
- All adapters in `tools/wvo_mcp/src/adapters/`
- DPS in `tools/wvo_mcp/src/dps/`
- Memory in `tools/wvo_mcp/src/memory/`

### VISIBILITY (Important obvious)

**Critical structure explicit:**
- Adapters make external dependencies obvious (explicit interface)
- Libraries make reusable utilities obvious (exported from @wvo/libs)
- DPS makes prompt logic obvious (separate from business logic)
- Memory makes context obvious (explicit storage)

### EVOLUTION (Fitness)

**This work enables evolution:**
- Libraries extend with new utilities (modular)
- Adapters add new systems (pluggable)
- DPS adds new prompt patterns (template library)
- Memory adds new indexing (queryable)

---

## Alternatives Considered

### Alternative 1: Skip Infrastructure, Build in Agents
**Approach:** Each agent implements what it needs inline

**Rejected because:**
- Massive duplication (N agents × M utilities)
- Hard to test (mocking scattered throughout)
- Inconsistent patterns (every agent different)
- Technical debt accumulates

### Alternative 2: Use External Libraries (lodash, etc.)
**Approach:** Import npm packages for utilities

**Rejected because:**
- Generic libraries don't fit WeatherVane domain
- Increases dependencies (security, maintenance)
- Doesn't solve adapters/DPS/memory
- Loss of control

### Alternative 3: Build Everything at Once
**Approach:** Complete infrastructure layer before any agents

**Rejected because:**
- Delays agent development (blocks progress)
- Risk of over-engineering (YAGNI)
- Can't validate until used by real agents

### Selected: Build Infrastructure Alongside Agents (MVP Approach)

**Why:**
- **Just enough** - Only what agents need now
- **Validated** - Real usage drives requirements
- **Incremental** - Can extend as agents evolve
- **Pragmatic** - Balances speed and quality

---

## Success Criteria

**Set complete when:**

### Libraries Functional
- [ ] Common utilities extracted (logging, file I/O, validation, error handling)
- [ ] Type-safe interfaces (TypeScript)
- [ ] Unit tests pass (100% coverage for libs)
- [ ] Documentation complete (README + JSDoc)
- [ ] Agents using libraries (0 duplicated code)

### Adapters Functional
- [ ] MCP adapter (tool calls, responses)
- [ ] Roadmap adapter (read/write tasks)
- [ ] Git adapter (status, commit, push)
- [ ] Critic adapter (run critics, parse results)
- [ ] Easy to mock (interfaces, not implementations)
- [ ] Agents using adapters (0 direct calls)

### DPS Functional
- [ ] Prompt templates defined (agent roles, task types)
- [ ] Context variables populated (task, history, constraints)
- [ ] Prompt versioning (track changes)
- [ ] Query interface (getPrompt(role, context))
- [ ] Agents requesting prompts from DPS

### Memory Functional
- [ ] Working memory (current task context)
- [ ] Short-term memory (recent 10 tasks)
- [ ] Long-term memory (learned patterns)
- [ ] Query interface (getContext(task), storeContext(task, context))
- [ ] Agents reading/writing memory

---

## Risks and Mitigations

### Risk 1: Over-Engineering Infrastructure
- **Threat:** Build too much, YAGNI violations, wasted time
- **Mitigation:** MVP approach (only what agents need now)
- **Mitigation:** Real usage drives design (validate with agents)
- **Mitigation:** Simple interfaces (extend later if needed)

### Risk 2: Adapter Performance Overhead
- **Threat:** Adapter layer adds latency
- **Mitigation:** Benchmark (ensure <10ms overhead)
- **Mitigation:** Optimize hot paths (caching)
- **Mitigation:** Async by default (non-blocking)

### Risk 3: Memory Storage Scalability
- **Threat:** Memory grows unbounded, performance degrades
- **Mitigation:** Retention policy (archive old memories)
- **Mitigation:** Indexing (fast queries)
- **Mitigation:** Tiered storage (working/short-term/long-term)

### Risk 4: DPS Prompt Quality
- **Threat:** Dynamic prompts worse than handcrafted
- **Mitigation:** Template library with good examples
- **Mitigation:** Prompt versioning (track what works)
- **Mitigation:** A/B testing (future: compare prompt effectiveness)

---

## Estimated Effort

**Shared libraries:** 6 hours (extract utilities, unit tests, docs)
**Adapters:** 8 hours (4 adapters × 2 hours each)
**DPS:** 6 hours (template system, context population)
**Memory core:** 8 hours (storage, query interface, retention)

**Total:** ~28 hours

**Deliverables:**
- 4 tasks completed (tasks 6, 7, 10, 11 from W0.M1)
- Shared libraries operational
- Adapters operational
- DPS operational
- Memory core operational

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md (define acceptance criteria precisely)
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M1-MVP-LIBS-SCAFFOLD, AFP-W0-M1-MVP-ADAPTERS-SCAFFOLD, AFP-W0-M1-DPS-BUILD, AFP-W0-M1-MEMORY-CORE
