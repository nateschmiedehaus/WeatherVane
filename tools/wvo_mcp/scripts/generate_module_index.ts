#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

interface ModuleConfig {
  id: string;
  path: string;
  description: string;
  stewards: string[];
  reviewers: string[];
  ttl_days?: number;
  dependencies?: string[];
  health_signals?: string[];
  status?: "healthy" | "warning" | "critical";
}

interface ModuleRecord extends ModuleConfig {
  last_review: string;
  next_review: string;
  ttl_days: number;
}

const TODAY = new Date();

const MODULES: ModuleConfig[] = [
  {
    id: "apps",
    path: "apps",
    description: "Application umbrella containing API, web, and worker services",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: [],
    health_signals: ["build_passes", "tests_pass"],
  },
  {
    id: "apps-api",
    path: "apps/api",
    description: "WeatherVane API service",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["shared", "tools-wvo_mcp"],
    health_signals: ["build_passes", "tests_pass", "api_latency"],
  },
  {
    id: "apps-web",
    path: "apps/web",
    description: "WeatherVane web front-end",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["apps-api", "shared"],
    health_signals: ["build_passes", "tests_pass", "lighthouse_score"],
  },
  {
    id: "apps-worker",
    path: "apps/worker",
    description: "Background worker for orchestration workflows",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["tools-wvo_mcp", "shared"],
    health_signals: ["build_passes", "tests_pass", "queue_latency"],
  },
  {
    id: "shared",
    path: "shared",
    description: "Shared libraries used by applications and tools",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: [],
    health_signals: ["build_passes", "tests_pass"],
  },
  {
    id: "docs",
    path: "docs",
    description: "Documentation and theory references",
    stewards: ["Director Dana"],
    reviewers: ["Council"],
    dependencies: [],
    health_signals: ["doc_review_pass", "ttl_not_expired"],
  },
  {
    id: "meta",
    path: "meta",
    description: "Governance, guardrails, and policy configuration",
    stewards: ["Council"],
    reviewers: ["Atlas"],
    dependencies: ["docs"],
    health_signals: ["guardrails_valid"],
  },
  {
    id: "state",
    path: "state",
    description: "Evidence, analytics, and state bundles",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: [],
    health_signals: ["evidence_complete", "analytics_fresh"],
  },
  {
    id: "tools",
    path: "tools",
    description: "Developer tooling and automation scripts",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["shared"],
    health_signals: ["build_passes"],
  },
  {
    id: "tools-wvo_mcp",
    path: "tools/wvo_mcp",
    description: "Autopilot orchestrator MCP server and tooling",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["shared"],
    health_signals: ["build_passes", "tests_pass"],
  },
  {
    id: "orchestrator",
    path: "tools/wvo_mcp/src/orchestrator",
    description: "Task planning, execution coordination, guardrails",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["executor", "intelligence", "critics", "telemetry"],
    health_signals: ["build_passes", "tests_pass", "guardrail_compliance"],
  },
  {
    id: "executor",
    path: "tools/wvo_mcp/src/executor",
    description: "Command execution and sandbox enforcement",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["telemetry"],
    health_signals: ["build_passes", "tests_pass"],
  },
  {
    id: "intelligence",
    path: "tools/wvo_mcp/src/intelligence",
    description: "Research orchestration and knowledge management",
    stewards: ["Atlas"],
    reviewers: ["Director Dana"],
    dependencies: ["telemetry"],
    health_signals: ["build_passes"],
  },
  {
    id: "critics",
    path: "tools/wvo_mcp/src/critics",
    description: "Automated reviewers and quality critics",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["telemetry"],
    health_signals: ["tests_pass", "critic_pass_rate"],
  },
  {
    id: "telemetry",
    path: "tools/wvo_mcp/src/telemetry",
    description: "Telemetry exporters, tracing, and analytics helpers",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: [],
    health_signals: ["telemetry_flowing"],
  },
  {
    id: "analytics",
    path: "tools/wvo_mcp/src/analytics",
    description: "Analytics helpers: outcome logging, feedback tracking",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["telemetry"],
    health_signals: ["build_passes"],
  },
  {
    id: "tests",
    path: "tools/wvo_mcp/src/tests",
    description: "Autopilot test suites and fixtures",
    stewards: ["Atlas"],
    reviewers: ["Council"],
    dependencies: ["orchestrator", "executor"],
    health_signals: ["tests_pass"],
  },
];

const OUTPUT_PATH = path.join("meta", "module_index.yaml");

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(path.join(__dirname, "..", "..", ".."));
  const outputPath = path.join(repoRoot, OUTPUT_PATH);

  const records: ModuleRecord[] = MODULES.map((module) => toRecord(module));
  records.sort((a, b) => a.id.localeCompare(b.id));

  const yamlOutput = yaml.stringify({ modules: records });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, yamlOutput, "utf8");
  console.log(`Module index generated -> ${path.relative(repoRoot, outputPath)}`);
}

function toRecord(config: ModuleConfig): ModuleRecord {
  const ttlDays = config.ttl_days ?? 90;
  const lastReview = formatDate(TODAY);
  const nextReview = formatDate(addDays(TODAY, ttlDays));
  return {
    ...config,
    ttl_days: ttlDays,
    last_review: lastReview,
    next_review: nextReview,
    dependencies: config.dependencies ?? [],
    health_signals: config.health_signals ?? ["build_passes"],
    status: config.status ?? "healthy",
  };
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

main().catch((error) => {
  console.error("Failed to generate module index:", error);
  process.exit(1);
});
