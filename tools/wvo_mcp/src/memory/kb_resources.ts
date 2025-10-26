import path from 'node:path';
import { promises as fs } from 'node:fs';
import { logDebug, logWarning } from '../telemetry/logger.js';

interface ResourceFile {
  name: string;
  relativePath: string;
}

interface KnowledgeResource {
  name: string;
  version: string;
  path: string;
  content: string;
}

const KB_TARGETS: ResourceFile[] = [
  { name: 'dod_pr', relativePath: path.join('tools', 'wvo_mcp', 'prompts', 'dod_pr.md') },
  { name: 'reviewer_rubric', relativePath: path.join('tools', 'wvo_mcp', 'prompts', 'reviewer_rubric.md') },
  { name: 'style_guide', relativePath: path.join('tools', 'wvo_mcp', 'resources', 'style-guide.md') },
  { name: 'security_checklist', relativePath: path.join('tools', 'wvo_mcp', 'resources', 'security-checklist.md') },
];

export class KnowledgeBaseResources {
  private readonly cache = new Map<string, KnowledgeResource>();

  constructor(private readonly workspaceRoot: string) {}

  async listPinned(): Promise<KnowledgeResource[]> {
    const resources: KnowledgeResource[] = [];
    for (const target of KB_TARGETS) {
      const resource = await this.getResource(target.name);
      if (resource) {
        resources.push(resource);
      }
    }
    return resources;
  }

  async getResource(name: string): Promise<KnowledgeResource | undefined> {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }
    const target = KB_TARGETS.find((entry) => entry.name === name);
    if (!target) {
      logWarning('KnowledgeBaseResources requested unknown resource', { name });
      return undefined;
    }
    const absolute = path.join(this.workspaceRoot, target.relativePath);
    try {
      const raw = await fs.readFile(absolute, 'utf8');
      const version = this.extractVersion(raw) ?? 'unversioned';
      const resource: KnowledgeResource = {
        name: target.name,
        version,
        path: target.relativePath,
        content: raw.trim(),
      };
      this.cache.set(name, resource);
      logDebug('KnowledgeBaseResources cached resource', { name, version });
      return resource;
    } catch (error) {
      logWarning('Failed to load knowledge base resource', {
        name,
        path: absolute,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private extractVersion(content: string): string | undefined {
    const [firstLine] = content.split(/\r?\n/, 1);
    if (!firstLine) return undefined;
    const match = firstLine.match(/^Version:\s*(.+)$/i);
    return match?.[1]?.trim();
  }
}
