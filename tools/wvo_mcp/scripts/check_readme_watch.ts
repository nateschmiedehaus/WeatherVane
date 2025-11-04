import fs from 'node:fs';
import path from 'node:path';

interface GapEntry {
  path: string;
  hasReadme: boolean;
  active: boolean;
  commitCount14d: number;
  locChange14d: number;
  newFiles7d: number;
  depth: number;
  structuralFlags: string[];
}

function parseArgs(): { taskId: string } {
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
    throw new Error('check_readme_watch: --task <TASK_ID> required');
  }
  return { taskId };
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function ensureDirectory(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

(async function main() {
  try {
    const { taskId } = parseArgs();
    const baseDir = path.join('state', 'evidence', taskId);
    const scanPath = path.join(baseDir, 'scan', 'readme_gaps.json');
    const outputDir = path.join(baseDir, 'verify');
    ensureDirectory(outputDir);

    const payload = readJson<{ generated_at: string; directories: GapEntry[] }>(scanPath);
    const activeGaps = payload.directories.filter((entry) => entry.active);

    const report = {
      taskId,
      generated_at: new Date().toISOString(),
      total_directories: payload.directories.length,
      active_gaps: activeGaps.map((entry) => entry.path),
    };

    fs.writeFileSync(
      path.join(outputDir, 'check_readme_watch.json'),
      JSON.stringify(report, null, 2)
    );

    if (activeGaps.length > 0) {
      console.error(`Active README gaps detected: ${activeGaps.map((e) => e.path).join(', ')}`);
      process.exit(1);
    } else {
      console.log('README watch verification passed (no active gaps).');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
