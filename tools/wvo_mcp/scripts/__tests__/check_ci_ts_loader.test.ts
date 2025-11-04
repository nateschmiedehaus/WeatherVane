import { describe, expect, it } from "vitest";

import { analyseWorkflow } from "../check_ci_ts_loader";

describe("check_ci_ts_loader", () => {
  it("returns no violations when all TypeScript commands use a loader", () => {
    const workflow = `
jobs:
  test:
    steps:
      - name: Delta note enforcement
        run: node --import tsx tools/wvo_mcp/scripts/check_delta_notes.ts
      - name: Quality graph precision
        run: |
          node --import tsx tools/wvo_mcp/scripts/check_quality_graph_precision.ts \\
            --workspace-root /tmp/root
      - name: Non TypeScript helper
        run: node scripts/run_helper.mjs
`;

    const violations = analyseWorkflow(workflow);
    expect(violations).toHaveLength(0);
  });

  it("flags commands that invoke TypeScript without a loader", () => {
    const workflow = `
jobs:
  test:
    steps:
      - name: Missing loader
        run: node tools/wvo_mcp/scripts/check_structural_policy.ts
`;

    const violations = analyseWorkflow(workflow);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      stepName: "Missing loader",
    });
  });

  it("handles multi-line run blocks when checking for loaders", () => {
    const workflow = `
jobs:
  test:
    steps:
      - name: Multi-line without loader
        run: |
          node \\
            tools/wvo_mcp/scripts/check_quality_graph.ts
`;

    const violations = analyseWorkflow(workflow);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      stepName: "Multi-line without loader",
    });
  });
});
