import type { Task } from "../state_machine.js";
import type { AssembledContext } from "../context_assembler.js";

export type ConsensusDecisionType = "critical" | "strategic" | "specialist";

export interface ConsensusAgenda {
  decisionType: ConsensusDecisionType;
  rationale: string[];
  participants: string[];
}

export interface AgendaOptions {
  forcedType?: ConsensusDecisionType;
}

function extractMetadata(task: Task): Record<string, unknown> {
  const metadata = task.metadata as Record<string, unknown> | undefined;
  return metadata ?? {};
}

export function buildConsensusAgenda(
  task: Task,
  context: AssembledContext,
  options: AgendaOptions = {},
): ConsensusAgenda {
  const metadata = extractMetadata(task);
  const rationale: string[] = [];

  let decisionType: ConsensusDecisionType = "strategic";
  if (options.forcedType) {
    decisionType = options.forcedType;
    rationale.push(`forced:${options.forcedType}`);
  } else if (typeof metadata.decision_type === "string") {
    const normalised = metadata.decision_type.toLowerCase();
    if (normalised === "critical" || normalised === "strategic" || normalised === "specialist") {
      decisionType = normalised;
      rationale.push(`metadata:${normalised}`);
    }
  }

  if (!options.forcedType && rationale.length === 0) {
    if (typeof task.estimated_complexity === "number" && task.estimated_complexity >= 7) {
      decisionType = "critical";
      rationale.push("complexity>=7");
    } else if (context.relevantConstraints.length > 3) {
      decisionType = "critical";
      rationale.push("constraints>=4");
    } else if (task.status === "needs_review" || task.status === "needs_improvement") {
      decisionType = "strategic";
      rationale.push(`status:${task.status}`);
    } else {
      decisionType = "specialist";
      rationale.push("default:specialist");
    }
  }

  const participants = new Set<string>(["atlas", "claude_council"]);
  if (decisionType === "critical") {
    participants.add("director_dana");
  }
  if (context.researchHighlights && context.researchHighlights.length > 0) {
    participants.add("research_orchestrator");
  }
  if (metadata.delegate_agent && typeof metadata.delegate_agent === "string") {
    participants.add(String(metadata.delegate_agent).toLowerCase());
  }

  return {
    decisionType,
    rationale,
    participants: Array.from(participants),
  };
}
