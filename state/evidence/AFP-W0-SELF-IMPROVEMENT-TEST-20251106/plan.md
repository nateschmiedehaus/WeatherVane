# PLAN - Wave 0.1 Architecture and Implementation

**Task ID:** AFP-W0-SELF-IMPROVEMENT-TEST-20251106
**Date:** 2025-11-06
**Phase:** PLAN

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Wave 0.1 Runner                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Clone Manager│  │Provider Router│  │Resource Mon. │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼────────────────┼──────────────────┼──────────┘
          │                │                  │
     ┌────▼────────────────▼──────────────────▼─────┐
     │              Task Executor                    │
     │  ┌────────────────────────────────────────┐ │
     │  │         Phase Orchestrator              │ │
     │  └────────────┬───────────────────────────┘ │
     └───────────────┼──────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │    Real MCP Client      │
        │ ┌────────────────────┐ │
        │ │   MCP Server        │ │
        │ │  (stdio transport)  │ │
        │ └────────────────────┘ │
        └─────────────────────────┘
```

## Component Design

### 1. Real MCP Client (Replace Fake)
**File:** `tools/wvo_mcp/src/wave0/real_mcp_client.ts`
```typescript
class RealMCPClient {
  private server: ChildProcess;
  private client: MCPClient;

  async connect(): Promise<void> {
    // Start MCP server process
    this.server = spawn('node', ['./mcp-server.js']);

    // Connect via stdio transport
    const transport = new StdioClientTransport({
      stdin: this.server.stdin,
      stdout: this.server.stdout
    });

    this.client = new Client({ transport });
    await this.client.connect();
  }

  async executeToolbash: string, params: any): Promise<any> {
    return this.client.callTool(name, params);
  }
}
```
**LOC:** ~150

### 2. Provider Router (New)
**File:** `tools/wvo_mcp/src/wave0/provider_router.ts`
```typescript
class ProviderRouter {
  private usage = { claude: 0, codex: 0 };
  private limits = { claude: 100000, codex: 150000 };

  selectProvider(task: Task): 'claude' | 'codex' {
    // Complex reasoning → Claude
    if (task.type === 'review' || task.type === 'think') {
      return this.canUse('claude') ? 'claude' : 'codex';
    }

    // Code generation → Codex
    if (task.type === 'implement' || task.type === 'test') {
      return this.canUse('codex') ? 'codex' : 'claude';
    }

    // Default: balance usage
    return this.usage.claude < this.usage.codex ? 'claude' : 'codex';
  }

  private canUse(provider: string): boolean {
    return this.usage[provider] < this.limits[provider];
  }
}
```
**LOC:** ~100

### 3. Clone Manager (New)
**File:** `tools/wvo_mcp/src/wave0/clone_manager.ts`
```typescript
class CloneManager {
  async createClone(taskId: string): Promise<CloneInfo> {
    const cloneDir = `/tmp/wave0-clone-${taskId}-${Date.now()}`;
    const clonePort = this.findFreePort();

    // Copy current Wave 0 code
    await fs.cp(process.cwd(), cloneDir, { recursive: true });

    // Start cloned instance
    const clone = spawn('node', ['./scripts/run_wave0.mjs'], {
      cwd: cloneDir,
      env: {
        ...process.env,
        WAVE0_PORT: clonePort,
        WAVE0_STATE: `${cloneDir}/state`,
        WAVE0_MODE: 'test'
      }
    });

    return {
      pid: clone.pid,
      dir: cloneDir,
      port: clonePort,
      process: clone
    };
  }

  async validateClone(clone: CloneInfo, testTask: Task): Promise<boolean> {
    // Give clone a test task
    const result = await this.executeOnClone(clone, testTask);

    // Check it completed successfully
    return result.status === 'completed' &&
           result.evidence.length > 0 &&
           await this.verifyNoLeaks(clone);
  }

  async cleanupClone(clone: CloneInfo): Promise<void> {
    clone.process.kill('SIGTERM');
    await fs.rm(clone.dir, { recursive: true, force: true });
  }
}
```
**LOC:** ~200

### 4. Content Generator (New)
**File:** `tools/wvo_mcp/src/wave0/content_generator.ts`
```typescript
class ContentGenerator {
  constructor(private mcp: RealMCPClient, private router: ProviderRouter) {}

  async generateStrategy(task: Task): Promise<string> {
    const provider = this.router.selectProvider(task);

    const prompt = `
      Analyze this task and create a STRATEGIZE document:
      Task: ${task.title}
      Type: ${task.type}

      Include:
      1. Problem analysis
      2. Root cause
      3. Goal definition
      4. Success criteria
    `;

    // Use real LLM via MCP
    const response = await this.mcp.executeTool('llm_generate', {
      provider,
      prompt,
      maxTokens: 2000
    });

    return response.content;
  }

  async generateCode(spec: string, plan: string): Promise<string> {
    const provider = 'codex'; // Prefer Codex for code

    const prompt = `
      Generate implementation code based on:
      Spec: ${spec}
      Plan: ${plan}

      Requirements:
      - Must compile
      - Must include error handling
      - Must have comments
    `;

    const response = await this.mcp.executeTool('llm_generate', {
      provider,
      prompt,
      maxTokens: 5000
    });

    return response.content;
  }
}
```
**LOC:** ~150

### 5. Enhanced Phase Executors
**File:** `tools/wvo_mcp/src/wave0/real_phase_executors.ts`
```typescript
async function executeStrategize(
  task: Task,
  mcp: RealMCPClient,
  generator: ContentGenerator
): Promise<PhaseResult> {
  // Generate real strategy content
  const strategy = await generator.generateStrategy(task);

  // Write to evidence
  await mcp.executeTool('fs_write', {
    path: `state/evidence/${task.id}/strategy.md`,
    content: strategy
  });

  return {
    phase: 'strategize',
    status: 'completed',
    output: strategy
  };
}

async function executeImplement(
  task: Task,
  mcp: RealMCPClient,
  generator: ContentGenerator,
  context: PhaseContext
): Promise<PhaseResult> {
  // Generate real code
  const code = await generator.generateCode(context.spec, context.plan);

  // Write actual files
  for (const file of parseFiles(code)) {
    await mcp.executeTool('fs_write', {
      path: file.path,
      content: file.content
    });
  }

  // Run build to verify
  const buildResult = await mcp.executeTool('cmd_run', {
    cmd: 'npm run build'
  });

  if (buildResult.exitCode !== 0) {
    throw new Error(`Build failed: ${buildResult.stderr}`);
  }

  return {
    phase: 'implement',
    status: 'completed',
    output: code,
    files: parseFiles(code).length
  };
}
```
**LOC:** ~300

## Tests to Author (BEFORE Implementation)

### 1. MCP Connection Test
```typescript
describe('RealMCPClient', () => {
  it('should connect to MCP server', async () => {
    const client = new RealMCPClient();
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('should execute fs_read tool', async () => {
    const result = await client.executeTool('fs_read', {
      path: 'package.json'
    });
    expect(result).toContain('"name"');
  });
});
```

### 2. Clone Isolation Test
```typescript
describe('CloneManager', () => {
  it('should create isolated clone', async () => {
    const manager = new CloneManager();
    const clone = await manager.createClone('test-task');

    expect(clone.pid).not.toBe(process.pid);
    expect(clone.dir).toMatch(/\/tmp\/wave0-clone/);
    expect(clone.port).not.toBe(process.env.WAVE0_PORT);
  });

  it('should prevent resource leaks', async () => {
    const clone = await manager.createClone('test');
    await manager.validateClone(clone, testTask);

    // Check no shared file handles
    const lsof = await exec(`lsof -p ${clone.pid}`);
    expect(lsof).not.toContain(process.cwd());
  });
});
```

### 3. Provider Switching Test
```typescript
describe('ProviderRouter', () => {
  it('should route reasoning to Claude', () => {
    const router = new ProviderRouter();
    const provider = router.selectProvider({
      type: 'review',
      complexity: 'high'
    });
    expect(provider).toBe('claude');
  });

  it('should switch on rate limit', () => {
    router.recordUsage('claude', 100000);
    const provider = router.selectProvider({ type: 'review' });
    expect(provider).toBe('codex'); // Fallback
  });
});
```

### 4. End-to-End Test
```typescript
describe('Wave 0.1 E2E', () => {
  it('should complete real task with evidence', async () => {
    const executor = new TaskExecutor();
    const task = {
      id: 'TEST-E2E',
      title: 'Add logging to function',
      type: 'implement'
    };

    const result = await executor.execute(task);

    // Verify real changes
    expect(result.status).toBe('completed');
    expect(fs.existsSync(`state/evidence/${task.id}/implement.md`)).toBe(true);

    // Verify not placeholder
    const content = fs.readFileSync(`state/evidence/${task.id}/implement.md`, 'utf8');
    expect(content).not.toContain('Auto-generated by Wave 0');
    expect(content).toContain('function'); // Real code
  });
});
```

## Implementation Order

1. **PROTOTYPE** - Proof of concept MCP connection
2. **IMPLEMENT CORE** - Real MCP client + executor
3. **IMPLEMENT CLONING** - Clone manager
4. **IMPLEMENT PROVIDERS** - Provider router
5. **INTEGRATION TEST** - All components together
6. **CLONE TEST** - Isolation verification
7. **PERFORMANCE TEST** - Resource usage
8. **CHAOS TEST** - Failure handling

## Resource Estimates

- **Total LOC:** ~1000 (core) + ~500 (tests)
- **Files Changed:** 8 new, 3 modified
- **Implementation Time:** 4-6 hours
- **Testing Time:** 2-3 hours

## Risk Mitigation

### Risk 1: MCP Server Won't Start
**Mitigation:** Check server exists, auto-install if needed, fallback to direct execution

### Risk 2: Clone Port Conflicts
**Mitigation:** Port scanner, retry with different ports, cleanup on failure

### Risk 3: Provider Rate Limits
**Mitigation:** Track usage, switch providers, queue if both limited

### Risk 4: Memory Leaks
**Mitigation:** Process monitoring, periodic restarts, resource limits

## Success Metrics

1. **Real Tool Execution:** MCP tools actually run (not fake)
2. **Clone Isolation:** Clones have different PIDs and ports
3. **Provider Switching:** Both Claude and Codex used
4. **Real Content:** Generated files compile and pass tests
5. **Self-Improvement:** Can modify own code and test changes

## AFP/SCAS Compliance

- **Via Negativa:** Delete ALL fake MCP code
- **Refactor:** Complete rewrite, not patching
- **Simplicity:** Each component single purpose
- **Complexity:** Justified by feature requirements
- **Net LOC:** +1500 (necessary for real functionality)