#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

interface ModuleRecord {
  id: string;
  path: string;
  description: string;
  stewards: string[];
  reviewers: string[];
  ttl_days: number;
  last_review: string;
  next_review: string;
  dependencies: string[];
  health_signals: string[];
  status: string;
}

interface ModuleIndexFile {
  modules: ModuleRecord[];
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(path.join(__dirname, "..", "..", ".."));
  const indexPath = path.join(repoRoot, "meta", "module_index.yaml");
  const raw = await fs.readFile(indexPath, "utf8");
  const parsed = yaml.parse(raw) as ModuleIndexFile;
  if (!parsed || !Array.isArray(parsed.modules)) {
    throw new Error("module_index.yaml missing 'modules' array");
  }

  const ids = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const module of parsed.modules) {
    if (!module.id || typeof module.id !== "string") {
      errors.push("Module missing id");
      continue;
    }
    if (ids.has(module.id)) {
      errors.push(`Duplicate module id: ${module.id}`);
    }
    ids.add(module.id);

    if (!module.path) {
      warnings.push(`Module ${module.id} missing path`);
    } else {
      const absolute = path.join(repoRoot, module.path);
      try {
        await fs.access(absolute);
      } catch {
        warnings.push(`Module ${module.id} path not found: ${module.path}`);
      }
    }

    if (!Array.isArray(module.stewards) || module.stewards.length === 0) {
      warnings.push(`Module ${module.id} missing stewards`);
    }
    if (!Array.isArray(module.reviewers) || module.reviewers.length === 0) {
      warnings.push(`Module ${module.id} missing reviewers`);
    }
    if (typeof module.ttl_days !== "number" || module.ttl_days <= 0) {
      warnings.push(`Module ${module.id} has invalid ttl_days`);
    }

    const nextReview = Date.parse(module.next_review);
    if (!Number.isFinite(nextReview)) {
      warnings.push(`Module ${module.id} next_review invalid date: ${module.next_review}`);
    }
  }

  for (const module of parsed.modules) {
    for (const dependency of module.dependencies ?? []) {
      if (!ids.has(dependency)) {
        errors.push(`Module ${module.id} depends on unknown module '${dependency}'`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("Validation errors:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("Validation warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n"));
  }

  console.log("module_index.yaml validation passed");
}

main().catch((error) => {
  console.error("Failed to validate module index:", error);
  process.exit(1);
});
