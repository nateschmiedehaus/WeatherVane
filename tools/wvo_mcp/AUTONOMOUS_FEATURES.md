# Autonomous Development Features

## Overview

The WeatherVane MCP server includes autonomous operation capabilities that enable continuous development, automatic roadmap extension, and intelligent task generation - all while **prioritizing shipping velocity over excessive review**.

## 🤖 Autonomous Roadmap Extension

### Philosophy

**Ship Fast, Iterate from Production**

The system is designed around these core principles:
1. **Shipping > Analysis**: Deploy early, learn from production
2. **Velocity > Perfection**: Keep momentum high, refine iteratively
3. **Production-First**: Real data beats speculation
4. **Continuous Delivery**: Always have next tasks ready

### How It Works

#### Automatic Detection

The system monitors roadmap health and triggers extension when:
- **Completion Rate > 75%**: Approaching end of roadmap
- **Pending Tasks < 3**: Running low on work to do

#### Intelligent Task Generation

Tasks are generated based on **project phase**:

**Foundation Phase** (0-30% complete)
- Core infrastructure
- Data pipelines
- Basic observability
- MVP feature set
- **Focus**: Get basics working fast

**Development Phase** (30-70% complete)
- Feature development
- Quick integration tests (critical paths only)
- Staging deployments
- Rapid iteration
- **Focus**: Build and ship features continuously

**Shipping Phase** (70-80% complete)
- Production deployment prep
- Deploy to production
- Post-deployment validation
- Start next cycle immediately
- **Focus**: Get to production ASAP

**Optimization Phase** (80%+ complete)
- Performance optimization (based on real usage)
- Technical debt (only critical)
- Refactoring (minimal, targeted)
- **Focus**: Optimize based on production data

### Generated Task Categories

Every generated task includes:
- **ID**: Unique identifier
- **Title**: Clear, action-oriented
- **Description**: Specific guidance
- **Priority**: high/medium/low
- **Category**: feature/shipping/optimization/infrastructure/bug_fix
- **Estimated Hours**: Resource planning
- **Dependencies**: Task ordering
- **Rationale**: Why this task matters

### Task Priority Rules

1. **Shipping tasks**: Always highest priority
2. **Feature tasks**: High priority in dev/foundation phases
3. **Optimization tasks**: Lower priority, only after shipping
4. **Infrastructure tasks**: As needed for shipping velocity

### Shipping Accelerator

A **mandatory shipping velocity task** is always included:
```
Title: Shipping velocity check
Description: Review deployment frequency, identify and remove bottlenecks
Priority: HIGH
Rationale: Shipping speed is paramount
```

## 📊 Roadmap Metrics

The system tracks:
- `totalTasks`: All tasks in roadmap
- `pendingTasks`: Not yet started
- `inProgressTasks`: Currently being worked on
- `completedTasks`: Finished
- `blockedTasks`: Waiting on dependencies
- `completionPercentage`: Overall progress
- `nearingCompletion`: Boolean trigger for extension

## 🔄 Using the Roadmap Auto-Extension Tool

### Manual Check

```javascript
// Check roadmap and extend if needed
await use_tool("roadmap_check_and_extend")
```

**Returns (when extension needed):**
```json
{
  "extended": true,
  "metrics": {
    "totalTasks": 20,
    "pendingTasks": 2,
    "completedTasks": 15,
    "completionPercentage": 0.75,
    "nearingCompletion": true
  },
  "generated_tasks": [
    {
      "id": "T_AUTO_1234_1",
      "title": "Deploy latest features to production",
      "priority": "high",
      "category": "shipping",
      "estimatedHours": 4,
      "rationale": "Get to production ASAP"
    },
    // ... more tasks
  ],
  "project_phase": "shipping",
  "next_action": "Add these tasks to roadmap with plan_update, then start executing",
  "philosophy": "🚀 Ship fast, iterate from production, prioritize deployment over review"
}
```

**Returns (when extension NOT needed):**
```json
{
  "metrics": {
    "totalTasks": 25,
    "pendingTasks": 8,
    "completionPercentage": 0.32,
    "nearingCompletion": false
  },
  "message": "No extension needed - roadmap healthy"
}
```

### Autonomous Operation

For fully autonomous operation, the MCP agent should:

1. **Periodically check** roadmap status (e.g., after completing each task)
2. **Auto-extend** when thresholds hit
3. **Immediately add** generated tasks to roadmap
4. **Start executing** new tasks without waiting for approval

**Example Autonomous Loop:**
```
1. Complete task
2. Call roadmap_check_and_extend
3. If extended:
   a. Add new tasks with plan_update
   b. Log extension event
   c. Call plan_next to get updated priorities
4. Start next highest-priority task
5. Repeat
```

## 🚀 Development Velocity Guidelines

### Priorities (in order)

1. **Ship code** - Deploy features to production
2. **Build features** - Create value for users
3. **Test critical paths** - Verify basics work
4. **Optimize bottlenecks** - Only if impacting production
5. **Refactor** - Only critical tech debt
6. **Document** - Minimal, essential only

### Anti-Patterns to Avoid

❌ **Excessive testing**: Focus on critical paths, not 100% coverage
❌ **Over-engineering**: Ship MVPs, iterate from real usage
❌ **Premature optimization**: Optimize based on production data
❌ **Analysis paralysis**: Bias toward action and deployment
❌ **Perfect code**: Ship working code, refine later if needed
❌ **Long review cycles**: Quick validation, iterate in production

### Metrics to Optimize

✅ **Deployment frequency**: Higher is better
✅ **Time to production**: Minimize
✅ **Feature delivery rate**: Maximize
✅ **Recovery time**: Fast rollback/fixes
✅ **Learning velocity**: Iterate from production feedback

## 🎯 Task Generation Strategy

### Foundation Phase Tasks

Focus: **Get infrastructure working fast**

Typical tasks:
- Integrate data sources (just enough to work)
- Build MVP feature matrix
- Add basic logging/monitoring
- Quick deployment pipeline

Philosophy: "Working code beats perfect architecture"

### Development Phase Tasks

Focus: **Ship features continuously**

Typical tasks:
- Build next high-value feature
- Quick integration test sweep (critical paths only)
- Deploy to staging
- Validate and iterate

Philosophy: "Deploy to staging fast, learn from real environment"

### Shipping Phase Tasks

Focus: **Get to production ASAP**

Typical tasks:
- Production deployment prep (minimal)
- Execute deployment
- Post-deploy validation (quick smoke tests)
- Start next feature immediately

Philosophy: "Ship it, monitor it, fix fast if needed"

### Optimization Phase Tasks

Focus: **Optimize based on production data**

Typical tasks:
- Performance optimization (measured bottlenecks only)
- Critical technical debt
- Targeted refactoring

Philosophy: "Optimize what matters, based on real usage"

## 📈 Roadmap Extension Examples

### Example 1: Near Completion

**Current State:**
- 18/20 tasks complete (90%)
- 2 pending tasks
- Project phase: shipping

**Auto-Generated Tasks:**
```
1. Production deployment preparation (HIGH)
2. Deploy to production (HIGH)
3. Post-deployment validation (HIGH)
4. Start next feature cycle (HIGH)
5. Shipping velocity check (HIGH)
```

### Example 2: Low Pending Buffer

**Current State:**
- 10/25 tasks complete (40%)
- 2 pending tasks (< 3 threshold)
- Project phase: development

**Auto-Generated Tasks:**
```
1. Implement next priority feature (HIGH)
2. Quick integration test pass (MEDIUM)
3. Deploy to staging and validate (HIGH)
4. Shipping velocity check (HIGH)
```

### Example 3: Healthy Roadmap

**Current State:**
- 8/30 tasks complete (27%)
- 10 pending tasks
- Project phase: foundation

**Result:**
```
No extension needed - roadmap healthy
```

## 🔧 Configuration

### Thresholds

```typescript
// Completion threshold for triggering extension
COMPLETION_THRESHOLD = 0.75 // 75%

// Minimum pending tasks to maintain
MIN_PENDING_BUFFER = 3
```

### Task Estimation

Default time estimates by category:
- **Shipping tasks**: 2-5 hours
- **Feature tasks**: 6-10 hours
- **Infrastructure**: 4-8 hours
- **Optimization**: 6-8 hours (only when appropriate)
- **Bug fixes**: 2-4 hours

## 🎓 Best Practices

### For Autonomous Agents

1. **Check frequently**: Call `roadmap_check_and_extend` after every 2-3 tasks
2. **Act immediately**: Don't wait for approval to add/start tasks
3. **Maintain velocity**: Always have 3-5 pending tasks
4. **Prioritize shipping**: Bias toward deployment tasks
5. **Log decisions**: Track why tasks were generated

### For Human Operators

1. **Trust the system**: The auto-extender prioritizes correctly
2. **Monitor metrics**: Check completion % and phase
3. **Adjust if needed**: Override priority if business needs change
4. **Review velocity**: Ensure shipping frequency stays high
5. **Provide feedback**: Refine task generation based on outcomes

## 🚦 Success Criteria

The autonomous system is working well when:

✅ **Deployment frequency**: Multiple deploys per week
✅ **Roadmap never empty**: Always 3+ pending tasks
✅ **Phase progression**: Natural flow through phases
✅ **Velocity maintained**: Consistent task completion rate
✅ **Production-first**: Most learning from real usage

## 🔮 Future Enhancements

Potential improvements:
- ML-based task prioritization
- Historical velocity analysis
- Automatic dependency detection
- Inter-agent coordination
- Custom task templates per project
- Adaptive phase detection

## 📚 Related Documentation

- `README.md` - General setup
- `CLAUDE_CODE_SETUP.md` - Claude Code integration
- `UX_IMPROVEMENTS.md` - User experience features
- `docs/MCP_ORCHESTRATOR.md` - Full architecture

---

**Remember**: The goal is **continuous delivery**, not perfect code. Ship fast, learn from production, iterate relentlessly. 🚀
