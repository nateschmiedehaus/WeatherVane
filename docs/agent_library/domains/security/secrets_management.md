# Secrets Management

Secure storage, access, and rotation of API keys, credentials, and sensitive data.

---

## Quick Reference

**Primary Documentation**: `/docs/SECURITY_AUDIT.md`, `/docs/CREDENTIALS_SECURITY_AUDIT_2025-10-22.md`

**Purpose**: Prevent secrets exposure and credential compromise

---

## Secrets Classification

### API Keys

**Examples**:
- Weather API: `WEATHER_API_KEY`
- Google Ads: `GOOGLE_ADS_API_KEY`
- Meta Ads: `META_ADS_API_KEY`
- Codex: `CODEX_API_KEY`
- Claude: `CLAUDE_API_KEY`

**Risk**: High (allows API access, incurs costs)

**Rotation**: Every 90 days

---

### OAuth Tokens

**Examples**:
- Google Ads OAuth: `GOOGLE_OAUTH_TOKEN`
- Meta Ads OAuth: `META_OAUTH_TOKEN`
- Shopify OAuth: `SHOPIFY_ACCESS_TOKEN`

**Risk**: Critical (full account access)

**Rotation**: On access (refresh tokens), 60 days (access tokens)

---

### Database Credentials

**Examples**:
- PostgreSQL: `DATABASE_URL=postgresql://user:pass@host/db`
- SQLite: (file-based, no remote credentials)

**Risk**: Critical (full data access)

**Rotation**: Every 90 days

---

### Encryption Keys

**Examples**:
- JWT signing key: `JWT_SECRET`
- Data encryption key: `ENCRYPTION_KEY`

**Risk**: Critical (all encrypted data compromised if leaked)

**Rotation**: Annually (requires re-encryption)

---

## Storage Methods

### 1. Environment Variables (Current)

**Usage**:
```bash
# .env (NOT committed to git)
WEATHER_API_KEY=sk_live_abc123...
GOOGLE_ADS_API_KEY=AIza...
DATABASE_URL=postgresql://user:pass@localhost/weathervane
```

**Load in code**:
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

const weatherApiKey = process.env.WEATHER_API_KEY;
if (!weatherApiKey) {
  throw new Error('WEATHER_API_KEY environment variable is required');
}
```

**Python**:
```python
import os
from dotenv import load_dotenv

load_dotenv()

weather_api_key = os.getenv('WEATHER_API_KEY')
if not weather_api_key:
    raise ValueError('WEATHER_API_KEY environment variable is required')
```

**Pros**:
- Simple, no external dependencies
- Supported by all platforms (Heroku, AWS, etc.)

**Cons**:
- Not encrypted at rest
- Manual rotation
- No access audit trail

---

### 2. Secret Manager (Recommended for Production)

**Google Cloud Secret Manager**:
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function getSecret(secretName: string): Promise<string> {
  const [version] = await client.accessSecretVersion({
    name: `projects/PROJECT_ID/secrets/${secretName}/versions/latest`
  });

  return version.payload?.data?.toString() || '';
}

// Usage
const weatherApiKey = await getSecret('WEATHER_API_KEY');
```

**AWS Secrets Manager**:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}
```

**Pros**:
- Encrypted at rest
- Automatic rotation
- Access audit trail
- Version history

**Cons**:
- Requires cloud provider
- Additional cost
- More complex setup

---

### 3. Encrypted Files (Fallback)

**Encrypt secrets file**:
```bash
# Encrypt secrets
gpg --symmetric --cipher-algo AES256 .env
# Generates: .env.gpg

# Decrypt (in CI/CD)
gpg --decrypt --quiet --batch --passphrase="$GPG_PASSPHRASE" .env.gpg > .env
```

**Pros**:
- Encrypted at rest
- Can commit encrypted file to git

**Cons**:
- GPG passphrase is still a secret
- Manual rotation
- Decryption key management

---

## Access Control

### Principle of Least Privilege

**Rule**: Only grant access to secrets that are absolutely necessary

**Example**:
```
Service A (Weather Ingestion):
- ✅ Needs: WEATHER_API_KEY
- ❌ Does NOT need: GOOGLE_ADS_API_KEY, DATABASE_URL (writes to queue only)

Service B (Ad Optimization):
- ✅ Needs: GOOGLE_ADS_API_KEY, META_ADS_API_KEY, DATABASE_URL
- ❌ Does NOT need: WEATHER_API_KEY
```

**Implementation**:
```yaml
# docker-compose.yml
services:
  weather_ingestion:
    environment:
      - WEATHER_API_KEY=${WEATHER_API_KEY}
      # No other secrets exposed

  ad_optimization:
    environment:
      - GOOGLE_ADS_API_KEY=${GOOGLE_ADS_API_KEY}
      - META_ADS_API_KEY=${META_ADS_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
```

---

## Secret Rotation

### Rotation Schedule

| Secret Type | Frequency | Priority |
|------------|-----------|----------|
| API Keys | 90 days | Medium |
| OAuth Tokens | 60 days | High |
| Database Passwords | 90 days | High |
| Encryption Keys | 365 days | Critical |

---

### Rotation Workflow

**1. Generate new secret**:
```bash
# Generate new API key (provider-specific)
# Example: OpenAI API keys
curl https://api.openai.com/v1/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name": "weathervane-2025-10-23"}'
```

**2. Update secret in secret manager**:
```bash
# Google Cloud
gcloud secrets versions add WEATHER_API_KEY --data-file=new_key.txt
```

**3. Test with new secret**:
```bash
# Verify new secret works
export WEATHER_API_KEY=$(cat new_key.txt)
npm run test:integration
```

**4. Deploy new secret**:
```bash
# Update production environment
gcloud run services update weathervane \
  --update-secrets=WEATHER_API_KEY=WEATHER_API_KEY:latest
```

**5. Revoke old secret**:
```bash
# After 24 hours (grace period), revoke old key
curl https://api.openai.com/v1/api-keys/old_key_id \
  -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Secrets in CI/CD

### GitHub Actions

**Store secrets in GitHub**:
```
Settings → Secrets and variables → Actions → New repository secret
```

**Use in workflow**:
```yaml
# .github/workflows/test.yml
name: Test

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run tests
        env:
          WEATHER_API_KEY: ${{ secrets.WEATHER_API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npm test
```

**Never**:
- ❌ Print secrets in logs
- ❌ Echo secrets in bash
- ❌ Include in error messages

---

## Secret Scanning

### Pre-Commit Hook

**Install git-secrets**:
```bash
brew install git-secrets  # macOS

# Initialize
cd /path/to/weathervane
git secrets --install
git secrets --register-aws  # AWS patterns
git secrets --add 'sk_live_[a-zA-Z0-9]{32}'  # Custom pattern
```

**Hook** (`.git/hooks/pre-commit`):
```bash
#!/bin/bash
git secrets --pre_commit_hook -- "$@"
```

**Test**:
```bash
# Try to commit a secret (should fail)
echo "WEATHER_API_KEY=sk_live_abc123..." > test.txt
git add test.txt
git commit -m "Test"
# Error: Secret detected!
```

---

### GitHub Advanced Security

**Enable secret scanning**:
```
Settings → Code security and analysis → Enable secret scanning
```

**Alerts**: GitHub will alert if secrets are detected in commits

**Remediation**:
1. Rotate the compromised secret immediately
2. Remove from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. Force push (if private repo)
4. Update documentation

---

## Secret Injection Patterns

### Environment Variable Injection

**Docker**:
```dockerfile
# Dockerfile
FROM node:18

# Never hardcode secrets!
# ARG WEATHER_API_KEY=sk_live_...  ❌ WRONG

COPY . .
RUN npm install

CMD ["node", "index.js"]
```

**Run with secrets**:
```bash
docker run -e WEATHER_API_KEY=$WEATHER_API_KEY weathervane
```

---

### Config File Generation

**Template** (`config.template.json`):
```json
{
  "weatherApi": {
    "key": "{{WEATHER_API_KEY}}",
    "baseUrl": "https://api.weather.com"
  }
}
```

**Generate at runtime**:
```bash
#!/bin/bash
envsubst < config.template.json > config.json
node index.js
```

**Cleanup**:
```bash
# Remove config.json after process exits
trap 'rm -f config.json' EXIT
```

---

## Audit Logging

**Log all secret access**:

```typescript
interface SecretAccessEvent {
  timestamp: string;
  secretName: string;
  accessedBy: string;  // service or user
  outcome: 'success' | 'failure';
  ipAddress?: string;
}

function logSecretAccess(event: SecretAccessEvent): void {
  const logEntry = {
    ...event,
    timestamp: new Date().toISOString()
  };

  fs.appendFileSync(
    'state/audit/secret_access.jsonl',
    JSON.stringify(logEntry) + '\n'
  );
}

// Usage
async function getSecret(secretName: string): Promise<string> {
  try {
    const value = await secretManager.get(secretName);

    logSecretAccess({
      secretName,
      accessedBy: 'weather_ingestion_service',
      outcome: 'success'
    });

    return value;
  } catch (error) {
    logSecretAccess({
      secretName,
      accessedBy: 'weather_ingestion_service',
      outcome: 'failure'
    });

    throw error;
  }
}
```

**Review audit log**:
```bash
# Check recent access
tail -20 state/audit/secret_access.jsonl

# Find failures
grep '"outcome":"failure"' state/audit/secret_access.jsonl
```

---

## Emergency Response

### If Secret is Compromised

**1. Immediate Actions** (within 5 minutes):
- Revoke the compromised secret
- Generate new secret
- Update all services

**2. Investigation** (within 1 hour):
- Check audit logs for unauthorized access
- Identify scope of compromise
- Assess damage (API usage, data access)

**3. Notification** (within 24 hours):
- Notify affected users (if applicable)
- Report to provider (if API key abuse detected)
- Document incident

**4. Prevention** (within 1 week):
- Update secret scanning rules
- Improve access controls
- Train team on secret management

---

## Migration to Secret Manager

**Planned upgrade**: See `/docs/CREDENTIALS_ENCRYPTION_UPGRADE_SPEC.md`

**Steps**:
1. Set up Google Cloud Secret Manager
2. Migrate secrets from .env to Secret Manager
3. Update code to fetch from Secret Manager
4. Test in staging
5. Deploy to production
6. Remove .env files
7. Update documentation

**Timeline**: Q1 2026

---

## Key Documents

- [Security Audit](/docs/SECURITY_AUDIT.md)
- [Credentials Security Audit](/docs/CREDENTIALS_SECURITY_AUDIT_2025-10-22.md)
- [Credentials Encryption Upgrade Spec](/docs/CREDENTIALS_ENCRYPTION_UPGRADE_SPEC.md)
- [Security Standards](/docs/agent_library/common/standards/security_standards.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
