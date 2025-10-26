import { z } from 'zod';

export const ProviderEnum = z.enum(['openai', 'anthropic', 'google', 'xai', 'other']);

export const ReasoningStrengthEnum = z.enum(['low', 'medium', 'medium_high', 'high', 'ultra']);
export const CodeQualityEnum = z.enum(['low', 'medium', 'high', 'ultra']);
export const PriceClassEnum = z.enum(['cheap', 'normal', 'premium']);

export const ModelCapabilitySchema = z.object({
  name: z.string().min(1),
  provider: ProviderEnum,
  context_window: z.number().int().nonnegative(),
  reasoning_strength: ReasoningStrengthEnum,
  code_quality: CodeQualityEnum,
  latency_ms_est: z.number().int().nonnegative(),
  price_class: PriceClassEnum,
  tool_use_ok: z.boolean(),
  vision_ok: z.boolean(),
  max_output_tokens: z.number().int().nonnegative(),
  notes: z.union([z.array(z.string()), z.undefined()]).optional(),
});

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelCatalogSchema = z.object({
  models: z.array(ModelCapabilitySchema),
  source: z.enum(['discovery', 'policy', 'mixed']).optional(),
  timestamp: z.string().optional(),
  fallback: z.array(z.string()).optional(),
});

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

export interface RepairReport {
  repaired: ModelCapability[];
  dropped: { original: unknown; reason: string }[];
}

export function ensureNotes(entry: ModelCapability): ModelCapability {
  return {
    ...entry,
    notes: Array.isArray(entry.notes) ? entry.notes : [],
  };
}
