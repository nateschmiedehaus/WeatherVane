# Infrastructure Domain - Overview

WeatherVane's infrastructure, automation, and orchestration systems.

---

## Infrastructure Architecture

```
┌──────────────────────────────────────────────────────┐
│              Infrastructure Stack                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────┐     │
│  │  MCP (Model Context Protocol) Server       │     │
│  │  - Tool routing                            │     │
│  │  - State management (SQLite)               │     │
│  │  - Provider management                     │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Unified Orchestrator                      │     │
│  │  - Task scheduling (WSJF)                  │     │
│  │  - WIP management                          │     │
│  │  - Agent pool coordination                 │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Health Monitoring (OODA Loop)             │     │
│  │  - Stale task recovery                     │     │
│  │  - Dependency sync                         │     │
│  │  - Throughput monitoring                   │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Providers (Codex + Claude Code)           │     │
│  │  - Token management                        │     │
│  │  - Model routing (tiers)                   │     │
│  │  - Failover logic                          │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. MCP Server

**Purpose**: Multi-tenant orchestration protocol server

**Location**: `tools/wvo_mcp/src/`

**Features**:
- **Tool routing**: 40+ MCP tools (plan_next, context_write, etc.)
- **State management**: SQLite database for tasks, dependencies
- **Provider management**: Codex + Claude Code coordination
- **Telemetry**: OpenTelemetry tracing

See [MCP Architecture](/docs/agent_library/domains/infrastructure/mcp_architecture.md)

---

### 2. Unified Orchestrator

**Purpose**: Task scheduling and agent coordination

**Location**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

**Features**:
- **WSJF Scheduling**: Weighted Shortest Job First (value / complexity)
- **WIP Management**: Work-in-progress limits (default: 3 tasks)
- **Agent Pool**: Multi-provider agent coordination
- **Prefetch Queue**: Keep agents busy (queue depth: 10-20 tasks)

**Key Metrics**:
- Throughput: 5-10 tasks/hour
- Queue utilization: 60-80%
- WIP utilization: 80-100%

---

### 3. Health Monitoring

**Purpose**: Real-time system health with auto-remediation

**Location**: `tools/wvo_mcp/src/orchestrator/autopilot_health_monitor.ts`

**OODA Loop**:
1. **Observe**: Task states, queue depth, throughput
2. **Orient**: Detect anomalies (stale tasks, desync, degradation)
3. **Decide**: Plan safe remediation
4. **Act**: Auto-recover stale tasks, alert on critical issues

**Frequency**: Every 60 seconds (configurable)

See [Autopilot System](/docs/agent_library/domains/infrastructure/autopilot_system.md)

---

### 4. Provider Management

**Purpose**: Multi-provider coordination with failover

**Providers**:
- **Codex**: OpenAI GPT-5 Codex (3 tiers: LOW/MEDIUM/HIGH)
- **Claude Code**: Anthropic Sonnet 4.5

**Routing**:
- **Simple tasks** (complexity ≤4) → Codex LOW tier
- **Moderate tasks** (complexity 5-7) → Codex MEDIUM tier
- **Complex tasks** (complexity 8-10) → Codex HIGH tier or Claude
- **Failover**: If Codex at capacity → Claude Code

**Token Management**:
- Hourly limits (Codex: varies by tier)
- Daily limits (Codex: varies by tier)
- Intelligent routing to stay within limits

---

## Infrastructure as Code

### Configuration Files

**MCP Config**: `tools/wvo_mcp/mcp.json`
```json
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ROOT": "/path/to/workspace",
        "OTEL_ENABLED": "1"
      }
    }
  }
}
```

**Orchestrator Config**: Environment variables
```bash
WVO_AUTOPILOT_AGENTS=3  # Agent pool size
WVO_AUTOPILOT_WIP_LIMIT=3  # Max concurrent tasks
WVO_AUTOPILOT_HEALTH_INTERVAL_MS=60000  # Health check frequency
WVO_AUTOPILOT_STALE_TASK_MINUTES=10  # Stale threshold
```

---

## Database Schema

**Location**: `tools/wvo_mcp/src/orchestrator/state_machine.ts`

**Tables**:

### tasks
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  epic_id TEXT,
  milestone_id TEXT,
  title TEXT,
  status TEXT,  -- pending, in_progress, blocked, done
  priority TEXT,  -- high, medium, low
  complexity INTEGER,  -- 1-10
  assigned_to TEXT,
  metadata TEXT,  -- JSON
  created_at TEXT,
  updated_at TEXT
);
```

### task_dependencies
```sql
CREATE TABLE task_dependencies (
  task_id TEXT,
  depends_on_task_id TEXT,
  PRIMARY KEY (task_id, depends_on_task_id)
);
```

### agent_pool
```sql
CREATE TABLE agent_pool (
  agent_id TEXT PRIMARY KEY,
  provider TEXT,  -- codex, claude
  status TEXT,  -- idle, busy
  current_task_id TEXT,
  assigned_at TEXT
);
```

---

## Telemetry & Observability

### OpenTelemetry Integration

**Enabled**: `export OTEL_ENABLED=1`

**Spans**:
- Task execution (from assignment → done)
- Critic runs
- MCP tool calls
- Provider API calls

**Metrics**:
- Task throughput (tasks/hour)
- Queue depth
- WIP utilization
- Provider token usage

**Export**: JSON files in `state/telemetry/`

See [Observability](/docs/agent_library/domains/infrastructure/observability.md)

---

## CI/CD Pipeline

### Build Pipeline

```yaml
# .github/workflows/build.yml
name: Build & Test

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - run: npm test
      - run: npm audit
```

### Nightly Jobs

**Weather Ingestion**:
```yaml
# .github/workflows/nightly-weather-ingestion.yml
name: Nightly Weather Ingestion

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - run: python scripts/weather/ingest_daily.py
```

---

## Monitoring & Alerts

### Health Checks

**Endpoint**: `/health` (future)

**Checks**:
- Database connectivity
- MCP server responsive
- Provider authentication
- Task queue not stalled

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "mcp_server": "ok",
    "providers": "ok",
    "task_queue": "ok"
  },
  "timestamp": "2025-10-23T12:00:00Z"
}
```

### Alerts

**Critical Alerts** (immediate action):
- MCP server down
- Database corruption
- All providers failing
- Task queue stalled >1 hour

**Warning Alerts** (investigate):
- Provider at 80% capacity
- Queue depth growing
- Throughput <50% of baseline
- Dependency sync ratio <80%

---

## Disaster Recovery

### Backup Strategy

**Database**:
- Snapshot every hour: `state/backups/db/state-YYYY-MM-DD-HH.db`
- Retain: 24 hours (hourly), 7 days (daily), 4 weeks (weekly)

**Roadmap**:
- Git version control (`state/roadmap.yaml`)
- Auto-commit on changes

**Context**:
- Circular buffer: `state/backups/context/context-YYYY-MM-DD-HH.md`
- Retain: Last 10 versions

### Recovery Procedures

**Database corruption**:
```bash
# Restore from last good backup
cp state/backups/db/state-2025-10-23-11.db state/state.db

# Resync roadmap
node scripts/force_roadmap_sync.mjs
```

**MCP server crash**:
```bash
# Restart MCP server
./tools/wvo_mcp/scripts/restart_mcp.sh

# Recover stale tasks
# (automatic on startup)
```

---

## Performance Optimization

### Database Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_epic_id ON tasks(epic_id);
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
```

### Query Optimization

**Find ready tasks** (optimized):
```sql
-- Use index on status + join on dependencies
SELECT t.*
FROM tasks t
WHERE t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM task_dependencies td
    JOIN tasks dep ON td.depends_on_task_id = dep.id
    WHERE td.task_id = t.id
      AND dep.status != 'done'
  )
ORDER BY
  CASE t.priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
  END,
  t.complexity ASC
LIMIT 20;
```

---

## Security

### Secrets Management

**Never commit**:
- API keys
- Database credentials
- OAuth tokens

**Use environment variables**:
```bash
export WEATHER_API_KEY="sk_live_..."
export CODEX_API_KEY="sk_..."
export CLAUDE_API_KEY="sk_..."
```

**OR secret manager**:
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secret = await getSecret('WEATHER_API_KEY');
```

### Access Control

**MCP tools**:
- No authentication required (local process only)
- Sandboxed execution (workspace-confined)

**API endpoints** (future):
- JWT authentication
- Role-based access control (RBAC)

---

## Scalability

### Current Limits

- **Agents**: 1-5 (configured via `WVO_AUTOPILOT_AGENTS`)
- **Tasks**: 100-500 (SQLite handles easily)
- **Throughput**: 5-10 tasks/hour

### Scale-Up Path

**10x scale** (50-100 tasks/hour):
- Increase agent pool to 10-20
- Add more provider accounts (Codex tiers)
- Optimize database queries
- Add caching layer

**100x scale** (500-1000 tasks/hour):
- Migrate to PostgreSQL (better concurrency)
- Horizontal scaling (multiple orchestrators)
- Task sharding (by epic/milestone)
- Distributed queue (RabbitMQ, Redis)

---

## Key Documents

- [MCP Architecture](/docs/agent_library/domains/infrastructure/mcp_architecture.md)
- [Autopilot System](/docs/agent_library/domains/infrastructure/autopilot_system.md)
- [Observability](/docs/agent_library/domains/infrastructure/observability.md)
- [Development Guide](/docs/DEVELOPMENT.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
