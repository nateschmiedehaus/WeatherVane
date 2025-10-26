import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadRouterPolicy } from '../router_policy.js';

const tmpRoot = path.join(tmpdir(), 'router-policy-');
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('router_policy', () => {
  it('loads capability priorities and thresholds from YAML', async () => {
    const dir = await mkdtemp(tmpRoot);
    tempDirs.push(dir);
    const policyPath = path.join(dir, 'model_policy.yaml');
    await writeFile(
      policyPath,
      `capability_tags:
  reasoning_high:
    prefer:
      - claude-opus-4.1
      - claude-sonnet-4.5
  fast_code:
    prefer:
      - codex-5-high
      - codex-5-medium
thresholds:
  long_context_tokens: 150000
  fast_code_files: 7
routing:
  monitor: cheap_batch
escalation:
  on_two_verify_failures:
    threshold: 3
    require_plan_delta: false
`
    );

    const policy = loadRouterPolicy(policyPath);
    expect(policy.capabilityPriorities.reasoning_high[0]).toBe('claude-opus-4.1');
    expect(policy.capabilityPriorities.fast_code[0]).toBe('codex-5-high');
    expect(policy.thresholds.longContextTokens).toBe(150000);
    expect(policy.thresholds.fastCodeFiles).toBe(7);
    expect(policy.verifyFailureEscalation).toBe(3);
    expect(policy.requirePlanDeltaOnEscalation).toBe(false);
    expect(policy.stateCapabilities.monitor).toEqual(['cheap_batch']);
  });
});
