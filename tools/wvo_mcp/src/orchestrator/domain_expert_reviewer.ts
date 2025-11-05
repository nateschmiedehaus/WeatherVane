import { logInfo, logWarning } from "../telemetry/logger.js";

export interface ModelRouter {
  route(prompt: string, complexity: string): Promise<string>;
  getLastModelUsed(): string | undefined;
}

export interface DomainEvidencePayload {
  taskId: string;
  title: string;
  description: string;
  buildOutput: string;
  testOutput: string;
  changedFiles: string[];
  documentation: string[];
  runtimeEvidence?: Array<{ type: string; path: string } | { type: string; content?: string }>;
}

export interface DomainReviewSummary {
  domain: string;
  approved: boolean;
  concerns: string[];
  recommendations: string[];
}

export interface MultiDomainReview {
  consensusApproved: boolean;
  reasoning: string;
  reviews: DomainReviewSummary[];
  modelUsed: string;
}

export class DomainExpertReviewer {
  constructor(private readonly workspaceRoot: string, private readonly router: ModelRouter) {}

  async reviewTaskWithMultipleDomains(payload: DomainEvidencePayload): Promise<MultiDomainReview> {
    logInfo("DomainExpertReviewer invoked", {
      taskId: payload.taskId,
      changedFiles: payload.changedFiles.length,
      documentation: payload.documentation.length,
    });

    try {
      const prompt = this.buildPrompt(payload);
      const complexity = payload.changedFiles.length > 20 ? "complex" : "standard";
      const raw = await this.router.route(prompt, complexity);
      const parsed = this.safeParse(raw);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      logWarning("DomainExpertReviewer fallback", {
        taskId: payload.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.defaultReview(payload);
  }

  private buildPrompt(payload: DomainEvidencePayload): string {
    return `Review task ${payload.taskId} ("${payload.title}") with the following evidence:\n` +
      `Build: ${payload.buildOutput.slice(0, 500)}\n` +
      `Tests: ${payload.testOutput.slice(0, 500)}\n` +
      `Files: ${payload.changedFiles.join(", ")}\n` +
      `Docs: ${payload.documentation.join(", ")}\n`;
  }

  private safeParse(raw: string | undefined): MultiDomainReview | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<MultiDomainReview>;
      if (typeof parsed?.consensusApproved === "boolean" && Array.isArray(parsed.reviews)) {
        return {
          consensusApproved: parsed.consensusApproved,
          reasoning: parsed.reasoning ?? "Model response parsed",
          reviews: parsed.reviews as DomainReviewSummary[],
          modelUsed: parsed.modelUsed ?? this.router.getLastModelUsed() ?? "unknown",
        };
      }
    } catch {
      // ignore parse errors and fall back to default implementation
    }
    return null;
  }

  private defaultReview(payload: DomainEvidencePayload): MultiDomainReview {
    const reviews: DomainReviewSummary[] = [
      {
        domain: "architecture",
        approved: true,
        concerns: [],
        recommendations: ["Document architectural decisions if not already captured."],
      },
      {
        domain: "quality",
        approved: payload.testOutput.toLowerCase().includes("fail") ? false : true,
        concerns: payload.testOutput.toLowerCase().includes("fail")
          ? ["Test output indicates failures that must be addressed."]
          : [],
        recommendations: payload.testOutput.toLowerCase().includes("fail")
          ? ["Resolve failing tests and re-run verification."]
          : ["Maintain high coverage; verify edge-cases."],
      },
    ];

    const consensusApproved = reviews.every((review) => review.approved);

    return {
      consensusApproved,
      reasoning: consensusApproved
        ? "No blocking issues detected by default reviewer"
        : "Concerns detected that need remediation",
      reviews,
      modelUsed: this.router.getLastModelUsed() ?? "simulated-domain-expert",
    };
  }
}
