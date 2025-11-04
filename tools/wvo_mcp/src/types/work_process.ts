import type { CompiledPrompt, PromptInput } from '../prompt/compiler.js';
import type { PromptVariantsMode } from '../utils/config.js';

export type WorkPhase =
  | 'STRATEGIZE'
  | 'SPEC'
  | 'PLAN'
  | 'AFP_ALIGNMENT'
  | 'THINK'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'PR'
  | 'MONITOR';

export interface PhasePromptMetadata {
  compiled?: CompiledPrompt;
  input?: PromptInput;
  personaHash?: string;
  personaSummary?: string;
  contextSummary?: string;
  compilerEnabled?: boolean;
  failureReason?: string;
  promptHash?: string;
  variantId?: string;
}

export interface PhasePersonaMetadata {
  hash?: string;
  summary?: string;
  allowlist?: string[];
  spec?: Record<string, unknown>;
}

export interface PhaseAdvanceMetadata {
  prompt?: PhasePromptMetadata;
  persona?: PhasePersonaMetadata;
  variantMode?: PromptVariantsMode;
}
