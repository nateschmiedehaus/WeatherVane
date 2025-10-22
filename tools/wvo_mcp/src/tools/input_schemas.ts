import { z } from "zod";

export const orchestratorStatusInput = z.object({});
export const authStatusInput = z.object({});

export const planUpdateInput = z.object({
  task_id: z.string(),
  status: z.enum(["pending", "in_progress", "blocked", "done"]),
});

export const contextWriteInput = z.object({
  section: z.string().min(1),
  content: z.string().min(1),
  append: z.boolean().optional(),
});

export const contextSnapshotInput = z.object({
  notes: z.string().optional(),
});

export const fsReadInput = z.object({
  path: z.string().min(1),
});

export const fsWriteInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const cmdRunInput = z.object({
  cmd: z.string().min(1),
});

export const criticsRunInput = z.object({
  critics: z.array(z.string()).optional(),
});

export const autopilotAuditInput = z.object({
  task_id: z.string().min(1).optional(),
  focus: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export const heavyQueueEnqueueInput = z.object({
  summary: z.string().min(1),
  command: z.string().optional(),
  notes: z.string().optional(),
  id: z.string().optional(),
  priority: z.enum(["urgent", "normal", "background"]).optional(),
  is_interactive: z.boolean().optional(),
  is_critical: z.boolean().optional(),
  estimated_duration_ms: z.number().nonnegative().optional(),
});

export const heavyQueueUpdateInput = z.object({
  id: z.string().min(1),
  status: z.enum(["queued", "running", "completed", "cancelled"]).optional(),
  notes: z.string().optional(),
  command: z.string().optional(),
  execution_start_time: z.string().optional(),
  execution_duration_ms: z.number().optional(),
});

export const artifactRecordInput = z.object({
  type: z.string(),
  path: z.string(),
  metadata: z.record(z.any()).optional(),
});

// LSP Tool Schemas
export const lspDefinitionInput = z.object({
  language: z.enum(["typescript", "python"]),
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
  contextLines: z.number().int().nonnegative().optional(),
});

export const lspReferencesInput = z.object({
  language: z.enum(["typescript", "python"]),
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
  contextLines: z.number().int().nonnegative().optional(),
});

export const lspHoverInput = z.object({
  language: z.enum(["typescript", "python"]),
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});

export const lspServerStatusInput = z.object({
  language: z.enum(["typescript", "python"]).optional(),
});

export const lspInitializeInput = z.object({
  workspaceRoot: z.string().min(1),
});

// Admin tool schemas
export const adminFlagsInput = z.object({
  action: z.enum(["get", "set", "reset"]).describe("get: read current flags, set: update one or more flags, reset: restore defaults"),
  flags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Flags to update (only for 'set' action)"),
  flag: z.string().optional().describe("Single flag to get or reset"),
});

export type PlanUpdateInput = z.infer<typeof planUpdateInput>;
export type ContextWriteInput = z.infer<typeof contextWriteInput>;
export type ContextSnapshotInput = z.infer<typeof contextSnapshotInput>;
export type FsReadInput = z.infer<typeof fsReadInput>;
export type FsWriteInput = z.infer<typeof fsWriteInput>;
export type CmdRunInput = z.infer<typeof cmdRunInput>;
export type CriticsRunInput = z.infer<typeof criticsRunInput>;
export type AutopilotAuditInput = z.infer<typeof autopilotAuditInput>;
export type HeavyQueueEnqueueInput = z.infer<typeof heavyQueueEnqueueInput>;
export type HeavyQueueUpdateInput = z.infer<typeof heavyQueueUpdateInput>;
export type ArtifactRecordInput = z.infer<typeof artifactRecordInput>;
export type LspDefinitionInput = z.infer<typeof lspDefinitionInput>;
export type LspReferencesInput = z.infer<typeof lspReferencesInput>;
export type LspHoverInput = z.infer<typeof lspHoverInput>;
export type LspServerStatusInput = z.infer<typeof lspServerStatusInput>;
export type LspInitializeInput = z.infer<typeof lspInitializeInput>;
export type AdminFlagsInput = z.infer<typeof adminFlagsInput>;
