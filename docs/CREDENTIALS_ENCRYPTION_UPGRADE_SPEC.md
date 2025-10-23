# Credentials Encryption Upgrade Specification (Phase 1)
**Task**: T6.2.1 - Sub-deliverable | **Priority**: HIGH | **Effort**: Medium (3-5 days)

## Objective
Replace weak XOR-based encryption in `CredentialsManager` with production-grade NaCl (libsodium) encryption, ensuring backward compatibility and seamless key migration.

---

## Current Implementation (What We Have)

**File**: `tools/wvo_mcp/src/utils/credentials_manager.ts:265-292`

**Weaknesses**:
- XOR cipher with SHA256-derived key (cryptographically broken)
- Hash reuse enables pattern recognition attacks
- No IV/nonce randomization
- Single stream cipher without authentication (malleable)

**Current Usage**:
```typescript
// WeakEncryption: new CredentialsManager() uses XOR by default
const manager = new CredentialsManager();
manager.storeCredential('api_key', 'sk-xyz...');
// Stored on disk as: base64(plaintext XOR hash)
```

---

## Target Implementation (What We Want)

### Technology Choice: libsodium (NaCl)

**Why libsodium?**
- ✅ Industry-standard authenticated encryption (crypto_secretbox = XChaCha20-Poly1305)
- ✅ NPM package: `libsodium.js` (pure JS, no native deps)
- ✅ Nonce randomization prevents replay attacks
- ✅ Authentication tag prevents tampering
- ✅ Widely used: Kubernetes, Docker, CloudFlare, Wire

### New Data Format

```typescript
interface EncryptedCredentialV2 {
  version: 2;                    // Versioning for future upgrades
  algorithm: 'crypto_secretbox'; // Algorithm identifier
  nonce: string;                 // Base64-encoded random nonce
  ciphertext: string;            // Base64-encoded authenticated ciphertext
}

// Storage format (JSON)
{
  "services": {
    "meta_ads": {
      "version": 2,
      "algorithm": "crypto_secretbox",
      "nonce": "AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrSt",
      "ciphertext": "XyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZa..."
    }
  }
}
```

---

## Implementation Plan

### Phase 1a: Add libsodium Dependency

**Step 1: Install package**
```bash
cd /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane
npm install --save libsodium.js
npm install --save-dev @types/libsodium.js  # Optional, for TypeScript
```

**Step 2: Verify compatibility**
```bash
npm ls libsodium.js
```

### Phase 1b: Update CredentialsManager

**New encrypt method**:
```typescript
private encrypt(data: string, key: string): string {
  // Derive 256-bit key from input key (for variable-length inputs)
  const keyHash = createHash('sha256').update(key).digest();

  // Generate random nonce (24 bytes for XChaCha20)
  const nonce = sodium.randombytes(sodium.crypto_secretbox_NONCEBYTES);

  // Encrypt with nonce + key
  const plaintext = Buffer.from(data);
  const ciphertext = sodium.crypto_secretbox(plaintext, nonce, keyHash);

  // Return versioned format: version + nonce + ciphertext
  const format = Buffer.alloc(1);
  format[0] = 2; // Version 2

  return Buffer.concat([format, nonce, ciphertext]).toString('base64');
}

private decrypt(encrypted: string, key: string): string {
  const keyHash = createHash('sha256').update(key).digest();
  const buffer = Buffer.from(encrypted, 'base64');

  // Extract version
  const version = buffer[0];

  if (version === 2) {
    // New format: version (1) + nonce (24) + ciphertext
    const nonce = buffer.slice(1, 1 + sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = buffer.slice(1 + sodium.crypto_secretbox_NONCEBYTES);

    try {
      const plaintext = sodium.crypto_secretbox_open(
        ciphertext,
        nonce,
        keyHash
      );
      return plaintext.toString('utf-8');
    } catch (e) {
      throw new Error('Decryption failed: Invalid authentication tag (corrupted or tampered data)');
    }
  } else if (version === 1) {
    // Fallback: Old XOR format
    console.warn('Decrypting legacy XOR-encrypted credential. Run rotation to upgrade.');
    return this.decryptV1Legacy(buffer.slice(1), keyHash);
  } else {
    throw new Error(`Unknown encryption version: ${version}`);
  }
}

/**
 * Legacy V1 decryption (for backward compatibility)
 */
private decryptV1Legacy(encrypted: Buffer, keyHash: Buffer): string {
  const decrypted = Buffer.alloc(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyHash[i % keyHash.length];
  }
  return decrypted.toString('utf-8');
}
```

**Backward compatibility**:
- Detect version byte at start of encrypted data
- V1 (XOR) → Decrypt with legacy method
- V2 (NaCl) → Decrypt with new method
- Transparent migration: Old credentials automatically upgrade on next rotation

### Phase 1c: Update Tests

**File**: `tools/wvo_mcp/src/utils/credentials_manager.test.ts`

```typescript
describe('CredentialsManager - Encryption V2', () => {
  let manager: CredentialsManager;

  beforeEach(() => {
    manager = new CredentialsManager(
      'test-credentials.json',
      'test-encryption-key-32-bytes-long-1234567890'
    );
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync('test-credentials.json')) {
      fs.unlinkSync('test-credentials.json');
    }
  });

  describe('NaCl encryption (V2)', () => {
    it('should encrypt with randomized nonce', () => {
      manager.storeCredential('test1', 'secret_value');
      manager.storeCredential('test2', 'secret_value'); // Same plaintext

      const file = fs.readFileSync('test-credentials.json', 'utf-8');
      const data = JSON.parse(file);

      // Different ciphertexts for same plaintext = nonce randomization working
      expect(data.test1.value).not.toBe(data.test2.value);
    });

    it('should authenticate ciphertext', () => {
      manager.storeCredential('api_key', 'sk-secret-value');

      // Tamper with encrypted data
      const file = fs.readFileSync('test-credentials.json', 'utf-8');
      const data = JSON.parse(file);
      const tampered = data.test1.value;

      // Flip a bit in the ciphertext
      const buffer = Buffer.from(tampered, 'base64');
      buffer[50] ^= 0xFF;
      data.test1.value = buffer.toString('base64');

      fs.writeFileSync('test-credentials.json', JSON.stringify(data));

      // Should fail to decrypt
      const manager2 = new CredentialsManager(
        'test-credentials.json',
        'test-encryption-key-32-bytes-long-1234567890'
      );

      expect(() => manager2.getCredential('api_key')).toThrow(
        'Decryption failed'
      );
    });

    it('should migrate V1 (XOR) to V2 (NaCl) on rotation', () => {
      // Simulate V1 credential (legacy)
      const legacyValue = manager['encrypt']; // Temporarily use old method
      // ... set up V1 encrypted value ...

      // Request rotation
      manager.rotateCredential('legacy_key', 'new_value');

      // Verify new value uses V2
      const metadata = manager.getCredentialMetadata('legacy_key');
      expect(metadata?.status).toBe('rotated');
      expect(metadata?.rotatedAt).toBeDefined();

      // New value should be V2 encrypted
      const decrypted = manager.getCredential('legacy_key');
      expect(decrypted).toBe('new_value');
    });
  });

  describe('Backward compatibility', () => {
    it('should decrypt V1 (XOR) credentials transparently', () => {
      // Create a V1-encrypted credential
      const manager1 = new CredentialsManager();
      // (Would use old implementation temporarily)

      // Read with new version
      const value = manager1.getCredential('v1_key');
      expect(value).toBe('original_value');

      // Should log warning about legacy format
      const log = manager1.getAuditLog();
      expect(log.some(e => e.action.includes('legacy'))).toBe(true);
    });
  });
});
```

### Phase 1d: Migration Script

**File**: `tools/wvo_mcp/scripts/rotate_credentials_to_v2.ts`

```typescript
/**
 * Migrate all credentials from V1 (XOR) to V2 (NaCl)
 * Run once after deploying new encryption code
 */

import { CredentialsManager } from '../src/utils/credentials_manager';
import * as fs from 'fs';

async function migrateCredentials() {
  const credPath = 'state/security/credentials.json';
  const backupPath = `state/security/credentials.json.v1.backup`;

  console.log('Starting credentials migration...');

  // Backup original
  if (fs.existsSync(credPath)) {
    fs.copyFileSync(credPath, backupPath);
    console.log(`✅ Backup created: ${backupPath}`);
  }

  const manager = new CredentialsManager();

  // Get all credentials
  const allCreds = getAllCredentialKeys(manager);

  for (const key of allCreds) {
    const cred = manager.getCredential(key);
    const metadata = manager.getCredentialMetadata(key);

    // Rotation re-encrypts with new algorithm
    manager.rotateCredential(key, cred!);

    console.log(`✅ Migrated: ${key} (${metadata?.provider})`);
  }

  console.log(`\n✅ Migration complete: ${allCreds.length} credentials upgraded to V2`);
  console.log(`📦 Backup: ${backupPath}`);
}

migrateCredentials().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
```

**Usage**:
```bash
npm run migrate:credentials-v2
```

### Phase 1e: Deployment Process

**Step 1: Pre-deployment**
```bash
# Backup current credentials
cp state/security/credentials.json state/security/credentials.json.backup

# Verify encryption key is set
echo $CREDENTIALS_ENCRYPTION_KEY | wc -c  # Should be 44 chars (32 bytes base64)
```

**Step 2: Deploy new code**
```bash
# Update npm packages
npm install

# Build
npm run build

# Run tests
npm test -- credentials_manager.test.ts
```

**Step 3: Run migration**
```bash
# Migrate existing credentials to V2
npx ts-node tools/wvo_mcp/scripts/rotate_credentials_to_v2.ts

# Verify
ls -la state/security/
# credentials.json (new, V2 format)
# credentials.json.v1.backup (old, V1 format)
```

**Step 4: Verify in production**
```bash
# Check that credentials still load correctly
npm run start

# Verify audit log shows rotations
tail -50 state/security/audit.log | grep "credential_rotated"
```

**Step 5: Cleanup (after 30 days)**
```bash
# Remove V1 backup once V2 is stable
rm state/security/credentials.json.v1.backup
```

---

## Testing Checklist

- [ ] libsodium.js installs without errors
- [ ] TypeScript compilation passes
- [ ] New encrypt/decrypt methods work
- [ ] V1 → V2 migration succeeds
- [ ] Backward compatibility test passes
- [ ] Tampering detection works (authentication tag)
- [ ] Nonce randomization verified
- [ ] Audit logging includes V2 markers
- [ ] File permissions still 0o600
- [ ] No new dependencies break build
- [ ] Performance acceptable (< 10ms per operation)

---

## Rollback Plan

If issues arise:

```bash
# 1. Restore backup
cp state/security/credentials.json.v1.backup state/security/credentials.json

# 2. Revert code
git checkout HEAD~1 -- tools/wvo_mcp/src/utils/credentials_manager.ts

# 3. Rebuild and restart
npm install && npm run build && npm start
```

---

## Security Review Checklist

- [ ] Libsodium version pinned in package.json
- [ ] No export of encrypt/decrypt methods
- [ ] Audit log doesn't include nonces/plaintexts
- [ ] Error messages don't leak key material
- [ ] Nonce is always randomized (never reused)
- [ ] Authentication tag verified before returning plaintext
- [ ] Old keys not left in memory after rotation

---

## Performance Impact

**Expected overhead**: < 5% (libsodium is highly optimized)

**Benchmarks** (estimated, per operation):
- Old XOR: ~0.5ms
- New NaCl: ~2-3ms
- Migration: ~50ms per credential

---

## Post-Implementation Tasks

1. **Document in runbook**: Add section to ops playbook
2. **Train team**: Share encryption upgrade details
3. **Monitor audit log**: Check for successful rotations
4. **Schedule Phase 2**: Key rotation capability (next sprint)

---

## Sign-Off

- **Security Sentinel**: ✅ Reviewed specification
- **Atlas**: Implementation approved - assign to engineer for Phase 1 (next sprint)
- **Director Dana**: Infrastructure coordination not needed (local only)

**Estimated Timeline**: 3-5 days engineering + testing + deployment
