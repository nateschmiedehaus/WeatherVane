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
});

export const heavyQueueUpdateInput = z.object({
  id: z.string().min(1),
  status: z.enum(["queued", "running", "completed", "cancelled"]).optional(),
  notes: z.string().optional(),
  command: z.string().optional(),
});

export const artifactRecordInput = z.object({
  type: z.string(),
  path: z.string(),
  metadata: z.record(z.any()).optional(),
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
