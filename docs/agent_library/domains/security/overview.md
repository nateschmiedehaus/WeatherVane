# Security Domain - Overview

WeatherVane's security architecture, threat model, and compliance requirements.

---

## Security Architecture

```
┌──────────────────────────────────────────────────────┐
│              Security Layers                         │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────┐     │
│  │  Application Security                      │     │
│  │  - Input validation                        │     │
│  │  - Output encoding                         │     │
│  │  - SQL injection prevention                │     │
│  │  - XSS protection                          │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Secrets Management                        │     │
│  │  - Environment variables                   │     │
│  │  - Encrypted storage                       │     │
│  │  - Key rotation                            │     │
│  │  - Access control                          │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Authentication & Authorization            │     │
│  │  - API key auth (current)                  │     │
│  │  - JWT tokens (future)                     │     │
│  │  - Role-based access control (RBAC)        │     │
│  └────────┬──────────────────────────────────┘     │
│           │                                          │
│           ↓                                          │
│  ┌────────────────────────────────────────────┐     │
│  │  Audit & Compliance                        │     │
│  │  - Audit logging                           │     │
│  │  - Security scanning (npm audit)           │     │
│  │  - Dependency monitoring                   │     │
│  │  - Incident response                       │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Threat Model

### Assets to Protect

**1. Customer Data**:
- Ad account credentials (Google, Meta)
- Shopify store data
- Sales/revenue data
- Email addresses (Klaviyo)

**2. API Keys & Secrets**:
- Weather API keys
- Provider API keys (Codex, Claude)
- Database credentials
- OAuth tokens

**3. Intellectual Property**:
- ML models (MMM coefficients)
- Optimization algorithms
- Feature engineering logic

---

### Threat Actors

**1. External Attackers**:
- **Goal**: Steal customer data, API keys
- **Methods**: SQL injection, XSS, credential stuffing
- **Likelihood**: Medium
- **Impact**: Critical

**2. Malicious Insiders**:
- **Goal**: Exfiltrate data, sabotage system
- **Methods**: Abuse access, backdoors
- **Likelihood**: Low
- **Impact**: High

**3. Compromised Dependencies**:
- **Goal**: Supply chain attack
- **Methods**: Malicious npm packages
- **Likelihood**: Medium
- **Impact**: High

---

### Attack Vectors

**1. API Vulnerabilities**:
```
Threat: SQL injection in API endpoints
Example: /api/plans?tenant_id=' OR '1'='1
Mitigation: Parameterized queries, input validation
```

**2. Secrets Exposure**:
```
Threat: API keys committed to git
Example: WEATHER_API_KEY="sk_live_..." in code
Mitigation: Environment variables, .gitignore, secret scanning
```

**3. Dependency Vulnerabilities**:
```
Threat: Vulnerable npm packages
Example: lodash <4.17.21 (prototype pollution)
Mitigation: npm audit, automated updates, SCA scanning
```

**4. Insufficient Access Control**:
```
Threat: Tenant A can access Tenant B's data
Example: GET /api/tenants/tenant_B/sales (from tenant_A session)
Mitigation: JWT with tenant_id claim, row-level security
```

---

## Security Controls

### 1. Input Validation

**All user inputs must be validated**:

```python
from pydantic import BaseModel, validator

class PlanRequest(BaseModel):
    tenant_id: str
    start_date: date
    end_date: date

    @validator('tenant_id')
    def validate_tenant_id(cls, v):
        # Only alphanumeric + hyphens
        if not re.match(r'^[a-zA-Z0-9-]+$', v):
            raise ValueError('Invalid tenant_id format')
        return v

    @validator('end_date')
    def validate_date_range(cls, v, values):
        if v < values['start_date']:
            raise ValueError('end_date must be >= start_date')
        return v
```

**SQL Injection Prevention**:
```python
# ❌ WRONG - SQL injection risk
query = f"SELECT * FROM tenants WHERE id = '{tenant_id}'"

# ✅ CORRECT - Parameterized query
query = "SELECT * FROM tenants WHERE id = ?"
db.execute(query, (tenant_id,))
```

---

### 2. Secrets Management

**See**: [Secrets Management](/docs/agent_library/domains/security/secrets_management.md)

**Key principles**:
- Never commit secrets to git
- Use environment variables or secret managers
- Rotate secrets regularly (90 days)
- Audit secret access

---

### 3. Authentication

**Current** (API key):
```typescript
function authenticateRequest(req: Request): boolean {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    throw new UnauthorizedError('API key required');
  }

  const isValid = validateApiKey(apiKey);
  if (!isValid) {
    throw new UnauthorizedError('Invalid API key');
  }

  return true;
}
```

**Future** (JWT tokens):
```typescript
function authenticateJWT(req: Request): User {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    throw new UnauthorizedError('Token required');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  return {
    userId: decoded.sub,
    tenantId: decoded.tenant_id,
    roles: decoded.roles
  };
}
```

---

### 4. Authorization (RBAC)

**Role hierarchy**:
```
Admin: Full access (CRUD on all resources)
├─ Manager: Read/write plans, budgets, campaigns
└─ Viewer: Read-only access to analytics
```

**Implementation**:
```python
from enum import Enum

class Role(Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    VIEWER = "viewer"

def require_role(required_role: Role):
    def decorator(func):
        def wrapper(user, *args, **kwargs):
            if user.role.value < required_role.value:
                raise ForbiddenError(f"Requires {required_role.value} role")
            return func(user, *args, **kwargs)
        return wrapper
    return decorator

@require_role(Role.MANAGER)
def update_plan(user, plan_id, updates):
    # Only managers and admins can update plans
    ...
```

---

### 5. Audit Logging

**Log all security-relevant events**:

```typescript
interface AuditEvent {
  timestamp: string;
  userId: string;
  tenantId: string;
  action: string;  // e.g., "plan_created", "user_login"
  resource: string;  // e.g., "plan:P123"
  outcome: 'success' | 'failure';
  ipAddress: string;
  metadata?: Record<string, any>;
}

function logAuditEvent(event: AuditEvent): void {
  const logEntry = {
    ...event,
    timestamp: new Date().toISOString()
  };

  // Append to audit log (immutable)
  fs.appendFileSync(
    'state/audit/events.jsonl',
    JSON.stringify(logEntry) + '\n'
  );
}
```

**Example events**:
```json
{"timestamp":"2025-10-23T12:00:00Z","userId":"user_123","action":"plan_created","resource":"plan:P456","outcome":"success"}
{"timestamp":"2025-10-23T12:01:00Z","userId":"user_789","action":"plan_view","resource":"plan:P456","outcome":"failure","reason":"unauthorized"}
```

---

## Security Scanning

### Dependency Scanning

**Tool**: `npm audit`

**Frequency**: Every build + daily

**Command**:
```bash
npm audit --json > state/security/npm_audit.json
```

**Threshold**: 0 high or critical vulnerabilities

**Workflow**:
1. Run `npm audit`
2. If vulnerabilities found:
   - Run `npm audit fix` (auto-fix)
   - If auto-fix fails: Manual upgrade or investigate
3. Block PR/deployment if critical vulnerabilities remain

---

### Static Code Analysis

**Tools**:
- **TypeScript**: `tsc --strict` (no type errors)
- **Python**: `mypy` (type checking), `bandit` (security linting)
- **SQL**: Parameterized queries only

**Example** (`bandit` for Python):
```bash
bandit -r apps/ shared/ -f json -o state/security/bandit.json
```

**Critical findings** (must fix):
- SQL injection vectors
- Hard-coded secrets
- Insecure random number generation
- Unvalidated redirects

---

### Secret Scanning

**Tool**: `git-secrets` or GitHub Advanced Security

**Pre-commit hook**:
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Scan for secrets
git diff --cached --name-only | xargs git-secrets --scan

if [ $? -ne 0 ]; then
  echo "Error: Secrets detected in commit. Please remove."
  exit 1
fi
```

**Patterns to detect**:
- API keys: `sk_live_[a-zA-Z0-9]{32}`
- AWS keys: `AKIA[A-Z0-9]{16}`
- Private keys: `-----BEGIN PRIVATE KEY-----`

---

## Incident Response

### Incident Types

**1. Data Breach**:
- **Indicators**: Unauthorized data access, data exfiltration
- **Response**: Lock accounts, rotate credentials, notify affected users

**2. Service Disruption**:
- **Indicators**: DDoS, system unavailable
- **Response**: Rate limiting, failover, traffic filtering

**3. Credential Compromise**:
- **Indicators**: Failed logins, suspicious activity
- **Response**: Revoke credentials, force password reset, MFA enforcement

---

### Incident Response Workflow

```
1. DETECT
   └─→ Monitoring, logs, alerts

2. TRIAGE
   ├─→ Severity: Critical, High, Medium, Low
   └─→ Impact: Number of users affected

3. CONTAIN
   ├─→ Revoke access
   ├─→ Isolate affected systems
   └─→ Preserve evidence

4. ERADICATE
   ├─→ Remove threat
   ├─→ Patch vulnerabilities
   └─→ Rotate credentials

5. RECOVER
   ├─→ Restore from backup
   ├─→ Verify integrity
   └─→ Monitor for re-infection

6. LESSONS LEARNED
   ├─→ Root cause analysis
   ├─→ Update runbooks
   └─→ Implement preventive controls
```

---

## Compliance Requirements

### GDPR (if applicable)

**Requirements**:
- User consent for data processing
- Right to access (data export)
- Right to erasure (account deletion)
- Data breach notification (72 hours)

**Implementation**:
```python
def export_user_data(user_id):
    """GDPR Article 15: Right to access"""
    user_data = {
        'user': db.query("SELECT * FROM users WHERE id = ?", (user_id,)),
        'plans': db.query("SELECT * FROM plans WHERE user_id = ?", (user_id,)),
        'analytics': db.query("SELECT * FROM analytics WHERE user_id = ?", (user_id,))
    }
    return json.dumps(user_data, indent=2)

def delete_user_data(user_id):
    """GDPR Article 17: Right to erasure"""
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.execute("DELETE FROM plans WHERE user_id = ?", (user_id,))
    # Anonymize analytics (retain for aggregate stats)
    db.execute("UPDATE analytics SET user_id = 'deleted' WHERE user_id = ?", (user_id,))
```

---

### SOC 2 (future)

**Type II Controls**:
- Access control (least privilege)
- Change management (audit trail)
- Availability monitoring (uptime SLA)
- Data encryption (at rest + in transit)

---

## Security Checklist

Before deploying to production:

- [ ] **Secrets**: No secrets in code, all in env vars
- [ ] **Dependencies**: `npm audit` shows 0 vulnerabilities
- [ ] **Authentication**: All endpoints require auth
- [ ] **Authorization**: RBAC enforced, tenant isolation verified
- [ ] **Input validation**: All inputs validated with schema
- [ ] **SQL injection**: All queries parameterized
- [ ] **XSS protection**: All outputs encoded
- [ ] **HTTPS**: TLS 1.2+ enforced
- [ ] **Audit logging**: Security events logged
- [ ] **Backups**: Automated daily backups
- [ ] **Incident response**: Runbook documented

---

## Key Documents

- [Security Audit](/docs/SECURITY_AUDIT.md)
- [Secrets Management](/docs/agent_library/domains/security/secrets_management.md)
- [Audit Requirements](/docs/agent_library/domains/security/audit_requirements.md)
- [Security Standards](/docs/agent_library/common/standards/security_standards.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
