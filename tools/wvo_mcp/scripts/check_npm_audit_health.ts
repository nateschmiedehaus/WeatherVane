import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(p: string): T {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as T;
}

(async function main() {
  try {
    const args = process.argv.slice(2);
    let taskId = '';
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if ((arg === '--task' || arg === '-t') && args[i + 1]) {
        taskId = args[i + 1];
        i += 1;
      } else if (arg.startsWith('--task=')) {
        taskId = arg.split('=')[1];
      }
    }
    if (!taskId) {
      throw new Error('check_npm_audit_health: --task <TASK_ID> required');
    }

    const reportPath = path.join('state', 'automation', 'npm_audit_report.json');
    const statusPath = path.join('state', 'automation', 'npm_audit_report.status.json');
    const baseDir = path.join('state', 'evidence', taskId, 'verify');
    ensureDir(baseDir);

    const summary: Record<string, unknown> = {
      taskId,
      generated_at: new Date().toISOString(),
      status: 'unknown'
    };

    if (fs.existsSync(reportPath)) {
      const report = readJson<Record<string, unknown>>(reportPath);
      summary.status = 'ok';
      summary.report = {
        attempt: report.attempt,
        cacheDir: report.cacheDir
      };
    } else if (fs.existsSync(statusPath)) {
      const status = readJson<Record<string, unknown>>(statusPath);
      summary.status = status.status ?? 'degraded';
      summary.error = status.error ?? 'unknown';
    } else {
      throw new Error('npm audit evidence not found (expected npm_audit_report.json or .status.json)');
    }

    fs.writeFileSync(
      path.join(baseDir, 'check_npm_audit_health.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log(`npm audit health: ${summary.status}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
