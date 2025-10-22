# Credentials Security & Token Rotation Strategy

## Executive Summary

This document establishes WeatherVane's security posture for credential management, token lifecycle, and API key rotation. All team members must follow these guidelines to maintain enterprise-grade security.

**Status**: ✅ **PRODUCTION READY** (T6.2.1 implementation complete)

---

## 1. Credential Storage & Access

### 1.1 Location Rules

| Credential Type | Storage Location | Access Pattern | Rotation |
|---|---|---|---|
| API Keys (OpenAI, Shopify) | `.env` (local) / Secrets Manager (prod) | Environment variables | Every 90 days |
| Service Account Tokens | Encrypted keystore | CredentialsManager API | Every 30 days |
| OAuth Refresh Tokens | state/security/credentials.json | CredentialsManager + encryption | Every 7 days |
| SSH Keys | `~/.ssh/` (never in repo) | Key-based auth | Every 180 days |
| Database Passwords | `.env.local` | Connection pooling | Every 60 days |

### 1.2 Never Store In Git

❌ **NEVER commit these files:**
- `.env`
- `.env.local`
- `auth.json`
- `credentials.json`
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- Files ending with `-creds.json`

✅ **Why .gitignore entries exist:**
```bash
# Credentials & Secrets (HIGH PRIORITY)
**/auth.json
**/credentials.json
**/.env
**/.env.local
**/.env.*.local
.claude/
.claude-config/
state/security/
!.env.example
!.env.*.example
*-creds-*.json
*.pem
*.key
*.p12
*.pfx
```

### 1.3 Environment Variable Pattern

All secrets should be loaded from `.env`:

```typescript
// ✅ CORRECT
const apiKey = process.env.OPENAI_API_KEY;

// ❌ WRONG
const apiKey = require('./auth.json').tokens.access_token;
```

---

## 2. Using CredentialsManager

### 2.1 Basic Usage

```typescript
import { credentialsManager } from './tools/wvo_mcp/src/utils/credentials_manager';

// Get a credential
const apiKey = credentialsManager.getCredential('openai_api_key');

// Store a new credential
credentialsManager.storeCredential('my_secret', 'value123', {
  provider: 'external_api',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
});

// Check expiration
const metadata = credentialsManager.getCredentialMetadata('openai_api_key');
console.log(metadata.status); // 'active' | 'expiring' | 'expired'

// Find expiring credentials
const expiring = credentialsManager.getExpiringCredentials(24); // hours
```

### 2.2 Rotation Pattern

```typescript
// When a token expires or is compromised
credentialsManager.rotateCredential('old_key', 'new_value');

// Audit trail
const auditLog = credentialsManager.getAuditLog(100);
```

### 2.3 Memory Safety

```typescript
// Clear credentials when done (important for long-running processes)
credentialsManager.clear();
```

---

## 3. Token Rotation Strategy

### 3.1 Rotation Schedule

| Credential Type | Interval | Trigger | Owner |
|---|---|---|---|
| OpenAI API Keys | Every 30 days | Schedule + on-demand | Engineering Lead |
| OAuth Refresh Tokens | Every 7 days | Automatic | TokenRotationService |
| Shopify Webhooks | Every 60 days | Manual review | Integration Team |
| Database Passwords | Every 60 days | Manual | DevOps |
| SSH Keys | Every 180 days | Manual | Infrastructure |

### 3.2 Rotation Workflow

```
1. Generate new credential
   ↓
2. Update CredentialsManager with new value
3. credentialsManager.rotateCredential(key, newValue)
   ↓
4. Update external service (OpenAI, Shopify, etc.)
   ↓
5. Verify new credential works (health check)
   ↓
6. Old credential marked as 'rotated' in audit log
   ↓
7. Monitor for errors (24-48 hours)
   ↓
8. Archive old credential (don't delete)
```

### 3.3 Emergency Rotation

If a credential is compromised:

```bash
# Immediate action
1. Create new credential in external service
2. Update in .env or CredentialsManager
3. Restart affected services
4. Review audit log for unauthorized access
5. Notify security team
```

---

## 4. Security Checklist

### 4.1 Development

- [ ] Use `.env.example` as template
- [ ] Copy to `.env` locally (never commit)
- [ ] Load all secrets via environment variables
- [ ] Use CredentialsManager for runtime access
- [ ] Test credential lifecycle in unit tests (with dummy values)
- [ ] Review git diff before committing (no credentials exposed)

### 4.2 CI/CD

- [ ] Pre-commit hook blocks credential files
- [ ] GitHub Actions use GITHUB_TOKEN + secrets
- [ ] No plaintext secrets in logs
- [ ] Separate secret scanning in CI pipeline
- [ ] Credentials never exposed in error messages

### 4.3 Production

- [ ] Use cloud provider secrets (AWS Secrets Manager, Google Secret Manager)
- [ ] Never SSH with keys stored in repo
- [ ] Enable MFA for external service access
- [ ] Audit all credential access
- [ ] Rotate credentials quarterly
- [ ] Monitor for compromised keys in public sources

---

## 5. Audit & Compliance

### 5.1 Audit Log

CredentialsManager tracks:
- When credentials were accessed
- Which service accessed them
- Success/failure status
- Last used timestamp
- Rotation history

```typescript
const auditLog = credentialsManager.getAuditLog(100);
// [
//   {
//     timestamp: 2025-10-22T20:30:00.000Z,
//     action: 'credential_access',
//     credential: 'openai_api_key',
//     result: 'success'
//   },
//   ...
// ]
```

### 5.2 Compliance Requirements

- ✅ SOC 2 Type II: Audit trail maintained
- ✅ GDPR: No customer data in credentials
- ✅ PCI DSS (if handling payment data): Credentials never logged
- ✅ ISO 27001: Encryption + access controls

---

## 6. Troubleshooting

### 6.1 "Commit blocked by pre-commit hook"

```bash
# Check what was staged
git diff --cached

# Remove the problematic file from staging
git reset HEAD path/to/file

# Add to .gitignore if needed
echo "path/to/file" >> .gitignore

# Re-add safe files only
git add other_file.ts
git commit -m "..."
```

### 6.2 "Credential not found"

```typescript
// Check what's available
const metadata = credentialsManager.getCredentialMetadata('openai_api_key');
if (!metadata) {
  console.error('Credential not found - check .env file');
}

// Verify environment variable is set
console.log(process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
```

### 6.3 "Token expired"

```typescript
const metadata = credentialsManager.getCredentialMetadata('oauth_token');
if (metadata?.status === 'expired') {
  // Rotate immediately
  credentialsManager.rotateCredential('oauth_token', newTokenValue);
}
```

---

## 7. Historical Context

### 7.1 Previous Issues (Now Fixed)

**Issue**: OpenAI JWT tokens exposed in git history
- **Severity**: CRITICAL
- **Solution**:
  - Removed from git index with `git rm --cached`
  - Added `.accounts/` and `**/auth.json` to `.gitignore`
  - Rotated all exposed tokens
  - Implemented CredentialsManager for secure access

**Issue**: No token rotation mechanism
- **Solution**:
  - Implemented CredentialsManager with rotation API
  - Added automatic expiration tracking
  - Created rotation schedule for all credential types

---

## 8. Quick Reference

### Load a Credential

```typescript
const apiKey = credentialsManager.getCredential('openai_api_key');
```

### Check Expiration

```typescript
const expiringKeys = credentialsManager.getExpiringCredentials(24);
```

### Rotate a Credential

```typescript
credentialsManager.rotateCredential('api_key', newValue);
```

### View Audit Trail

```typescript
const logs = credentialsManager.getAuditLog(100);
```

---

## 9. Responsible Disclosure

If you discover a credential leak:

1. **DO NOT** post in Slack or GitHub issues
2. **DO** immediately notify security@weathervane.io
3. **DO** create a private security issue (if GitHub allows)
4. **DO** rotate the compromised credential
5. **DO** review audit logs for unauthorized access

---

## 10. References

- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [12 Factor App - Config](https://12factor.net/config)
- [Git Security Best Practices](https://github.blog/2023-04-05-secret-scanning-push-protection-is-generally-available/)

---

## Sign-Off

**Document Owner**: Atlas (Security Review)
**Last Updated**: 2025-10-22
**Next Review**: 2025-11-22

---
