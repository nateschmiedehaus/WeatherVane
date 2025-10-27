import fs from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';
import { z } from 'zod';

import { logWarning } from '../telemetry/logger.js';

import { ROUTER_ALLOWED_MODELS, ROUTER_LOCKED_MODELS, ROUTER_BANNED_PROVIDERS } from './router_lock.js';

const CAPABILITY_TAG_VALUES = ['reasoning_high', 'fast_code', 'cheap_batch', 'long_context'] as const;
export type CapabilityTag = (typeof CAPABILITY_TAG_VALUES)[number];

const ROUTER_STATE_VALUES = ['specify', 'plan', 'thinker', 'implement', 'verify', 'review', 'pr', 'monitor'] as const;
export type RouterState = (typeof ROUTER_STATE_VALUES)[number];
const ROUTER_STATES: RouterState[] = [...ROUTER_STATE_VALUES];

const DEFAULT_STATE_CAPABILITIES: Record<RouterState, CapabilityTag[]> = {
  specify: ['reasoning_high'],
  plan: ['reasoning_high'],
  thinker: ['reasoning_high'],
  implement: ['fast_code'],
  verify: ['fast_code'],
  review: ['reasoning_high'],
  pr: ['reasoning_high'],
  monitor: ['cheap_batch'],
};

const DEFAULT_THRESHOLDS = {
  longContextTokens: 120_000,
  fastCodeFiles: 5,
};

const DEFAULT_VERIFY_FAILURE_ESCALATION = 2;

const CapabilityTagSchema = z.enum(CAPABILITY_TAG_VALUES);
const CapabilityPolicySchema = z.object({
  prefer: z.array(z.string()).min(1),
  min_context_window: z.number().int().positive().optional(),
});

const RouterPolicyYamlSchema = z.object({
  capability_tags: z.record(CapabilityTagSchema, CapabilityPolicySchema).optional(),
  routing: z
    .record(z.enum(ROUTER_STATE_VALUES), z.union([CapabilityTagSchema, z.array(CapabilityTagSchema)]))
    .optional(),
  thresholds: z
    .object({
      long_context_tokens: z.number().int().positive().optional(),
      fast_code_files: z.number().int().positive().optional(),
    })
    .optional(),
  escalation: z
    .object({
      on_two_verify_failures: z
        .object({
          threshold: z.number().int().positive().optional(),
          require_plan_delta: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export interface RouterPolicy {
  capabilityPriorities: Record<CapabilityTag, string[]>;
  stateCapabilities: Record<RouterState, CapabilityTag[]>;
  thresholds: {
    longContextTokens: number;
    fastCodeFiles: number;
  };
  verifyFailureEscalation: number;
  requirePlanDeltaOnEscalation: boolean;
  bannedProviders: string[];
}

export function resolvePolicyPath(workspaceRoot: string, explicit?: string): string {
  const candidates = [
    explicit,
    path.join(workspaceRoot, 'tools', 'wvo_mcp', 'src', 'orchestrator', 'model_policy.yaml'),
    path.join(workspaceRoot, 'src', 'orchestrator', 'model_policy.yaml'),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

export function loadRouterPolicy(policyPath: string): RouterPolicy {
  if (!fs.existsSync(policyPath)) {
    logWarning('router_policy: policy file not found; using defaults', { path: policyPath });
    return buildPolicyFromData({});
  }
  const raw = fs.readFileSync(policyPath, 'utf-8');
  const parsed = RouterPolicyYamlSchema.safeParse(yaml.parse(raw));
  if (!parsed.success) {
    logWarning('router_policy: invalid YAML; falling back to defaults', {
      path: policyPath,
      issues: parsed.error.issues.map(issue => issue.message),
    });
    return buildPolicyFromData({});
  }

  const data = parsed.data;
  return buildPolicyFromData(data);
}

function buildPolicyFromData(data: z.infer<typeof RouterPolicyYamlSchema>): RouterPolicy {
  const capabilityPriorities = buildCapabilityPriorities(data.capability_tags);
  const stateCapabilities = buildStateCapabilities(data.routing);
  const thresholds = buildThresholds(data, capabilityPriorities.long_context);
  const verifyFailureEscalation =
    data.escalation?.on_two_verify_failures?.threshold ?? DEFAULT_VERIFY_FAILURE_ESCALATION;
  const requirePlanDeltaOnEscalation =
    data.escalation?.on_two_verify_failures?.require_plan_delta ?? true;

  return {
    capabilityPriorities,
    stateCapabilities,
    thresholds,
    verifyFailureEscalation,
    requirePlanDeltaOnEscalation,
    bannedProviders: [...ROUTER_BANNED_PROVIDERS],
  };
}

function buildCapabilityPriorities(
  capabilitySections?: Partial<Record<CapabilityTag, z.infer<typeof CapabilityPolicySchema>>>
): Record<CapabilityTag, string[]> {
  const priorities: Record<CapabilityTag, string[]> = {
    reasoning_high: [],
    fast_code: [],
    cheap_batch: [],
    long_context: [],
  };
  for (const tag of CAPABILITY_TAG_VALUES) {
    const preferred =
      capabilitySections?.[tag]?.prefer ??
      (ROUTER_LOCKED_MODELS[tag as keyof typeof ROUTER_LOCKED_MODELS] as readonly string[]);
    const sanitized = preferred.filter(model => ROUTER_ALLOWED_MODELS.has(model));
    if (!sanitized.length) {
      priorities[tag] = [
        ...(ROUTER_LOCKED_MODELS[tag as keyof typeof ROUTER_LOCKED_MODELS] as readonly string[]),
      ];
    } else {
      priorities[tag] = Array.from(new Set(sanitized));
    }
  }
  return priorities;
}

function buildStateCapabilities(
  routing?: Record<string, CapabilityTag | CapabilityTag[]>
): Record<RouterState, CapabilityTag[]> {
  const result: Record<RouterState, CapabilityTag[]> = { ...DEFAULT_STATE_CAPABILITIES };
  if (!routing) {
    return result;
  }
  for (const [stateKey, mapping] of Object.entries(routing)) {
    if (!ROUTER_STATES.includes(stateKey as RouterState)) {
      logWarning('router_policy: ignoring unknown state in routing map', { state: stateKey });
      continue;
    }
    const tags = Array.isArray(mapping) ? mapping : [mapping];
    result[stateKey as RouterState] = tags.filter(tag =>
      CAPABILITY_TAG_VALUES.includes(tag)
    ) as CapabilityTag[];
  }
  return result;
}

function buildThresholds(
  data: z.infer<typeof RouterPolicyYamlSchema>,
  longContextPriority: string[]
): { longContextTokens: number; fastCodeFiles: number } {
  const longContextFromCap =
    data.capability_tags?.long_context?.min_context_window ?? DEFAULT_THRESHOLDS.longContextTokens;
  const longContextTokens =
    data.thresholds?.long_context_tokens ?? longContextFromCap ?? DEFAULT_THRESHOLDS.longContextTokens;
  const fastCodeFiles = data.thresholds?.fast_code_files ?? DEFAULT_THRESHOLDS.fastCodeFiles;
  if (!longContextPriority.length) {
    logWarning('router_policy: long_context priority list empty; using defaults');
  }
  return {
    longContextTokens,
    fastCodeFiles,
  };
}
