/**
 * Helpers for mapping WeatherVane Codex presets to current Codex CLI options.
 *
 * The Codex CLI now expects the base model identifier (e.g. `codex-5`)
 * and uses config overrides for reasoning level selection instead of the
 * legacy tiered model names. This module converts the historical preset
 * strings (`codex-5-medium`, `codex-5-high`, etc.) into the new
 * CLI arguments so existing orchestration code can continue to operate
 * without invasive changes.
 */

export type CodexReasoningLevel = 'minimal' | 'low' | 'medium' | 'high' | 'auto';

export interface CodexCliOptions {
  /**
   * Model identifier to pass via `--model`. Undefined means rely on the
   * configured default in the Codex profile.
   */
  model?: string;
  /**
   * Additional `-c key=value` overrides that should be appended to the CLI
   * invocation (e.g. `reasoning="medium"`).
   */
  configOverrides: string[];
}

const CODEX_PRESET_PATTERN = /^codex-5-(minimal|low|medium|high)$/;
const GPT5_PRESET_PATTERN = /^gpt-5-(minimal|low|medium|high)$/;

const ALLOWED_REASONING: Record<string, Exclude<CodexReasoningLevel, 'auto'>> = {
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/**
 * Resolve the CLI arguments needed for a requested Codex model.
 *
 * @param modelPreset Historical or display model identifier (e.g. `codex-5-high`)
 * @param requestedReasoning Optional reasoning level hint
 */
export function resolveCodexCliOptions(
  modelPreset?: string,
  requestedReasoning?: CodexReasoningLevel
): CodexCliOptions {
  let resolvedModel = modelPreset;
  const configOverrides: string[] = [];
  let reasoningApplied = false;

  const applyReasoning = (level?: CodexReasoningLevel | string) => {
    if (!level || level === 'auto' || reasoningApplied) {
      return;
    }
    const normalized = ALLOWED_REASONING[level];
    if (!normalized) {
      return;
    }
    configOverrides.push(`model_reasoning_effort="${normalized}"`);
    reasoningApplied = true;
  };

  if (modelPreset) {
    const codexTier = CODEX_PRESET_PATTERN.exec(modelPreset);
    if (codexTier) {
      resolvedModel = 'codex-5';
      applyReasoning(codexTier[1]);
    } else {
      const generalTier = GPT5_PRESET_PATTERN.exec(modelPreset);
      if (generalTier) {
        throw new Error('router_lock violation: gpt-5 presets are not allowed');
      }
      // Unknown model string; trust caller but still honour requested reasoning.
      applyReasoning(requestedReasoning);
    }
  } else {
    // No model provided; rely on profile default but still allow reasoning hint.
    applyReasoning(requestedReasoning);
  }

  if (!reasoningApplied) {
    applyReasoning(requestedReasoning);
  }

  return {
    model: resolvedModel,
    configOverrides,
  };
}
