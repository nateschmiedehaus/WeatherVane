import { describe, expect, it } from 'vitest';

import { AgentPool } from './agent_pool.js';

describe('AgentPool coordinator failover', () => {
  it('promotes Codex to coordinator when Claude is unavailable and demotes when recovered', () => {
    const pool = new AgentPool(process.cwd(), 2);

    expect(pool.getCoordinatorType()).toBe('claude_code');
    expect(pool.isCoordinatorAvailable()).toBe(true);

    pool.imposeCooldown('claude_code', 10, 'usage_limit');

    pool.promoteCoordinatorRole('test');

    expect(pool.getCoordinatorType()).toBe('codex');
    expect(pool.isCoordinatorAvailable()).toBe(true);

    const promoted = pool.getAgent('codex_worker_1');
    expect(promoted?.role).toBe('architect');
    expect(typeof promoted?.promotedAt).toBe('number');

    // Claude still on cooldown should keep Codex as coordinator
    pool.demoteCoordinatorRole();
    expect(pool.getCoordinatorType()).toBe('codex');

    pool.clearCooldown('claude_code');
    pool.demoteCoordinatorRole();

    expect(pool.getCoordinatorType()).toBe('claude_code');
    expect(pool.isCoordinatorAvailable()).toBe(true);
    const restored = pool.getAgent('codex_worker_1');
    expect(restored?.role).toBe(restored?.baseRole);
    expect(restored?.promotedAt).toBeUndefined();
  });
});
