import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';

export interface Anchor {
  kind: 'code' | 'test' | 'kb' | 'decision' | 'artifact';
  path?: string;
  lines?: string;
  ref?: string;
  rev?: string;
  name?: string;
}

export interface NavigatorOptions {
  workspaceRoot: string;
}

export class KnowledgeNavigator {
  constructor(private readonly options: NavigatorOptions) {}

  async collectCodeAnchors(paths: string[]): Promise<Anchor[]> {
    const anchors: Anchor[] = [];
    for (const relPath of paths.slice(0, 6)) {
      const filePath = path.join(this.options.workspaceRoot, relPath);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const snippet = content.split('\n').slice(0, 60).join('\n');
        anchors.push({
          kind: 'code',
          path: relPath,
          lines: this.estimateLineSpan(content.length),
          rev: this.hashContent(snippet),
        });
      } catch {
        // ignore missing files
      }
    }
    return anchors;
  }

  async collectKbAnchors(): Promise<Anchor[]> {
    const kbDir = path.join(this.options.workspaceRoot, 'resources', 'kb');
    try {
      const entries = await fs.readdir(kbDir);
      return entries
        .filter(entry => entry.endsWith('.md'))
        .slice(0, 4)
        .map(entry => ({
          kind: 'kb',
          ref: `resources://kb/${entry}`,
        }));
    } catch {
      return [];
    }
  }

  async collectDecisionAnchors(runId: string): Promise<Anchor[]> {
    const journalPath = path.join(this.options.workspaceRoot, 'resources', 'runs', runId, 'journal.md');
    try {
      await fs.access(journalPath);
      return [
        {
          kind: 'decision',
          ref: `resources://runs/${runId}/journal.md`,
        },
      ];
    } catch {
      return [];
    }
  }

  async collectTestAnchors(paths: string[]): Promise<Anchor[]> {
    const filtered = paths.filter(p => p.startsWith('tests/') || p.includes('.test.'));
    const anchors: Anchor[] = [];
    for (const relPath of filtered.slice(0, 4)) {
      anchors.push({
        kind: 'test',
        path: relPath,
        name: path.basename(relPath),
      });
    }
    return anchors;
  }

  private estimateLineSpan(length: number): string {
    const approxLines = Math.ceil(length / 40);
    return `1-${Math.min(approxLines, 200)}`;
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12);
  }
}
