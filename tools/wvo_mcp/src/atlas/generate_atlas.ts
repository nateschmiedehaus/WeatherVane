import crypto from "node:crypto";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  COMPONENT_SOURCES,
  DOC_SOURCES,
  PROMPT_SOURCES,
  SCHEMA_SOURCES,
  TOOL_SOURCES,
  ATLAS_VERSION,
} from "./atlas_sources.js";
import type { AtlasComponentSource, AtlasManifest, BriefingPack } from "./atlas_types.js";

const WORKSPACE_ROOT = path.resolve(process.cwd());
const DOCS_ROOT = path.join(WORKSPACE_ROOT, "docs", "autopilot");
const CARDS_DIR = path.join(DOCS_ROOT, "COMPONENT_CARDS");
const MANIFEST_PATH = path.join(DOCS_ROOT, "MANIFEST.yml");
const MANIFEST_JSON_PATH = path.join(DOCS_ROOT, "MANIFEST.json");
const BRIEFING_PACK_PATH = path.join(DOCS_ROOT, "AGENT_BRIEFING_PACK.json");
const CHANGELOG_PATH = path.join(DOCS_ROOT, "CHANGELOG.md");

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DOCS_ROOT, { recursive: true });
  await fs.mkdir(CARDS_DIR, { recursive: true });
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_:\/\-.]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function serializeArray(name: string, values: string[]): string {
  if (!values.length) {
    return `${name}: []`;
  }
  const rendered = values.map((value) => `  - ${quote(value)}`).join("\n");
  return `${name}:\n${rendered}`;
}

function serializeLinks(component: AtlasComponentSource): string {
  const lines: string[] = ["links:"]; 
  const { links } = component;
  const linkEntries: Array<[string, string[] | undefined]> = [
    ["code", links.code],
    ["docs", links.docs],
    ["schema", links.schema],
  ];
  for (const [key, entries] of linkEntries) {
    if (!entries || entries.length === 0) {
      lines.push(`  ${key}: []`);
      continue;
    }
    lines.push(`  ${key}:`);
    for (const entry of entries) {
      lines.push(`    - ${quote(entry)}`);
    }
  }
  return lines.join("\n");
}

function renderFrontMatter(component: AtlasComponentSource): string {
  const baseKeys: Array<keyof Pick<AtlasComponentSource, "id" | "kind" | "role" | "level" | "version">> = [
    "id",
    "kind",
    "role",
    "level",
    "version",
  ];
  const sections = baseKeys.map((key) => `${key}: ${quote(component[key])}`);

  sections.push(serializeArray("intents", component.intents));
  sections.push(serializeArray("inputs", component.inputs));
  sections.push(serializeArray("outputs", component.outputs));
  sections.push(serializeArray("depends_on", component.depends_on));
  sections.push(serializeArray("tools", component.tools));
  sections.push(serializeArray("invariants", component.invariants));
  sections.push(serializeArray("risks", component.risks));
  sections.push(serializeLinks(component));

  return `---\n${sections.join("\n")}\n---`;
}

async function hashFile(relativePath: string): Promise<string> {
  const absPath = path.join(WORKSPACE_ROOT, relativePath);
  const data = await fs.readFile(absPath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function writeComponentCards(): Promise<void> {
  for (const component of COMPONENT_SOURCES) {
    const frontMatter = renderFrontMatter(component);
    const body = `${component.summary}\n`;
    const filePath = path.join(CARDS_DIR, `${component.id}.md`);
    const payload = `${frontMatter}\n\n${body}`;
    await fs.writeFile(filePath, payload, "utf-8");
  }
}

async function buildManifest(): Promise<AtlasManifest> {
  const components = [];
  for (const component of COMPONENT_SOURCES) {
    const codeRefs: Array<{ path: string; sha256: string }> = [];
    if (component.links.code) {
      for (const ref of component.links.code) {
        codeRefs.push({ path: ref, sha256: await hashFile(ref) });
      }
    }
    const docRefs = component.links.docs ?? [];
    const schemaRefs = component.links.schema ?? [];
    components.push({
      id: component.id,
      card: `docs/autopilot/COMPONENT_CARDS/${component.id}.md`,
      code_refs: codeRefs,
      doc_refs: docRefs,
      schema_refs: schemaRefs,
    });
  }

  const prompts = [];
  for (const prompt of PROMPT_SOURCES) {
    prompts.push({ id: prompt.id, path: prompt.path, sha256: await hashFile(prompt.path) });
  }

  const schemas = [];
  for (const schema of SCHEMA_SOURCES) {
    schemas.push({ id: schema.id, path: schema.path, sha256: await hashFile(schema.path) });
  }

  const manifest: AtlasManifest = {
    version: ATLAS_VERSION,
    generated_at: new Date().toISOString(),
    components,
    prompts,
    tools: TOOL_SOURCES.map((tool) => ({ name: tool.name, path: tool.path, description: tool.description })),
    schemas,
    docs: DOC_SOURCES.map((doc) => doc.path),
  };

  return manifest;
}

function toYaml(manifest: AtlasManifest): string {
  const lines: string[] = [];
  lines.push(`version: ${manifest.version}`);
  lines.push(`generated_at: ${quote(manifest.generated_at)}`);

  const renderObjArray = <T extends object>(name: string, values: T[]) => {
    lines.push(`${name}:`);
    if (values.length === 0) {
      lines.push("  []");
      return;
    }
    for (const value of values) {
      lines.push("  -");
      for (const [key, raw] of Object.entries(value)) {
        if (Array.isArray(raw)) {
          if (raw.length === 0) {
            lines.push(`      ${key}: []`);
          } else {
            lines.push(`      ${key}:`);
            for (const entry of raw) {
              if (typeof entry === "object" && entry !== null) {
                lines.push("        -");
                for (const [entryKey, entryValue] of Object.entries(entry)) {
                  lines.push(`          ${entryKey}: ${quote(String(entryValue))}`);
                }
              } else {
                lines.push(`        - ${quote(String(entry))}`);
              }
            }
          }
        } else {
          lines.push(`      ${key}: ${quote(String(raw))}`);
        }
      }
    }
  };

  renderObjArray("components", manifest.components);
  renderObjArray("prompts", manifest.prompts);
  renderObjArray("tools", manifest.tools);
  renderObjArray("schemas", manifest.schemas);

  lines.push("docs:");
  for (const doc of manifest.docs) {
    lines.push(`  - ${quote(doc)}`);
  }

  return `${lines.join("\n")}\n`;
}

function computePackHash(paths: string[], manifest: AtlasManifest): string {
  const hash = crypto.createHash("sha256");
  for (const ref of paths.sort()) {
    hash.update(ref);
    try {
      const content = readFileSync(path.join(WORKSPACE_ROOT, ref));
      hash.update(content);
    } catch {
      // ignore missing; validator will catch later
    }
  }
  hash.update(JSON.stringify(manifest.prompts));
  return hash.digest("hex");
}

async function writeManifest(manifest: AtlasManifest): Promise<void> {
  const yaml = toYaml(manifest);
  await fs.writeFile(MANIFEST_PATH, yaml, "utf-8");
  await fs.writeFile(MANIFEST_JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

async function writeBriefingPack(manifest: AtlasManifest): Promise<void> {
  const pack: BriefingPack = {
    version: ATLAS_VERSION,
    mission: "WeatherVane Unified Autopilot builds, verifies, and monitors app-core tasks autonomously.",
    architecture: {
      diagram: "docs/autopilot/OVERVIEW.md#architecture",
      components: COMPONENT_SOURCES.map((component) => component.id),
    },
    how_to_use: "docs/autopilot/AGENT_README.md",
    tools: "docs/autopilot/TOOLBOX.md",
    prompts: "docs/autopilot/PROMPT_REGISTRY.md",
    policies: [
      "docs/autopilot/SECURITY.md",
      "docs/autopilot/QUALITY_BAR.md",
      "docs/autopilot/GOVERNANCE.md",
    ],
    schemas: "docs/autopilot/DATA_SCHEMAS/",
    roadmap_ops: "docs/autopilot/ROADMAP_OPS.md",
    context_fabric: "docs/autopilot/CONTEXT_FABRIC.md",
    control_plane: "docs/autopilot/DSD.md",
    history: "docs/autopilot/HISTORY.md",
    faq: "docs/autopilot/FAQ.md",
    glossary: "docs/autopilot/GLOSSARY.md",
    manifest: "docs/autopilot/MANIFEST.yml",
    hash: "",
    attestation: {
      manifest_sha: "",
      prompt_registry_sha: "",
    },
  };

  const references = [pack.manifest, pack.how_to_use, pack.tools, pack.prompts, pack.roadmap_ops, pack.context_fabric, pack.control_plane, pack.history, pack.faq, pack.glossary, ...pack.policies];
  pack.hash = computePackHash(references, manifest);
  pack.attestation.manifest_sha = await hashFile(pack.manifest);
  pack.attestation.prompt_registry_sha = await hashFile("docs/autopilot/PROMPT_REGISTRY.md");
  await fs.writeFile(BRIEFING_PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`, "utf-8");
}

async function updateChangelog(): Promise<void> {
  const entry = `- Atlas regenerated on ${new Date().toISOString()} (${ATLAS_VERSION})\n`;
  try {
    const current = await fs.readFile(CHANGELOG_PATH, "utf-8");
    if (!current.includes(entry)) {
      await fs.writeFile(CHANGELOG_PATH, `${current.trim()}\n${entry}`);
    }
  } catch {
    await fs.writeFile(CHANGELOG_PATH, `# Atlas Changelog\n\n${entry}`);
  }
}

export async function generateAtlas(): Promise<AtlasManifest> {
  await ensureDirectories();
  await writeComponentCards();
  const manifest = await buildManifest();
  await writeManifest(manifest);
  await writeBriefingPack(manifest);
  await updateChangelog();
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void generateAtlas().then(() => {
    console.log(JSON.stringify({ ok: true, manifest: MANIFEST_PATH, pack: BRIEFING_PACK_PATH }));
  });
}
