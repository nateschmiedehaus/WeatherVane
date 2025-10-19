export type TaskStatus = "pending" | "in_progress" | "blocked" | "done";

export type ClusterStrategy = "clustered" | "sequential";

export interface TaskClusterSpec {
  id: string;
  instructions?: string;
  tags?: string[];
  strategy?: ClusterStrategy;
  max_tasks_per_run?: number;
}

export interface RoadmapTask {
  id: string;
  title: string;
  owner: string;
  estimate_hours?: number;
  status: TaskStatus;
  description?: string;
  dependencies?: string[];
  exit_criteria?: Array<
    | { critic: string }
    | { doc: string }
    | { artifact: string }
    | { note: string }
    | string
  >;
  cluster?: TaskClusterSpec | string;
  notes?: string;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description?: string;
  tasks: RoadmapTask[];
}

export interface RoadmapEpic {
  id: string;
  title: string;
  description?: string;
  status?: string;
  blocked_by?: string[];
  milestones: RoadmapMilestone[];
}

export interface RoadmapDocument {
  epics: RoadmapEpic[];
}

export interface PlanNextInput {
  limit?: number;
  max_tasks?: number;
  filters?: {
    status?: TaskStatus[];
    epic_id?: string;
    milestone_id?: string;
    domain?: "product" | "mcp";
  };
}

export interface PlanTaskSummary {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  epic_id: string;
  milestone_id: string;
  exit_criteria: Array<string>;
  estimate_hours?: number;
  domain?: "product" | "mcp";
  cluster?: TaskClusterSpec;
}

export interface PlanClusterSummary extends TaskClusterSpec {
  task_ids: string[];
  task_titles: string[];
}

export interface ContextWriteInput {
  section: string;
  content: string;
  append?: boolean;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CodexCommandDescriptor {
  command: string;
  description: string;
  recommendedProfile: "low" | "medium" | "high";
  requiresApproval?: boolean;
}

export type HeavyTaskStatus = "queued" | "running" | "completed" | "cancelled";

export interface HeavyTaskQueueItem {
  id: string;
  summary: string;
  status: HeavyTaskStatus;
  created_at: string;
  updated_at: string;
  command?: string;
  notes?: string;
}

export interface HeavyTaskUpdateInput {
  id: string;
  status?: HeavyTaskStatus;
  notes?: string;
  command?: string;
}

export interface AutopilotAuditEntry {
  task_id?: string;
  focus?: string;
  notes?: string;
  timestamp?: string;
}

export interface AutopilotState {
  last_audit: AutopilotAuditEntry | null;
  audit_history: AutopilotAuditEntry[];
  audit_count: number;
}
