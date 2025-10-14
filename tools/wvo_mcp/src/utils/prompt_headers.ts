import { SERVER_NAME, SERVER_VERSION } from './version.js';

export type PromptIntent = 'execute' | 'review' | 'remediation';

export interface PromptHeaderContext {
  projectName: string;
  projectPhase: string;
  environment: string;
  promptMode: 'compact' | 'verbose';
  agentType: string;
  agentRole: string;
  intent: PromptIntent;
}

const INTENT_LABELS: Record<PromptIntent, string> = {
  execute: 'Implementation',
  review: 'Review',
  remediation: 'Remediation',
};

const AGENT_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude_code: 'Claude Code',
};

function normalise(value: string | null | undefined): string {
  if (value == null) {
    return 'unspecified';
  }
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact || 'unspecified';
}

function canonicalAgentLabel(agentType: string): string {
  const typeKey = normalise(agentType).toLowerCase();
  if (typeKey === 'unspecified') {
    return 'unspecified';
  }
  return AGENT_LABELS[typeKey] ?? normalise(agentType);
}

export function standardPromptHeader(ctx: PromptHeaderContext): string {
  const agentLabel = canonicalAgentLabel(ctx.agentType);
  const intentLabel = INTENT_LABELS[ctx.intent];
  const promptMode = ctx.promptMode === 'verbose' ? 'verbose' : 'compact';

  const headerLines = [
    `# ${SERVER_NAME} v${SERVER_VERSION}`,
    `Project: ${normalise(ctx.projectName)}`,
    `Phase: ${normalise(ctx.projectPhase)}`,
    `Environment: ${normalise(ctx.environment)}`,
    `Prompt Mode: ${promptMode}`,
    `Agent Lane: ${agentLabel} • ${normalise(ctx.agentRole)}`,
    `Intent: ${intentLabel}`,
  ];

  const guardrails = [
    '- Follow instruction priority: system > developer > user > docs.',
    '- Use MCP tools only; avoid unmanaged shell sessions.',
    '- Keep changes scoped and deterministic; match existing conventions.',
    '- Add or update tests when behaviour changes; document rationale when needed.',
    '- Never store secrets or credentials in the repository.',
  ];

  const delivery = [
    '- Prefer project tooling (e.g. make lint, make test) to verify changes.',
    '- Maintain ASCII output and unified diffs for code edits.',
    '- Keep prompts cache-friendly: avoid timestamps, randomness, or volatile data in headers.',
    '- Final reply must satisfy the codex_output_schema JSON contract.',
  ];

  return [
    headerLines.join('\n'),
    '',
    '## System Guardrails',
    guardrails.join('\n'),
    '',
    '## Delivery Expectations',
    delivery.join('\n'),
  ].join('\n');
}
