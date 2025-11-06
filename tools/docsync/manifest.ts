import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DirectoryEntry, ReadmeManifest } from './types.js';

const MANIFEST_VERSION = 1;
const MANIFEST_PATH = path.join('state', 'analytics', 'readme_manifest.json');

export async function loadManifest(repoRoot: string): Promise<ReadmeManifest> {
  const absolutePath = path.join(repoRoot, MANIFEST_PATH);
  try {
    const raw = await fs.readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as ReadmeManifest;
    if (typeof parsed.version !== 'number') {
      parsed.version = MANIFEST_VERSION;
    }
    if (!parsed.generatedAt) {
      parsed.generatedAt = new Date().toISOString();
    }
    if (!parsed.entries) {
      parsed.entries = {};
    }
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return {
        version: MANIFEST_VERSION,
        generatedAt: new Date().toISOString(),
        entries: {},
        stats: {
          trackedDirectories: 0,
        },
      };
    }
    throw error;
  }
}

export async function saveManifest(repoRoot: string, manifest: ReadmeManifest): Promise<void> {
  const absolutePath = path.join(repoRoot, MANIFEST_PATH);
  const sortedEntries = Object.fromEntries(
    Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  manifest.entries = sortedEntries;
  manifest.generatedAt = new Date().toISOString();
  manifest.version = MANIFEST_VERSION;
  manifest.stats = {
    trackedDirectories: Object.keys(sortedEntries).length,
  };

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function updateManifestEntry(
  manifest: ReadmeManifest,
  entry: DirectoryEntry,
  digest: string,
  timestamp: string,
): void {
  manifest.entries[entry.path] = {
    digest,
    lastUpdated: timestamp,
    metrics: {
      summary: entry.metrics.summary,
      warningCount: entry.metrics.warnings.length,
    },
  };
}

export function pruneManifest(manifest: ReadmeManifest, entries: Iterable<string>): void {
  const keep = new Set(entries);
  for (const key of Object.keys(manifest.entries)) {
    if (!keep.has(key)) {
      delete manifest.entries[key];
    }
  }
}
