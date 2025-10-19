#!/usr/bin/env ts-node
/**
 * Compare state/roadmap.yaml and the SQLite roadmap in orchestrator.db.
 *
 * Usage:
 *   ts-node tools/wvo_mcp/scripts/check_roadmap_parity.ts [--workspace /path]
 *
 * Exits with code 0 when parity holds, 1 when mismatches are found.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import YAML from "yaml";

import DatabaseConstructor from "better-sqlite3";

type TaskStatus = "pending" | "in_progress" | "needs_review" | "needs_improvement" | "done" | "blocked";
type TaskType = "epic" | "story" | "task" | "bug";

interface DbTask {
  id: string;
  status: TaskStatus;
  type: TaskType;
}

interface CliOptions {
  workspaceRoot: string;
}

interface RoadmapYamlTask {
  id: string;
  title?: string;
  status?: string;
  type?: string;
  description?: string;
}

type RoadmapYamlNode = RoadmapYamlTask & Record<string, unknown>;

const STATUS_MAP: Record<string, TaskStatus> = {
  pending: "pending",
  in_progress: "in_progress",
  "in-progress": "in_progress",
  needs_review: "needs_review",
  "needs-review": "needs_review",
  needs_improvement: "needs_improvement",
  "needs-improvement": "needs_improvement",
  done: "done",
  completed: "done",
  blocked: "blocked",
};

const TYPE_MAP: Record<string, TaskType> = {
  epic: "epic",
  story: "story",
  task: "task",
  bug: "bug",
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let workspaceRoot = process.cwd();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === "--workspace" || arg === "-w") && args[i + 1]) {
      workspaceRoot = args[i + 1];
      i += 1;
    }
  }

  return { workspaceRoot: path.resolve(workspaceRoot) };
}

async function readRoadmapYaml(workspaceRoot: string): Promise<Record<string, RoadmapYamlTask>> {
  const roadmapPath = path.join(workspaceRoot, "state", "roadmap.yaml");
  const result = new Map<string, RoadmapYamlTask>();

  let text: string;
  try {
    text = await fs.readFile(roadmapPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read roadmap YAML at ${roadmapPath}: ${(error as Error).message}`);
  }

  const parsed = YAML.parse(text) as { epics?: Array<Record<string, unknown>> };
  const epics = Array.isArray(parsed?.epics) ? parsed.epics : [];

  for (const epicNode of epics) {
    if (typeof epicNode?.id === "string") {
      const epicId = epicNode.id as string;
      result.set(epicId, {
        id: epicId,
        status: normalizeStatus(epicNode.status as string | undefined),
        type: inferTypeFromId(epicId),
        title: epicNode.title as string | undefined,
        description: epicNode.description as string | undefined,
      });
    }

    const milestones = Array.isArray(epicNode?.milestones) ? (epicNode.milestones as RoadmapYamlNode[]) : [];
    for (const milestone of milestones) {
      const tasks = Array.isArray(milestone?.tasks) ? (milestone.tasks as RoadmapYamlNode[]) : [];
      for (const task of tasks) {
        if (typeof task.id !== "string") {
          continue;
        }
        result.set(task.id, {
          id: task.id,
          status: normalizeStatus(task.status),
          type: normalizeType(task.type),
          title: task.title,
          description: task.description,
        });
      }
    }
  }

  return Object.fromEntries(result);
}

function normalizeStatus(raw?: string): TaskStatus {
  if (!raw) {
    return "pending";
  }
  const lowered = raw.toLowerCase();
  return (STATUS_MAP[lowered] ?? "pending") as TaskStatus;
}

function normalizeType(raw?: string): TaskType {
  if (!raw) {
    return "task";
  }
  const lowered = raw.toLowerCase();
  return (TYPE_MAP[lowered] ?? "task") as TaskType;
}

function inferTypeFromId(id: string): TaskType {
  if (/^E\d+/i.test(id)) {
    return "epic";
  }
  if (/^BUG/i.test(id)) {
    return "bug";
  }
  return "task";
}

function loadDbTasks(workspaceRoot: string): DbTask[] {
  const sqlitePath = path.join(workspaceRoot, "state", "orchestrator.db");
  const db = new DatabaseConstructor(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare<{ id: string; status: string; type: string }>("SELECT id, status, type FROM tasks")
      .all();
    return rows.map((row) => ({
      id: row.id,
      status: normalizeStatus(row.status),
      type: normalizeType(row.type),
    }));
  } finally {
    db.close();
  }
}

function compareTasks(dbTasks: DbTask[], yamlTasks: Record<string, RoadmapYamlTask>) {
  const dbMap = new Map<string, DbTask>(dbTasks.map((task) => [task.id, task]));
  const yamlMap = new Map<string, RoadmapYamlTask>(Object.entries(yamlTasks));

  const missingInDb: RoadmapYamlTask[] = [];
  const missingInYaml: Task[] = [];
  const statusMismatches: Array<{ id: string; dbStatus: TaskStatus; yamlStatus: TaskStatus }> = [];
  const typeMismatches: Array<{ id: string; dbType: TaskType; yamlType: TaskType }> = [];

  for (const [id, yamlTask] of yamlMap.entries()) {
    const dbTask = dbMap.get(id);
    if (!dbTask) {
      missingInDb.push(yamlTask);
      continue;
    }
    if (dbTask.status !== yamlTask.status) {
      statusMismatches.push({ id, dbStatus: dbTask.status, yamlStatus: yamlTask.status! });
    }
    if (dbTask.type !== normalizeType(yamlTask.type)) {
      typeMismatches.push({ id, dbType: dbTask.type, yamlType: normalizeType(yamlTask.type) });
    }
  }

  for (const [id, dbTask] of dbMap.entries()) {
    if (!yamlMap.has(id)) {
      missingInYaml.push(dbTask);
    }
  }

  return {
    missingInDb,
    missingInYaml,
    statusMismatches,
    typeMismatches,
  };
}

async function main() {
  const options = parseArgs();
  try {
    const yamlTasks = await readRoadmapYaml(options.workspaceRoot);
    const dbTasks = loadDbTasks(options.workspaceRoot);

    const { missingInDb, missingInYaml, statusMismatches, typeMismatches } = compareTasks(
      dbTasks,
      yamlTasks,
    );

  const ignoredPrefixes = ["PHASE-", "CRIT-", "TASK-RESEARCH-"];
  const filteredMissingInYaml = missingInYaml.filter(
    (task) => !ignoredPrefixes.some((prefix) => task.id.startsWith(prefix)),
  );

  const summary = {
    workspace: options.workspaceRoot,
    total_yaml_tasks: Object.keys(yamlTasks).length,
    total_db_tasks: dbTasks.length,
    missing_in_db: missingInDb.map((task) => ({ id: task.id, status: task.status })),
    missing_in_yaml: missingInYaml.map((task) => ({ id: task.id, status: task.status })),
    status_mismatches: statusMismatches,
    type_mismatches: typeMismatches,
  };

  const parityOk =
    missingInDb.length === 0 && filteredMissingInYaml.length === 0 && statusMismatches.length === 0;

    if (parityOk) {
      console.log("✅ Roadmap parity check passed.");
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    } else {
      console.error("❌ Roadmap parity check failed.");
      console.error(JSON.stringify(summary, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Roadmap parity check error:", error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

void main();
