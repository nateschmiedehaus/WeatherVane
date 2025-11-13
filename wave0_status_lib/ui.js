'use strict';

const { collectWave0Status, DEFAULT_LIMIT } = require('./collect');

const getRelativeTime = (timestamp) => {
  if (!timestamp) return 'unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  let value;
  let unit;
  if (absMs >= 86_400_000) {
    value = Math.round(diffMs / 86_400_000);
    unit = 'day';
  } else if (absMs >= 3_600_000) {
    value = Math.round(diffMs / 3_600_000);
    unit = 'hour';
  } else if (absMs >= 60_000) {
    value = Math.round(diffMs / 60_000);
    unit = 'minute';
  } else {
    value = Math.round(diffMs / 1000);
    unit = 'second';
  }
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return rtf.format(value, unit);
};

const formatLock = (lock) => {
  if (!lock.exists) {
    return '- No lock file present.';
  }
  const parts = [
    `- Lock file: ${lock.path}`,
    `- PID: ${lock.pid ?? 'unknown'}`,
    `- Started: ${lock.startTime || 'unknown'} (${lock.startTime ? getRelativeTime(lock.startTime) : 'unknown'})`,
    `- PID state: ${
      lock.pidAlive === true
        ? 'alive'
        : lock.pidAlive === false
          ? 'not running'
          : lock.pidCheckError || 'unknown'
    }`,
  ];
  return parts.join('\n');
};

const formatRuns = (runs) => {
  if (!runs.length) {
    return '  (no executions recorded yet)';
  }
  return runs
    .map((run) => {
      const timestamp = run.endTime || 'no timestamp';
      const age = run.endTime ? getRelativeTime(run.endTime) : 'unknown';
      return `  • ${run.taskId} — ${run.status} — ${timestamp} (${age})`;
    })
    .join('\n');
};

const formatLifecycle = (event) => {
  if (!event) {
    return '  (no lifecycle events recorded yet)';
  }
  const age = event.timestamp ? getRelativeTime(event.timestamp) : 'unknown';
  return `  • ${event.type} for ${event.taskId} at ${event.timestamp || 'unknown'} (${age})`;
};

const formatWarnings = (warnings) =>
  warnings.length ? `Warnings:\n  - ${warnings.join('\n  - ')}` : 'Warnings: none';

const formatStatusReport = (report) => [
    `Wave 0 Runner Status: ${report.status.toUpperCase()}`,
    '',
    'Lock:',
    formatLock(report.lock),
    '',
    'Recent Runs:',
    formatRuns(report.recentRuns),
    '',
    'Last Lifecycle Event:',
    formatLifecycle(report.lastLifecycleEvent),
    '',
    formatWarnings(report.warnings),
  ].join('\n');

const parseArgs = (argv) => {
  const args = {
    limit: DEFAULT_LIMIT,
    root: null,
    json: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isNaN(value) && value > 0) {
        args.limit = value;
      }
    } else if (arg.startsWith('--root=')) {
      args.root = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
};

const printHelp = () => {
  console.log(`Usage: ./wave0_status [--json] [--limit=N] [--root=/custom/repo]

Options:
  --json        Output JSON instead of formatted text.
  --limit=N     Show the last N Wave 0 runs (default: ${DEFAULT_LIMIT}).
  --root=PATH   Override repository root (useful for tests).
  --help        Show this message.
`);
};

const runCli = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const report = collectWave0Status({ limit: args.limit, root: args.root });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatStatusReport(report));
  }
};

module.exports = {
  formatStatusReport,
  getRelativeTime,
  parseArgs,
  runCli,
};
