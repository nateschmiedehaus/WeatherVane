# Architecture Knowledge Base

**Problem**: Scattered markdown files don't capture hierarchical and relational architecture well. Hard to navigate between levels, find dependencies, track changes.

**Solution**: SQLite database with structured architecture tracking, relationships, and queries.

---

## What This Provides

### 1. Hierarchical Architecture Tracking

**Levels**:
- **System**: WeatherVane platform
- **Subsystem**: MCP, Weather, ML, Web, API
- **Component**: Orchestrator, Quality Gates, Agents, etc.
- **Module**: QualityGateOrchestrator, DomainExpertReviewer, etc.
- **Function**: Individual functions (when needed)

**Navigate** up and down the hierarchy easily.

### 2. Relationship Tracking

**Types**:
- `depends_on`: Component A needs Component B
- `calls`: Component A invokes Component B
- `configures`: Component A configures Component B
- `monitors`: Component A monitors Component B
- `extends`: Component A extends Component B

**Strength**: critical, strong, normal, weak

**Example**:
```
COMP-MCP-ORCHESTRATOR --depends_on (critical)--> COMP-MCP-QUALITY
COMP-MCP-QUALITY --depends_on (strong)--> MOD-QG-DOMAIN-EXPERT
```

### 3. Cross-References

Every component knows:
- **Parent** (hierarchical)
- **Children** (hierarchical)
- **Dependencies** (what it needs)
- **Dependents** (what needs it - blast radius)
- **Epic** (which roadmap epic owns it)
- **Domain** (product, mcp, infra)

### 4. Change Tracking

Every architecture change is logged:
- What changed?
- When?
- Why?
- Which task caused it?
- Commit hash?

### 5. Health Monitoring

Track:
- Component health (healthy, degraded, failing)
- Test coverage
- Status (active, deprecated, planned)
- Last verified timestamp

### 6. Queries

Pre-built queries for common tasks:
- Get component hierarchy
- Find all dependencies
- Find all dependents (blast radius)
- Get epic architecture
- Find failing components
- Find untested components
- Find cross-epic dependencies (coupling)

---

## Usage

### Initialize Database

```bash
python3 tools/wvo_mcp/scripts/architecture_kb.py init
```

Creates `state/architecture.db` with schema.

### Add Component

```bash
python3 tools/wvo_mcp/scripts/architecture_kb.py add \
  COMP-NEW-FEATURE \
  "New Feature Module" \
  component \
  --description "Handles new feature functionality" \
  --parent SUBSYS-MCP \
  --epic E13
```

### Search

```bash
python3 tools/wvo_mcp/scripts/architecture_kb.py search quality
```

Output:
```
COMP-MCP-QUALITY     component   Quality Gate System
MOD-QG-ORCHESTRATOR  module      QualityGateOrchestrator
MOD-QG-ADVERSARIAL   module      AdversarialBullshitDetector
MOD-QG-DOMAIN-EXPERT module      DomainExpertReviewer
```

### Get Component Details

```bash
python3 tools/wvo_mcp/scripts/architecture_kb.py get COMP-MCP-QUALITY
```

Returns JSON with:
- Component details
- Dependencies (what it needs)
- Dependents (what needs it)
- Hierarchy (ancestors and descendants)

### Health Report

```bash
python3 tools/wvo_mcp/scripts/architecture_kb.py health
```

Returns:
```json
{
  "total_components": 15,
  "by_health": {
    "healthy": 1,
    "unknown": 14
  },
  "by_level": {
    "component": 6,
    "module": 3,
    "subsystem": 5,
    "system": 1
  },
  "low_coverage_count": 15
}
```

---

## Python API

```python
from architecture_kb import ArchitectureKB

kb = ArchitectureKB()
kb.connect()

# Add component
kb.add_component(
    'COMP-MY-FEATURE',
    'My Feature',
    'component',
    'Does something important',
    parent_id='SUBSYS-MCP',
    epic_id='E13'
)

# Add relationship
kb.add_relationship(
    'COMP-MY-FEATURE',
    'COMP-MCP-QUALITY',
    'depends_on',
    'Uses quality gates',
    strength='critical'
)

# Get dependencies
deps = kb.get_dependencies('COMP-MY-FEATURE')
print(f"Depends on: {[d['name'] for d in deps]}")

# Get dependents (blast radius)
dependents = kb.get_dependents('COMP-MCP-QUALITY')
print(f"If quality gates break, affects: {[d['name'] for d in dependents]}")

# Get hierarchy
hierarchy = kb.get_hierarchy('COMP-MY-FEATURE')
for item in hierarchy:
    indent = "  " * abs(item['depth'])
    print(f"{indent}{item['name']} ({item['level']})")

kb.close()
```

---

## Common Queries

### Find Blast Radius

"If I change component X, what breaks?"

```python
dependents = kb.get_dependents('COMP-MCP-QUALITY')
# Returns all components that depend on quality gates
```

### Find Dependencies

"What does component X need to work?"

```python
deps = kb.get_dependencies('COMP-MCP-ORCHESTRATOR')
# Returns: Quality, Router, Agents, Roadmap
```

### Get Epic Architecture

"Show me all architecture for Epic E6"

```python
components = kb.get_epic_architecture('E6')
# Returns all MCP components
```

### Find Cross-Epic Coupling

"What dependencies cross epic boundaries?"

```sql
SELECT
  c1.epic_id as from_epic,
  c2.epic_id as to_epic,
  COUNT(*) as coupling_count
FROM architecture_relationships r
JOIN architecture_components c1 ON r.from_component_id = c1.component_id
JOIN architecture_components c2 ON r.to_component_id = c2.component_id
WHERE c1.epic_id != c2.epic_id
GROUP BY c1.epic_id, c2.epic_id
ORDER BY coupling_count DESC;
```

---

## Architecture Decision Records (ADRs)

Track architectural decisions:

```python
# Add ADR
kb.conn.execute("""
    INSERT INTO architecture_decisions
    (adr_id, title, date, status, context, decision, consequences, affects_components)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
""", (
    'ADR-001',
    'Use multi-domain genius-level reviews',
    '2025-10-23',
    'accepted',
    'Quality gates were too mechanical (checkbox thinking)',
    'Implement DomainExpertReviewer with 16 expert domains',
    'Higher quality but more expensive (multiple Opus calls)',
    '["COMP-MCP-QUALITY", "MOD-QG-DOMAIN-EXPERT"]'
))
```

---

## Integration with Remediation

Each remediation task can update architecture:

```python
# When verifying a task
kb.log_change(
    'COMP-MCP-QUALITY',
    'modified',
    'Fixed adversarial detector regex bug',
    task_id='REMEDIATION-ALL-QUALITY-GATES-DOGFOOD'
)

# Update health after verification
kb.conn.execute("""
    UPDATE architecture_components
    SET health = 'healthy',
        test_coverage = 100.0,
        last_verified_at = CURRENT_TIMESTAMP
    WHERE component_id = ?
""", ('COMP-MCP-QUALITY',))
```

---

## Benefits Over Markdown

**Markdown Approach**:
- ❌ Hard to find relationships
- ❌ Manual cross-references
- ❌ No history tracking
- ❌ Hard to query
- ❌ Gets out of date

**Database Approach**:
- ✅ Automatic relationship queries
- ✅ Full change history
- ✅ Rich queries (SQL)
- ✅ Programmatic access
- ✅ Can auto-update from code

---

## Next Steps

### Immediate:
1. ✅ Database initialized
2. ✅ Schema created
3. ✅ Basic components populated
4. ⏳ Integrate with remediation tasks (update health after verification)

### Short-term:
1. Add ALL WeatherVane components (not just MCP)
2. Track test coverage from actual test runs
3. Auto-update from git commits
4. Generate architecture diagrams from relationships
5. Link to actual code files

### Long-term:
1. Auto-discover components from codebase
2. Detect architecture drift (code vs. documented)
3. Recommend refactoring based on coupling
4. Predict blast radius for changes
5. Generate ADRs automatically from major changes

---

## Files

- **Database**: `state/architecture.db`
- **Schema**: `tools/wvo_mcp/scripts/init_architecture_db.sql`
- **CLI**: `tools/wvo_mcp/scripts/architecture_kb.py`
- **Populate**: `tools/wvo_mcp/scripts/populate_architecture.py`
- **Docs**: `docs/ARCHITECTURE_KNOWLEDGE_BASE.md` (this file)

---

## Example: Navigate Quality Gate Architecture

```python
from architecture_kb import ArchitectureKB

kb = ArchitectureKB()
kb.connect()

# Get quality component
quality = kb.export_component('COMP-MCP-QUALITY')

print("Component:", quality['component']['name'])
print("\nParent:")
hierarchy = kb.get_hierarchy('COMP-MCP-QUALITY')
parent = [h for h in hierarchy if h['depth'] < 0]
for p in parent:
    print(f"  {p['name']} ({p['level']})")

print("\nChildren (modules):")
children = [h for h in hierarchy if h['depth'] > 0]
for c in children:
    print(f"  {c['name']} ({c['level']})")

print("\nDependencies:")
for dep in quality['dependencies']:
    print(f"  {dep['name']} ({dep['relationship_type']}, {dep['strength']})")

print("\nDependents (who uses this):")
for dep in quality['dependents']:
    print(f"  {dep['name']} ({dep['relationship_type']}, {dep['strength']})")
```

Output:
```
Component: Quality Gate System

Parent:
  MCP Orchestrator (subsystem)

Children (modules):
  QualityGateOrchestrator (module)
  AdversarialBullshitDetector (module)
  DomainExpertReviewer (module)

Dependencies:
  DomainExpertReviewer (depends_on, strong)
  AdversarialBullshitDetector (depends_on, strong)

Dependents (who uses this):
  Unified Orchestrator (depends_on, critical)
  Critic System (monitors, normal)
```

---

**Status**: ✅ Implemented and working

**Database**: `state/architecture.db` (15 components, 10 relationships)

**Advantage**: Structured, queryable, trackable architecture instead of scattered markdown files
