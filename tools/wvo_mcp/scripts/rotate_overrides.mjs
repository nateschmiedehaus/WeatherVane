#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzip as gzipCallback } from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(gzipCallback);

const DEFAULT_MAX_AGE_HOURS = 24;

const toAbsolutePath = (inputPath) =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);

const sanitizeArchiveName = (date) =>
  date.toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');

export const parseLedger = (rawContent) => {
  const entries = [];
  const warnings = [];
  if (!rawContent.trim()) {
    return { entries, warnings };
  }

  const lines = rawContent.split('\n');
  lines.forEach((line, index) => {
    if (!line.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(line);
      entries.push({ parsed, lineNumber: index + 1 });
    } catch (error) {
      warnings.push(
        `Unable to parse JSON on line ${index + 1}: ${(error && error.message) || error}`
      );
    }
  });
  return { entries, warnings };
};

export const partitionEntries = (entries, cutoffMs) => {
  const archive = [];
  const keep = [];
  const warnings = [];

  entries.forEach(({ parsed, lineNumber }) => {
    const timestamp = parsed?.timestamp;
    if (!timestamp) {
      warnings.push(`Missing timestamp on line ${lineNumber}, keeping entry`);
      keep.push(parsed);
      return;
    }
    const entryTime = Date.parse(timestamp);
    if (Number.isNaN(entryTime)) {
      warnings.push(`Invalid timestamp "${timestamp}" on line ${lineNumber}, keeping entry`);
      keep.push(parsed);
      return;
    }
    if (entryTime <= cutoffMs) {
      archive.push(parsed);
    } else {
      keep.push(parsed);
    }
  });

  return { archive, keep, warnings };
};

export const rotateOverrides = async ({
  inputPath = toAbsolutePath('state/overrides.jsonl'),
  archiveDir = toAbsolutePath('state/analytics/override_history'),
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  dryRun = false,
  now = new Date(),
} = {}) => {
  let ledgerContent = '';
  try {
    ledgerContent = await fs.readFile(inputPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        status: 'missing_source',
        archived: 0,
        kept: 0,
        archivePath: null,
        warnings: [`No overrides file found at ${inputPath}`],
      };
    }
    throw error;
  }

  const { entries, warnings: parseWarnings } = parseLedger(ledgerContent);
  const cutoffMs = now.getTime() - maxAgeHours * 60 * 60 * 1000;
  const { archive, keep, warnings: partitionWarnings } = partitionEntries(entries, cutoffMs);
  const warnings = [...parseWarnings, ...partitionWarnings];

  if (archive.length === 0) {
    return {
      status: 'noop',
      archived: 0,
      kept: keep.length,
      archivePath: null,
      warnings,
    };
  }

  const archiveContent = `${archive.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  const archiveName = `${sanitizeArchiveName(now)}-overrides.jsonl.gz`;
  const archivePath = path.join(archiveDir, archiveName);
  const archiveTemp = `${archivePath}.tmp`;
  const ledgerTemp = `${inputPath}.tmp`;

  if (!dryRun) {
    await fs.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });

    const compressed = await gzip(archiveContent);
    await fs.writeFile(archiveTemp, compressed);
    await fs.rename(archiveTemp, archivePath);

    const keepContent = keep.length ? `${keep.map((entry) => JSON.stringify(entry)).join('\n')}\n` : '';
    await fs.writeFile(ledgerTemp, keepContent, 'utf8');
    await fs.rename(ledgerTemp, inputPath);
  }

  return {
    status: 'rotated',
    archived: archive.length,
    kept: keep.length,
    archivePath,
    warnings,
  };
};

const parseArgs = (args) => {
  const options = {
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    sample: null,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--sample') {
      options.sample = args[index + 1];
      index += 1;
    } else if (arg === '--max-age-hours') {
      options.maxAgeHours = Number(args[index + 1]);
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
};

const printHelp = () => {
  console.log(
    [
      'Usage: node tools/wvo_mcp/scripts/rotate_overrides.mjs [--max-age-hours <hours>] [--sample <path>] [--dry-run]',
      '',
      'Options:',
      '  --max-age-hours <hours>   Rotate entries older than this many hours (default 24).',
      '  --sample <path>           Use an alternate overrides ledger (useful for testing).',
      '  --dry-run                 Do not write files; report what would happen.',
      '  --help, -h                Show this help message.',
    ].join('\n')
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputPath = toAbsolutePath(args.sample ?? 'state/overrides.jsonl');
  const archiveDir = toAbsolutePath('state/analytics/override_history');

  try {
    const result = await rotateOverrides({
      inputPath,
      archiveDir,
      maxAgeHours: Number.isFinite(args.maxAgeHours) ? args.maxAgeHours : DEFAULT_MAX_AGE_HOURS,
      dryRun: Boolean(args.dryRun),
    });

    if (result.status === 'noop') {
      console.log(
        `No overrides older than threshold. Entries kept: ${result.kept}. Warnings: ${result.warnings.join(
          '; '
        )}`
      );
    } else if (result.status === 'missing_source') {
      console.warn(result.warnings.join('; '));
    } else {
      console.log(
        `Archived ${result.archived} entries to ${result.archivePath}. Remaining: ${result.kept}. Warnings: ${result.warnings.join(
          '; '
        )}`
      );
    }
  } catch (error) {
    console.error('[rotate_overrides] Failed to rotate overrides ledger:', error);
    process.exitCode = 1;
  }
};

const isExecutedDirectly = () => {
  const entryUrl = pathToFileURL(process.argv[1]).href;
  return import.meta.url === entryUrl;
};

if (isExecutedDirectly()) {
  await main();
}
