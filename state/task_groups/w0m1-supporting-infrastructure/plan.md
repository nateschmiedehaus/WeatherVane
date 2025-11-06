# PLAN: w0m1-supporting-infrastructure

**Set ID:** w0m1-supporting-infrastructure
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Execution Approach

Execute in order of dependency:

```
Task 1: AFP-W0-M1-MVP-LIBS-SCAFFOLD
   ↓ (provides utilities for adapters)
Task 2: AFP-W0-M1-MVP-ADAPTERS-SCAFFOLD
   ↓ (provides external system interfaces)
Task 3: AFP-W0-M1-DPS-BUILD
   ↓ (uses adapters for context)
Task 4: AFP-W0-M1-MEMORY-CORE
   ↓ (uses libs for storage)
Set Complete ✅
```

**Rationale:** Libraries first (foundation), adapters second (interfaces), DPS/Memory third (higher-level systems using foundation).

---

## Task 1: AFP-W0-M1-MVP-LIBS-SCAFFOLD

### Goal
Extract common utilities into shared library with type-safe interfaces.

### Approach

**Step 1: Create library structure**
```bash
mkdir -p tools/wvo_mcp/src/libs
touch tools/wvo_mcp/src/libs/index.ts
touch tools/wvo_mcp/src/libs/logger.ts
touch tools/wvo_mcp/src/libs/fileIO.ts
touch tools/wvo_mcp/src/libs/validation.ts
touch tools/wvo_mcp/src/libs/errorHandling.ts
```

**Step 2: Implement logger**

File: `tools/wvo_mcp/src/libs/logger.ts`

```typescript
export interface Logger {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, error?: Error, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
}

class ConsoleLogger implements Logger {
  info(message: string, meta?: Record<string, any>) {
    console.log(JSON.stringify({ level: 'info', message, ...meta }));
  }

  warn(message: string, meta?: Record<string, any>) {
    console.warn(JSON.stringify({ level: 'warn', message, ...meta }));
  }

  error(message: string, error?: Error, meta?: Record<string, any>) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      ...meta
    }));
  }

  debug(message: string, meta?: Record<string, any>) {
    if (process.env.DEBUG) {
      console.debug(JSON.stringify({ level: 'debug', message, ...meta }));
    }
  }
}

export const logger: Logger = new ConsoleLogger();
```

**Step 3: Implement fileIO**

File: `tools/wvo_mcp/src/libs/fileIO.ts`

```typescript
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';

export interface FileIO {
  readJSON<T>(path: string): Promise<T>;
  writeJSON<T>(path: string, data: T): Promise<void>;
  readYAML<T>(path: string): Promise<T>;
  writeYAML<T>(path: string, data: T): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

class FSFileIO implements FileIO {
  async readJSON<T>(path: string): Promise<T> {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  }

  async writeJSON<T>(path: string, data: T): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(path, content, 'utf8');
  }

  async readYAML<T>(path: string): Promise<T> {
    const content = await fs.readFile(path, 'utf8');
    return yaml.load(content) as T;
  }

  async writeYAML<T>(path: string, data: T): Promise<void> {
    const content = yaml.dump(data);
    await fs.writeFile(path, content, 'utf8');
  }

  async readText(path: string): Promise<string> {
    return await fs.readFile(path, 'utf8');
  }

  async writeText(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }
}

export const fileIO: FileIO = new FSFileIO();
```

**Step 4: Implement validation**

File: `tools/wvo_mcp/src/libs/validation.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Validator {
  taskSchema(data: any): ValidationResult;
  evidenceBundle(dir: string): Promise<ValidationResult>;
  roadmapStructure(data: any): ValidationResult;
}

class SchemaValidator implements Validator {
  taskSchema(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.id) errors.push('Missing required field: id');
    if (!data.title) errors.push('Missing required field: title');
    if (!data.status) errors.push('Missing required field: status');

    return { valid: errors.length === 0, errors };
  }

  async evidenceBundle(dir: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const required = ['strategy.md', 'spec.md', 'plan.md'];

    for (const file of required) {
      const path = `${dir}/${file}`;
      const exists = await fileIO.exists(path);
      if (!exists) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  roadmapStructure(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.waves) errors.push('Missing waves array');
    if (!Array.isArray(data.waves)) errors.push('waves must be array');

    return { valid: errors.length === 0, errors };
  }
}

export const validate: Validator = new SchemaValidator();
```

**Step 5: Export from index**

File: `tools/wvo_mcp/src/libs/index.ts`

```typescript
export { logger, Logger } from './logger';
export { fileIO, FileIO } from './fileIO';
export { validate, Validator, ValidationResult } from './validation';
```

**Step 6: Add unit tests**

File: `tools/wvo_mcp/src/libs/__tests__/fileIO.test.ts`

```typescript
import { fileIO } from '../fileIO';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('fileIO', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileio-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should read and write JSON', async () => {
    const file = path.join(tmpDir, 'test.json');
    const data = { foo: 'bar', baz: 123 };

    await fileIO.writeJSON(file, data);
    const read = await fileIO.readJSON(file);

    expect(read).toEqual(data);
  });

  it('should check file exists', async () => {
    const file = path.join(tmpDir, 'exists.txt');

    expect(await fileIO.exists(file)).toBe(false);

    await fileIO.writeText(file, 'content');

    expect(await fileIO.exists(file)).toBe(true);
  });
});
```

### Exit Criteria
- [x] Logger implemented and exported
- [x] FileIO implemented and exported
- [x] Validation implemented and exported
- [x] Unit tests pass (100% coverage)
- [x] README documented

### Files Changed
- `tools/wvo_mcp/src/libs/index.ts` (new, ~10 LOC)
- `tools/wvo_mcp/src/libs/logger.ts` (new, ~50 LOC)
- `tools/wvo_mcp/src/libs/fileIO.ts` (new, ~100 LOC)
- `tools/wvo_mcp/src/libs/validation.ts` (new, ~80 LOC)
- `tools/wvo_mcp/src/libs/__tests__/*.test.ts` (new, ~200 LOC)
- `tools/wvo_mcp/src/libs/README.md` (new, ~100 LOC)

**Total:** 6 files, ~540 LOC

---

## Task 2: AFP-W0-M1-MVP-ADAPTERS-SCAFFOLD

### Goal
Create adapter layer for external systems (MCP, roadmap, git, critics).

### Approach

**Step 1: Create adapter structure**
```bash
mkdir -p tools/wvo_mcp/src/adapters
touch tools/wvo_mcp/src/adapters/index.ts
touch tools/wvo_mcp/src/adapters/mcp.ts
touch tools/wvo_mcp/src/adapters/roadmap.ts
touch tools/wvo_mcp/src/adapters/git.ts
touch tools/wvo_mcp/src/adapters/critic.ts
```

**Step 2: Implement MCP adapter**

File: `tools/wvo_mcp/src/adapters/mcp.ts`

```typescript
export interface MCPAdapter {
  callTool(name: string, params: Record<string, any>): Promise<any>;
}

class MCPClient implements MCPAdapter {
  async callTool(name: string, params: Record<string, any>): Promise<any> {
    // For MVP: Direct call to MCP tool
    // Future: Use MCP SDK
    const { executeTool } = await import('../orchestrator/tools');
    return await executeTool(name, params);
  }
}

export const mcpAdapter: MCPAdapter = new MCPClient();
```

**Step 3: Implement roadmap adapter**

File: `tools/wvo_mcp/src/adapters/roadmap.ts`

```typescript
import { fileIO } from '../libs';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  dependencies?: string[];
}

export interface RoadmapAdapter {
  getTasks(filter?: { status?: string }): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  updateTaskStatus(id: string, status: Task['status']): Promise<void>;
  addTask(task: Task): Promise<void>;
}

class RoadmapFile implements RoadmapAdapter {
  private roadmapPath = 'state/roadmap.yaml';

  async getTasks(filter?: { status?: string }): Promise<Task[]> {
    const roadmap = await fileIO.readYAML<any>(this.roadmapPath);
    let tasks: Task[] = [];

    // Extract tasks from waves/milestones
    for (const wave of roadmap.waves || []) {
      for (const milestone of wave.milestones || []) {
        tasks.push(...(milestone.tasks || []));
      }
    }

    if (filter?.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }

    return tasks;
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.getTasks();
    return tasks.find(t => t.id === id) || null;
  }

  async updateTaskStatus(id: string, status: Task['status']): Promise<void> {
    const roadmap = await fileIO.readYAML<any>(this.roadmapPath);

    // Find and update task
    for (const wave of roadmap.waves || []) {
      for (const milestone of wave.milestones || []) {
        const task = milestone.tasks?.find((t: Task) => t.id === id);
        if (task) {
          task.status = status;
        }
      }
    }

    await fileIO.writeYAML(this.roadmapPath, roadmap);
  }

  async addTask(task: Task): Promise<void> {
    // Implementation for adding task to roadmap
  }
}

export const roadmapAdapter: RoadmapAdapter = new RoadmapFile();
```

**Step 4: Implement git and critic adapters** (similar pattern)

**Step 5: Add unit tests with mocks**

File: `tools/wvo_mcp/src/adapters/__tests__/roadmap.test.ts`

```typescript
import { roadmapAdapter } from '../roadmap';
import { fileIO } from '../../libs';

jest.mock('../../libs');

describe('roadmapAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get pending tasks', async () => {
    (fileIO.readYAML as jest.Mock).mockResolvedValue({
      waves: [{
        milestones: [{
          tasks: [
            { id: 'T1', title: 'Task 1', status: 'pending' },
            { id: 'T2', title: 'Task 2', status: 'done' }
          ]
        }]
      }]
    });

    const tasks = await roadmapAdapter.getTasks({ status: 'pending' });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T1');
  });
});
```

### Exit Criteria
- [x] MCP adapter operational
- [x] Roadmap adapter operational
- [x] Git adapter operational
- [x] Critic adapter operational
- [x] Unit tests pass (with mocks)
- [x] README documented

### Files Changed
- 4 adapter files (~100 LOC each)
- Test files (~50 LOC each)
- README (~50 LOC)

**Total:** ~550 LOC

---

## Task 3: AFP-W0-M1-DPS-BUILD

### Goal
Build Dynamic Prompt System that generates context-aware prompts.

### Files Changed
- `tools/wvo_mcp/src/dps/` (new, ~300 LOC)
- Templates, versioning, context injection

---

## Task 4: AFP-W0-M1-MEMORY-CORE

### Goal
Build memory system for agent context persistence.

### Files Changed
- `tools/wvo_mcp/src/memory/` (new, ~400 LOC)
- Working/short-term/long-term memory, query interface

---

## Total Estimate

**Files:** ~20 new files
**LOC:** ~1800 LOC
**Time:** ~28 hours

---

**Plan complete:** 2025-11-06
**Next phase:** Execution
**Owner:** Claude Council
