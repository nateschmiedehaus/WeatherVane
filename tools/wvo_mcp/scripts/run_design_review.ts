#!/usr/bin/env node
/**
 * Automated Design Review Script
 *
 * Runs DesignReviewer critic on design.md and enforces iterative feedback.
 *
 * Usage:
 *   npx tsx scripts/run_design_review.ts <TASK-ID>
 *   npx tsx scripts/run_design_review.ts AFP-CACHE-FIX-20251105
 *
 * Process:
 * 1. Check if design.md exists
 * 2. Run DesignReviewer analysis
 * 3. If concerns found: Show remediation instructions and EXIT 1
 * 4. If approved: Show summary and EXIT 0
 *
 * Exit codes:
 *   0 = Design approved, can proceed to IMPLEMENT
 *   1 = Design needs revision, must remediate
 *   2 = Error (no design.md, invalid task ID, etc.)
 */

import fs from "node:fs";
import path from "node:path";
import { DesignReviewerCritic } from "../src/critics/design_reviewer.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function printHeader(text: string, color: string = CYAN): void {
  console.log(`\n${BOLD}${color}${"=".repeat(60)}${RESET}`);
  console.log(`${BOLD}${color}${text}${RESET}`);
  console.log(`${BOLD}${color}${"=".repeat(60)}${RESET}\n`);
}

function printError(text: string): void {
  console.error(`${RED}❌ ${text}${RESET}`);
}

function printSuccess(text: string): void {
  console.log(`${GREEN}✅ ${text}${RESET}`);
}

function printWarning(text: string): void {
  console.log(`${YELLOW}⚠️  ${text}${RESET}`);
}

async function main(): Promise<void> {
  const taskId = process.argv[2];

  if (!taskId) {
    printHeader("GATE DESIGN REVIEW", RED);
    printError("Missing task ID");
    console.log("\nUsage: npx tsx scripts/run_design_review.ts <TASK-ID>");
    console.log("Example: npx tsx scripts/run_design_review.ts AFP-CACHE-FIX-20251105");
    process.exit(2);
  }

  printHeader("GATE DESIGN REVIEW: " + taskId);

  // Check if design.md exists
  // Workspace root is 2 levels up from tools/wvo_mcp
  const workspaceRoot = path.resolve(process.cwd(), "../..");
  const designPath = path.join(
    workspaceRoot,
    "state/evidence",
    taskId,
    "design.md"
  );

  if (!fs.existsSync(designPath)) {
    printError(`No design.md found for task ${taskId}`);
    console.log(`\nExpected: ${designPath}`);
    console.log("\n📝 Create design documentation:");
    console.log(`   cp docs/templates/design_template.md state/evidence/${taskId}/design.md`);
    console.log("   # Fill in your AFP/SCAS thinking");
    console.log(`   git add state/evidence/${taskId}/design.md`);
    console.log("\nGATE requires design.md (NOT gate.md) with:");
    console.log("   • Via Negativa analysis (deletion/simplification)");
    console.log("   • Refactor vs Repair analysis");
    console.log("   • Alternatives exploration (2-3 approaches)");
    console.log("   • Complexity trade-offs");
    console.log("   • Implementation plan with scope estimates");
    process.exit(2);
  }

  printSuccess(`Found design.md at ${designPath}`);

  // Run DesignReviewer
  console.log("\n🔍 Running DesignReviewer analysis...\n");

  const reviewer = new DesignReviewerCritic(workspaceRoot);
  const result = await reviewer.reviewDesign(taskId);

  if (!result.passed) {
    printHeader("DESIGN NEEDS REVISION", RED);

    console.log(`${BOLD}Summary:${RESET} ${result.message}\n`);

    if (result.metadata?.concerns) {
      console.log(`${BOLD}Concerns Found:${RESET}`);
      for (const concern of result.metadata.concerns) {
        const severityColor =
          concern.severity === "high" ? RED :
          concern.severity === "medium" ? YELLOW :
          RESET;
        console.log(`\n  ${severityColor}[${concern.severity.toUpperCase()}] ${concern.type}${RESET}`);
        console.log(`  ${concern.guidance.split("\n").join("\n  ")}`);
      }
    }

    if (result.metadata?.remediation_instructions) {
      printHeader("REMEDIATION REQUIRED", YELLOW);
      console.log(result.metadata.remediation_instructions);
    }

    console.log(`\n${BOLD}Next Steps:${RESET}`);
    console.log("1. Create remediation task (new STRATEGIZE→MONITOR cycle)");
    console.log("2. Do actual research/exploration (30-60 min per critical issue)");
    console.log("3. Update UPSTREAM phase artifacts (strategy/spec/plan docs)");
    console.log("4. Update design.md with revised approach");
    console.log("5. Re-run: npx tsx scripts/run_design_review.ts " + taskId);
    console.log("\n⚠️  This is ITERATIVE - expect 2-3 rounds. That's NORMAL and GOOD.");

    process.exit(1);
  }

  // Approved!
  printHeader("DESIGN APPROVED", GREEN);

  console.log(`${BOLD}Summary:${RESET} ${result.message}\n`);

  if (result.metadata?.strengths) {
    console.log(`${BOLD}Strengths:${RESET}`);
    for (const strength of result.metadata.strengths) {
      console.log(`  ✓ ${strength}`);
    }
  }

  if (result.metadata?.concerns && result.metadata.concerns.length > 0) {
    console.log(`\n${BOLD}Minor Recommendations:${RESET}`);
    for (const concern of result.metadata.concerns) {
      console.log(`  • [${concern.severity}] ${concern.type}`);
    }
    console.log("\nThese are suggestions, not blockers. You may proceed.");
  }

  console.log(`\n${BOLD}${GREEN}✅ GATE APPROVED - You may proceed to IMPLEMENT${RESET}\n`);

  process.exit(0);
}

main().catch((error) => {
  console.error(`${RED}${BOLD}ERROR:${RESET} ${error.message}`);
  console.error(error.stack);
  process.exit(2);
});
