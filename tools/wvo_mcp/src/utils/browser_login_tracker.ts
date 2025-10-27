import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { logWarning } from '../telemetry/logger.js';

type ProviderId = 'openai' | 'anthropic';

interface BrowserSessionEntry {
  provider: ProviderId;
  recordedAt: string;
  identityHash?: string | null;
  identityHint?: string;
  source: 'cli_browser_login';
}

const MAX_ENTRIES = 200;

export async function recordBrowserLogin(workspaceRoot: string, provider: ProviderId): Promise<void> {
  if (process.env.WVO_BROWSER_LOGIN_CAPTURE_DISABLED === '1') {
    return;
  }
  try {
    const rawIdentity = await resolveIdentity(provider);
    const entry: BrowserSessionEntry = {
      provider,
      recordedAt: new Date().toISOString(),
      identityHash: rawIdentity ? hashIdentity(rawIdentity) : null,
      identityHint: rawIdentity ? redactIdentity(rawIdentity) : undefined,
      source: 'cli_browser_login',
    };
    await persistEntry(workspaceRoot, entry);
  } catch (error) {
    logWarning('browser_login_tracker.record_failed', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveIdentity(provider: ProviderId): Promise<string | undefined> {
  if (provider === 'openai') {
    return await resolveCodexIdentity();
  }
  return await resolveClaudeIdentity();
}

async function resolveCodexIdentity(): Promise<string | undefined> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const candidates = ['credentials.json', 'auth.json'];
  for (const candidate of candidates) {
    const filePath = path.join(codexHome, candidate);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const profile = data.profile as Record<string, unknown> | undefined;
      const tokens = data.tokens as Record<string, unknown> | undefined;
      const accountEmail = tokens?.account_email ?? profile?.email ?? data.email ?? data.user;
      if (typeof accountEmail === 'string' && accountEmail.trim()) {
        return accountEmail.trim();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        continue;
      }
      logWarning('browser_login_tracker.codex_read_failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

async function resolveClaudeIdentity(): Promise<string | undefined> {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const sessionPath = path.join(configDir, 'session.json');
  const configPath = path.join(configDir, 'config.json');
  for (const filePath of [sessionPath, configPath]) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const user = data.user ?? (data.profile as Record<string, unknown> | undefined)?.user;
      if (typeof user === 'string' && user.trim()) {
        return user.trim();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        continue;
      }
      logWarning('browser_login_tracker.claude_read_failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

function hashIdentity(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function redactIdentity(value: string): string {
  if (!value.includes('@')) {
    return value.length <= 3 ? `${value[0] ?? ''}***` : `${value.slice(0, 3)}***`;
  }
  const [local, domain] = value.split('@');
  const localPart = local ? `${local.slice(0, 2)}***` : '***';
  return `${localPart}@${domain}`;
}

async function persistEntry(workspaceRoot: string, entry: BrowserSessionEntry): Promise<void> {
  const securityDir = path.join(workspaceRoot, 'state', 'security');
  await fs.mkdir(securityDir, { recursive: true });
  const sessionsPath = path.join(securityDir, 'browser_sessions.json');
  let existing: BrowserSessionEntry[] = [];
  try {
    const raw = await fs.readFile(sessionsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      existing = parsed as BrowserSessionEntry[];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      logWarning('browser_login_tracker.load_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  existing.push(entry);
  if (existing.length > MAX_ENTRIES) {
    existing = existing.slice(-MAX_ENTRIES);
  }
  await fs.writeFile(sessionsPath, JSON.stringify(existing, null, 2));
}
