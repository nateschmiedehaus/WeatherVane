import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProofSystem } from '../proof_system.js';
import type { ProofSystemOptions } from '../proof_system.js';

const createWorkspace = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-system-'));
  fs.mkdirSync(path.join(root, 'tools', 'wvo_mcp'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state', 'evidence', 'AFP-PROOF-TEST'), {
    recursive: true,
  });
  return root;
};

const writePlan = (workspaceRoot: string, content: string) => {
  const planPath = path.join(
    workspaceRoot,
    'state',
    'evidence',
    'AFP-PROOF-TEST',
    'plan.md'
  );
  fs.writeFileSync(planPath, content, 'utf-8');
};

const createExecStub = (
  overrides: Record<string, () => Promise<{ stdout: string; stderr: string }>>
): ProofSystemOptions['execRunner'] => {
  return async (command: string) => {
    const handler = overrides[command];
    if (handler) {
      return handler();
    }
    return { stdout: '', stderr: '' };
  };
};

describe('ProofSystem', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = createWorkspace();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (workspaceRoot && fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('marks task as proven and generates verify.md when all checks succeed', async () => {
    const planContent = `# PLAN

## Proof Criteria
- Build Verification: npm run build
- Test Verification: npm test

### Runtime Verification
- Ensure CLI help output renders
`;
    writePlan(workspaceRoot, planContent);

    const execRunner = createExecStub({
      'npm run build': async () => ({ stdout: 'build ok', stderr: '' }),
      'npm test': async () => ({ stdout: 'tests ok', stderr: '' }),
    });

    const proofSystem = new ProofSystem(workspaceRoot, { execRunner });
    const result = await proofSystem.attemptProof('AFP-PROOF-TEST');

    expect(result.status).toBe('proven');
    expect(result.checks).toHaveLength(3); // build, test, runtime (skipped)

    const verifyPath = path.join(
      workspaceRoot,
      'state',
      'evidence',
      'AFP-PROOF-TEST',
      'verify.md'
    );
    expect(fs.existsSync(verifyPath)).toBe(true);
    const verifyContents = fs.readFileSync(verifyPath, 'utf-8');
    expect(verifyContents).toContain('PROVEN ✅');
  });

  it('records discoveries when a check fails', async () => {
    const planContent = `# PLAN

## Proof Criteria
- Build Verification: npm run build
- Test Verification: npm test
`;
    writePlan(workspaceRoot, planContent);

    const execRunner = createExecStub({
      'npm run build': async () => ({ stdout: 'build ok', stderr: '' }),
      'npm test': async () => {
        const error: any = new Error('Tests failed');
        error.stdout = 'failing test output';
        error.stderr = 'stack trace';
        throw error;
      },
    });

    const proofSystem = new ProofSystem(workspaceRoot, { execRunner });
    const result = await proofSystem.attemptProof('AFP-PROOF-TEST');

    expect(result.status).toBe('unproven');
    expect(result.discoveries.length).toBeGreaterThan(0);
    expect(result.checks.some((check) => !check.success)).toBe(true);

    const verifyPath = path.join(
      workspaceRoot,
      'state',
      'evidence',
      'AFP-PROOF-TEST',
      'verify.md'
    );
    expect(fs.existsSync(verifyPath)).toBe(false);
  });
});
