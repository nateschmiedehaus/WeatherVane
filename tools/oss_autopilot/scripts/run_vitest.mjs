// Vitest launcher to avoid shell shims in restricted sandboxes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const rawArgs = process.argv.slice(2);
  const filters = [];
  let configPath = path.resolve(__dirname, '../../../vitest.config.mjs');

  for (const arg of rawArgs) {
    if (arg === '--run') {
      continue;
    }
    if (arg.startsWith('--scope=')) {
      const [, scope] = arg.split('=');
      if (scope === 'web') {
        configPath = path.resolve(__dirname, '../../../apps/web/vitest.config.ts');
      }
      continue;
    }
    filters.push(arg);
  }

  try {
    const ctx = await startVitest('test', filters, {
      config: configPath,
      watch: false,
      runTests: true,
    });
    const exitCode = await ctx?.close();
    process.exit(exitCode ?? 0);
  } catch (error) {
    console.error('[vitest-launcher] error:', error);
    process.exit(1);
  }
}

await main();
