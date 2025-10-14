import type {
  ClusterStrategy,
  PlanClusterSummary,
  PlanTaskSummary,
  TaskClusterSpec,
} from "./types.js";

const DEFAULT_CLUSTER_STRATEGY: ClusterStrategy = "clustered";

function normaliseId(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return undefined;
}

function normaliseTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const unique = new Set<string>();
  for (const entry of value) {
    const tag = typeof entry === "string" ? entry.trim() : normaliseId(entry);
    if (tag) {
      unique.add(tag);
    }
  }

  if (unique.size === 0) {
    return undefined;
  }

  return Array.from(unique);
}

function normaliseStrategy(value: unknown): ClusterStrategy | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalised = value.trim().toLowerCase();
  if (normalised === "clustered" || normalised === "sequential") {
    return normalised;
  }
  return undefined;
}

function normaliseMaxTasks(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const floored = Math.floor(value);
  return floored > 0 ? floored : undefined;
}

/**
 * Normalise arbitrary cluster metadata into a consistent spec structure.
 */
export function normalizeClusterSpec(input: unknown): TaskClusterSpec | undefined {
  if (input == null) {
    return undefined;
  }

  if (typeof input === "string" || typeof input === "number") {
    const id = normaliseId(input);
    if (!id) {
      return undefined;
    }
    return { id, strategy: DEFAULT_CLUSTER_STRATEGY };
  }

  if (typeof input !== "object") {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const id = normaliseId(record.id ?? record.slug ?? record.name);
  if (!id) {
    return undefined;
  }

  const spec: TaskClusterSpec = { id };

  if (typeof record.instructions === "string") {
    const instructions = record.instructions.trim();
    if (instructions.length > 0) {
      spec.instructions = instructions;
    }
  }

  const tags = normaliseTags(record.tags);
  if (tags && tags.length > 0) {
    spec.tags = tags;
  }

  const strategy = normaliseStrategy(record.strategy);
  if (strategy) {
    spec.strategy = strategy;
  }

  const maxTasks =
    normaliseMaxTasks(record.max_tasks_per_run) ??
    normaliseMaxTasks(record.max_batch_size) ??
    normaliseMaxTasks(record.maxBatchSize);
  if (typeof maxTasks === "number") {
    spec.max_tasks_per_run = maxTasks;
  }

  if (!spec.strategy) {
    spec.strategy = DEFAULT_CLUSTER_STRATEGY;
  }

  return spec;
}

/**
 * Build grouped cluster summaries from plan tasks so accelerators can act on them.
 */
export function buildClusterSummaries(tasks: PlanTaskSummary[]): PlanClusterSummary[] {
  const clusters = new Map<string, PlanClusterSummary>();

  for (const task of tasks) {
    const spec = task.cluster && task.cluster.id ? task.cluster : normalizeClusterSpec(task.cluster);
    if (!spec?.id) {
      continue;
    }

    const existing = clusters.get(spec.id);
    if (!existing) {
      clusters.set(spec.id, {
        id: spec.id,
        instructions: spec.instructions,
        tags: spec.tags ? [...spec.tags] : undefined,
        strategy: spec.strategy ?? DEFAULT_CLUSTER_STRATEGY,
        max_tasks_per_run: spec.max_tasks_per_run,
        task_ids: [task.id],
        task_titles: [task.title],
      });
      continue;
    }

    existing.task_ids.push(task.id);
    existing.task_titles.push(task.title);

    if (!existing.instructions && spec.instructions) {
      existing.instructions = spec.instructions;
    }

    if (spec.tags?.length) {
      if (!existing.tags) {
        existing.tags = [...spec.tags];
      } else {
        const seen = new Set(existing.tags);
        for (const tag of spec.tags) {
          if (!seen.has(tag)) {
            seen.add(tag);
            existing.tags.push(tag);
          }
        }
      }
    }

    if (!existing.strategy && spec.strategy) {
      existing.strategy = spec.strategy;
    }

    if (spec.max_tasks_per_run) {
      existing.max_tasks_per_run = existing.max_tasks_per_run
        ? Math.max(existing.max_tasks_per_run, spec.max_tasks_per_run)
        : spec.max_tasks_per_run;
    }
  }

  return Array.from(clusters.values());
}
