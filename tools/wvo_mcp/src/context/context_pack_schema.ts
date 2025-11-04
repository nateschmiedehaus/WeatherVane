import { z } from 'zod';

export const AnchorSchema = z.object({
  kind: z.enum(['code', 'test', 'kb', 'decision', 'artifact']),
  path: z.string().optional(),
  lines: z.string().optional(),
  rev: z.string().optional(),
  ref: z.string().optional(),
  name: z.string().optional(),
});

export const MicroSummarySchema = z.object({
  ref: z.string(),
  summary: z.string().min(1).max(320),
});

export const LocalContextPackSchema = z.object({
  agent: z.enum(['Planner', 'Thinker', 'Implementer', 'Verifier', 'Reviewer', 'Critical', 'Supervisor']),
  task_id: z.string(),
  goal: z.string(),
  acceptance_criteria: z.array(z.string()),
  constraints: z.array(z.string()),
  scope_class: z.enum(['Tiny', 'Small', 'Medium', 'Large']),
  model_capability: z.enum(['fast_code', 'reasoning_high', 'reasoning_ultra', 'long_context', 'cheap_batch']),
  anchors: z.array(AnchorSchema).max(24),
  micro_summaries: z.array(MicroSummarySchema).max(24),
  risk_notes: z.array(z.string()),
  open_questions: z.array(z.string()),
  next_actions: z.array(z.string()),
  token_estimate: z.number().nonnegative(),
  bloat_checks: z.object({
    dedup_ok: z.boolean(),
    within_budget: z.boolean(),
    no_large_blobs: z.boolean(),
  }),
});

export type LocalContextPack = z.infer<typeof LocalContextPackSchema>;
