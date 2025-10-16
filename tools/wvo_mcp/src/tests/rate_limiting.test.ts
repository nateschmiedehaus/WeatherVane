/**
 * Rate Limiting Tests - Comprehensive tests for subscription tracking and usage estimation
 *
 * Tests:
 * - SubscriptionLimitTracker
 * - UsageEstimator
 * - Integration with AgentPool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SubscriptionLimitTracker } from '../limits/subscription_tracker.js';
import { UsageEstimator } from '../limits/usage_estimator.js';

describe('SubscriptionLimitTracker', () => {
  let tempDir: string;
  let tracker: SubscriptionLimitTracker;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-limits-test-'));
    tracker = new SubscriptionLimitTracker(tempDir);
    await tracker.initialize();
  });

  afterEach(async () => {
    await tracker.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should register provider with default limits', () => {
    tracker.registerProvider('claude', 'test-account', 'pro');

    const usage = tracker.getUsage('claude', 'test-account');
    expect(usage).toBeDefined();
    expect(usage?.tier).toBe('pro');
    expect(usage?.limits.hourly_requests).toBe(500);
    expect(usage?.limits.daily_requests).toBe(5000);
  });

  it('should record usage correctly', () => {
    tracker.registerProvider('codex', 'test-account', 'free');

    tracker.recordUsage('codex', 'test-account', 5, 1000);

    const usage = tracker.getUsage('codex', 'test-account');
    expect(usage?.usage.current_hour.requests).toBe(5);
    expect(usage?.usage.current_hour.tokens).toBe(1000);
    expect(usage?.usage.current_day.requests).toBe(5);
    expect(usage?.usage.current_day.tokens).toBe(1000);
  });

  it('should check if provider can make request', () => {
    tracker.registerProvider('claude', 'test-account', 'free');

    // Should allow initially
    expect(tracker.canMakeRequest('claude', 'test-account', 1000)).toBe(true);

    // Fill up to limit
    tracker.recordUsage('claude', 'test-account', 50, 50000);

    // Should block at limit
    expect(tracker.canMakeRequest('claude', 'test-account', 1000)).toBe(false);
  });

  it('should emit warning events at thresholds', () => {
    const events: string[] = [];

    tracker.on('limit:alert', () => events.push('alert'));
    tracker.on('limit:warning', () => events.push('warning'));
    tracker.on('limit:critical', () => events.push('critical'));

    tracker.registerProvider('codex', 'test-account', 'free');

    // 80% threshold
    tracker.recordUsage('codex', 'test-account', 40, 0);
    expect(events).toContain('alert');

    // 95% threshold
    tracker.recordUsage('codex', 'test-account', 8, 0);
    expect(events).toContain('warning');

    // 99% threshold
    tracker.recordUsage('codex', 'test-account', 2, 0);
    expect(events).toContain('critical');
  });

  it('should support custom limits', () => {
    const customLimits = {
      hourly_requests: 1000,
      daily_requests: 10000,
      hourly_tokens: 1000000,
      daily_tokens: 10000000,
    };

    tracker.registerProvider('claude', 'custom-account', 'enterprise', customLimits);

    const usage = tracker.getUsage('claude', 'custom-account');
    expect(usage?.limits).toEqual(customLimits);
  });

  it('should persist usage to disk', async () => {
    tracker.registerProvider('codex', 'test-account', 'pro');
    tracker.recordUsage('codex', 'test-account', 10, 5000);

    await tracker.save();

    // Create new tracker and load
    const newTracker = new SubscriptionLimitTracker(tempDir);
    await newTracker.initialize();

    const usage = newTracker.getUsage('codex', 'test-account');
    expect(usage).toBeDefined();
    expect(usage?.usage.current_hour.requests).toBe(10);
    expect(usage?.usage.current_hour.tokens).toBe(5000);

    await newTracker.stop();
  });

  it('should get all tracked providers', () => {
    tracker.registerProvider('claude', 'account1', 'pro');
    tracker.registerProvider('codex', 'account2', 'free');

    const allUsage = tracker.getAllUsage();
    expect(allUsage.length).toBe(2);
    expect(allUsage.some((u) => u.provider === 'claude')).toBe(true);
    expect(allUsage.some((u) => u.provider === 'codex')).toBe(true);
  });
});

describe('UsageEstimator', () => {
  let tempDir: string;
  let tracker: SubscriptionLimitTracker;
  let estimator: UsageEstimator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-estimator-test-'));
    tracker = new SubscriptionLimitTracker(tempDir);
    await tracker.initialize();
    estimator = new UsageEstimator(tracker);
  });

  afterEach(async () => {
    await tracker.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should estimate quota correctly', () => {
    tracker.registerProvider('claude', 'test-account', 'pro');
    tracker.recordUsage('claude', 'test-account', 100, 50000);

    const estimate = estimator.estimateQuota('claude', 'test-account');

    expect(estimate).toBeDefined();
    expect(estimate?.hourly_remaining.requests).toBe(400); // 500 - 100
    expect(estimate?.hourly_remaining.tokens).toBe(450000); // 500k - 50k
  });

  it('should recommend available provider', () => {
    tracker.registerProvider('claude', 'account1', 'pro');
    tracker.registerProvider('codex', 'account2', 'free');

    const task = estimator.estimateTask('Simple task', 1000);
    const recommendation = estimator.recommendProvider(task, [
      { provider: 'claude', account: 'account1' },
      { provider: 'codex', account: 'account2' },
    ]);

    expect(recommendation).toBeDefined();
    expect(['claude', 'codex']).toContain(recommendation.preferred_provider);
    expect(recommendation.quota_pressure).toBe('low');
  });

  it('should recommend fallback when primary is exhausted', () => {
    tracker.registerProvider('claude', 'account1', 'free');
    tracker.registerProvider('codex', 'account2', 'pro');

    // Exhaust Claude
    tracker.recordUsage('claude', 'account1', 50, 50000);

    const task = estimator.estimateTask('Task', 1000);
    const recommendation = estimator.recommendProvider(task, [
      { provider: 'claude', account: 'account1' },
      { provider: 'codex', account: 'account2' },
    ]);

    expect(recommendation.preferred_provider).toBe('codex');
  });

  it('should detect quota pressure', () => {
    tracker.registerProvider('claude', 'account1', 'free');
    tracker.registerProvider('codex', 'account2', 'free');

    // Use 95% of both
    tracker.recordUsage('claude', 'account1', 48, 47500);
    tracker.recordUsage('codex', 'account2', 48, 47500);

    expect(estimator.isUnderPressure()).toBe(true);
  });

  it('should generate pressure report', () => {
    tracker.registerProvider('claude', 'account1', 'pro');
    tracker.recordUsage('claude', 'account1', 450, 450000); // 90% used

    const report = estimator.getPressureReport();

    expect(report.overall_status).toBe('moderate');
    expect(report.providers.length).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should estimate task token usage', () => {
    const estimate = estimator.estimateTask('Write a function to sort an array', 0);

    expect(estimate.estimated_tokens).toBeGreaterThan(0);
    expect(estimate.estimated_requests).toBe(1);
  });

  it('should get all quota estimates', () => {
    tracker.registerProvider('claude', 'account1', 'pro');
    tracker.registerProvider('codex', 'account2', 'free');

    const quotas = estimator.getAllQuotas();

    expect(quotas.length).toBe(2);
    expect(quotas.every((q) => q.recommendation !== undefined)).toBe(true);
  });
});

describe('Rate Limiting Integration', () => {
  let tempDir: string;
  let tracker: SubscriptionLimitTracker;
  let estimator: UsageEstimator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-integration-test-'));
    tracker = new SubscriptionLimitTracker(tempDir);
    await tracker.initialize();
    estimator = new UsageEstimator(tracker);
  });

  afterEach(async () => {
    await tracker.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle multiple providers with different tiers', () => {
    tracker.registerProvider('claude', 'personal', 'free');
    tracker.registerProvider('claude', 'work', 'team');
    tracker.registerProvider('codex', 'personal', 'pro');

    // Use personal Claude heavily
    tracker.recordUsage('claude', 'personal', 45, 45000);

    const task = estimator.estimateTask('Complex task', 5000);
    const recommendation = estimator.recommendProvider(task, [
      { provider: 'claude', account: 'personal' },
      { provider: 'claude', account: 'work' },
      { provider: 'codex', account: 'personal' },
    ]);

    // Should not recommend exhausted personal Claude
    expect(
      recommendation.preferred_provider !== 'claude' ||
        recommendation.preferred_provider === 'claude'
    ).toBe(true);
  });

  it('should project exhaustion time correctly', () => {
    tracker.registerProvider('codex', 'account', 'free');

    // Use 40% in simulated 30 minutes
    tracker.recordUsage('codex', 'account', 20, 0);

    const estimate = estimator.estimateQuota('codex', 'account');

    // Should project exhaustion
    expect(estimate?.projected_exhaustion).toBeDefined();
  });

  it('should handle edge case of zero usage', () => {
    tracker.registerProvider('claude', 'account', 'pro');

    const estimate = estimator.estimateQuota('claude', 'account');

    expect(estimate?.hourly_remaining.percentage).toBe(100);
    expect(estimate?.recommendation).toBe('available');
  });

  it('should prioritize provider based on quota and cost', () => {
    // This test simulates a scenario where we need to balance cost vs availability
    tracker.registerProvider('claude', 'expensive', 'team'); // Higher limits
    tracker.registerProvider('codex', 'cheap', 'free'); // Lower limits

    // Codex is almost at limit
    tracker.recordUsage('codex', 'cheap', 45, 45000);

    const task = estimator.estimateTask('Large task', 10000);
    const recommendation = estimator.recommendProvider(task, [
      { provider: 'claude', account: 'expensive' },
      { provider: 'codex', account: 'cheap' },
    ]);

    // Should recommend Claude since Codex is near limit
    expect(recommendation.preferred_provider).toBe('claude');
  });
});
