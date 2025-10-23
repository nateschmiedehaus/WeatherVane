# Security Standards

Security is a **critical dimension** (not optional). All work must meet security standards before release.

---

## Core Principles

1. **Defense in Depth**: Multiple layers of security controls
2. **Least Privilege**: Minimum permissions necessary
3. **Zero Trust**: Verify everything, trust nothing
4. **Fail Secure**: Default to denying access
5. **Security by Design**: Build security in from the start

---

## Secrets Management

### ❌ NEVER Do This

**Hardcoded secrets** (CRITICAL violation):
```typescript
// ❌ NEVER hardcode secrets
const API_KEY = 'sk_live_abc123xyz';
const DB_PASSWORD = 'mypassword123';
```

**Secrets in version control** (CRITICAL violation):
```bash
# ❌ NEVER commit secrets
git add .env
git add config/credentials.json
```

**Secrets in logs** (CRITICAL violation):
```typescript
// ❌ NEVER log secrets
logInfo('API request', { apiKey: config.apiKey });
```

### ✅ Correct Approach

**Use environment variables**:
```typescript
// ✅ Good: Load from environment
const API_KEY = process.env.WEATHER_API_KEY;
if (!API_KEY) {
  throw new Error('WEATHER_API_KEY environment variable is required');
}
```

**Use secret management services**:
```typescript
// ✅ Good: Fetch from secret manager
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
const client = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
  const [version] = await client.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`
  });
  return version.payload?.data?.toString() || '';
}
```

**Never log secrets**:
```typescript
// ✅ Good: Redact sensitive data
function sanitizeForLog(data: any): any {
  const sanitized = { ...data };
  const secretKeys = ['password', 'apiKey', 'token', 'secret'];

  for (const key of secretKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

logInfo('API request', sanitizeForLog(requestData));
```

### Secret Scanning

**Run automated scans**:
```bash
# Scan for committed secrets
npm install -g truffleHog
truffleHog git https://github.com/yourorg/repo.git

# Scan current files
npm install -g detect-secrets
detect-secrets scan
```

**Pre-commit hooks**:
```bash
# .husky/pre-commit
#!/bin/sh
detect-secrets-hook --baseline .secrets.baseline $(git diff --cached --name-only)
```

---

## Input Validation

### Principle: Validate ALL User Input

**Never trust user input** - always validate and sanitize.

### SQL Injection Prevention

❌ **Bad** (vulnerable to SQL injection):
```typescript
const userId = req.params.id;
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.execute(query);
```

✅ **Good** (parameterized queries):
```typescript
const userId = req.params.id;
const query = 'SELECT * FROM users WHERE id = ?';
db.execute(query, [userId]);
```

### XSS Prevention

❌ **Bad** (vulnerable to XSS):
```typescript
const userInput = req.body.comment;
res.send(`<div>${userInput}</div>`);
```

✅ **Good** (sanitized output):
```typescript
import DOMPurify from 'dompurify';

const userInput = req.body.comment;
const sanitized = DOMPurify.sanitize(userInput);
res.send(`<div>${sanitized}</div>`);
```

### Input Validation Rules

```typescript
import Joi from 'joi';

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(0).max(120).required(),
  name: Joi.string().min(1).max(100).required(),
  website: Joi.string().uri().optional()
});

function validateUser(data: unknown): User {
  const { error, value } = userSchema.validate(data);
  if (error) {
    throw new ValidationError(error.message);
  }
  return value;
}
```

---

## Authentication & Authorization

### Authentication

**Require authentication** for all non-public endpoints:

```typescript
// Middleware: Check authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Apply to protected routes
app.get('/api/orders', requireAuth, getOrders);
```

### Authorization

**Check permissions** before allowing access:

```typescript
function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Apply to admin routes
app.delete('/api/users/:id', requireAuth, requirePermission('admin'), deleteUser);
```

### Session Management

```typescript
// ✅ Good: Secure session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,      // Prevent XSS
    secure: true,        // HTTPS only
    sameSite: 'strict',  // CSRF protection
    maxAge: 3600000      // 1 hour
  }
}));
```

---

## Encryption

### Data at Rest

**Encrypt sensitive data** in database:

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
}

function decrypt(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Data in Transit

**Always use HTTPS** in production:

```typescript
// ✅ Good: Enforce HTTPS
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
```

---

## Rate Limiting

**Prevent abuse** with rate limiting:

```typescript
import rateLimit from 'express-rate-limit';

// Global rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // 100 requests per window
  message: 'Too many requests, please try again later'
});

app.use('/api/', limiter);

// Stricter limit for sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                   // 5 attempts per hour
  message: 'Too many login attempts, please try again later'
});

app.post('/api/login', authLimiter, login);
```

---

## Audit Logging

**Log all security-relevant events**:

```typescript
interface AuditEvent {
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  success: boolean;
  metadata?: any;
}

function logAudit(event: AuditEvent): void {
  // Write to secure audit log (append-only, tamper-proof)
  auditLogger.info('Security event', {
    ...event,
    // Never log sensitive data in audit logs
    metadata: sanitizeForLog(event.metadata)
  });
}

// Example: Log authentication attempts
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authenticateUser(email, password);

    logAudit({
      timestamp: new Date(),
      userId: user.id,
      action: 'login',
      resource: 'authentication',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json({ token: generateToken(user) });
  } catch (error) {
    logAudit({
      timestamp: new Date(),
      action: 'login',
      resource: 'authentication',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: false,
      metadata: { email } // Don't log password!
    });

    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

---

## Dependency Security

### Keep Dependencies Updated

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (when possible)
npm audit fix

# Review before upgrading
npm outdated
```

### Use Lock Files

**Always commit** `package-lock.json` or `yarn.lock`:
```bash
git add package-lock.json
git commit -m "chore: update dependencies"
```

### Automated Scanning

**GitHub Dependabot** (enable in repo settings):
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## Security Headers

**Set security headers** in all responses:

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Additional headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

## Security Checklist

Before releasing ANY feature:

- [ ] **Secrets**: All secrets in env vars or secret manager (not hardcoded)
- [ ] **Input validation**: All user inputs validated/sanitized
- [ ] **Authentication**: Required for non-public endpoints
- [ ] **Authorization**: Permissions checked before data access
- [ ] **SQL injection**: Parameterized queries used
- [ ] **XSS**: User-generated content sanitized
- [ ] **HTTPS**: Enforced in production
- [ ] **Rate limiting**: Applied to public APIs
- [ ] **Audit logging**: Security events logged
- [ ] **Dependencies**: `npm audit` shows 0 vulnerabilities
- [ ] **Security headers**: Set correctly
- [ ] **Encryption**: Sensitive data encrypted at rest

---

## Security Review Process

### Self-Review (Worker):
1. Run security checklist
2. Scan for secrets: `detect-secrets scan`
3. Check dependencies: `npm audit`
4. Review authentication/authorization logic

### Automated Scans:
- **Pre-commit**: Secret scanning
- **CI/CD**: Dependency scanning
- **Nightly**: Full security scan

### Security Critic Review:
- Validates all checklist items
- Runs automated scans
- Reviews security-critical code
- **Blocks release** if issues found

### Escalation:
- **Critical vulnerabilities** → Security team immediately
- **Compliance issues** → Legal/compliance team
- **Architectural concerns** → Atlas + security team

---

## Common Vulnerabilities to Avoid

### OWASP Top 10 (2021)

1. **Broken Access Control** → Always check permissions
2. **Cryptographic Failures** → Use strong encryption, no weak algorithms
3. **Injection** → Parameterize queries, sanitize inputs
4. **Insecure Design** → Security by design, threat modeling
5. **Security Misconfiguration** → Secure defaults, minimal permissions
6. **Vulnerable Components** → Keep dependencies updated
7. **Auth/Session Failures** → Strong authentication, secure sessions
8. **Data Integrity Failures** → Verify integrity, use signed tokens
9. **Logging/Monitoring Failures** → Audit all security events
10. **SSRF** → Validate URLs, allowlist domains

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [Security Audit Docs](/docs/SECURITY_AUDIT.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
