import { ProviderId, ProviderMetadata } from "./types.js";

const PROVIDER_DEFINITIONS: ProviderMetadata[] = [
  {
    id: "codex",
    label: "OpenAI Codex",
    family: "openai",
    defaultEnabled: true,
    staging: false,
    requiredEnv: ["OPENAI_API_KEY"],
    hourlyLimit: 100000,
    dailyLimit: 500000,
    capabilities: {
      largeContext: true,
      costTier: "medium",
    },
    models: [
      {
        id: "codex-5-high",
        label: "Codex 5 High",
        stage: "production",
        variant: "primary",
        contextTokens: 128000,
      },
      {
        id: "codex-5-medium",
        label: "Codex 5 Medium",
        stage: "production",
        variant: "primary",
        contextTokens: 128000,
      },
      {
        id: "codex-5-low",
        label: "Codex 5 Low",
        stage: "production",
        variant: "primary",
        contextTokens: 128000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Ensures OPENAI_API_KEY is set before attempting Codex calls.",
    },
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    family: "anthropic",
    defaultEnabled: true,
    staging: false,
    requiredEnv: ["ANTHROPIC_API_KEY"],
    hourlyLimit: 150000,
    dailyLimit: 750000,
    capabilities: {
      largeContext: true,
      costTier: "high",
    },
    models: [
      {
        id: "claude-sonnet-4.5",
        label: "Claude Sonnet 4.5",
        stage: "production",
        variant: "primary",
        contextTokens: 200000,
      },
      {
        id: "claude-haiku-4.5",
        label: "Claude Haiku 4.5",
        stage: "production",
        variant: "light",
        contextTokens: 200000,
      },
      {
        id: "claude-opus-4.1",
        label: "Claude Opus 4.1",
        stage: "production",
        variant: "primary",
        contextTokens: 200000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Ensures ANTHROPIC_API_KEY is set before attempting Claude calls.",
    },
  },
];

export type ProviderRegistry = Record<ProviderId, ProviderMetadata>;

export const providerRegistry: ProviderRegistry = Object.fromEntries(
  PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]),
) as ProviderRegistry;

export type KnownProvider = keyof typeof providerRegistry;

const PROVIDER_ALIAS_TO_ID = {
  claude_code: "claude",
} as const;

const PROVIDER_ID_TO_ALIAS = Object.entries(PROVIDER_ALIAS_TO_ID).reduce<Record<string, string>>(
  (acc, [alias, id]) => {
    acc[id] = alias;
    return acc;
  },
  {}
);

export type ProviderAlias = ProviderId | keyof typeof PROVIDER_ALIAS_TO_ID;

export function getProviderMetadata(id: ProviderId): ProviderMetadata | undefined {
  return providerRegistry[id];
}

export function isProviderEnabled(metadata: ProviderMetadata): boolean {
  if (metadata.defaultEnabled) {
    return true;
  }
  if (metadata.enableEnv) {
    return process.env[metadata.enableEnv] === "1";
  }
  return false;
}

export function getEnabledProviders(): ProviderId[] {
  return PROVIDER_DEFINITIONS.filter(isProviderEnabled).map((provider) => provider.id);
}

export function listProviders(options?: { includeStaging?: boolean }): ProviderMetadata[] {
  const includeStaging = options?.includeStaging ?? false;
  return PROVIDER_DEFINITIONS.filter((provider) => {
    if (provider.staging && !includeStaging) {
      return false;
    }
    return true;
  });
}

export function normalizeProviderId(id: ProviderAlias): ProviderId {
  const key = id as keyof typeof PROVIDER_ALIAS_TO_ID;
  if (key in PROVIDER_ALIAS_TO_ID) {
    return PROVIDER_ALIAS_TO_ID[key];
  }
  return id as ProviderId;
}

export function displayProviderId(id: ProviderId): ProviderAlias {
  return (PROVIDER_ID_TO_ALIAS[id] ?? id) as ProviderAlias;
}
