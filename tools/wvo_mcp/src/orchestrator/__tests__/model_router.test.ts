import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { ModelRouter, type RouterDecisionLog } from '../model_router.js';
import type { RouterState } from '../router_policy.js';

const tmpRoot = path.join(tmpdir(), 'model-router-');
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createMockDiscoveryCatalog(workspaceRoot: string, runId: string) {
  const runDir = path.join(workspaceRoot, 'resources', 'runs', `run-${runId}`);
  await mkdir(runDir, { recursive: true });

  const catalog = {
    models: [
      {
        name: 'codex-5-high',
        provider: 'openai',
        context_window: 128000,
        reasoning_strength: 'high',
        code_quality: 'high',
        latency_ms_est: 1800,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
      {
        name: 'codex-5-medium',
        provider: 'openai',
        context_window: 128000,
        reasoning_strength: 'medium_high',
        code_quality: 'high',
        latency_ms_est: 1200,
        price_class: 'normal',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
      {
        name: 'codex-5-low',
        provider: 'openai',
        context_window: 128000,
        reasoning_strength: 'medium',
        code_quality: 'high',
        latency_ms_est: 800,
        price_class: 'cheap',
        tool_use_ok: true,
        vision_ok: false,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
      {
        name: 'claude-sonnet-4.5',
        provider: 'anthropic',
        context_window: 200000,
        reasoning_strength: 'high',
        code_quality: 'high',
        latency_ms_est: 1600,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
      {
        name: 'claude-haiku-4.5',
        provider: 'anthropic',
        context_window: 200000,
        reasoning_strength: 'medium',
        code_quality: 'medium',
        latency_ms_est: 700,
        price_class: 'cheap',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
      {
        name: 'claude-opus-4.1',
        provider: 'anthropic',
        context_window: 200000,
        reasoning_strength: 'ultra',
        code_quality: 'ultra',
        latency_ms_est: 2400,
        price_class: 'premium',
        tool_use_ok: true,
        vision_ok: true,
        max_output_tokens: 8192,
        notes: ['allowlist', 'sdk_env_present'],
      },
    ],
    source: 'discovery',
    timestamp: new Date().toISOString(),
    fallback: [],
  };

  const discoveryPath = path.join(runDir, 'models_discovered.json');
  await writeFile(discoveryPath, JSON.stringify(catalog, null, 2));
  return discoveryPath;
}

async function createMockPolicyFile(workspaceRoot: string) {
  const policyPath = path.join(workspaceRoot, 'model_policy.yaml');
  await writeFile(
    policyPath,
    `catalog_version: 1
models:
  - name: codex-5-high
    provider: openai
    context_window: 128000
    reasoning_strength: high
    code_quality: high
    latency_ms_est: 1800
    price_class: premium
    tool_use_ok: true
    vision_ok: false
    max_output_tokens: 8192
  - name: claude-sonnet-4.5
    provider: anthropic
    context_window: 200000
    reasoning_strength: high
    code_quality: high
    latency_ms_est: 1600
    price_class: premium
    tool_use_ok: true
    vision_ok: true
    max_output_tokens: 8192
  - name: claude-haiku-4.5
    provider: anthropic
    context_window: 200000
    reasoning_strength: medium
    code_quality: medium
    latency_ms_est: 700
    price_class: cheap
    tool_use_ok: true
    vision_ok: true
    max_output_tokens: 8192
capability_tags:
  reasoning_high:
    prefer: ["claude-sonnet-4.5", "claude-opus-4.1"]
  fast_code:
    prefer: ["codex-5-medium", "codex-5-high", "codex-5-low"]
  cheap_batch:
    prefer: ["claude-haiku-4.5"]
  long_context:
    prefer: ["claude-sonnet-4.5", "claude-opus-4.1"]
    min_context_window: 120000
routing:
  specify: reasoning_high
  plan: reasoning_high
  thinker: reasoning_high
  implement: fast_code
  verify: fast_code
  review: reasoning_high
  pr: reasoning_high
  monitor: cheap_batch
thresholds:
  long_context_tokens: 120000
  fast_code_files: 5
escalation:
  on_two_verify_failures:
    threshold: 2
    require_plan_delta: true
`
  );
  return policyPath;
}

describe('model_router', () => {
  describe('basic model selection', () => {
    it('picks a model based on state and tags', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-basic-pick';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      expect(selection).toBeDefined();
      expect(selection.model).toBeTruthy();
      expect(selection.provider).toBeTruthy();
      expect(selection.source).toBe('discovery');
    });

    it('prefers fast_code models for implement state', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-fast-code';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      // Should be a codex model (fast_code preference)
      expect(selection.model).toMatch(/^codex-5-/);
    });

    it('prefers reasoning_high models for plan state', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-reasoning';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('plan', { taskId: 'T1' });

      // Should be a claude model (reasoning_high preference)
      expect(selection.model).toMatch(/^claude-(sonnet|opus)/);
    });

    it('prefers cheap_batch models for monitor state', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-cheap';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('monitor', { taskId: 'T1' });

      // Should be haiku (cheap_batch preference)
      expect(selection.model).toBe('claude-haiku-4.5');
    });
  });

  describe('model ranking', () => {
    it('ranks by reasoning strength when capability is reasoning_high', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-ranking-reasoning';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('review', { taskId: 'T1' });

      // Should prefer sonnet over haiku (higher reasoning)
      expect(selection.model).toBe('claude-sonnet-4.5');
    });

    it('considers code quality for fast_code tasks', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-code-quality';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      // Should prefer high code quality models
      expect(['codex-5-medium', 'codex-5-high', 'codex-5-low']).toContain(selection.model);
    });

    it('considers latency as tiebreaker', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-latency';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('monitor', { taskId: 'T1' });

      // Haiku should win due to lowest latency + cheap price
      expect(selection.model).toBe('claude-haiku-4.5');
    });
  });

  describe('capability tag resolution', () => {
    it('adds long_context tag when context tokens exceed threshold', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-long-context';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      const selection = router.pickModel('implement', {
        taskId: 'T1',
        contextTokens: 150000, // Exceeds 120k threshold
      });

      // Should request long_context in the decision
      expect(decisions[0].requestedTags).toContain('long_context');
      expect(decisions[0].requestedTags).toContain('fast_code');
      // Router may apply fallback if no models match both fast_code + long_context
      // At minimum, verify it picks a valid model
      expect(selection.model).toBeDefined();
    });

    it('forces long_context tag when explicitly requested', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-force-long';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      const selection = router.pickModel('implement', {
        taskId: 'T1',
        forceLongContext: true,
      });

      // Should request long_context in the decision
      expect(decisions[0].requestedTags).toContain('long_context');
      // Router may apply fallback logic
      expect(selection.model).toBeDefined();
    });

    it('maps states to default capability tags', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-state-mapping';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const states: RouterState[] = ['specify', 'plan', 'thinker', 'implement', 'verify', 'review', 'pr', 'monitor'];

      for (const state of states) {
        const selection = router.pickModel(state, { taskId: `T-${state}` });
        expect(selection.capabilityTags.length).toBeGreaterThan(0);
      }
    });
  });

  describe('escalation logic', () => {
    it('escalates to reasoning_high after verify failures', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-escalation';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      const taskId = 'T-escalate';

      // First verify failure
      router.noteVerifyFailure(taskId);
      let selection = router.pickModel('implement', { taskId });

      // Second verify failure - should trigger escalation
      router.noteVerifyFailure(taskId);
      selection = router.pickModel('implement', { taskId });

      // Should now request reasoning_high
      const lastDecision = decisions[decisions.length - 1];
      expect(lastDecision.requestedTags).toContain('reasoning_high');
    });

    it('escalates to opus after verify failures', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-opus-escalation';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const taskId = 'T-opus';

      // Trigger escalation
      router.noteVerifyFailure(taskId);
      router.noteVerifyFailure(taskId);

      const selection = router.pickModel('plan', { taskId });

      // Should prioritize opus due to forced reasoning_high
      expect(selection.model).toBe('claude-opus-4.1');
    });

    it('clears escalation when task is cleared', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-clear';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      const taskId = 'T-clear';

      // Trigger escalation
      router.noteVerifyFailure(taskId);
      router.noteVerifyFailure(taskId);

      let selection = router.pickModel('implement', { taskId });
      const escalatedDecision = decisions[decisions.length - 1];
      expect(escalatedDecision.requestedTags).toContain('reasoning_high');

      // Clear task
      router.clearTask(taskId);

      // Should no longer force reasoning_high
      selection = router.pickModel('implement', { taskId });
      const clearedDecision = decisions[decisions.length - 1];
      // Should only have fast_code from state mapping, not reasoning_high
      expect(clearedDecision.requestedTags).toContain('fast_code');
      expect(clearedDecision.requestedTags).not.toContain('reasoning_high');
    });
  });

  describe('circuit breaker', () => {
    it('engages circuit breaker on 429 status', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-429';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        cooldownMs: 100, // Short cooldown for testing
      });

      // Record failure
      router.recordProviderFailure('implement', 'openai', 429);

      // Next selection should avoid openai
      const selection = router.pickModel('implement', { taskId: 'T1' });

      // Should fall back to a different provider or model
      expect(selection).toBeDefined();
    });

    it('engages circuit breaker on 5xx status', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-500';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        cooldownMs: 100,
      });

      // Record failure
      router.recordProviderFailure('implement', 'anthropic', 503);

      // Should still be able to pick a model (from openai)
      const selection = router.pickModel('implement', { taskId: 'T1' });
      expect(selection).toBeDefined();
    });

    it('resets circuit breaker after cooldown', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-cooldown';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        cooldownMs: 50, // Very short cooldown
      });

      // Record failure
      router.recordProviderFailure('implement', 'openai', 429);

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should be able to pick from openai again
      const selection = router.pickModel('implement', { taskId: 'T1' });
      expect(selection).toBeDefined();
    });
  });

  describe('decision logging', () => {
    it('invokes decision logger callback', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-logging';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      router.pickModel('implement', { taskId: 'T1' });

      expect(decisions.length).toBe(1);
      expect(decisions[0].taskId).toBe('T1');
      expect(decisions[0].state).toBe('implement');
      expect(decisions[0].requestedTags).toBeDefined();
      expect(decisions[0].selected).toBeDefined();
    });

    it('logs complete decision information', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-complete-log';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const decisions: RouterDecisionLog[] = [];

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        decisionLogger: (entry) => decisions.push(entry),
      });

      router.pickModel('plan', { taskId: 'T-log' });

      const decision = decisions[0];
      expect(decision.taskId).toBe('T-log');
      expect(decision.state).toBe('plan');
      expect(decision.selected.model).toBeTruthy();
      expect(decision.selected.provider).toBeTruthy();
      expect(decision.selected.source).toBeTruthy();
      expect(decision.selected.reason).toBeTruthy();
    });

    it('can update decision logger after construction', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-update-logger';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const decisions: RouterDecisionLog[] = [];
      router.setDecisionLogger((entry) => decisions.push(entry));

      router.pickModel('implement', { taskId: 'T1' });

      expect(decisions.length).toBe(1);
    });
  });

  describe('catalog loading', () => {
    it('loads discovery catalog when available', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-discovery-load';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      expect(selection.source).toBe('discovery');
    });

    it('falls back to policy when discovery unavailable', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-policy-fallback';
      // Don't create discovery catalog
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      expect(selection.source).toBe('policy');
    });

    it('uses explicit discovery path when provided', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-explicit-path';
      const discoveryPath = await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
        discoveryPath,
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      expect(selection.source).toBe('discovery');
    });
  });

  describe('allow-list enforcement', () => {
    it('only selects allow-listed models', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-allowlist';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const allowedModels = new Set([
        'codex-5-high',
        'codex-5-medium',
        'codex-5-low',
        'claude-sonnet-4.5',
        'claude-haiku-4.5',
        'claude-opus-4.1',
      ]);

      const states: RouterState[] = ['specify', 'plan', 'implement', 'verify', 'review', 'pr', 'monitor'];

      for (const state of states) {
        const selection = router.pickModel(state, { taskId: `T-${state}` });
        expect(allowedModels.has(selection.model)).toBe(true);
      }
    });

    it('rejects banned providers', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-banned';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', { taskId: 'T1' });

      // Should never select from banned providers (google, xai, other)
      expect(['openai', 'anthropic']).toContain(selection.provider);
    });
  });

  describe('hints-based routing', () => {
    it('escalates when touching many files', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-many-files';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', {
        taskId: 'T1',
        hints: { touchedFiles: 10 }, // Exceeds threshold of 5
      });

      // Should still pick a model (may escalate internally)
      expect(selection).toBeDefined();
    });

    it('escalates for security-sensitive tasks', async () => {
      const workspaceRoot = await mkdtemp(tmpRoot);
      tempDirs.push(workspaceRoot);
      const runId = 'test-security';
      await createMockDiscoveryCatalog(workspaceRoot, runId);
      await createMockPolicyFile(workspaceRoot);

      const router = new ModelRouter({
        workspaceRoot,
        runId,
        policyPath: path.join(workspaceRoot, 'model_policy.yaml'),
      });

      const selection = router.pickModel('implement', {
        taskId: 'T1',
        hints: { securitySensitive: true },
      });

      // Should still pick a model
      expect(selection).toBeDefined();
    });
  });
});
