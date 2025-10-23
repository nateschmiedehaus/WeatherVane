# Threat Model

Structured analysis of threats, attack vectors, and mitigations for WeatherVane.

---

## Quick Reference

**Methodology**: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)

**Purpose**: Identify security risks before they become incidents

---

## System Components

### 1. Web Application (Next.js)

**Component**: `apps/web/`

**Trust Boundary**: User browser ↔ Web server

**Assets**:
- User session data
- Dashboard analytics
- Plan configurations

**Threats**:

| Threat Category | Specific Threat | Impact | Likelihood | Mitigation |
|----------------|----------------|--------|-----------|------------|
| **S**poofing | Session hijacking | High | Medium | HTTPS, secure cookies, short session timeout |
| **T**ampering | XSS injection | High | Medium | Output encoding, CSP headers, input validation |
| **R**epudiation | User denies action | Low | Low | Audit logging with timestamps |
| **I**nfo Disclosure | Sensitive data in DOM | Medium | Medium | Server-side rendering, sanitize responses |
| **D**enial of Service | Client-side resource exhaustion | Low | Low | Rate limiting, pagination |
| **E**levation of Privilege | Access other tenant's data | Critical | Low | Tenant isolation, JWT claims validation |

---

### 2. API Server (FastAPI)

**Component**: `apps/api/`

**Trust Boundary**: Web/mobile client ↔ API server

**Assets**:
- Customer data (ad accounts, sales)
- API keys
- Business logic

**Threats**:

| Threat Category | Specific Threat | Impact | Likelihood | Mitigation |
|----------------|----------------|--------|-----------|------------|
| **S**poofing | API key theft | Critical | Medium | HTTPS only, key rotation, rate limiting |
| **T**ampering | SQL injection | Critical | Low | Parameterized queries, ORM usage |
| **R**epudiation | API call denial | Low | Low | Audit logging with request ID |
| **I**nfo Disclosure | Verbose error messages | Medium | Medium | Generic error responses, log details server-side |
| **D**enial of Service | API abuse | Medium | High | Rate limiting (100 req/min), API quotas |
| **E**levation of Privilege | Bypass RBAC | Critical | Low | Centralized auth middleware, policy enforcement |

**Mitigations**:

```python
# Input validation
from pydantic import BaseModel, validator

class PlanRequest(BaseModel):
    tenant_id: str

    @validator('tenant_id')
    def validate_tenant_id(cls, v):
        if not re.match(r'^[a-zA-Z0-9-]+$', v):
            raise ValueError('Invalid tenant_id')
        return v

# SQL injection prevention
query = "SELECT * FROM plans WHERE tenant_id = ?"
db.execute(query, (tenant_id,))  # Parameterized

# Rate limiting
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

@app.get("/api/plans")
@limiter.limit("100/minute")
async def get_plans(request: Request):
    ...
```

---

### 3. Database (PostgreSQL / SQLite)

**Component**: `state/state.db` (SQLite), `postgresql://...` (PostgreSQL)

**Trust Boundary**: API server ↔ Database

**Assets**:
- All customer data
- User credentials
- Audit logs

**Threats**:

| Threat Category | Specific Threat | Impact | Likelihood | Mitigation |
|----------------|----------------|--------|-----------|------------|
| **S**poofing | Connection hijacking | Critical | Low | TLS encryption, cert validation |
| **T**ampering | Unauthorized data modification | Critical | Low | Access control, connection pooling |
| **R**epudiation | Database change denial | Medium | Low | Database audit logs, transaction logs |
| **I**nfo Disclosure | Database backup theft | Critical | Medium | Encryption at rest, backup encryption |
| **D**enial of Service | Database connection exhaustion | High | Medium | Connection pooling, query timeouts |
| **E**levation of Privilege | SQL injection → admin access | Critical | Low | Principle of least privilege, no DB admin from app |

**Mitigations**:

```bash
# Encryption at rest (PostgreSQL)
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET archive_mode = on;

# TLS connection
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Least privilege user
CREATE USER weathervane_app WITH PASSWORD 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON plans, tasks TO weathervane_app;
-- No DROP, CREATE, TRUNCATE permissions
```

---

### 4. ML Pipeline (Python)

**Component**: `apps/model/`, `shared/feature_store/`

**Trust Boundary**: API server ↔ ML pipeline

**Assets**:
- Training data
- Model artifacts
- Feature definitions

**Threats**:

| Threat Category | Specific Threat | Impact | Likelihood | Mitigation |
|----------------|----------------|--------|-----------|------------|
| **S**poofing | Fake training data | Medium | Low | Data lineage tracking, checksums |
| **T**ampering | Model poisoning | High | Low | Model versioning, canary validation |
| **R**epudiation | Model prediction denial | Low | Low | Prediction logging with input hash |
| **I**nfo Disclosure | Model theft | Medium | Low | Access control on model artifacts |
| **D**enial of Service | Training resource exhaustion | Medium | Medium | Resource limits (CPU, memory, time) |
| **E**levation of Privilege | Arbitrary code execution via pickle | Critical | Low | Use safe serialization (joblib, not pickle) |

**Mitigations**:

```python
# Safe model serialization
import joblib  # Safer than pickle

# Save model
joblib.dump(model, 'model.pkl')

# Load with validation
loaded_model = joblib.load('model.pkl')
assert hasattr(loaded_model, 'predict')  # Validate it's a model

# Resource limits
import resource

# Limit training time (2 hours)
resource.setrlimit(resource.RLIMIT_CPU, (7200, 7200))

# Limit memory (4GB)
resource.setrlimit(resource.RLIMIT_AS, (4 * 1024 ** 3, 4 * 1024 ** 3))
```

---

### 5. External Integrations

**Components**: Weather API, Google Ads API, Meta Ads API, Shopify API

**Trust Boundary**: WeatherVane ↔ External API

**Assets**:
- API keys
- OAuth tokens
- Customer ad accounts

**Threats**:

| Threat Category | Specific Threat | Impact | Likelihood | Mitigation |
|----------------|----------------|--------|-----------|------------|
| **S**poofing | API endpoint spoofing | Medium | Low | Certificate pinning, domain validation |
| **T**ampering | MITM attack | High | Low | HTTPS only, TLS 1.2+ |
| **R**epudiation | API call denial | Low | Low | Request logging with correlation ID |
| **I**nfo Disclosure | API key leakage | Critical | Medium | Environment variables, secret rotation |
| **D**enial of Service | Rate limit exhaustion | Medium | High | Request throttling, quota management |
| **E**levation of Privilege | Stolen OAuth token | Critical | Medium | Token refresh, scope limitation |

**Mitigations**:

```typescript
// HTTPS only
const axiosInstance = axios.create({
  baseURL: 'https://api.weather.com',
  timeout: 5000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: true  // Reject self-signed certs
  })
});

// Request logging
axiosInstance.interceptors.request.use((config) => {
  const correlationId = uuidv4();
  config.headers['X-Correlation-Id'] = correlationId;

  logAuditEvent({
    eventType: 'external_api_call',
    correlationId,
    endpoint: config.url,
    timestamp: new Date().toISOString()
  });

  return config;
});

// OAuth scope limitation
const scopes = [
  'https://www.googleapis.com/auth/adwords.readonly'  // Read-only, not write
];
```

---

## Attack Trees

### Attack: Steal Customer Data

```
Goal: Exfiltrate customer sales data
├─ Attack Vector 1: SQL Injection
│  ├─ Step 1: Find vulnerable endpoint
│  ├─ Step 2: Craft injection payload
│  ├─ Step 3: Extract data
│  └─ Mitigation: Parameterized queries ✅
│
├─ Attack Vector 2: Stolen API key
│  ├─ Step 1: Find API key in code/logs
│  ├─ Step 2: Use key to access API
│  ├─ Step 3: Download all data
│  └─ Mitigation: Secret scanning, key rotation ✅
│
└─ Attack Vector 3: Compromised admin account
   ├─ Step 1: Phish admin credentials
   ├─ Step 2: Login as admin
   ├─ Step 3: Export all tenant data
   └─ Mitigation: MFA, access logging, rate limiting 🔶
```

**Legend**:
- ✅ Mitigated
- 🔶 Partially mitigated
- ❌ Not mitigated

---

### Attack: Denial of Service

```
Goal: Make WeatherVane unavailable
├─ Attack Vector 1: API abuse
│  ├─ Step 1: Obtain valid API key
│  ├─ Step 2: Send 10,000 req/sec
│  ├─ Step 3: Exhaust server resources
│  └─ Mitigation: Rate limiting (100/min) ✅
│
├─ Attack Vector 2: Database connection exhaustion
│  ├─ Step 1: Open many DB connections
│  ├─ Step 2: Hold connections open
│  ├─ Step 3: Block legitimate requests
│  └─ Mitigation: Connection pooling (max 10) ✅
│
└─ Attack Vector 3: Resource exhaustion
   ├─ Step 1: Upload large file
   ├─ Step 2: Trigger expensive computation
   ├─ Step 3: OOM crash
   └─ Mitigation: File size limits, timeout ✅
```

---

## Data Flow Diagrams

### User → Dashboard → API → Database

```
┌─────────┐
│ Browser │ (1) HTTPS GET /dashboard
└────┬────┘
     │
     ↓
┌─────────────┐
│  Web Server │ (2) Render dashboard
│  (Next.js)  │
└─────┬───────┘
      │
      │ (3) HTTPS POST /api/plans?tenant_id=X
      ↓
┌──────────────┐
│  API Server  │ (4) Validate JWT, check tenant_id
│  (FastAPI)   │
└──────┬───────┘
       │
       │ (5) SELECT * FROM plans WHERE tenant_id = ?
       ↓
┌──────────────┐
│  Database    │ (6) Return plans for tenant X only
│  (PostgreSQL)│
└──────────────┘
```

**Threats at each step**:
1. **Browser → Web**: Session hijacking, XSS
2. **Web Server**: XSS, CSRF
3. **Web → API**: API key theft, MITM
4. **API Server**: SQL injection, IDOR (Insecure Direct Object Reference)
5. **API → DB**: Connection hijacking
6. **Database**: Unauthorized access

---

## Risk Assessment

### High Risk (Immediate attention)

| Threat | Impact | Likelihood | Risk Score | Action |
|--------|--------|-----------|-----------|---------|
| API key exposure | Critical | Medium | **9** | Implement secret scanning, key rotation |
| SQL injection | Critical | Low | **6** | Audit all queries, enforce ORM |
| OAuth token theft | Critical | Medium | **9** | Short-lived tokens, scope limitation |

### Medium Risk (Address in Q1 2026)

| Threat | Impact | Likelihood | Risk Score | Action |
|--------|--------|-----------|-----------|---------|
| DoS via API abuse | High | Medium | **6** | Enhanced rate limiting, CAPTCHA |
| XSS in dashboard | High | Low | **4** | CSP headers, output encoding audit |
| Dependency vulnerabilities | Medium | High | **6** | Automated scanning, update policy |

### Low Risk (Monitor)

| Threat | Impact | Likelihood | Risk Score | Action |
|--------|--------|-----------|-----------|---------|
| Session fixation | Medium | Low | **2** | Session regeneration on login |
| Verbose errors | Low | Medium | **2** | Generic error messages |

**Risk Score**: Impact (1-3) × Likelihood (1-3) → 1-9

---

## Threat Hunting

### Indicators of Compromise (IOCs)

**Authentication anomalies**:
- Multiple failed logins from same IP
- Login from unusual geolocation
- After-hours access

**Data access anomalies**:
- Bulk export (>1000 records)
- Access to many tenants in short time
- Unusual query patterns

**System anomalies**:
- High CPU/memory usage
- Database connection spikes
- Increased error rates

---

### Hunting Queries

**Multiple failed logins**:
```bash
# Find IPs with >5 failed logins in last hour
cat state/audit/auth.jsonl | \
  jq -r 'select(.outcome == "failure") | .ipAddress' | \
  sort | uniq -c | sort -rn | awk '$1 > 5'
```

**Bulk exports**:
```bash
# Find users with >10 exports today
TODAY=$(date +%Y-%m-%d)
grep '"eventType":"export"' state/audit/data_access.jsonl | \
  jq -r "select(.timestamp | startswith(\"$TODAY\")) | .userId" | \
  sort | uniq -c | sort -rn | awk '$1 > 10'
```

**Unusual access patterns**:
```bash
# Find access outside business hours (9 AM - 6 PM)
cat state/audit/data_access.jsonl | \
  jq -r 'select(.timestamp | sub("T"; " ") | split(":")[0] | tonumber < 9 or > 18)'
```

---

## Secure Development Lifecycle

### Phase 1: Design
- [ ] Threat modeling (STRIDE)
- [ ] Data flow diagrams
- [ ] Trust boundary identification

### Phase 2: Implementation
- [ ] Secure coding guidelines
- [ ] Input validation
- [ ] Output encoding
- [ ] Parameterized queries

### Phase 3: Testing
- [ ] Security unit tests
- [ ] Penetration testing
- [ ] Fuzzing (input validation)

### Phase 4: Deployment
- [ ] Secret scanning (pre-commit)
- [ ] Dependency scanning (npm audit)
- [ ] HTTPS enforcement
- [ ] Rate limiting

### Phase 5: Monitoring
- [ ] Audit logging
- [ ] Anomaly detection
- [ ] Threat hunting
- [ ] Incident response

---

## Key Documents

- [Security Overview](/docs/agent_library/domains/security/overview.md)
- [Security Audit](/docs/SECURITY_AUDIT.md)
- [Secrets Management](/docs/agent_library/domains/security/secrets_management.md)
- [Audit Requirements](/docs/agent_library/domains/security/audit_requirements.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
