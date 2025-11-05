#!/usr/bin/env node
import path from 'node:path';
import { promises as fs } from 'node:fs';
import process from 'node:process';
import { collectRepositoryDirectories, filterEntriesByMode, groupWarnings } from './analyzer.js';
import { DocsyncOptions, DirectoryEntry, ReadmeManifest } from './types.js';
import { writeFileIfChanged, readFileSafe } from './fs-utils.js';
import { renderReadme, summarizeWarnings, extractExistingDigest } from './render.js';
import { loadManifest, saveManifest, updateManifestEntry } from './manifest.js';

async function main() {
  const command = process.argv[2];
  if (!command || !['bootstrap', 'update', 'check'].includes(command)) {
    printUsage();
    process.exit(1);
  }

  const options = parseOptions(process.argv.slice(3));
  const entries = await collectRepositoryDirectories(options);
  const targetEntries = filterEntriesByMode(entries, options.mode, options.repoRoot);

  if (command === 'update' && targetEntries.size === 0) {
    if (options.verbose) {
      console.log('No directories selected for update (staging empty).');
    }
    process.exit(0);
  }

  const manifest = await loadManifest(options.repoRoot);
  const results = await processEntries(command, targetEntries, manifest, options);

  if (!options.dryRun) {
    await saveManifest(options.repoRoot, manifest);
  }

  if (results.warnings.length > 0) {
    await appendSyncLog(options.repoRoot, results.warnings);
  }

  if (command === 'update' && options.mode === 'staged' && !options.dryRun) {
    const touched = results.updated.length + results.created.length;
    if (touched > 0) {
      console.error('📚 Docsync updated documentation/metrics. Review changes and stage them before committing.');
      console.error(`   Updated: ${results.updated.length}, Created: ${results.created.length}`);
      process.exit(3);
    }
  }

  if (command === 'check') {
    if (results.updated.length > 0) {
      console.error('❌ README automation detected stale content:');
      for (const update of results.updated) {
        console.error(`   - ${update}`);
      }
      process.exit(2);
    }
    console.log('✅ README automation check passed.');
    console.log(summarizeWarnings(results.warnings));
    process.exit(0);
  }

  if (options.verbose) {
    console.log(`Updated READMEs: ${results.updated.length}`);
    console.log(`Created READMEs: ${results.created.length}`);
    console.log(`Skipped (fresh): ${results.skipped.length}`);
    if (results.warnings.length > 0) {
      console.log('Structural warnings:');
      console.log(summarizeWarnings(results.warnings));
    }
  }
}

function parseOptions(args: string[]): DocsyncOptions {
  const options: DocsyncOptions = {
    repoRoot: process.env.WEATHERVANE_WORKSPACE
      ? path.resolve(process.env.WEATHERVANE_WORKSPACE)
      : process.cwd(),
    mode: 'all',
    dryRun: false,
    verbose: process.env.CI ? false : true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--mode' && args[i + 1]) {
      const mode = args[i + 1] as DocsyncOptions['mode'];
      if (mode === 'all' || mode === 'staged') {
        options.mode = mode;
      }
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--quiet') {
      options.verbose = false;
    } else if (arg === '--repo' && args[i + 1]) {
      options.repoRoot = path.resolve(args[i + 1]);
      i += 1;
    }
  }

  return options;
}

async function processEntries(
  command: string,
  entries: Map<string, DirectoryEntry>,
  manifest: ReadmeManifest,
  options: DocsyncOptions,
) {
  const updated: string[] = [];
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings = groupWarnings(entries);

  for (const entry of entries.values()) {
    const readmeContent = entry.hasReadme ? await readFileSafe(entry.readmePath) : null;
    if (entry.hasReadme && readmeContent !== null) {
      entry.files = entry.files.map((file) =>
        file.name === 'README.md'
          ? { ...file, content: readmeContent }
          : file,
      );
    }

    const manifestEntry = manifest.entries[entry.path];
    const previousTimestamp = manifestEntry?.lastUpdated ?? 'untracked';
    const firstRender = renderReadme(entry, warnings, previousTimestamp);
    const existingDigest = entry.hasReadme && readmeContent ? extractExistingDigest(readmeContent) : null;

    if (command === 'check') {
      if (!existingDigest || existingDigest !== firstRender.digest) {
        if (options.verbose) {
          console.error(`Docsynchronization mismatch for ${entry.path}`);
          console.error(`Existing: ${existingDigest}`);
          console.error(`Rendered: ${firstRender.digest}`);
        }
        updated.push(entry.path);
      } else {
        skipped.push(entry.path);
      }
      continue;
    }

    if (!entry.hasReadme) {
      const timestamp = new Date().toISOString();
      const { content, digest } = renderReadme(entry, warnings, timestamp);
      if (!options.dryRun) {
        await writeFileIfChanged(entry.readmePath, content);
      }
      updateManifestEntry(manifest, entry, digest, timestamp);
      created.push(entry.path);
      continue;
    }

    if (existingDigest && existingDigest === firstRender.digest) {
      skipped.push(entry.path);
      continue;
    }

    const timestamp = new Date().toISOString();
    const { content, digest } = renderReadme(entry, warnings, timestamp);
    if (!options.dryRun) {
      await writeFileIfChanged(entry.readmePath, content);
    }
    updateManifestEntry(manifest, entry, digest, timestamp);
    updated.push(entry.path);
  }

  return { updated, created, skipped, warnings };
}

async function appendSyncLog(repoRoot: string, records: ReturnType<typeof groupWarnings>) {
  if (records.length === 0) {
    return;
  }
  const logPath = path.join(repoRoot, 'state', 'analytics', 'readme_sync.jsonl');
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const timestamp = new Date().toISOString();
  const lines = records.map((record) =>
    JSON.stringify({
      timestamp,
      directory: record.directory,
      warnings: record.warnings,
    }),
  );
  await fs.appendFile(logPath, `${lines.join('\n')}\n`);
}

function printUsage() {
  console.log(`Usage: node --import tsx tools/docsync/index.ts <command> [options]

Commands:
  bootstrap         Generate READMEs for the entire repository.
  update            Refresh READMEs (default mode=all, use --mode staged in hooks).
  check             Validate READMEs without writing changes (used in CI).

Options:
  --mode <all|staged>   Control directory selection (default: all).
  --dry-run             Report actions without writing files.
  --repo <path>         Explicit repository root (default: cwd).
  --quiet               Reduce output.
`);
}

main().catch((error) => {
  console.error('Docsynchronisation failed:', error);
  process.exit(1);
});
