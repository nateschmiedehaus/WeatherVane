import { afterEach, describe, expect, it } from 'vitest';

import { deriveResourceLimits, type DeviceProfile } from './device_profile.js';

describe('device_profile resource limits', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('derives reasonable defaults when no profile is present', () => {
    const limits = deriveResourceLimits(null);
    expect(limits.codexWorkers).toBeGreaterThanOrEqual(2);
    expect(limits.heavyTaskConcurrency).toBeGreaterThanOrEqual(1);
    expect(limits.recommendedConcurrency).toBeGreaterThanOrEqual(1);
  });

  it('scales codex workers and heavy task limit based on recommended concurrency', () => {
    const profile: DeviceProfile = {
      profile_id: 'abc123',
      capabilities: {
        recommended_concurrency: 8,
        suggested_batch_size: 192,
        has_accelerator: true,
      },
      accelerators: [],
    };

    const limits = deriveResourceLimits(profile);
    expect(limits.codexWorkers).toBeGreaterThanOrEqual(4);
    expect(limits.heavyTaskConcurrency).toBeGreaterThanOrEqual(2);
    expect(limits.profileId).toBe('abc123');
    expect(limits.hasAccelerator).toBe(true);
    expect(limits.suggestedBatchSize).toBe(192);
  });

  it('honours environment overrides for codex workers and heavy task slots', () => {
    process.env.WVO_CODEX_WORKERS = '5';
    process.env.WVO_HEAVY_TASK_CONCURRENCY = '3';

    const profile: DeviceProfile = {
      profile_id: 'override',
      capabilities: {
        recommended_concurrency: 4,
      },
      accelerators: [],
    };

    const limits = deriveResourceLimits(profile);
    expect(limits.codexWorkers).toBe(5);
    expect(limits.heavyTaskConcurrency).toBe(3);
  });
});
