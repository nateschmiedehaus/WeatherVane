import { DocumentReviewerCritic } from "./document_reviewer.js";

const PLAN_CONFIG = {
  artifact: "plan" as const,
  fileName: "plan.md",
  logFile: "plan_reviews.jsonl",
  requiredSections: ["## Work Plan", "## Milestones", "## Risks", "## Verification Strategy"],
  summaryTitle: "PlanReviewer",
};

export class PlanReviewerCritic extends DocumentReviewerCritic {
  constructor(workspaceRoot: string) {
    super(workspaceRoot, PLAN_CONFIG);
  }
}
