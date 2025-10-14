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

export declare function formatDuration(ms: number): string;
export declare function parseOperationsLines(lines: string[]): FailoverSample[];
export declare function analyzeFailoverSamples(
  samples: FailoverSample[],
  now?: number
): FailoverAnalysis;
export declare function evaluateFailoverGuardrail(
  analysis: FailoverAnalysis
): GuardrailResult;
export declare function runGuardrailCheck(
  workspaceRoot: string,
  options?: { now?: number; maxLines?: number }
): Promise<GuardrailResult>;
