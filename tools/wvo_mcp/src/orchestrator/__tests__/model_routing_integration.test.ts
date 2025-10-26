import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { discoverModelCatalog } from '../model_discovery.js';
import { ModelRouter, type RouterDecisionLog } from '../model_router.js';
import { ROUTER_ALLOWED_MODELS, ROUTER_BANNED_PROVIDERS } from '../router_lock.js';

const tmpRoot = path.join(tmpdir(), 'model-routing-integration-');
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('model routing integration', () => {
  it('discovery → router → decision end-to-end flow', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'integration-test';

    // Phase 1: Run model discovery
    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      },
    });

    // Verify discovery produces valid catalog
    expect(discoveryResult.models.length).toBeGreaterThan(0);
    expect(discoveryResult.discoveryPath).toBeDefined();
    expect(discoveryResult.resourceUri).toMatch(/^resources:\/\/runs\/run-integration-test/);

    // Phase 2: Create router with discovery catalog
    const decisions: RouterDecisionLog[] = [];
    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
      decisionLogger: (entry) => decisions.push(entry),
    });

    // Phase 3: Make routing decisions
    const implementSelection = router.pickModel('implement', { taskId: 'T1' });
    const planSelection = router.pickModel('plan', { taskId: 'T2' });
    const monitorSelection = router.pickModel('monitor', { taskId: 'T3' });

    // Phase 4: Verify routing decisions
    expect(implementSelection.source).toBe('discovery');
    expect(planSelection.source).toBe('discovery');
    expect(monitorSelection.source).toBe('discovery');

    // Verify decisions logged
    expect(decisions.length).toBe(3);
    expect(decisions[0].taskId).toBe('T1');
    expect(decisions[1].taskId).toBe('T2');
    expect(decisions[2].taskId).toBe('T3');

    // Phase 5: Verify allow-list enforcement throughout
    for (const model of discoveryResult.models) {
      expect(ROUTER_ALLOWED_MODELS.has(model.name)).toBe(true);
      expect(ROUTER_BANNED_PROVIDERS.has(model.provider as string)).toBe(false);
    }

    for (const decision of decisions) {
      expect(ROUTER_ALLOWED_MODELS.has(decision.selected.model)).toBe(true);
      expect(ROUTER_BANNED_PROVIDERS.has(decision.selected.provider)).toBe(false);
    }
  });

  it('handles banned provider detection in discovery → router pipeline', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'banned-provider-test';
    const journalEntries: string[] = [];

    // Discovery with banned provider env vars
    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        GOOGLE_API_KEY: 'fake-google-key', // Banned provider
        XAI_API_KEY: 'fake-xai-key', // Banned provider
        ANTHROPIC_API_KEY: 'test-key',
      },
      journalLogger: async (entry) => {
        journalEntries.push(entry);
      },
    });

    // Verify banned providers were logged
    const bannedEntries = journalEntries.filter(e => e.includes('banned_env'));
    expect(bannedEntries.length).toBeGreaterThan(0);

    // Verify catalog contains no banned provider models
    for (const model of discoveryResult.models) {
      expect(ROUTER_BANNED_PROVIDERS.has(model.provider as string)).toBe(false);
    }

    // Router should only work with allow-listed models
    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
    });

    const selection = router.pickModel('implement', { taskId: 'T1' });
    expect(ROUTER_BANNED_PROVIDERS.has(selection.provider)).toBe(false);
  });

  it('escalation triggers reasoning_high selection from discovery catalog', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'escalation-test';

    // Run discovery
    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      },
    });

    const decisions: RouterDecisionLog[] = [];
    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
      decisionLogger: (entry) => decisions.push(entry),
    });

    const taskId = 'T-escalate';

    // Normal selection
    router.pickModel('implement', { taskId });
    const normalDecision = decisions[decisions.length - 1];

    // Trigger escalation
    router.noteVerifyFailure(taskId);
    router.noteVerifyFailure(taskId);

    // Escalated selection
    router.pickModel('implement', { taskId });
    const escalatedDecision = decisions[decisions.length - 1];

    // Verify escalation changed requested tags
    expect(normalDecision.requestedTags).toContain('fast_code');
    expect(escalatedDecision.requestedTags).toContain('reasoning_high');

    // Both selections should come from discovery catalog
    expect(normalDecision.selected.source).toBe('discovery');
    expect(escalatedDecision.selected.source).toBe('discovery');
  });

  it('circuit breaker works with discovery catalog', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'circuit-breaker-test';

    // Run discovery
    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      },
    });

    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
      cooldownMs: 100,
    });

    // Simulate provider failure
    router.recordProviderFailure('implement', 'openai', 429);

    // Should still be able to pick a model (from anthropic)
    const selection = router.pickModel('implement', { taskId: 'T1' });

    expect(selection).toBeDefined();
    expect(selection.source).toBe('discovery');
  });

  it('fallback to policy when discovery unavailable', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'fallback-test';

    // Create policy file but no discovery catalog
    const policyPath = path.join(workspaceRoot, 'model_policy.yaml');
    await require('fs/promises').writeFile(
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
capability_tags:
  reasoning_high:
    prefer: ["claude-sonnet-4.5"]
  fast_code:
    prefer: ["codex-5-high"]
routing:
  implement: fast_code
  plan: reasoning_high
`
    );

    const router = new ModelRouter({
      workspaceRoot,
      runId,
      policyPath,
    });

    const selection = router.pickModel('implement', { taskId: 'T1' });

    // Should fall back to policy
    expect(selection.source).toBe('policy');
    expect(selection.model).toBeDefined();
    expect(ROUTER_ALLOWED_MODELS.has(selection.model)).toBe(true);
  });

  it('verify long context threshold triggers tag resolution', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'long-context-test';

    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      },
    });

    const decisions: RouterDecisionLog[] = [];
    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
      decisionLogger: (entry) => decisions.push(entry),
    });

    // Request with high context
    router.pickModel('implement', {
      taskId: 'T1',
      contextTokens: 150000, // Exceeds default threshold of 120k
    });

    // Should request long_context tag
    expect(decisions[0].requestedTags).toContain('long_context');
    expect(decisions[0].requestedTags).toContain('fast_code');
    expect(decisions[0].selected.source).toBe('discovery');
  });

  it('verify decision logging captures complete pipeline metadata', async () => {
    const workspaceRoot = await mkdtemp(tmpRoot);
    tempDirs.push(workspaceRoot);
    const runId = 'logging-test';

    const discoveryResult = await discoverModelCatalog({
      workspaceRoot,
      runId,
      env: {
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
      },
    });

    const decisions: RouterDecisionLog[] = [];
    const router = new ModelRouter({
      workspaceRoot,
      runId,
      discoveryPath: discoveryResult.discoveryPath,
      decisionLogger: (entry) => decisions.push(entry),
    });

    router.pickModel('plan', {
      taskId: 'T-log',
      contextTokens: 50000,
    });

    const decision = decisions[0];

    // Verify complete decision metadata
    expect(decision.taskId).toBe('T-log');
    expect(decision.state).toBe('plan');
    expect(decision.requestedTags).toBeDefined();
    expect(decision.requestedTags.length).toBeGreaterThan(0);
    expect(decision.selected).toBeDefined();
    expect(decision.selected.model).toBeTruthy();
    expect(decision.selected.provider).toBeTruthy();
    expect(decision.selected.capabilityTags).toBeDefined();
    expect(decision.selected.source).toBe('discovery');
    expect(decision.selected.reason).toBeTruthy();
    expect(decision.fallbackApplied).toBeDefined();
  });
});
