import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AtlasManifest, BriefingPack } from "./atlas_types.js";

const WORKSPACE_ROOT = path.resolve(process.cwd());
const MANIFEST_JSON = path.join(WORKSPACE_ROOT, "docs/autopilot/MANIFEST.json");
const MANIFEST_YAML = path.join(WORKSPACE_ROOT, "docs/autopilot/MANIFEST.yml");
const BRIEFING_PACK = path.join(WORKSPACE_ROOT, "docs/autopilot/AGENT_BRIEFING_PACK.json");
const PROMPT_REGISTRY = path.join(WORKSPACE_ROOT, "docs/autopilot/PROMPT_REGISTRY.md");

async function loadManifest(): Promise<AtlasManifest> {
  const content = await fs.readFile(MANIFEST_JSON, "utf-8");
  return JSON.parse(content) as AtlasManifest;
}

async function loadPack(): Promise<BriefingPack> {
  const content = await fs.readFile(BRIEFING_PACK, "utf-8");
  return JSON.parse(content) as BriefingPack;
}

async function sha(relativePath: string): Promise<string> {
  const data = await fs.readFile(path.join(WORKSPACE_ROOT, relativePath));
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function validateAtlas(): Promise<void> {
  const issues: string[] = [];
  const manifest = await loadManifest();
  const pack = await loadPack();

  for (const component of manifest.components) {
    const cardPath = path.join(WORKSPACE_ROOT, component.card);
    try {
      await fs.access(cardPath);
    } catch {
      issues.push(`Missing component card: ${component.card}`);
    }
    for (const codeRef of component.code_refs) {
      const currentSha = await sha(codeRef.path);
      if (currentSha !== codeRef.sha256) {
        issues.push(`Hash drift for ${codeRef.path} (component ${component.id})`);
      }
    }
  }

  for (const prompt of manifest.prompts) {
    const currentSha = await sha(prompt.path);
    if (currentSha !== prompt.sha256) {
      issues.push(`Prompt hash drift: ${prompt.id}`);
    }
  }

  for (const schema of manifest.schemas) {
    const currentSha = await sha(schema.path);
    if (currentSha !== schema.sha256) {
      issues.push(`Schema hash drift: ${schema.id}`);
    }
  }

  const manifestSha = await sha("docs/autopilot/MANIFEST.yml");
  if (pack.attestation.manifest_sha !== manifestSha) {
    issues.push("Manifest attestation mismatch");
  }

  const promptRegistrySha = await sha("docs/autopilot/PROMPT_REGISTRY.md");
  if (pack.attestation.prompt_registry_sha !== promptRegistrySha) {
    issues.push("Prompt registry attestation mismatch");
  }

  if (issues.length > 0) {
    throw new Error(`Atlas validation failed:\n- ${issues.join("\n- ")}`);
  }

  console.log(JSON.stringify({ ok: true, components: manifest.components.length, prompts: manifest.prompts.length }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void validateAtlas();
}
