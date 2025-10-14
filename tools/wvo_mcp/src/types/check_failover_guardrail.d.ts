declare module "../../scripts/check_failover_guardrail.mjs" {
  export type FailoverSample = {
    timestamp: number;
    type: "claude_code" | "codex";
    available: boolean;
    reason?: string;
  };

  export interface FailoverAnalysis {
    samples: FailoverSample[];
    totalMs: number;
    codexMs: number;
    claudeUnavailableMs: number;
    codexShare: number;
    longestCodexRunMs: number;
    lastSampleAgeMs: number;
  }

  export interface GuardrailResult {
    ok: boolean;
    messages: string[];
    analysis: FailoverAnalysis;
  }

  export function formatDuration(ms: number): string;
  export function parseOperationsLines(lines: string[]): FailoverSample[];
  export function analyzeFailoverSamples(
    samples: FailoverSample[],
    now?: number
  ): FailoverAnalysis;
  export function evaluateFailoverGuardrail(analysis: FailoverAnalysis): GuardrailResult;
  export function runGuardrailCheck(
    workspaceRoot: string,
    options?: { now?: number; maxLines?: number }
  ): Promise<GuardrailResult>;
}
