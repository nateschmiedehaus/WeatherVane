import { DocumentReviewerCritic } from "./document_reviewer.js";

const SPEC_CONFIG = {
  artifact: "spec" as const,
  fileName: "spec.md",
  logFile: "spec_reviews.jsonl",
  requiredSections: ["## Requirements", "## Non-Functional Requirements", "## Success Criteria"],
  summaryTitle: "SpecReviewer",
};

export class SpecReviewerCritic extends DocumentReviewerCritic {
  constructor(workspaceRoot: string) {
    super(workspaceRoot, SPEC_CONFIG);
  }
}
