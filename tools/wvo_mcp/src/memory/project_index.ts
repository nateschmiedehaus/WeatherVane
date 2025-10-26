import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { logDebug, logWarning } from '../telemetry/logger.js';

interface IndexedFile {
  path: string;
  hash: string;
  size: number;
  mtimeMs: number;
}

interface ProjectIndexSnapshot {
  version: string;
  files: IndexedFile[];
}

export class ProjectIndex {
  private readonly entries = new Map<string, IndexedFile>();
  private version = 0;

  constructor(private readonly workspaceRoot: string) {}

  async refresh(relativePaths: string[] = []): Promise<void> {
    if (relativePaths.length === 0) {
      return;
    }

    await Promise.all(
      relativePaths.map(async (relPath) => {
        const absolute = path.resolve(this.workspaceRoot, relPath);
        try {
          const stat = await fs.stat(absolute);
          if (!stat.isFile()) {
            return;
          }
          const buffer = await fs.readFile(absolute);
          const hash = crypto.createHash('sha1').update(buffer).digest('hex');
          const normalized = path.relative(this.workspaceRoot, absolute);
          const existing = this.entries.get(normalized);
          if (!existing || existing.hash !== hash) {
            this.entries.set(normalized, {
              path: normalized,
              hash,
              size: buffer.length,
              mtimeMs: stat.mtimeMs,
            });
            this.version += 1;
          }
        } catch (error) {
          logWarning('ProjectIndex failed to refresh path', {
            path: relPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  }

  snapshot(): ProjectIndexSnapshot {
    const files = Array.from(this.entries.values()).sort((a, b) => a.path.localeCompare(b.path));
    const version = `project-index@${this.version}`;
    logDebug('ProjectIndex snapshot generated', { version, fileCount: files.length });
    return { version, files };
  }
}
