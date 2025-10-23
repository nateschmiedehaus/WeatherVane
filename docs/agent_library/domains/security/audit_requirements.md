# Audit Requirements

Logging, monitoring, and compliance audit trails for WeatherVane.

---

## Quick Reference

**Primary Documentation**: `/docs/SECURITY_AUDIT.md`

**Purpose**: Maintain audit trail for security, compliance, and debugging

---

## Audit Event Types

### 1. Authentication Events

**Events to log**:
- User login (success/failure)
- API key validation (success/failure)
- Session creation/expiration
- Password reset
- MFA challenges

**Schema**:
```typescript
interface AuthEvent {
  timestamp: string;
  eventType: 'login' | 'logout' | 'api_key_auth' | 'session_expire';
  userId?: string;
  tenantId?: string;
  outcome: 'success' | 'failure';
  ipAddress: string;
  userAgent?: string;
  failureReason?: string;
}
```

**Example**:
```json
{
  "timestamp": "2025-10-23T12:00:00Z",
  "eventType": "login",
  "userId": "user_123",
  "tenantId": "tenant_abc",
  "outcome": "success",
  "ipAddress": "203.0.113.42",
  "userAgent": "Mozilla/5.0..."
}
```

---

### 2. Data Access Events

**Events to log**:
- Plan view/creation/update/deletion
- Sales data export
- Analytics dashboard access
- Tenant data access

**Schema**:
```typescript
interface DataAccessEvent {
  timestamp: string;
  eventType: 'view' | 'create' | 'update' | 'delete' | 'export';
  userId: string;
  tenantId: string;
  resource: string;  // e.g., "plan:P123"
  outcome: 'success' | 'failure';
  failureReason?: string;
}
```

**Example**:
```json
{
  "timestamp": "2025-10-23T12:01:00Z",
  "eventType": "export",
  "userId": "user_456",
  "tenantId": "tenant_abc",
  "resource": "sales_data:2025-10",
  "outcome": "success"
}
```

---

### 3. Administrative Events

**Events to log**:
- User creation/deletion
- Role assignment
- Permission changes
- Configuration updates
- Secret rotation

**Schema**:
```typescript
interface AdminEvent {
  timestamp: string;
  eventType: 'user_create' | 'user_delete' | 'role_assign' | 'config_update' | 'secret_rotate';
  adminUserId: string;
  targetUserId?: string;
  changes: Record<string, any>;
  outcome: 'success' | 'failure';
}
```

**Example**:
```json
{
  "timestamp": "2025-10-23T12:02:00Z",
  "eventType": "role_assign",
  "adminUserId": "admin_789",
  "targetUserId": "user_456",
  "changes": {
    "role": {
      "from": "viewer",
      "to": "manager"
    }
  },
  "outcome": "success"
}
```

---

### 4. System Events

**Events to log**:
- Autopilot start/stop
- Task execution (start/complete/fail)
- Critic runs
- Provider failover
- Database backups

**Schema**:
```typescript
interface SystemEvent {
  timestamp: string;
  eventType: 'autopilot_start' | 'task_complete' | 'critic_run' | 'backup_complete';
  component: string;  // e.g., "unified_orchestrator"
  metadata: Record<string, any>;
  outcome: 'success' | 'failure';
}
```

**Example**:
```json
{
  "timestamp": "2025-10-23T12:03:00Z",
  "eventType": "task_complete",
  "component": "unified_orchestrator",
  "metadata": {
    "task_id": "T1.1.1",
    "duration_ms": 125000,
    "complexity": 5
  },
  "outcome": "success"
}
```

---

## Audit Log Storage

### File-Based Logs (Current)

**Location**: `state/audit/`

**Files**:
- `auth.jsonl` - Authentication events
- `data_access.jsonl` - Data access events
- `admin.jsonl` - Administrative events
- `system.jsonl` - System events

**Format**: JSON Lines (one JSON object per line)

**Example**:
```bash
# View recent auth events
tail -20 state/audit/auth.jsonl | jq .

# Find failed logins
grep '"outcome":"failure"' state/audit/auth.jsonl | jq .
```

**Retention**: 90 days

**Rotation**:
```bash
# Rotate logs (daily cron job)
#!/bin/bash
ARCHIVE_DIR="state/audit/archives/$(date +%Y-%m)"
mkdir -p "$ARCHIVE_DIR"

for log in state/audit/*.jsonl; do
  if [ $(wc -l < "$log") -gt 10000 ]; then
    mv "$log" "$ARCHIVE_DIR/$(basename "$log" .jsonl)-$(date +%Y-%m-%d).jsonl"
    touch "$log"  # Create new empty file
  fi
done
```

---

### Database Storage (Future)

**Table**: `audit_events`

```sql
CREATE TABLE audit_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(100),
  tenant_id VARCHAR(100),
  resource VARCHAR(255),
  outcome VARCHAR(20) NOT NULL,
  ip_address INET,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX idx_audit_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_tenant_id ON audit_events(tenant_id);
CREATE INDEX idx_audit_outcome ON audit_events(outcome);
```

**Query examples**:
```sql
-- Recent failed events
SELECT * FROM audit_events
WHERE outcome = 'failure'
ORDER BY timestamp DESC
LIMIT 20;

-- User activity
SELECT * FROM audit_events
WHERE user_id = 'user_123'
ORDER BY timestamp DESC;

-- Export attempts
SELECT * FROM audit_events
WHERE event_type = 'export'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

---

## Logging Implementation

### Audit Logger

```typescript
import * as fs from 'fs';
import * as path from 'path';

class AuditLogger {
  private logDir: string;

  constructor(logDir: string = 'state/audit') {
    this.logDir = logDir;
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(category: 'auth' | 'data_access' | 'admin' | 'system', event: any): void {
    const logFile = path.join(this.logDir, `${category}.jsonl`);

    const logEntry = {
      ...event,
      timestamp: new Date().toISOString()
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  logAuth(event: AuthEvent): void {
    this.log('auth', event);
  }

  logDataAccess(event: DataAccessEvent): void {
    this.log('data_access', event);
  }

  logAdmin(event: AdminEvent): void {
    this.log('admin', event);
  }

  logSystem(event: SystemEvent): void {
    this.log('system', event);
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();
```

---

### Usage in Code

**Authentication**:
```typescript
async function login(username: string, password: string, ipAddress: string): Promise<User> {
  try {
    const user = await authenticateUser(username, password);

    auditLogger.logAuth({
      eventType: 'login',
      userId: user.id,
      tenantId: user.tenantId,
      outcome: 'success',
      ipAddress
    });

    return user;
  } catch (error) {
    auditLogger.logAuth({
      eventType: 'login',
      userId: username,  // May not be valid user
      outcome: 'failure',
      ipAddress,
      failureReason: error.message
    });

    throw error;
  }
}
```

**Data Access**:
```typescript
async function viewPlan(userId: string, planId: string): Promise<Plan> {
  const plan = await db.plans.findById(planId);

  // Check authorization
  if (plan.tenantId !== user.tenantId) {
    auditLogger.logDataAccess({
      eventType: 'view',
      userId,
      tenantId: user.tenantId,
      resource: `plan:${planId}`,
      outcome: 'failure',
      failureReason: 'unauthorized'
    });

    throw new ForbiddenError('Access denied');
  }

  auditLogger.logDataAccess({
    eventType: 'view',
    userId,
    tenantId: user.tenantId,
    resource: `plan:${planId}`,
    outcome: 'success'
  });

  return plan;
}
```

---

## Audit Reports

### Daily Audit Report

**Script**: `scripts/generate_audit_report.sh`

```bash
#!/bin/bash
REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="state/audit/reports/audit_report_$REPORT_DATE.txt"

{
  echo "=== Audit Report: $REPORT_DATE ==="
  echo ""

  echo "Authentication Events:"
  echo "  Total logins: $(grep '"eventType":"login"' state/audit/auth.jsonl | wc -l)"
  echo "  Failed logins: $(grep '"eventType":"login".*"outcome":"failure"' state/audit/auth.jsonl | wc -l)"
  echo ""

  echo "Data Access Events:"
  echo "  Total views: $(grep '"eventType":"view"' state/audit/data_access.jsonl | wc -l)"
  echo "  Exports: $(grep '"eventType":"export"' state/audit/data_access.jsonl | wc -l)"
  echo ""

  echo "Administrative Events:"
  echo "  User changes: $(grep '"eventType":"user_' state/audit/admin.jsonl | wc -l)"
  echo "  Role assignments: $(grep '"eventType":"role_assign"' state/audit/admin.jsonl | wc -l)"
  echo ""

  echo "Suspicious Activity:"
  grep '"outcome":"failure"' state/audit/*.jsonl | tail -10
} > "$REPORT_FILE"

echo "Report generated: $REPORT_FILE"
```

**Cron job**:
```cron
# Generate daily audit report at 1 AM
0 1 * * * /path/to/weathervane/scripts/generate_audit_report.sh
```

---

### Anomaly Detection

**Detect suspicious patterns**:

```typescript
interface AnomalyDetectionRule {
  name: string;
  condition: (events: AuditEvent[]) => boolean;
  severity: 'low' | 'medium' | 'high';
  action: string;
}

const rules: AnomalyDetectionRule[] = [
  {
    name: 'Multiple failed logins',
    condition: (events) => {
      const failedLogins = events.filter(
        e => e.eventType === 'login' && e.outcome === 'failure'
      );
      return failedLogins.length > 5;  // More than 5 in last hour
    },
    severity: 'high',
    action: 'Lock account, notify admin'
  },
  {
    name: 'Unusual export volume',
    condition: (events) => {
      const exports = events.filter(e => e.eventType === 'export');
      return exports.length > 10;  // More than 10 in last hour
    },
    severity: 'medium',
    action: 'Review activity, notify user'
  },
  {
    name: 'After-hours access',
    condition: (events) => {
      const hour = new Date().getHours();
      return hour < 6 || hour > 22;  // Access between 10 PM - 6 AM
    },
    severity: 'low',
    action: 'Log for review'
  }
];

function detectAnomalies(events: AuditEvent[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const rule of rules) {
    if (rule.condition(events)) {
      anomalies.push({
        rule: rule.name,
        severity: rule.severity,
        action: rule.action,
        timestamp: new Date().toISOString()
      });
    }
  }

  return anomalies;
}
```

---

## Compliance Requirements

### GDPR Audit Trail

**Article 30**: Record of processing activities

**Required**:
- Purpose of data processing
- Categories of data processed
- Recipients of data
- Data retention periods
- Security measures

**Implementation**:
```json
{
  "processing_activity": "Ad optimization",
  "data_categories": ["ad_spend", "sales", "weather"],
  "purpose": "Optimize ad budgets based on weather",
  "legal_basis": "Consent",
  "recipients": ["Internal analytics team"],
  "retention_period": "90 days",
  "security_measures": ["Encryption at rest", "Access control"]
}
```

---

### SOC 2 Audit Trail

**CC6.1**: Audit logging and monitoring

**Required**:
- All privileged user actions logged
- Logs protected from tampering
- Logs retained for 90+ days
- Regular log review

**Implementation**:
- Immutable logs (append-only)
- Log integrity checks (checksums)
- Automated log rotation
- Weekly log review

---

## Audit Log Analysis

### Query Examples

**Find all actions by a user**:
```bash
grep '"userId":"user_123"' state/audit/*.jsonl | jq .
```

**Find unauthorized access attempts**:
```bash
grep '"outcome":"failure"' state/audit/data_access.jsonl | jq .
```

**Export activity in last 7 days**:
```bash
# Get timestamp for 7 days ago
CUTOFF=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S)

grep '"eventType":"export"' state/audit/data_access.jsonl | \
  jq "select(.timestamp > \"$CUTOFF\")"
```

**Most active users**:
```bash
cat state/audit/data_access.jsonl | \
  jq -r '.userId' | \
  sort | \
  uniq -c | \
  sort -rn | \
  head -10
```

---

## Log Integrity

### Checksums

**Generate checksum** (daily):
```bash
#!/bin/bash
for log in state/audit/*.jsonl; do
  sha256sum "$log" >> state/audit/checksums.txt
done
```

**Verify integrity**:
```bash
sha256sum -c state/audit/checksums.txt
```

**If tampering detected**:
1. Alert security team
2. Restore from backup
3. Investigate unauthorized access
4. Update access controls

---

### Write-Once Storage

**Goal**: Prevent log tampering

**Implementation** (future):
- Write logs to AWS S3 with object lock
- OR append to blockchain-based audit log
- OR use immutable database (TimescaleDB with hypertables)

---

## Audit Retention

**Policy**:
- **Active logs**: 90 days (queryable)
- **Archive**: 7 years (compliance requirement)
- **Deletion**: After 7 years, securely delete

**Archival**:
```bash
#!/bin/bash
ARCHIVE_DATE=$(date -d '90 days ago' +%Y-%m-%d)

# Move old logs to cold storage (S3 Glacier)
aws s3 sync state/audit/archives/ s3://weathervane-audit-archive/ \
  --storage-class GLACIER

# Delete local copies older than 90 days
find state/audit/archives/ -type f -mtime +90 -delete
```

---

## Key Documents

- [Security Audit](/docs/SECURITY_AUDIT.md)
- [Security Overview](/docs/agent_library/domains/security/overview.md)
- [Secrets Management](/docs/agent_library/domains/security/secrets_management.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
