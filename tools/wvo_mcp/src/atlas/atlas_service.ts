import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PROMPT_SOURCES, SCHEMA_SOURCES, TOOL_SOURCES, QNA_SOURCES } from "./atlas_sources.js";
import type { AtlasManifest, BriefingPack } from "./atlas_types.js";

const MANIFEST_JSON = "docs/autopilot/MANIFEST.json";
const MANIFEST_YAML = "docs/autopilot/MANIFEST.yml";
const BRIEFING_PACK = "docs/autopilot/AGENT_BRIEFING_PACK.json";
const PROMPT_REGISTRY = "docs/autopilot/PROMPT_REGISTRY.md";

function resolvePath(root: string, rel: string): string {
  return path.join(root, rel);
}

async function safeReadJson<T>(absPath: string): Promise<T> {
  const data = await fs.readFile(absPath, "utf-8");
  return JSON.parse(data) as T;
}

async function hashFile(absPath: string): Promise<string> {
  const data = await fs.readFile(absPath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export class AtlasService {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  private async loadManifest(): Promise<AtlasManifest> {
    return safeReadJson<AtlasManifest>(resolvePath(this.workspaceRoot, MANIFEST_JSON));
  }

  private async loadBriefingPack(): Promise<BriefingPack> {
    return safeReadJson<BriefingPack>(resolvePath(this.workspaceRoot, BRIEFING_PACK));
  }

  async describe(): Promise<Record<string, unknown>> {
    const [manifest, pack] = await Promise.all([this.loadManifest(), this.loadBriefingPack()]);
    return {
      mission: pack.mission,
      version: manifest.version,
      components: manifest.components.map((component) => component.id),
      docs: manifest.docs,
      tools: manifest.tools.map((tool) => tool.name),
      attestation: pack.attestation,
    };
  }

  async listTools(): Promise<Record<string, unknown>> {
    const manifest = await this.loadManifest();
    const detailed = TOOL_SOURCES.map((tool) => ({
      name: tool.name,
      description: tool.description,
      path: tool.path,
      preconditions: tool.preconditions,
      postconditions: tool.postconditions,
      examples: tool.examples,
    }));
    const known = new Set(manifest.tools.map((tool) => tool.name));
    const missing = detailed.filter((tool) => !known.has(tool.name));
    return {
      tools: detailed,
      manifest_gap: missing.map((tool) => tool.name),
    };
  }

  async getSchema(id: string): Promise<Record<string, unknown>> {
    const schemaSource = SCHEMA_SOURCES.find((schema) => schema.id === id);
    if (!schemaSource) {
      throw new Error(`Unknown schema id: ${id}`);
    }
    const absPath = resolvePath(this.workspaceRoot, schemaSource.path);
    const schema = await safeReadJson<Record<string, unknown>>(absPath);
    return {
      id,
      path: schemaSource.path,
      schema,
    };
  }

  async getPrompt(id: string): Promise<Record<string, unknown>> {
    const manifest = await this.loadManifest();
    const prompt = PROMPT_SOURCES.find((source) => source.id === id);
    if (!prompt) {
      throw new Error(`Unknown prompt id: ${id}`);
    }
    const manifestEntry = manifest.prompts.find((entry) => entry.id === id);
    if (!manifestEntry) {
      throw new Error(`Prompt ${id} missing from manifest`);
    }
    const absPath = resolvePath(this.workspaceRoot, prompt.path);
    const content = await fs.readFile(absPath, "utf-8");
    const sha = crypto.createHash("sha256").update(content).digest("hex");
    if (sha !== manifestEntry.sha256) {
      throw new Error(`Prompt ${id} hash mismatch; run atlas generator`);
    }
    return {
      id,
      path: prompt.path,
      version: prompt.version,
      summary: prompt.summary,
      sha256: sha,
      content,
    };
  }

  async getBriefingPack(): Promise<BriefingPack> {
    return this.loadBriefingPack();
  }

  async answerQuestions(): Promise<Record<string, unknown>> {
    return {
      total: QNA_SOURCES.length,
      answered: QNA_SOURCES.length,
      questions: QNA_SOURCES,
    };
  }

  async attestation(): Promise<{ manifest_sha: string; prompt_registry_sha: string }> {
    const manifestSha = await hashFile(resolvePath(this.workspaceRoot, MANIFEST_YAML));
    const promptSha = await hashFile(resolvePath(this.workspaceRoot, PROMPT_REGISTRY));
    return { manifest_sha: manifestSha, prompt_registry_sha: promptSha };
  }
}
