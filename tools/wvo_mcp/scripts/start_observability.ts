import path from 'node:path';
import process from 'node:process';
import { ObservabilityServer } from '../src/observability/observability_server.js';
import { logInfo, logWarning } from '../src/telemetry/logger.js';

const workspaceRoot =
  process.env.WVO_WORKSPACE_ROOT ?? path.resolve(__dirname, '..', '..', '..');
const port = Number(process.env.WVO_OBSERVABILITY_PORT ?? '3030');
const host = process.env.WVO_OBSERVABILITY_HOST ?? '127.0.0.1';

const server = new ObservabilityServer({
  workspaceRoot,
  port,
  host,
});

async function main() {
  await server.start();
  logInfo('Observability dashboard ready', { workspaceRoot, port, host });

  const shutdown = async (signal: NodeJS.Signals) => {
    logWarning('Stopping observability server', { signal });
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

await main();
