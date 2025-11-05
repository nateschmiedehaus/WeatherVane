# COMPLETE SYSTEM INVENTORY: Critic Architecture

**Task:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Purpose:** Exhaustive inventory of all design points, connection points, and system perspectives

---

## 1. COMPLETE CRITIC INVENTORY (46 Implementations)

### 1.1 Simple Shell Critics (8 critics, ~150 LOC total)

| # | Critic | File | LOC | Command | Profile Variance |
|---|--------|------|-----|---------|------------------|
| 1 | build | build.ts | 10 | `make lint` | ❌ Same for all |
| 2 | tests | tests.ts | 7 | `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` | ❌ Same for all |
| 3 | security | security.ts | ~50 | `npm audit` | ✅ low/medium/high |
| 4 | typecheck | typecheck.ts | ~50 | `tsc --noEmit` | ❌ Same for all |
| 5 | data_quality | data_quality.ts | ~30 | Shell script | Unknown |
| 6 | leakage | leakage.ts | ~20 | Validation script | Unknown |
| 7 | causal | causal.ts | ~20 | Causal analysis | Unknown |
| 8 | allocator | allocator.ts | ~20 | Allocator check | Unknown |

### 1.2 Observation Critics (5 critics, 2,449 LOC total)

| # | Critic | File | LOC | Observation Type | Dev Server? | Load Testing? |
|---|--------|------|-----|------------------|-------------|---------------|
| 9 | api_observation | api_observation.ts | 564 | HTTP endpoints | ✅ Yes | ✅ Yes (autocannon) |
| 10 | database_observation | database_observation.ts | 484 | SQL queries | ❌ No | ✅ Yes (concurrent queries) |
| 11 | infrastructure_observation | infrastructure_observation.ts | 543 | System resources | ❌ No | ✅ Yes (chaos testing) |
| 12 | performance_observation | performance_observation.ts | 470 | Runtime profiling | ✅ Yes | ✅ Yes |
| 13 | data_observation | data_observation.ts | 388 | Data pipelines | ❌ No | ✅ Yes |

**Common Pattern:**
```typescript
// All 5 share this structure:
interface XTrace { timestamp, duration, resource, ... }
interface XIssue { severity, issue, suggestion, trace }
interface XOpportunity { pattern, observation, opportunity }
interface XReport { overall_score, issues, opportunities, traces }

private async observe(): Promise<XReport>
private analyzeTraces(traces): XIssue[]
private findOpportunities(traces): XOpportunity[]
```

### 1.3 Document Reviewer Critics (3 critics, 1,882 LOC total)

| # | Critic | File | LOC | Document | Required Lines | AFP/SCAS Check? |
|---|--------|------|-----|----------|----------------|-----------------|
| 14 | design_reviewer | design_reviewer.ts | 578 | design.md | 30+ | ✅ Full |
| 15 | strategy_reviewer | strategy_reviewer.ts | 671 | strategy.md | 30+ | ✅ Full |
| 16 | thinking_critic | thinking_critic.ts | 633 | think.md | 30+ | ✅ Full |

**Common Pattern:**
```typescript
// All 3 share this structure:
async reviewX(taskId: string): Promise<CriticResult> {
  // 1. Load document from state/evidence/{taskId}/{doc}.md
  // 2. Validate line count (min 30 lines)
  // 3. Regex-based analysis (via negativa, refactor, complexity, etc.)
  // 4. Categorize: concerns (high/medium/low) + strengths
  // 5. Adaptive thresholds (based on agent track record)
  // 6. Log to state/analytics/{critic}_reviews.jsonl
  // 7. Return APPROVED/BLOCKED/NEEDS_WORK
}
```

### 1.4 Weather-Specific Critics (5 critics, ~600 LOC total)

| # | Critic | File | LOC | Purpose |
|---|--------|------|-----|---------|
| 17 | weather_coverage | weather_coverage.ts | ~150 | Forecast coverage validation |
| 18 | weather_aesthetic | weather_aesthetic.ts | ~150 | Forecast presentation quality |
| 19 | weather_test | weather_test.ts | ~100 | Weather-specific test validation |
| 20 | weather_trust | weather_trust.ts | ~100 | Forecast reliability metrics |
| 21 | weather_attribution | weather_attribution.ts | ~100 | Attribution compliance |

### 1.5 ML/Modeling Critics (3 critics, ~900 LOC total)

| # | Critic | File | LOC | Purpose | Status |
|---|--------|------|-----|---------|--------|
| 22 | modeling_reality | modeling_reality.ts | ~100 | **WRAPPER for v2** | ⚠️ Duplicate |
| 23 | modeling_reality_v2 | modeling_reality_v2.ts | 420 | ML validation (actual impl) | ✅ Active |
| 24 | forecast_stitch | forecast_stitch.ts | ~380 | Forecast assembly validation | ✅ Active |

### 1.6 Product/UX Critics (2 critics, ~600 LOC total)

| # | Critic | File | LOC | Purpose | Method |
|---|--------|------|-----|---------|--------|
| 25 | design_system | design_system.ts | ~200 | Component library check | Shell + validation |
| 26 | design_system_visual | design_system_visual.ts | 437 | Screenshot-based UX review | Playwright + AI |

**design_system_visual unique features:**
- Captures screenshots with Playwright
- Multiple viewports (mobile/tablet/desktop)
- Configurable via state/screenshot_config.yaml
- Session-based capture (avoids re-screenshots)

### 1.7 Process/Workflow Critics (4 critics, ~400 LOC total)

| # | Critic | File | LOC | Purpose |
|---|--------|------|-----|---------|
| 27 | org_pm | org_pm.ts | ~150 | Project management compliance |
| 28 | health_check | health_check.ts | ~100 | System health validation |
| 29 | readiness | readiness.ts | ~80 | Deployment readiness |
| 30 | regression | regression.ts | ~70 | Regression detection |

### 1.8 Meta-Critics (3 critics, ~600 LOC total)

| # | Critic | File | LOC | Purpose | Status |
|---|--------|------|-----|---------|--------|
| 31 | ml_task_meta_critic | ml_task_meta_critic.ts | ~300 | ML task orchestration | ⚠️ BROKEN (missing ml_task_aggregator) |
| 32 | critic_meta | critic_meta.ts | ~200 | Critic-of-critics | Unknown |
| 33 | quality_meta | quality_meta.ts | ~100 | Quality aggregation | Unknown |

### 1.9 Specialized/Domain Critics (13 critics, ~1,500 LOC total)

| # | Critic | File | LOC | Domain |
|---|--------|------|-----|--------|
| 34 | api | api.ts | ~120 | API design |
| 35 | ui | ui.ts | ~100 | UI validation |
| 36 | ux | ux.ts | ~100 | UX patterns |
| 37 | accessibility | accessibility.ts | ~150 | A11y compliance |
| 38 | i18n | i18n.ts | ~80 | Internationalization |
| 39 | seo | seo.ts | ~90 | SEO optimization |
| 40 | analytics | analytics.ts | ~110 | Analytics integration |
| 41 | monitoring | monitoring.ts | ~130 | Observability |
| 42 | deployment | deployment.ts | ~140 | Deployment safety |
| 43 | documentation | documentation.ts | ~120 | Doc quality |
| 44 | licensing | licensing.ts | ~80 | License compliance |
| 45 | dependencies | dependencies.ts | ~100 | Dependency health |
| 46 | git_hygiene | git_hygiene_critic.ts | ~110 | Git tree cleanliness |

**Total: 46 critics, 8,078 LOC**

---

## 2. TYPE SYSTEM & INTERFACES

### 2.1 Core Types (base.ts)

```typescript
// Primary result type
export interface CriticResult extends CommandResult {
  critic: string;           // Critic key name
  passed: boolean;          // Success/failure
  git_sha?: string | null;  // Git commit hash
  timestamp?: string;       // ISO timestamp
  analysis?: CriticAnalysis | null;  // Intelligence engine output
  identity?: CriticIdentityProfile | null;  // Critic persona
}

// Inherits from:
export interface CommandResult {
  code: number;    // Exit code (0 = success)
  stdout: string;  // Command output
  stderr: string;  // Error output
}

// Intelligence analysis
export interface CriticAnalysis {
  category: FailureCategory;
  confidence: number;
  recommendations: string[];
  researchFindings?: ResearchFinding[];
  alternatives?: AlternativeOption[];
}

// Failure categorization
export type FailureCategory =
  | "timeout"
  | "test_failure"
  | "lint_error"
  | "type_error"
  | "dependency_issue"
  | "permission_error"
  | "unknown";

// Critic persona
export interface CriticIdentityProfile {
  title: string;              // e.g., "Code Steward"
  mission: string;            // Purpose statement
  powers: string[];           // Capabilities
  authority: string;          // Decision-making scope
  domain: string;             // Area of expertise
  autonomy_guidance?: string; // Independence level
  preferred_delegates?: string[];  // Other critics to coordinate with
}

// Critic options
export interface CriticOptions {
  intelligenceEnabled?: boolean;     // Enable AI analysis
  intelligenceLevel?: number;        // 1-3 (depth of analysis)
  researchManager?: ResearchManager; // Academic paper lookup
  stateMachine?: StateMachine;       // Task coordination
  escalationConfigPath?: string;     // Path to escalation rules
  escalationLogPath?: string;        // Path to escalation log
  identityConfigPath?: string;       // Path to critic personas
  defaultIdentity?: CriticIdentityProfile;  // Fallback persona
}
```

### 2.2 Escalation Types (base.ts)

```typescript
export interface CriticEscalationConfig {
  severity_threshold: "critical" | "high" | "medium" | "low";
  cooldown_hours: number;           // Min time between escalations
  escalation_message_template: string;  // Notification template
  delegate_to?: string[];           // Other critics to invoke
  create_task?: boolean;            // Auto-create remediation task
  block_completion?: boolean;       // Prevent task completion
}

export interface EscalationEvent {
  timestamp: string;
  critic: string;
  taskId: string;
  severity: string;
  message: string;
  delegatesCreated?: string[];  // Task IDs of delegate tasks
}
```

### 2.3 Observation Types (Pattern across 5 critics)

```typescript
// Generic pattern (each critic specializes):
export interface Trace {
  timestamp: string;
  duration_ms: number;
  resource: string;  // URL, query, process, etc.
  status: string;    // success, error, timeout, etc.
  metadata: Record<string, unknown>;
}

export interface Issue {
  severity: "critical" | "high" | "medium" | "low";
  category?: string;  // Domain-specific (index, n+1, timeout, etc.)
  issue: string;      // Problem description
  suggestion: string; // Remediation advice
  trace?: Trace;      // Evidence
}

export interface Opportunity {
  pattern: string;       // Detected pattern name
  observation: string;   // What was noticed
  opportunity: string;   // Improvement suggestion
  potential_impact?: string;  // Expected benefit
}

export interface ObservationReport {
  overall_score: number;      // 0-100
  issues: Issue[];            // Problems found
  opportunities: Opportunity[]; // Improvements identified
  traces: Trace[];            // Raw observation data
  summary: string;            // Human-readable summary
}
```

### 2.4 Document Review Types (Pattern across 3 critics)

```typescript
export interface DocumentConcern {
  severity: "high" | "medium" | "low";
  category: string;  // e.g., "via_negativa_missing", "complexity_unjustified"
  line?: number;     // Line number in document
  concern: string;   // Issue description
  suggestion: string;  // How to fix
}

export interface DocumentStrength {
  category: string;  // e.g., "via_negativa_applied", "clear_refactor_plan"
  observation: string;  // Positive finding
}

export interface DocumentReviewResult {
  verdict: "APPROVED" | "BLOCKED" | "NEEDS_WORK";
  score: number;         // 0-100
  concerns: DocumentConcern[];
  strengths: DocumentStrength[];
  adaptive_thresholds: {
    agent: string;
    track_record_score: number;
    threshold_adjustment: number;
  };
}
```

### 2.5 ML/Modeling Types (modeling_reality_v2.ts)

```typescript
export interface MLValidationContext {
  taskId: string;
  artifactPaths: {
    model?: string;
    predictions?: string;
    metrics?: string;
    notebook?: string;
  };
  baseline?: {
    accuracy?: number;
    rmse?: number;
    mae?: number;
  };
}

export interface MLIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "data" | "model" | "evaluation" | "deployment";
  issue: string;
  suggestion: string;
  evidence?: unknown;
}

export interface MLOpportunity {
  pattern: string;
  observation: string;
  opportunity: string;
  potential_lift?: number;  // Expected improvement %
}
```

---

## 3. CONNECTION POINTS & DATA FLOWS

### 3.1 Invocation Paths

```
┌────────────────────────────────────────────────────┐
│                   ENTRY POINTS                      │
├────────────────────────────────────────────────────┤
│                                                     │
│  1. ORCHESTRATOR PATH (Primary)                    │
│     CriticEnforcer.enforceCritics()                │
│      → SessionContext.runCritics()                 │
│      → CRITIC_REGISTRY[key]                        │
│      → new XCritic(workspaceRoot, options)         │
│      → critic.run(profile)                         │
│                                                     │
│  2. DIRECT INSTANTIATION (Tests)                   │
│     new BuildCritic(workspaceRoot)                 │
│      → critic.run("low")                           │
│                                                     │
│  3. CUSTOM METHODS (Document Reviewers)            │
│     new DesignReviewerCritic(workspaceRoot)        │
│      → critic.reviewDesign(taskId, context)        │
│                                                     │
│  4. INTEGRITY SCRIPT (Batch)                       │
│     bash scripts/run_integrity_tests.sh            │
│      → Runs multiple critics in sequence           │
│                                                     │
└────────────────────────────────────────────────────┘
```

### 3.2 Registration & Discovery

**Current System (Hardcoded):**
```typescript
// File: session.ts
const CRITIC_REGISTRY = {
  build: BuildCritic,
  tests: TestsCritic,
  security: SecurityCritic,
  // ... 43 more entries (MUST EDIT TO ADD)
} as const;

export type CriticKey = keyof typeof CRITIC_REGISTRY;

// Usage:
const CriticClass = CRITIC_REGISTRY[key];
const critic = new CriticClass(workspaceRoot, options);
```

**CONNECTION POINT ISSUES:**
1. **HIGH COUPLING:** session.ts imports all 46 critic classes
2. **NO DISCOVERY:** Cannot dynamically load critics
3. **NO PLUGINS:** Third-party critics impossible
4. **BRITTLE:** Adding critic requires core file edit

### 3.3 Task Integration Points

```typescript
// File: orchestrator/critic_enforcer.ts

// How critics are specified in roadmap:
interface RoadmapTask {
  id: string;
  title: string;
  exit_criteria: Array<
    | { critic: string }      // e.g., { critic: "build" }
    | { doc: string }         // e.g., { doc: "design.md" }
    | { artifact: string }    // e.g., { artifact: "model.pkl" }
    | string                  // freeform
  >;
}

// Enforcement flow:
class CriticEnforcer {
  async enforceCritics(task: Task): Promise<EnforcementResult> {
    // 1. Extract critic names from exit_criteria
    const criticNames = task.exit_criteria
      .filter(c => typeof c === 'object' && 'critic' in c)
      .map(c => c.critic);

    // 2. Run each critic
    const results = await sessionContext.runCritics(
      criticNames,
      profile,
      task.id
    );

    // 3. Check all passed
    const allPassed = results.every(r => r.passed);

    // 4. If failed, potentially escalate or block
    if (!allPassed) {
      await this.handleFailures(results, task);
    }

    return { passed: allPassed, results };
  }
}
```

**CONNECTION POINTS:**
- `exit_criteria` in roadmap.yaml → CriticEnforcer
- CriticEnforcer → SessionContext → CRITIC_REGISTRY
- CriticResult → EnforcementResult → StateMachine (task status)

### 3.4 Intelligence Engine Integration

```typescript
// File: base.ts (lines 67-75)

// Only enabled if explicitly opted in:
if (options.intelligenceEnabled) {
  this.intelligence = new CriticIntelligenceEngine({
    workspaceRoot,
    critic: this.getCriticKey(),
    intelligenceLevel: options.intelligenceLevel,
    researchManager: options.researchManager,
    stateMachine: options.stateMachine,
  });
}

// Usage in run():
const result = await this.executeCommand(cmd);
if (!result.passed && this.intelligence) {
  result.analysis = await this.intelligence.analyze(result);
}
```

**CONNECTION POINTS:**
- CriticOptions.intelligenceEnabled → Intelligence creation
- Intelligence → ResearchManager (academic papers)
- Intelligence → StateMachine (task history)
- **BROKEN:** ResearchManager requires research_types.ts (missing)

### 3.5 Escalation Flow

```typescript
// File: base.ts (lines 341-551)

// Escalation trigger:
protected async handleEscalation(result: CriticResult): Promise<void> {
  if (!result.passed) {
    const config = this.escalationConfig[this.getCriticKey()];
    if (config && this.shouldEscalate(result, config)) {
      await this.escalate(result, config);
    }
  }
}

// Escalation actions:
private async escalate(result: CriticResult, config: CriticEscalationConfig) {
  // 1. Log event
  await this.logEscalation(result);

  // 2. Create delegate tasks (if configured)
  if (config.delegate_to) {
    for (const delegate of config.delegate_to) {
      await this.createDelegateTask(delegate, result);
    }
  }

  // 3. Notify (future: Slack, email, etc.)
  // ...
}
```

**CONNECTION POINTS:**
- Escalation config files: `state/escalation/{critic}.json`
- Escalation log: `state/escalation/events.jsonl`
- Delegate tasks → StateMachine (creates new tasks)

### 3.6 Persistence Points

**Critic Results:**
```typescript
// File: base.ts (lines 710-730)

// Each critic persists results:
private async persistResult(result: CriticResult): Promise<void> {
  const resultPath = path.join(
    this.stateRoot,
    'critics',
    `${this.getCriticKey()}.json`
  );

  await fs.writeFile(
    resultPath,
    JSON.stringify(result, null, 2)
  );
}
```

**Paths:**
- `state/critics/{critic_name}.json` - Latest result
- `state/analytics/{critic}_reviews.jsonl` - Review history (document reviewers)
- `state/analytics/gate_reviews.jsonl` - GATE phase reviews
- `state/analytics/gate_remediations.jsonl` - GATE remediation cycles
- `state/escalation/events.jsonl` - Escalation events
- `state/screenshots/sessions/{session_id}/` - Visual critic screenshots

---

## 4. CONFIGURATION POINTS

### 4.1 Critic-Specific Config Files

```
state/
├── escalation/
│   ├── design_reviewer.json       # Escalation rules
│   ├── strategy_reviewer.json
│   └── thinking_critic.json
│
├── critic_identities/
│   ├── design_reviewer.json       # Persona definitions
│   ├── strategy_reviewer.json
│   └── thinking_critic.json
│
└── screenshot_config.yaml         # Visual critic config
    pages:
      - url: "http://localhost:3000/"
        name: "homepage"
      - url: "http://localhost:3000/dashboard"
        name: "dashboard"
    viewports:
      - width: 375, height: 667, name: "mobile"
      - width: 768, height: 1024, name: "tablet"
      - width: 1920, height: 1080, name: "desktop"
```

### 4.2 Profile System

**Profiles:** low, medium, high (hardcoded string type)

**Usage patterns:**
```typescript
// Pattern 1: Different commands per profile
protected command(profile: string): string | null {
  if (profile === "low") return "make lint";
  if (profile === "medium") return "make lint && make test:quick";
  if (profile === "high") return "make lint && make test:all";
}

// Pattern 2: Same command (profile ignored)
protected command(profile: string): string | null {
  return "make lint"; // Profile unused
}

// Pattern 3: Profile affects options, not command
protected command(profile: string): string | null {
  this.loadTestIterations = profile === "high" ? 1000 : 100;
  return "autocannon ...";
}
```

**ISSUE:** No standard for what profiles mean. Each critic interprets differently.

### 4.3 Environment Variables

```bash
# Observation critics respect:
API_BASE_URL         # Default: http://localhost:3000
DB_CONNECTION_STRING # Database to observe
LOAD_TEST_DURATION   # Seconds for load testing
CHAOS_MODE          # Enable infrastructure chaos testing

# Intelligence engine:
ENABLE_CRITIC_INTELLIGENCE=true
INTELLIGENCE_LEVEL=2  # 1-3

# Escalation:
ESCALATION_ENABLED=true
ESCALATION_COOLDOWN_HOURS=24
```

**ISSUE:** Undocumented, scattered across critic implementations.

---

## 5. EXTENSION POINTS

### 5.1 Current Extension Mechanisms

**Mechanism 1: Extend Critic base class**
```typescript
export class MyNewCritic extends Critic {
  protected command(profile: string): string | null {
    return "my-validation-script";
  }
}
```

**Required steps:**
1. Create critic class file
2. Edit session.ts CRITIC_REGISTRY
3. Restart MCP server
4. Add to roadmap exit_criteria

**LIMITATION:** Requires editing core code, no runtime extension

**Mechanism 2: Override methods**
```typescript
export class DesignReviewerCritic extends Critic {
  // Override run() entirely
  async run(profile: string): Promise<CriticResult> {
    // Custom logic
  }

  // Add custom methods
  async reviewDesign(taskId: string): Promise<CriticResult> {
    // ...
  }
}
```

**LIMITATION:** Inconsistent API, breaks Liskov Substitution

### 5.2 Missing Extension Points

**NO WAY TO:**
1. Register critics at runtime (plugin system)
2. Override critic selection logic (cannot A/B test)
3. Inject custom failure analyzers
4. Add new profile types (stuck with low/medium/high)
5. Customize result persistence
6. Hook into critic lifecycle (before/after events)
7. Replace escalation logic
8. Add custom metrics collectors

---

## 6. DEPENDENCY GRAPH

### 6.1 Internal Dependencies

```
Critic (base.ts)
├── DEPENDS ON:
│   ├── ../executor/command_runner.ts (MISSING FILE)
│   ├── ../telemetry/logger.ts
│   ├── ../telemetry/tracing.ts
│   ├── ../utils/git.ts
│   ├── ../utils/config.ts
│   ├── ../orchestrator/state_machine.ts (TIGHT COUPLING)
│   └── ./intelligence_engine.ts
│       └── ../intelligence/research_types.ts (MISSING FILE)
│
├── IMPORTED BY:
│   ├── All 46 critic implementations
│   └── session.ts (via CRITIC_REGISTRY)
│
└── TRANSITIVELY AFFECTS:
    └── Entire orchestrator system (via StateMachine dependency)
```

### 6.2 External Dependencies

```
Observation Critics:
├── autocannon (API load testing)
├── @playwright/test (visual testing)
├── systeminformation (infrastructure metrics)
└── Database drivers (Postgres, MySQL, etc.)

Document Reviewers:
├── fs/promises (file I/O)
├── yaml (config parsing)
└── JSON Lines format

ML Critics:
├── Python interop (modeling_reality_v2)
├── Artifact paths (models, notebooks, metrics)
└── Baseline metrics (from previous runs)
```

### 6.3 Circular Dependency Risks

**DETECTED:**
```
orchestrator/critic_enforcer.ts
  → imports SessionContext
    → imports CRITIC_REGISTRY
      → imports all Critic classes
        → imports base.ts
          → imports ../orchestrator/state_machine.ts
```

**RISK:** Critics depend on orchestrator types, orchestrator depends on critics.

**MITIGATION:** Use interfaces, not concrete types.

---

## 7. DATA FLOW DIAGRAMS

### 7.1 Simple Critic Flow

```
┌─────────────┐
│   Roadmap   │ exit_criteria: [{ critic: "build" }]
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ CriticEnforcer   │ Reads exit_criteria
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ SessionContext   │ runCritics(["build"], "low")
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ CRITIC_REGISTRY  │ Lookup "build" → BuildCritic
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   BuildCritic    │ new BuildCritic(workspaceRoot)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   run("low")     │ Execute template method
└──────┬───────────┘
       │
       ├─1──→ command("low") → "make lint"
       │
       ├─2──→ runCommand("make lint")
       │      └─→ CommandRunner (MISSING)
       │          └─→ execAsync("make lint")
       │
       ├─3──→ pass() or fail()
       │      └─→ Build CriticResult
       │
       ├─4──→ handleEscalation(result)
       │      └─→ Check config, possibly create tasks
       │
       ├─5──→ persistResult(result)
       │      └─→ Write to state/critics/build.json
       │
       └─6──→ return CriticResult
              └─→ Back to CriticEnforcer
```

### 7.2 Observation Critic Flow

```
┌──────────────────────┐
│ APIObservationCritic │
└──────┬───────────────┘
       │
       ├─1──→ startDevServer()
       │      └─→ spawn("npm run dev")
       │          └─→ Wait for readiness
       │
       ├─2──→ observe()
       │      ├─→ Discover endpoints
       │      ├─→ Fire requests (100-1000)
       │      ├─→ Collect traces (timing, errors)
       │      └─→ Return APITrace[]
       │
       ├─3──→ analyzeTraces(traces)
       │      ├─→ Detect slow endpoints (>500ms)
       │      ├─→ Detect errors (5xx, 4xx)
       │      ├─→ Detect timeouts
       │      └─→ Return APIIssue[]
       │
       ├─4──→ findOpportunities(traces)
       │      ├─→ Detect cacheable endpoints
       │      ├─→ Detect batch opportunities
       │      ├─→ Detect rate limit headroom
       │      └─→ Return APIOpportunity[]
       │
       ├─5──→ loadTest()
       │      └─→ autocannon (concurrent requests)
       │          └─→ Return load metrics
       │
       ├─6──→ stopDevServer()
       │      └─→ kill dev server process
       │
       └─7──→ return fail() or pass()
              └─→ ObservationReport in CriticResult
```

### 7.3 Document Reviewer Flow

```
┌─────────────────────┐
│ DesignReviewerCritic│
└──────┬──────────────┘
       │
       ├─1──→ reviewDesign(taskId, context)
       │      └─→ Load state/evidence/{taskId}/design.md
       │
       ├─2──→ validateLineCount(content)
       │      └─→ Reject if <30 lines
       │
       ├─3──→ analyzeDocument(content)
       │      ├─→ Check: Via Negativa section exists
       │      ├─→ Check: Refactor vs Repair discussed
       │      ├─→ Check: Complexity justified
       │      ├─→ Check: Alternatives considered
       │      ├─→ Check: Five Forces analysis
       │      └─→ Return concerns[], strengths[]
       │
       ├─4──→ loadAgentTrackRecord(agent)
       │      └─→ Read state/analytics/gate_reviews.jsonl
       │          └─→ Calculate approval rate
       │
       ├─5──→ applyAdaptiveThreshold(concerns, track_record)
       │      └─→ Adjust severity based on history
       │
       ├─6──→ determineVerdict(concerns)
       │      ├─→ APPROVED: 0 high concerns
       │      ├─→ BLOCKED: 1+ high concerns
       │      └─→ NEEDS_WORK: Only medium/low concerns
       │
       ├─7──→ logReview(verdict, concerns, strengths)
       │      └─→ Append to state/analytics/gate_reviews.jsonl
       │
       └─8──→ return fail() or pass()
              └─→ DocumentReviewResult in CriticResult
```

---

## 8. SYSTEM PERSPECTIVES

### 8.1 Architect's View: Layered Architecture

```
┌───────────────────────────────────────────────────┐
│              PRESENTATION LAYER                    │
│  - MCP Tools (critics_run, plan_update, etc.)     │
│  - CLI commands                                    │
└─────────────────┬─────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────┐
│           ORCHESTRATION LAYER                      │
│  - CriticEnforcer (exit_criteria enforcement)     │
│  - SessionContext (critic execution)               │
│  - StateMachine (task state management)           │
└─────────────────┬─────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────┐
│              CRITIC LAYER                          │
│  - Critic base class (template method)            │
│  - CRITIC_REGISTRY (hardcoded map)                │
│  - 46 critic implementations                       │
└─────────────────┬─────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────┐
│           INFRASTRUCTURE LAYER                     │
│  - CommandRunner (shell execution)                │
│  - Intelligence engine (failure analysis)         │
│  - Persistence (state/critics/*.json)             │
│  - Telemetry (tracing, logging)                   │
└───────────────────────────────────────────────────┘
```

**ISSUES:**
- **Layer violation:** Critics import StateMachine from orchestrator (upward dependency)
- **No clear boundaries:** Orchestration mixed with execution

### 8.2 Developer's View: Adding a New Critic

**Current process (8 steps):**
1. Create new file: `src/critics/my_new_critic.ts`
2. Extend Critic base class
3. Implement `command(profile)` method
4. Edit `src/session.ts` to add to CRITIC_REGISTRY
5. Restart MCP server
6. Add to roadmap exit_criteria
7. (Optional) Add escalation config
8. (Optional) Add tests

**Pain points:**
- Must edit core file (session.ts)
- Must understand base.ts (776 LOC)
- Must restart server
- No validation until runtime

**Desired process (3 steps):**
1. Create critic file
2. Register: `registry.register('my_critic', MyCritic)`
3. Use in roadmap

### 8.3 Operator's View: Runtime Behavior

**Observability:**
- Tracing: Each critic.run() creates a span
- Logging: stdout/stderr captured
- Persistence: Results in state/critics/*.json
- Metrics: ❌ **MISSING** (no Prometheus/Grafana)

**Monitoring questions we CANNOT answer:**
- Which critics run most frequently?
- Which critics fail most often?
- Average duration per critic?
- Resource usage (CPU, memory)?
- False positive rate?

**Reliability:**
- Retries: ❌ None (fail once = task blocked)
- Timeouts: ❌ None (critic can hang forever)
- Circuit breakers: ❌ None (flaky critic blocks all tasks)

### 8.4 Security Perspective

**Shell Command Execution:**
```typescript
// Critics execute arbitrary shell commands:
protected command(profile: string): string | null {
  return "make lint"; // What if this comes from user input?
}
```

**RISKS:**
1. **Command injection:** If profile or taskId not sanitized
2. **Privilege escalation:** Critics run with MCP server privileges
3. **Resource exhaustion:** No CPU/memory limits on critic processes

**Observation critic risks:**
- Spawns dev servers (network exposure)
- Chaos testing (deliberately breaks things)
- Load testing (resource consumption)

**MITIGATIONS:**
- Input sanitization: ✅ Profile is enum-like
- Process isolation: ❌ None
- Resource limits: ❌ None
- Audit logging: ✅ Partial (results logged)

### 8.5 Testing Perspective

**Test coverage breakdown:**
```
Base class (base.ts):
  ✅ base.test.ts - Template method tests

Observation critics (2,449 LOC):
  ❌ 0 tests - Risky (spawn processes, network I/O)

Document reviewers (1,882 LOC):
  ❌ 0 tests - **CRITICAL** (GATE blockers)

Simple critics (8 critics):
  ✅ Partial - health_check.test.ts

Modeling critics:
  ✅ modeling_reality.test.ts

Visual critics:
  ❌ 0 tests

Meta critics:
  ❌ 3/3 BROKEN (missing imports)
```

**Test quality issues:**
1. **Integration tests only:** No unit tests for individual methods
2. **Mocking:** Some tests mock, some don't (inconsistent)
3. **Flakiness:** Load tests may be timing-dependent
4. **Cleanup:** Dev server tests may leave processes running

---

## 9. ANTI-PATTERNS DETECTED (with Evidence)

### AP1: God Class (base.ts, 776 LOC)

**Evidence:** Single class with 10+ responsibilities:
1. Command execution (runCommand)
2. Result building (pass, fail)
3. Escalation (handleEscalation, 200 LOC)
4. Delegation (createDelegateTask, 150 LOC)
5. Intelligence (analyze failures)
6. Identity (load persona configs)
7. Persistence (save results)
8. Telemetry (tracing)
9. Git integration (getCurrentGitSha)
10. Lifecycle hooks (finalizeResult)

**Harm:** Hard to test, hard to understand, violation of SRP

### AP2: Shotgun Surgery

**Evidence:** Adding a new critic type requires editing:
- `session.ts` (CRITIC_REGISTRY)
- `types.ts` (if new CriticKey needed)
- Possibly `critic_enforcer.ts` (if special handling)
- Possibly `state_machine.ts` (if new task types)

**Harm:** Change amplification, high coupling

### AP3: Divergent Change

**Evidence:** Critic base class changes for unrelated reasons:
- Add escalation → Edit base.ts
- Add delegation → Edit base.ts
- Add intelligence → Edit base.ts
- Change persistence → Edit base.ts

**Harm:** Class has multiple reasons to change

### AP4: Feature Envy

**Evidence:** Critics access StateMachine internals:
```typescript
// Critics shouldn't know about orchestrator:
import type { StateMachine } from "../orchestrator/state_machine.js";
```

**Harm:** Tight coupling, dependency on orchestrator

### AP5: Speculative Generality

**Evidence:** Intelligence engine (298 LOC) designed for complex use cases, but:
- Only 4/46 critics use it (9%)
- Research integration broken (missing research_types)
- No clear ROI metrics

**Harm:** Complexity without benefit

### AP6: Dead Code

**Evidence:**
- `ml_task_aggregator.ts` moved to graveyard, still imported
- `modeling_reality.ts` v1 is just a wrapper (100 LOC waste)
- Escalation/delegation possibly unused (no metrics)

**Harm:** Maintenance burden, confusion

### AP7: Refused Bequest

**Evidence:** Document reviewers extend Critic but:
```typescript
protected command(_profile: string): string | null {
  return null; // Don't use inherited pattern
}
```

**Harm:** Inheritance used incorrectly, Liskov violation

---

## 10. RECOMMENDED ARCHITECTURE (Future State)

### 10.1 Proposed Layered Architecture

```
┌───────────────────────────────────────────────────┐
│              APPLICATION LAYER                     │
│  - CriticOrchestrator (high-level API)            │
│  - CriticRegistry (plugin system)                 │
└─────────────────┬─────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────┐
│              DOMAIN LAYER                          │
│                                                    │
│  Critic (interface)                                │
│    ├─→ ShellCritic (command execution)            │
│    ├─→ DocumentCritic (file analysis)             │
│    ├─→ ObservationCritic (runtime testing)        │
│    └─→ EvaluationCritic (artifact validation)     │
│                                                    │
│  Supporting Services (injected):                   │
│    ├─→ EscalationManager                          │
│    ├─→ FailureAnalyzer (simplified intelligence)  │
│    ├─→ CriticPersistence                          │
│    └─→ MetricsCollector                           │
│                                                    │
└─────────────────┬─────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────┐
│           INFRASTRUCTURE LAYER                     │
│  - CommandExecutor (shell)                         │
│  - FileSystem (I/O)                                │
│  - Telemetry (tracing, metrics)                   │
│  - ProcessManager (dev servers, cleanup)          │
└───────────────────────────────────────────────────┘
```

### 10.2 Proposed Critic Hierarchy

```typescript
// Core interface
interface Critic {
  name: string;
  run(context: CriticContext): Promise<CriticResult>;
}

// Specialized base classes
abstract class ShellCritic implements Critic {
  protected abstract command(context: CriticContext): string;
  // Shared: shell execution, timeout handling
}

abstract class DocumentCritic implements Critic {
  protected abstract analyze(content: string): DocumentAnalysis;
  // Shared: file loading, line counting, logging
}

abstract class ObservationCritic<T extends Trace> implements Critic {
  protected abstract observe(context: CriticContext): Promise<T[]>;
  protected abstract analyzeTraces(traces: T[]): Issue[];
  // Shared: dev server, reporting, cleanup
}

// Implementations
class BuildCritic extends ShellCritic {
  protected command(context: CriticContext): string {
    return "make lint";
  }
}

class DesignReviewerCritic extends DocumentCritic {
  protected analyze(content: string): DocumentAnalysis {
    // AFP/SCAS analysis
  }
}

class APIObservationCritic extends ObservationCritic<APITrace> {
  protected observe(context: CriticContext): Promise<APITrace[]> {
    // HTTP testing
  }
}
```

---

**END OF INVENTORY**

**Summary Stats:**
- **46 critics** across 8 categories
- **8,078 total LOC**
- **13 connection points** (invocation paths, config, persistence, etc.)
- **20+ data flow paths**
- **7 anti-patterns** detected
- **3 layers** in current architecture (with violations)
