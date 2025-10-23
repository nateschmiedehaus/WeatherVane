export type ProviderStage = "production" | "preview" | "staging";

export interface ProviderModel {
  id: string;
  label: string;
  stage: ProviderStage;
  variant?: "primary" | "light" | "fallback";
  contextTokens?: number;
}

export interface ProviderMetadata {
  id: string;
  label: string;
  family: "openai" | "anthropic" | "google" | "glm";
  defaultEnabled: boolean;
  staging: boolean;
  enableEnv?: string;
  requiredEnv?: string[];
  hourlyLimit?: number;
  dailyLimit?: number;
  capabilities?: {
    largeContext?: boolean;
    costTier?: "low" | "medium" | "high";
  };
  models: ProviderModel[];
  smokeTest?: {
    type: "env" | "command";
    command?: string[];
    description?: string;
  };
}

export type ProviderId = string;
