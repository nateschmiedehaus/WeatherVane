#!/usr/bin/env ts-node
/**
 * Live Flags CLI
 *
 * Manage runtime feature flags stored in the orchestrator SQLite database.
 *
 * Usage examples (run from repository root or tools/wvo_mcp):
 *   ts-node tools/wvo_mcp/scripts/live_flags.ts list
 *   ts-node tools/wvo_mcp/scripts/live_flags.ts get PROMPT_MODE
 *   ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE verbose
 *   ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE=compact SANDBOX_MODE=pool
 *   ts-node tools/wvo_mcp/scripts/live_flags.ts kill-switch on
 *
 * The CLI ensures the settings table exists, seeds defaults, and normalises values.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import DatabaseConstructor from 'better-sqlite3';

import {
  DEFAULT_LIVE_FLAGS,
  LIVE_FLAG_KEYS,
  type LiveFlagKey,
  type LiveFlagSnapshot,
  SettingsStore,
  isLiveFlagKey,
  seedLiveFlagDefaults,
} from '../src/state/live_flags.js';

type Command = 'list' | 'get' | 'set' | 'kill-switch' | 'help';

interface ParsedArgs {
  workspaceRoot: string;
  sqlitePath?: string;
  command: Command;
  operands: string[];
}

function printHelp(): void {
  const lines = [
    'Live Flags CLI',
    '',
    'Usage:',
    '  ts-node scripts/live_flags.ts [--workspace <path>] [--sqlite <file>] <command> [args...]',
    '',
    'Commands:',
    '  list                       Show all live flags with current and default values',
    '  get <FLAG>                 Print the current value for the given flag',
    '  set <FLAG>=<value> [...]   Update one or more flags (KEY=VAL or KEY VAL syntax)',
    '  kill-switch on|off|status  Flip or inspect the DISABLE_NEW kill switch',
    '  help                       Show this message',
    '',
    'Flags:',
    '  --workspace <path>         Workspace root (defaults to current working directory)',
    '  --sqlite <file>            Override SQLite database path (defaults to state/orchestrator.db)',
    '',
    `Supported live flags: ${LIVE_FLAG_KEYS.join(', ')}`,
  ];
  console.log(lines.join('\n'));
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const args = [...rawArgs];
  let workspaceRoot = process.cwd();
  let sqlitePath: string | undefined;

  while (args.length > 0) {
    const next = args[0];
    if (next === '--workspace') {
      args.shift();
      const value = args.shift();
      if (!value) {
        throw new Error('Missing value for --workspace');
      }
      workspaceRoot = path.resolve(value);
      continue;
    }
    if (next === '--sqlite') {
      args.shift();
      const value = args.shift();
      if (!value) {
        throw new Error('Missing value for --sqlite');
      }
      sqlitePath = path.resolve(value);
      continue;
    }
    break;
  }

  if (args.length === 0) {
    return { workspaceRoot, sqlitePath, command: 'list', operands: [] };
  }

  const [command, ...operands] = args;
  if (command === 'list' || command === 'get' || command === 'set' || command === 'kill-switch' || command === 'help') {
    return { workspaceRoot, sqlitePath, command, operands };
  }

  throw new Error(`Unknown command "${command}"`);
}

function resolveSqlitePath(workspaceRoot: string, override?: string): string {
  if (override) {
    return override;
  }
  return path.join(workspaceRoot, 'state', 'orchestrator.db');
}

function ensureWorkspace(stateDir: string): void {
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

function ensureSettingsTable(sqlitePath: string): void {
  const db = new DatabaseConstructor(sqlitePath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
        metadata JSON
      );
      CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);
    `);
    seedLiveFlagDefaults(db);
  } finally {
    db.close();
  }
}

function formatSnapshot(snapshot: LiveFlagSnapshot): string {
  const rows = LIVE_FLAG_KEYS.map((key) => {
    const current = snapshot[key];
    const baseline = DEFAULT_LIVE_FLAGS[key];
    const delta = current === baseline ? '' : ' (overridden)';
    return `${key.padEnd(28)} ${current}${delta}`;
  });
  return rows.join('\n');
}

function parseAssignment(input: string, next?: string): { key: LiveFlagKey; value: string } {
  if (input.includes('=')) {
    const [rawKey, rawValue] = input.split('=', 2);
    return normaliseKeyValue(rawKey, rawValue);
  }
  if (next) {
    return normaliseKeyValue(input, next);
  }
  throw new Error(`Missing value for flag "${input}"`);
}

function normaliseKeyValue(rawKey: string, rawValue: string): { key: LiveFlagKey; value: string } {
  const trimmedKey = rawKey.trim();
  if (!isLiveFlagKey(trimmedKey)) {
    throw new Error(`Unsupported live flag "${rawKey}"`);
  }
  return { key: trimmedKey, value: rawValue };
}

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const sqlitePath = resolveSqlitePath(parsed.workspaceRoot, parsed.sqlitePath);
    const stateDir = path.dirname(sqlitePath);
    ensureWorkspace(stateDir);
    ensureSettingsTable(sqlitePath);

    const settingsStore = new SettingsStore({
      workspaceRoot: parsed.workspaceRoot,
      sqlitePath,
    });

    try {
      await executeCommand(settingsStore, parsed);
    } finally {
      settingsStore.close();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`live_flags: ${error.message}`);
    } else {
      console.error('live_flags: Unknown error');
    }
    process.exitCode = 1;
  }
}

async function executeCommand(
  settingsStore: SettingsStore,
  parsed: ParsedArgs,
): Promise<void> {
  switch (parsed.command) {
    case 'help':
      printHelp();
      return;
    case 'list': {
      const snapshot = settingsStore.read();
      console.log(formatSnapshot(snapshot));
      return;
    }
    case 'get': {
      if (parsed.operands.length === 0) {
        throw new Error('get command requires a flag name');
      }
      const key = parsed.operands[0].trim();
      if (!isLiveFlagKey(key)) {
        throw new Error(`Unsupported live flag "${key}"`);
      }
      const value = settingsStore.read()[key];
      console.log(value);
      return;
    }
    case 'set': {
      if (parsed.operands.length === 0) {
        throw new Error('set command requires at least one flag assignment');
      }
      const operands = [...parsed.operands];
      const assignments: Array<{ key: LiveFlagKey; value: string }> = [];

      while (operands.length > 0) {
        const current = operands.shift()!;
        if (current.includes('=')) {
          assignments.push(parseAssignment(current));
        } else if (operands.length > 0 && !operands[0].includes('=')) {
          const next = operands.shift()!;
          assignments.push(parseAssignment(current, next));
        } else {
          throw new Error(`Invalid assignment "${current}". Use KEY=VALUE or KEY VALUE.`);
        }
      }

      for (const assignment of assignments) {
        const snapshot = settingsStore.upsert(assignment.key, assignment.value);
        console.log(`${assignment.key}=${snapshot[assignment.key]}`);
      }
      return;
    }
    case 'kill-switch': {
      const action = parsed.operands[0]?.toLowerCase() ?? 'status';
      if (action === 'on') {
        const snapshot = settingsStore.upsert('DISABLE_NEW', '1');
        console.log(`DISABLE_NEW=${snapshot.DISABLE_NEW}`);
        return;
      }
      if (action === 'off') {
        const snapshot = settingsStore.upsert('DISABLE_NEW', '0');
        console.log(`DISABLE_NEW=${snapshot.DISABLE_NEW}`);
        return;
      }
      if (action === 'status') {
        console.log(settingsStore.read().DISABLE_NEW);
        return;
      }
      throw new Error(`Unsupported kill-switch action "${action}". Use on|off|status.`);
    }
    default:
      throw new Error(`Unhandled command "${parsed.command}"`);
  }
}

void main();
