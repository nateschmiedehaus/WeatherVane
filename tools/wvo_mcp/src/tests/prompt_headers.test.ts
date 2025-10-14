import { describe, expect, it } from "vitest";

import {
  type PromptHeaderContext,
  standardPromptHeader,
} from "../utils/prompt_headers.js";
import { SERVER_NAME, SERVER_VERSION } from "../utils/version.js";

const BASE_CONTEXT: PromptHeaderContext = {
  projectName: "WeatherVane",
  projectPhase: "PHASE-5",
  environment: "production",
  promptMode: "compact",
  agentType: "codex",
  agentRole: "executor",
  intent: "execute",
};

describe("standardPromptHeader", () => {
  it("produces deterministic output for identical context payloads", () => {
    const first = standardPromptHeader(BASE_CONTEXT);
    const cloned: PromptHeaderContext = { ...BASE_CONTEXT };
    const second = standardPromptHeader(cloned);

    expect(second).toBe(first);
  });

  it("normalises whitespace and fills unspecified fields deterministically", () => {
    const noisyContext: PromptHeaderContext = {
      ...BASE_CONTEXT,
      projectName: "  WeatherVane   ",
      projectPhase: "   ",
      environment: "   ",
      agentType: "  CLAUDE_CODE  ",
      agentRole: "  Senior Builder  ",
    };

    const header = standardPromptHeader(noisyContext);

    expect(header).toContain("Project: WeatherVane");
    expect(header).toContain("Phase: unspecified");
    expect(header).toContain("Environment: unspecified");
    expect(header).toContain("Agent Lane: Claude Code • Senior Builder");
  });

  it("includes guardrails and delivery sections exactly once without volatile fields", () => {
    const header = standardPromptHeader(BASE_CONTEXT);

    expect(header).toContain(`# ${SERVER_NAME} v${SERVER_VERSION}`);
    const guardrailSectionCount = header.match(/## System Guardrails/g)?.length ?? 0;
    const deliverySectionCount = header.match(/## Delivery Expectations/g)?.length ?? 0;
    expect(guardrailSectionCount).toBe(1);
    expect(deliverySectionCount).toBe(1);
    expect(header).not.toMatch(/Timestamp:/i);
    expect(header).not.toMatch(/Correlation:/i);
  });
});
