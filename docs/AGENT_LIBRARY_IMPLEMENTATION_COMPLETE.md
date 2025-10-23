# Agent Library Implementation - Complete Guide

**Status**: ✅ Structure Created, Templates Ready
**Build**: Ready for population
**Next Step**: Populate all documents + integrate with ContextAssembler

---

## What Was Created

### ✅ Directory Structure

```
docs/agent_library/
├── index.md                          ✅ COMPLETE - Navigation hub
├── common/
│   ├── standards/
│   │   ├── quality_standards.md      📝 Template below
│   │   ├── coding_standards.md       📝 Template below
│   │   ├── testing_standards.md      📝 Template below
│   │   ├── security_standards.md     📝 Template below
│   │   └── communication_standards.md 📝 Template below
│   ├── concepts/
│   │   ├── roadmap_management.md     📝 Template below
│   │   ├── dependency_graph.md       📝 Template below
│   │   ├── quality_gates.md          📝 Template below
│   │   ├── escalation_protocol.md    📝 Template below
│   │   └── verification_loop.md      ✅ Use CLAUDE.md verification section
│   ├── processes/
│   │   ├── task_lifecycle.md         📝 Template below
│   │   ├── critic_workflow.md        📝 Template below
│   │   ├── blocker_escalation.md     📝 Template below
│   │   └── health_monitoring.md      ✅ Link to AutopilotHealthMonitor docs
│   └── tools/
│       ├── mcp_tools_reference.md    📝 Template below
│       ├── database_queries.md       📝 Template below
│       └── telemetry_logging.md      📝 Template below
├── roles/
│   ├── atlas/
│   │   ├── charter.md                ✅ COMPLETE
│   │   ├── responsibilities.md       📝 Expand from charter
│   │   └── decision_authority.md     📝 Matrix template below
│   ├── director_dana/
│   │   ├── charter.md                ✅ COMPLETE
│   │   ├── infrastructure_scope.md   📝 Template below
│   │   └── critic_coordination.md    📝 Use critic_identities.json
│   ├── workers/
│   │   ├── charter.md                📝 Template below
│   │   ├── task_execution_guide.md   📝 Template below
│   │   └── autonomy_bounds.md        📝 Template below
│   └── critics/
│       ├── charter.md                📝 Template below
│       ├── critic_identities.md      ✅ Link to config/critic_identities.json
│       └── quality_framework.md      📝 Template below
└── domains/
    ├── product/
    │   ├── overview.md               📝 Template below
    │   ├── weather_intelligence.md   📝 Existing docs
    │   ├── demo_standards.md         📝 Template below
    │   └── ux_principles.md          📝 Template below
    ├── ml/
    │   ├── overview.md               📝 Template below
    │   ├── modeling_standards.md     ✅ Use ML_QUALITY_STANDARDS.md
    │   ├── data_quality.md           📝 Template below
    │   └── causal_inference.md       📝 Template below
    ├── infrastructure/
    │   ├── overview.md               📝 Template below
    │   ├── mcp_architecture.md       ✅ Use existing MCP docs
    │   ├── autopilot_system.md       ✅ Use AUTOPILOT_META_MONITORING...
    │   └── observability.md          📝 Template below
    └── security/
        ├── overview.md               📝 Template below
        ├── secrets_management.md     ✅ Use SECURITY_AUDIT.md
        └── audit_requirements.md     📝 Template below
```

---

## Document Templates

### Common Standards Templates

#### quality_standards.md
```markdown
# Universal Quality Standards

All WeatherVane work must meet **85-95%** across 7 dimensions:

## 1. Code Elegance (85-95%)
**Principles:**
- Clear, self-documenting code
- Appropriate abstractions
- Minimal complexity (cyclomatic complexity <10)
- DRY principle applied

**Anti-patterns:**
- God objects
- Deep nesting (>3 levels)
- Magic numbers
- Unclear variable names

## 2. Architecture Design (85-95%)
**Principles:**
- Separation of concerns
- Loose coupling, high cohesion
- Scalable patterns
- Testable design

## 3. User Experience (85-95%)
**Principles:**
- Intuitive workflows
- Clear error messages
- Responsive UI (<100ms perceived)
- Accessible (WCAG AA)

## 4. Communication Clarity (85-95%)
**Principles:**
- Comprehensive documentation
- Clear commit messages
- Meaningful logs
- Transparent decisions

## 5. Scientific Rigor (85-95%)
**Principles:**
- Reproducible experiments
- Statistical validity
- Baseline comparisons
- Documented assumptions

## 6. Performance Efficiency (85-95%)
**Principles:**
- O(n log n) or better for critical paths
- Resource-bounded (memory, CPU)
- Caching where appropriate
- Lazy loading

## 7. Security Robustness (85-95%)
**Principles:**
- No secrets in code
- Input validation
- Least privilege
- Audit trails

**Measurement:**
Each dimension scored 0-100%, must average 85-95% overall.
```

#### testing_standards.md
```markdown
# Universal Testing Standards

## Essential 7 Test Dimensions

Every test suite MUST cover:

1. **Happy Path** - Core functionality works
2. **Edge Cases** - Boundary conditions handled
3. **Error Handling** - Failures gracefully managed
4. **Integration** - Components work together
5. **Performance** - Meets latency/throughput requirements
6. **Security** - No vulnerabilities introduced
7. **Regression** - Previous bugs don't return

## Test Quality Checklist

Before marking ANY task done:
- [ ] Unit tests: 80%+ coverage
- [ ] Integration tests: Critical paths covered
- [ ] All 7 dimensions tested
- [ ] Tests are deterministic (no flakiness)
- [ ] Tests run fast (<5 sec for unit, <60 sec for integration)
- [ ] Meaningful assertions (not just "doesn't crash")
- [ ] Clear test names describe what they verify

## Verification Script

```bash
bash scripts/validate_test_quality.sh path/to/test.ts
```

Checks:
- Coverage %
- Dimension coverage
- Flakiness
- Speed
- Assertion quality
```

#### coding_standards.md
```markdown
# Coding Standards

## TypeScript

**Naming:**
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Private: prefix with `_` (e.g., `_privateMethod`)

**Structure:**
```typescript
// File: src/foo/bar.ts

// 1. Imports (grouped: node, external, internal)
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { logInfo } from '../telemetry/logger.js';

// 2. Types & interfaces
export interface FooConfig {
  enabled: boolean;
  maxRetries: number;
}

// 3. Class or functions
export class Foo extends EventEmitter {
  // Private fields first
  private readonly config: FooConfig;

  // Constructor
  constructor(config: FooConfig) {
    super();
    this.config = config;
  }

  // Public methods
  async execute(): Promise<void> {
    // Implementation
  }

  // Private methods last
  private validate(): boolean {
    return true;
  }
}
```

**Async/Await:**
- Prefer `async/await` over callbacks
- Always handle errors with try/catch
- Use `Promise.all()` for parallel operations

## Python

**Style**: Follow PEP 8
**Type Hints**: Required for all functions
**Docstrings**: Required for all public functions

```python
def calculate_score(
    data: pd.DataFrame,
    weights: dict[str, float]
) -> float:
    """Calculate weighted score from data.

    Args:
        data: Input dataframe with features
        weights: Feature weights dictionary

    Returns:
        Weighted score (0-1)

    Raises:
        ValueError: If weights don't sum to 1.0
    """
    if not np.isclose(sum(weights.values()), 1.0):
        raise ValueError("Weights must sum to 1.0")

    return float((data * weights).sum())
```
```

---

### Role Templates

#### workers/charter.md
```markdown
# Workers - Task Execution Charter

**Role**: Worker (Tactical Execution Specialist)
**Autonomy Level**: Operational
**Max Complexity**: 6/10
**Providers**: Codex or Claude

## Mission

Execute tasks assigned by Atlas with high quality and efficiency. Workers are the hands that build the product.

## Core Responsibilities

1. **Task Execution**
   - Implement features, fix bugs, write tests
   - Follow specifications precisely
   - Complete verification loop before claiming done

2. **Quality Assurance**
   - Run build, test, audit before marking complete
   - Ensure 85-95% quality across all 7 dimensions
   - Document code and decisions

3. **Communication**
   - Report blockers within 10 minutes
   - Ask clarifying questions proactively
   - Update task progress regularly

4. **Continuous Learning**
   - Apply learnings from previous tasks
   - Suggest improvements to process
   - Share knowledge with other workers

## Autonomy Bounds

**Can Do Autonomously** (complexity ≤6):
- Implement well-specified features
- Fix bugs with clear root cause
- Write tests and documentation
- Refactor code for clarity
- Update dependencies (minor versions)

**Must Escalate** (complexity >6 or unclear):
- Architecture decisions → Atlas
- Security concerns → Security Sentinel + Director Dana
- Stuck >30 min → Orchestrator
- Breaking API changes → Atlas
- Major refactors → Atlas

**Gray Areas:**
- **Performance trade-offs** → Consult Atlas or cost_perf critic
- **UX decisions** → Involve design_system critic
- **Test strategy** → Follow testing_standards.md, escalate if unclear

## Verification Loop

**MANDATORY** before claiming done:

1. **Build** (0 errors):
   ```bash
   npm run build  # or appropriate build command
   ```

2. **Test** (all pass, 7/7 coverage):
   ```bash
   npm test
   bash scripts/validate_test_quality.sh path/to/test.ts
   ```

3. **Audit** (0 vulnerabilities):
   ```bash
   npm audit
   ```

4. **Runtime** (no errors):
   - Actually RUN the feature end-to-end
   - Test with realistic data
   - Monitor for crashes/errors

5. **Documentation** (complete):
   - Code comments for complex logic
   - README updated if needed
   - API docs if public interface

**Only when ALL 5 pass** can you mark the task `done`.

## Success Metrics

- ✅ Tasks completed on first try (no rework)
- ✅ Zero critical bugs in production
- ✅ 85-95% quality scores across all dimensions
- ✅ <10% escalation rate (sign of good autonomy bounds)
- ✅ Fast cycle time (hours, not days)

## Key Documents

- [Task Execution Guide](/docs/agent_library/roles/workers/task_execution_guide.md)
- [Autonomy Bounds](/docs/agent_library/roles/workers/autonomy_bounds.md)
- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md)
- [Quality Standards](/docs/agent_library/common/standards/quality_standards.md)

**Version**: 1.0.0
**Last Updated**: 2025-10-23
```

---

## ContextAssembler Integration

### How to Inject Docs

```typescript
// File: tools/wvo_mcp/src/orchestrator/context_assembler.ts

interface ContextOptions {
  // ... existing options ...
  injectAgentDocs?: boolean;  // NEW
}

async assembleContext(task: Task, options: ContextOptions): Promise<AssembledContext> {
  // ... existing assembly ...

  if (options.injectAgentDocs) {
    const agentDocs = await this.loadAgentDocs(task, currentAgent);
    context.agentGuidance = agentDocs;
  }

  return context;
}

private async loadAgentDocs(task: Task, agent: Agent): Promise<string> {
  const docs: string[] = [];

  // 1. Load role charter
  const rolePath = `docs/agent_library/roles/${agent.role}/charter.md`;
  docs.push(await fs.readFile(rolePath, 'utf-8'));

  // 2. Load relevant standards
  docs.push(await fs.readFile('docs/agent_library/common/standards/quality_standards.md', 'utf-8'));
  docs.push(await fs.readFile('docs/agent_library/common/concepts/verification_loop.md', 'utf-8'));

  // 3. Load domain-specific docs if applicable
  const domain = this.detectDomain(task);
  if (domain) {
    const domainPath = `docs/agent_library/domains/${domain}/overview.md`;
    docs.push(await fs.readFile(domainPath, 'utf-8'));
  }

  // 4. Load process docs based on task type
  if (task.type === 'bug') {
    docs.push(await fs.readFile('docs/agent_library/common/processes/task_lifecycle.md', 'utf-8'));
  }

  return docs.join('\n\n---\n\n');
}

private detectDomain(task: Task): string | null {
  // Heuristics to detect domain from task metadata or epic
  const metadata = task.metadata as Record<string, any> || {};

  if (metadata.domain) return metadata.domain;
  if (task.epic_id?.startsWith('E-ML')) return 'ml';
  if (task.epic_id?.startsWith('E-PRODUCT')) return 'product';
  if (task.epic_id?.startsWith('E-INFRA')) return 'infrastructure';
  if (task.epic_id?.startsWith('E-SEC')) return 'security';

  return null;
}
```

---

## Next Steps

### Immediate (Today)
1. ✅ Directory structure created
2. ✅ Index.md written (navigation hub)
3. ✅ Role charters created (Atlas, Director Dana)
4. 📝 Complete remaining role charters (Workers, Critics)
5. 📝 Populate common standards (5 files)
6. 📝 Populate common concepts (5 files)

### Short-term (This Week)
7. 📝 Populate processes (4 files)
8. 📝 Populate tools reference (3 files)
9. 📝 Populate domain guides (12 files)
10. 📝 Update ContextAssembler with doc injection
11. 📝 Test with real agent executions

### Long-term (This Month)
12. 📝 Add examples to each doc
13. 📝 Create quick reference cards
14. 📝 Build search/navigation tooling
15. 📝 Gather agent feedback on usefulness
16. 📝 Continuously improve based on usage

---

## Pair Programming Integration

The **pair programming system** is ready to implement:
- **Spec**: `docs/implementations/PAIR_PROGRAMMING_COMPLETE.md`
- **Lines**: 1,850 lines (types, coordinator, tests)
- **Benefit**: Research-backed 15% fewer bugs
- **Pattern**: Driver (implements) + Navigator (reviews in real-time)
- **Rotation**: 25-minute Pomodoro intervals
- **Integration Point**: `UnifiedOrchestrator.executeTaskWithPair()`

---

## Success Criteria

The agent library is successful when:

- ✅ **Agent Clarity**: Agents report clear understanding of their role
- ✅ **Reduced Escalations**: <10% of decisions require human intervention
- ✅ **Quality Consistency**: All agents maintain 85-95% across 7 dimensions
- ✅ **Faster Onboarding**: New agents (or agent types) onboard in <1 hour
- ✅ **Self-Service**: Agents can answer their own questions by reading docs
- ✅ **Continuous Improvement**: Docs updated monthly based on learnings

---

**Status**: Foundation Complete, Ready for Population
**Next Action**: Populate templates + integrate ContextAssembler
**Timeline**: 3-5 days for full implementation
**Maintainer**: Agent Collective (Atlas, Director Dana, Claude Council)
