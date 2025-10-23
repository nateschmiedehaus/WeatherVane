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
        id: "gpt-5-codex",
        label: "GPT-5 Codex (default)",
        stage: "production",
        variant: "primary",
        contextTokens: 200000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Ensures OPENAI_API_KEY is set before attempting Codex calls.",
    },
  },
  {
    id: "claude_code",
    label: "Claude Code (auto)",
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
        id: "claude-3.5-sonnet",
        label: "Claude 3.5 Sonnet (Code)",
        stage: "production",
        variant: "primary",
        contextTokens: 200000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Ensures ANTHROPIC_API_KEY is set before attempting Claude Code calls.",
    },
  },
  {
    id: "claude_opus",
    label: "Claude Code Opus",
    family: "anthropic",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_CLAUDE_OPUS",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    hourlyLimit: 120000,
    dailyLimit: 600000,
    capabilities: {
      largeContext: true,
      costTier: "high",
    },
    models: [
      {
        id: "claude-3-opus",
        label: "Claude 3 Opus",
        stage: "preview",
        variant: "primary",
        contextTokens: 200000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires ANTHROPIC_API_KEY; toggle via WVO_ENABLE_PROVIDER_CLAUDE_OPUS=1.",
    },
  },
  {
    id: "claude_sonnet",
    label: "Claude Code Sonnet",
    family: "anthropic",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_CLAUDE_SONNET",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    hourlyLimit: 150000,
    dailyLimit: 750000,
    capabilities: {
      largeContext: true,
      costTier: "high",
    },
    models: [
      {
        id: "claude-3.5-sonnet",
        label: "Claude 3.5 Sonnet",
        stage: "production",
        variant: "primary",
        contextTokens: 200000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires ANTHROPIC_API_KEY; toggle via WVO_ENABLE_PROVIDER_CLAUDE_SONNET=1.",
    },
  },
  {
    id: "claude_haiku",
    label: "Claude Code Haiku",
    family: "anthropic",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_CLAUDE_HAIKU",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    hourlyLimit: 200000,
    dailyLimit: 900000,
    capabilities: {
      largeContext: false,
      costTier: "medium",
    },
    models: [
      {
        id: "claude-3-haiku",
        label: "Claude 3 Haiku",
        stage: "production",
        variant: "light",
        contextTokens: 65000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires ANTHROPIC_API_KEY; toggle via WVO_ENABLE_PROVIDER_CLAUDE_HAIKU=1.",
    },
  },
  {
    id: "glm_latest",
    label: "GLM (latest)",
    family: "glm",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_GLM",
    requiredEnv: ["GLM_API_KEY"],
    hourlyLimit: 100000,
    dailyLimit: 400000,
    capabilities: {
      largeContext: true,
      costTier: "medium",
    },
    models: [
      {
        id: "glm-4-plus-latest",
        label: "GLM-4 Plus (latest)",
        stage: "preview",
        variant: "primary",
        contextTokens: 128000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires GLM_API_KEY; toggle via WVO_ENABLE_PROVIDER_GLM=1.",
    },
  },
  {
    id: "gemini_pro",
    label: "Gemini Pro",
    family: "google",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_GEMINI_PRO",
    requiredEnv: ["GEMINI_API_KEY"],
    hourlyLimit: 120000,
    dailyLimit: 500000,
    capabilities: {
      largeContext: true,
      costTier: "low",
    },
    models: [
      {
        id: "gemini-1.5-pro-latest",
        label: "Gemini 1.5 Pro (latest)",
        stage: "preview",
        variant: "primary",
        contextTokens: 1000000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires GEMINI_API_KEY; toggle via WVO_ENABLE_PROVIDER_GEMINI_PRO=1.",
    },
  },
  {
    id: "gemini_flash",
    label: "Gemini Flash",
    family: "google",
    defaultEnabled: false,
    staging: true,
    enableEnv: "WVO_ENABLE_PROVIDER_GEMINI_FLASH",
    requiredEnv: ["GEMINI_API_KEY"],
    hourlyLimit: 150000,
    dailyLimit: 600000,
    capabilities: {
      largeContext: false,
      costTier: "low",
    },
    models: [
      {
        id: "gemini-1.5-flash-latest",
        label: "Gemini 1.5 Flash (latest)",
        stage: "preview",
        variant: "light",
        contextTokens: 128000,
      },
    ],
    smokeTest: {
      type: "env",
      description: "Requires GEMINI_API_KEY; toggle via WVO_ENABLE_PROVIDER_GEMINI_FLASH=1.",
    },
  },
];

export type ProviderRegistry = Record<ProviderId, ProviderMetadata>;

export const providerRegistry: ProviderRegistry = Object.fromEntries(
  PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]),
) as ProviderRegistry;

export type KnownProvider = keyof typeof providerRegistry;

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
