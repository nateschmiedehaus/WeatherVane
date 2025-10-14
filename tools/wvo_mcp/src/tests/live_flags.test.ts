import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LiveFlags } from '../orchestrator/live_flags.js';
import { SettingsStore } from '../state/live_flags.js';
import { StateMachine } from '../orchestrator/state_machine.js';

async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 1000;
  const interval = options.intervalMs ?? 25;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Condition not met within timeout');
}

describe('LiveFlags', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wvo-live-flags-'));
    const stateMachine = new StateMachine(workspaceRoot);
    stateMachine.close();
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('refreshes PROMPT_MODE without requiring a restart', async () => {
    const liveFlags = new LiveFlags({ workspaceRoot, pollIntervalMs: 50 });
    const settings = new SettingsStore({ workspaceRoot });

    try {
      expect(liveFlags.getValue('PROMPT_MODE')).toBe('compact');

      settings.upsert('PROMPT_MODE', 'verbose');

      await waitFor(() => liveFlags.getValue('PROMPT_MODE') === ('verbose' as string), {
        timeoutMs: 1000,
      });
    } finally {
      liveFlags.dispose();
      settings.close();
    }
  });

  it('enforces DISABLE_NEW kill switch overrides', async () => {
    const liveFlags = new LiveFlags({ workspaceRoot, pollIntervalMs: 50 });
    const settings = new SettingsStore({ workspaceRoot });

    try {
      settings.upsert('PROMPT_MODE', 'verbose');
      await waitFor(() => liveFlags.getValue('PROMPT_MODE') === ('verbose' as string));

      settings.upsert('DISABLE_NEW', '1');
      await waitFor(() => liveFlags.getValue('DISABLE_NEW') === ('1' as string));

      expect(liveFlags.getValue('PROMPT_MODE')).toBe('compact');

      settings.upsert('DISABLE_NEW', '0');
      await waitFor(() => liveFlags.getValue('DISABLE_NEW') === ('0' as string));
      await waitFor(() => liveFlags.getValue('PROMPT_MODE') === ('verbose' as string));
    } finally {
      liveFlags.dispose();
      settings.close();
    }
  });
});
