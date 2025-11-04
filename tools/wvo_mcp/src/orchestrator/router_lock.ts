const FAST_CODE_MODELS = ['codex-5-high', 'codex-5-medium', 'codex-5-low'] as const;
const REASONING_HIGH_MODELS = ['claude-sonnet-4.5', 'claude-opus-4.1'] as const;
const CHEAP_BATCH_MODELS = ['claude-haiku-4.5'] as const;
const LONG_CONTEXT_MODELS = ['claude-sonnet-4.5', 'claude-opus-4.1'] as const;

const PROVIDER_ALIASES = new Map<string, string>([
  ['codex', 'openai'],
  ['claude', 'anthropic'],
]);

export const ROUTER_LOCKED_MODELS = {
  fast_code: FAST_CODE_MODELS,
  reasoning_high: REASONING_HIGH_MODELS,
  cheap_batch: CHEAP_BATCH_MODELS,
  long_context: LONG_CONTEXT_MODELS,
} as const;

export const ROUTER_ALLOWED_MODELS = new Set<string>(
  [
    ...FAST_CODE_MODELS,
    ...REASONING_HIGH_MODELS,
    ...CHEAP_BATCH_MODELS,
    ...LONG_CONTEXT_MODELS,
  ]
);

export const ROUTER_ALLOWED_PROVIDERS = new Set(['openai', 'anthropic']);
export const ROUTER_BANNED_PROVIDERS = new Set(['google', 'xai', 'other']);

export function assertRouterModel(model: string, context: string): void {
  if (!ROUTER_ALLOWED_MODELS.has(model)) {
    throw new Error(`router_lock violation: ${model} is not allow-listed (${context})`);
  }
}

export function assertRouterProvider(provider: string, context: string): void {
  const normalized = normalizeRouterProvider(provider);
  if (!ROUTER_ALLOWED_PROVIDERS.has(normalized)) {
    throw new Error(`router_lock violation: ${provider} is not allow-listed (${context})`);
  }
}

export function assertRouterEntry(provider: string, model: string, context: string): void {
  assertRouterProvider(provider, context);
  assertRouterModel(model, context);
}

export function normalizeRouterProvider(provider: string): string {
  return PROVIDER_ALIASES.get(provider) ?? provider;
}
