import { z } from "zod";

export const planNextFiltersSchema = z.object({
  status: z.array(z.enum(["pending", "in_progress", "blocked", "done"])).optional(),
  epic_id: z.string().optional(),
  milestone_id: z.string().optional(),
  domain: z.enum(["product", "mcp"]).optional(),
});

export const planNextInputSchema = z.object({
  limit: z.number().int().positive().max(20).optional(),
  max_tasks: z.number().int().positive().max(20).optional(),
  filters: planNextFiltersSchema.optional(),
  minimal: z.boolean().optional(),
});

export const dispatchInputSchema = z.object({
  limit: z.number().int().positive().max(20).optional(),
  max_tasks: z.number().int().positive().max(20).optional(),
  filters: planNextFiltersSchema.optional(),
});

export const verifyInputSchema = z.object({
  include: z
    .array(z.enum(["operations", "resilience", "self_improvement", "autopilot", "holistic_review"]))
    .optional(),
});

export const moReportInputSchema = z.object({
  limit: z.number().int().positive().max(20).optional(),
  filters: planNextFiltersSchema.optional(),
  include_operations: z.boolean().optional(),
  include_tasks: z.boolean().optional(),
});
