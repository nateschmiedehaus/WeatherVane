import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('app smoke e2e', () => {
  it('runs the hermetic stub script successfully', () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..');
    const script = path.join(workspaceRoot, 'scripts', 'app_smoke_e2e.sh');
    const result = spawnSync(script, {
      shell: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        APP_SMOKE_SKIP_VITEST: '1',
        APP_SMOKE_SKIP_AUTOPILOT_VITEST: '1',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[SMOKE]');
  });
});
