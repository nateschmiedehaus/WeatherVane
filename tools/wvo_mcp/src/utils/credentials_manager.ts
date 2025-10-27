/**
 * Credentials Manager
 * Handles secure loading, rotation, and lifecycle management of API keys and tokens
 *
 * SECURITY PRINCIPLES:
 * - Never log credentials to stdout/stderr
 * - Always load from environment or encrypted stores
 * - Never commit credentials to git
 * - Implement token rotation with lifecycle management
 * - Audit all credential access
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface TokenMetadata {
  provider: string;
  createdAt: Date;
  expiresAt?: Date;
  rotatedAt?: Date;
  lastUsedAt?: Date;
  accessCount: number;
  status: 'active' | 'expiring' | 'expired' | 'rotated';
}

interface CredentialsConfig {
  [key: string]: {
    value: string;
    metadata?: TokenMetadata;
  };
}

export class CredentialsManager {
  private storagePath: string;
  private encryptionKey: string | null;
  private credentials: CredentialsConfig = {};
  private auditLog: Array<{timestamp: Date; action: string; credential: string; result: string}> = [];

  constructor(storagePath?: string, encryptionKey?: string) {
    this.storagePath = storagePath || process.env.CREDENTIALS_STORAGE_PATH || 'state/security/credentials.json';
    this.encryptionKey = encryptionKey || process.env.CREDENTIALS_ENCRYPTION_KEY || null;
    this.loadCredentials();
  }

  /**
   * Load credentials from environment or encrypted storage
   * Priority: Environment variables > Encrypted storage > Defaults
   */
  private loadCredentials(): void {
    try {
      // First, load from environment variables
      const envCredentials = {
        openai_api_key: process.env.OPENAI_API_KEY,
        openai_org_id: process.env.OPENAI_ORG_ID,
        codex_home: process.env.CODEX_HOME,
        claude_config_dir: process.env.CLAUDE_CONFIG_DIR,
        shopify_api_key: process.env.SHOPIFY_API_KEY,
        shopify_api_secret: process.env.SHOPIFY_API_SECRET,
        shopify_webhook_secret: process.env.SHOPIFY_WEBHOOK_SECRET,
      };

      // Filter out undefined values
      Object.entries(envCredentials).forEach(([key, value]) => {
        if (value) {
          this.credentials[key] = {
            value,
            metadata: {
              provider: 'environment',
              createdAt: new Date(),
              accessCount: 0,
              status: 'active'
            }
          };
        }
      });

      // Then load from storage if exists and encryption is available
      if (fs.existsSync(this.storagePath) && this.encryptionKey) {
        const encryptedData = fs.readFileSync(this.storagePath, 'utf-8');
        const decrypted = this.decrypt(encryptedData, this.encryptionKey);
        const stored = JSON.parse(decrypted);
        Object.assign(this.credentials, stored);
      }

      this.auditLog.push({
        timestamp: new Date(),
        action: 'credentials_loaded',
        credential: '[redacted]',
        result: `Loaded ${Object.keys(this.credentials).length} credentials`
      });
    } catch (error) {
      console.error('Failed to load credentials:', (error as Error).message);
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Get a credential by key
   * Updates access metadata and audit log
   */
  getCredential(key: string): string | null {
    if (!this.credentials[key]) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'credential_access_failed',
        credential: key,
        result: 'not_found'
      });
      return null;
    }

    const cred = this.credentials[key];

    // Update metadata
    if (cred.metadata) {
      cred.metadata.lastUsedAt = new Date();
      cred.metadata.accessCount++;

      // Check if credential is expiring soon
      if (cred.metadata.expiresAt) {
        const hoursUntilExpiry = (cred.metadata.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilExpiry < 1) {
          cred.metadata.status = 'expiring';
        } else if (hoursUntilExpiry < 0) {
          cred.metadata.status = 'expired';
        }
      }
    }

    this.auditLog.push({
      timestamp: new Date(),
      action: 'credential_access',
      credential: key,
      result: 'success'
    });

    return cred.value;
  }

  /**
   * Store a new credential
   */
  storeCredential(key: string, value: string, metadata?: Partial<TokenMetadata>): void {
    if (!value) {
      throw new Error('Cannot store empty credential');
    }

    this.credentials[key] = {
      value,
      metadata: {
        provider: 'manual',
        createdAt: new Date(),
        accessCount: 0,
        status: 'active',
        ...metadata
      }
    };

    this.auditLog.push({
      timestamp: new Date(),
      action: 'credential_stored',
      credential: key,
      result: 'success'
    });

    this.persistCredentials();
  }

  /**
   * Rotate a credential (mark old as rotated, store new)
   */
  rotateCredential(key: string, newValue: string): void {
    if (!this.credentials[key]) {
      throw new Error(`Credential ${key} not found`);
    }

    const oldCred = this.credentials[key];
    if (oldCred.metadata) {
      oldCred.metadata.status = 'rotated';
      oldCred.metadata.rotatedAt = new Date();
    }

    this.storeCredential(key, newValue, {
      provider: oldCred.metadata?.provider || 'unknown',
      rotatedAt: new Date()
    });

    this.auditLog.push({
      timestamp: new Date(),
      action: 'credential_rotated',
      credential: key,
      result: 'success'
    });
  }

  /**
   * Get credential metadata (expiration, last used, etc.)
   */
  getCredentialMetadata(key: string): TokenMetadata | null {
    return this.credentials[key]?.metadata || null;
  }

  /**
   * Check credentials that need rotation
   */
  getExpiringCredentials(hoursThreshold: number = 24): string[] {
    const expiringKeys: string[] = [];
    const now = Date.now();

    Object.entries(this.credentials).forEach(([key, cred]) => {
      if (cred.metadata?.expiresAt) {
        const hoursUntilExpiry = (cred.metadata.expiresAt.getTime() - now) / (1000 * 60 * 60);
        if (hoursUntilExpiry < hoursThreshold && hoursUntilExpiry > 0) {
          expiringKeys.push(key);
        }
      }
    });

    return expiringKeys;
  }

  /**
   * Get audit log (filtered for security)
   */
  getAuditLog(limit: number = 100): typeof this.auditLog {
    return this.auditLog.slice(-limit);
  }

  /**
   * Persist credentials to encrypted storage
   */
  private persistCredentials(): void {
    if (!this.encryptionKey) {
      console.warn('No encryption key available - credentials not persisted to disk');
      return;
    }

    try {
      const json = JSON.stringify(this.credentials);
      const encrypted = this.encrypt(json, this.encryptionKey);

      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storagePath, encrypted, { mode: 0o600 });

      this.auditLog.push({
        timestamp: new Date(),
        action: 'credentials_persisted',
        credential: '[redacted]',
        result: 'success'
      });
    } catch (error) {
      console.error('Failed to persist credentials:', (error as Error).message);
    }
  }

  /**
   * Simple XOR-based encryption (placeholder - use proper encryption in production)
   * TODO: Replace with proper encryption library (libsodium, tweetnacl, etc.)
   */
  private encrypt(data: string, key: string): string {
    // This is a placeholder - DO NOT use in production
    // Use proper encryption library like tweetnacl or libsodium
    const hash = createHash('sha256').update(key).digest();
    const buffer = Buffer.from(data);
    const encrypted = Buffer.alloc(buffer.length);

    for (let i = 0; i < buffer.length; i++) {
      encrypted[i] = buffer[i] ^ hash[i % hash.length];
    }

    return encrypted.toString('base64');
  }

  /**
   * Simple XOR-based decryption (placeholder - use proper decryption in production)
   */
  private decrypt(encrypted: string, key: string): string {
    const hash = createHash('sha256').update(key).digest();
    const buffer = Buffer.from(encrypted, 'base64');
    const decrypted = Buffer.alloc(buffer.length);

    for (let i = 0; i < buffer.length; i++) {
      decrypted[i] = buffer[i] ^ hash[i % hash.length];
    }

    return decrypted.toString('utf-8');
  }

  /**
   * Clear credentials from memory
   */
  clear(): void {
    Object.keys(this.credentials).forEach(key => {
      delete this.credentials[key];
    });

    this.auditLog.push({
      timestamp: new Date(),
      action: 'credentials_cleared',
      credential: '[redacted]',
      result: 'success'
    });
  }
}

// Export singleton instance
export const credentialsManager = new CredentialsManager();
