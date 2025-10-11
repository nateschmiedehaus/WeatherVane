import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { PlanNextInput, PlanTaskSummary } from '../utils/types.js';
import type { StateMachine, Task, TaskStatus } from './state_machine.js';
import type { RoadmapDocument, RoadmapEpic, RoadmapMilestone, RoadmapTask } from '../utils/types.js';
import { RoadmapStore } from '../state/roadmap_store.js';
import { logWarning } from '../telemetry/logger.js';

export type LegacyPlanStatus = 'pending' | 'in_progress' | 'blocked' | 'done';

export interface LegacyTaskMetadata {
  owner?: string;
  milestone_id?: string;
  milestone_title?: string;
  epic_id?: string;
  epic_title?: string;
  exit_criteria?: string[];
  estimate_hours?: number;
  dependencies?: string[];
}

const LEGACY_TO_STATE_STATUS: Record<LegacyPlanStatus, TaskStatus> = {
  pending: 'pending',
  in_progress: 'in_progress',
  blocked: 'blocked',
  done: 'done',
};

const STATE_TO_LEGACY_STATUS: Record<TaskStatus, LegacyPlanStatus> = {
  pending: 'pending',
  in_progress: 'in_progress',
  blocked: 'blocked',
  done: 'done',
  needs_review: 'in_progress',
  needs_improvement: 'blocked',
};

const STATUS_PRIORITY: Record<TaskStatus, number> = {
  needs_review: 0,
  needs_improvement: 1,
  pending: 2,
  in_progress: 3,
  blocked: 4,
  done: 5,
};

function normaliseExitCriteria(criteria?: RoadmapTask['exit_criteria']): string[] {
  if (!criteria) {
    return [];
  }
  return criteria.map((criterion) => {
    if ('critic' in criterion) return `critic:${criterion.critic}`;
    if ('doc' in criterion) return `doc:${criterion.doc}`;
    if ('artifact' in criterion) return `artifact:${criterion.artifact}`;
    if ('note' in criterion) return `note:${criterion.note}`;
    return 'unknown';
  });
}

function estimateComplexity(estimateHours?: number): number | undefined {
  if (typeof estimateHours !== 'number' || Number.isNaN(estimateHours)) {
    return undefined;
  }
  const normalised = Math.max(1, Math.min(10, Math.round((estimateHours || 1) / 2)));
  return normalised;
}

function metadataNeedsUpdate(current: Record<string, unknown> | undefined, next: Record<string, unknown>): boolean {
  const left = stableStringify(current);
  const right = stableStringify(next);
  return left !== right;
}

export function toLegacyStatus(status: TaskStatus): LegacyPlanStatus {
  return STATE_TO_LEGACY_STATUS[status];
}

export function legacyStatusToState(status: LegacyPlanStatus): TaskStatus {
  return LEGACY_TO_STATE_STATUS[status] ?? 'pending';
}

function buildMetadata(task: RoadmapTask, milestone: RoadmapMilestone, epic: RoadmapEpic): LegacyTaskMetadata {
  return {
    owner: task.owner,
    milestone_id: milestone.id,
    milestone_title: milestone.title,
    epic_id: epic.id,
    epic_title: epic.title,
    exit_criteria: normaliseExitCriteria(task.exit_criteria),
    estimate_hours: task.estimate_hours,
    dependencies: task.dependencies,
  };
}

function toMetadataRecord(metadata: LegacyTaskMetadata): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'undefined' || value === null) {
      continue;
    }
    record[key] = value;
  }
  return record;
}

function stableStringify(record?: Record<string, unknown>): string {
  if (!record) {
    return '';
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = normalizeForCompare(record[key]);
  }
  return JSON.stringify(sorted);
}

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCompare);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const normalised: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      normalised[key] = normalizeForCompare(nested);
    }
    return normalised;
  }
  return value;
}

function parseMetadata(record: Record<string, unknown> | undefined): LegacyTaskMetadata {
  if (!record) {
    return {};
  }
  const metadata: LegacyTaskMetadata = {};
  if (typeof record.owner === 'string') {
    metadata.owner = record.owner;
  }
  if (typeof record.milestone_id === 'string') {
    metadata.milestone_id = record.milestone_id;
  }
  if (typeof record.milestone_title === 'string') {
    metadata.milestone_title = record.milestone_title;
  }
  if (typeof record.epic_id === 'string') {
    metadata.epic_id = record.epic_id;
  }
  if (typeof record.epic_title === 'string') {
    metadata.epic_title = record.epic_title;
  }
  if (typeof record.estimate_hours === 'number') {
    metadata.estimate_hours = record.estimate_hours;
  }
  if (Array.isArray(record.exit_criteria)) {
    metadata.exit_criteria = record.exit_criteria.map((item) => String(item));
  }
  if (Array.isArray(record.dependencies)) {
    metadata.dependencies = record.dependencies.map((item) => String(item));
  }
  return metadata;
}

function synchroniseTask(
  stateMachine: StateMachine,
  roadmapTask: RoadmapTask,
  milestone: RoadmapMilestone,
  epic: RoadmapEpic,
  dependencyAccumulator: Array<{ taskId: string; dependencies: string[] }>,
): void {
  const metadata = buildMetadata(roadmapTask, milestone, epic);
  const metadataRecord = toMetadataRecord(metadata);
  const desiredStatus = legacyStatusToState(roadmapTask.status);
  const existing = stateMachine.getTask(roadmapTask.id);
  const estimated_complexity = estimateComplexity(roadmapTask.estimate_hours);

  if (!existing) {
    stateMachine.createTask({
      id: roadmapTask.id,
      title: roadmapTask.title,
      description: roadmapTask.description,
      type: 'task',
      status: desiredStatus,
      epic_id: epic.id,
      estimated_complexity,
      metadata: metadataRecord,
    });
  } else {
    const statusChanged = existing.status !== desiredStatus;
    const metadataUpdateRequired = metadataNeedsUpdate(existing.metadata as Record<string, unknown> | undefined, metadataRecord);
    const patch: Record<string, unknown> | undefined = metadataUpdateRequired ? metadataRecord : undefined;

    if (statusChanged || metadataUpdateRequired) {
      stateMachine.transition(roadmapTask.id, desiredStatus, patch);
    }

    if (existing.title !== roadmapTask.title || existing.description !== roadmapTask.description) {
      stateMachine.updateTaskDetails(roadmapTask.id, {
        title: roadmapTask.title,
        description: roadmapTask.description,
      });
    }
  }

  if (roadmapTask.dependencies?.length) {
    dependencyAccumulator.push({
      taskId: roadmapTask.id,
      dependencies: roadmapTask.dependencies,
    });
  }
}

function addDependencies(stateMachine: StateMachine, dependencyAccumulator: Array<{ taskId: string; dependencies: string[] }>): void {
  for (const entry of dependencyAccumulator) {
    for (const dep of entry.dependencies) {
      try {
        stateMachine.addDependency(entry.taskId, dep, 'blocks');
      } catch (error) {
        logWarning('Failed to add dependency (possibly duplicate or cycle)', {
          taskId: entry.taskId,
          dependencyId: dep,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export function taskToPlanSummary(task: Task): PlanTaskSummary {
  const metadata = parseMetadata(task.metadata as Record<string, unknown> | undefined);
  return {
    id: task.id,
    title: task.title,
    owner: metadata.owner ?? 'unassigned',
    status: toLegacyStatus(task.status),
    epic_id: task.epic_id ?? metadata.epic_id ?? 'unknown_epic',
    milestone_id: metadata.milestone_id ?? 'unknown_milestone',
    estimate_hours: metadata.estimate_hours,
    exit_criteria: metadata.exit_criteria ?? [],
  };
}

export function buildPlanSummaries(stateMachine: StateMachine, filters?: PlanNextInput['filters']): PlanTaskSummary[] {
  const tasks = stateMachine.getTasks();
  const summaries = tasks.map(taskToPlanSummary);

  let filtered = summaries;
  if (filters?.status?.length) {
    const allowed = new Set<LegacyPlanStatus>(filters.status as LegacyPlanStatus[]);
    filtered = filtered.filter((summary) => allowed.has(summary.status));
  }

  if (filters?.epic_id) {
    filtered = filtered.filter((summary) => summary.epic_id === filters.epic_id);
  }

  if (filters?.milestone_id) {
    filtered = filtered.filter((summary) => summary.milestone_id === filters.milestone_id);
  }

  const summarisedById: Record<string, Task> = {};
  for (const task of tasks) {
    summarisedById[task.id] = task;
  }

  filtered.sort((a, b) => {
    const taskA = summarisedById[a.id];
    const taskB = summarisedById[b.id];
    const statusDiff = STATUS_PRIORITY[taskA.status] - STATUS_PRIORITY[taskB.status];
    if (statusDiff !== 0) return statusDiff;

    const complexityA = taskA.estimated_complexity ?? Number.MAX_SAFE_INTEGER;
    const complexityB = taskB.estimated_complexity ?? Number.MAX_SAFE_INTEGER;
    if (complexityA !== complexityB) {
      return complexityA - complexityB;
    }

    return taskA.created_at - taskB.created_at;
  });

  return filtered;
}

export async function syncRoadmapDocument(stateMachine: StateMachine, roadmap: RoadmapDocument): Promise<void> {
  const dependencies: Array<{ taskId: string; dependencies: string[] }> = [];

  for (const epic of roadmap.epics ?? []) {
    for (const milestone of epic.milestones ?? []) {
      for (const task of milestone.tasks ?? []) {
        synchroniseTask(stateMachine, task, milestone, epic, dependencies);
      }
    }
  }

  addDependencies(stateMachine, dependencies);
}

export async function syncRoadmapFile(stateMachine: StateMachine, workspaceRoot: string): Promise<void> {
  const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');

  try {
    await fs.access(roadmapPath);
  } catch {
    return;
  }

  const store = new RoadmapStore(workspaceRoot);
  const document = await store.read();
  await syncRoadmapDocument(stateMachine, document);
}
