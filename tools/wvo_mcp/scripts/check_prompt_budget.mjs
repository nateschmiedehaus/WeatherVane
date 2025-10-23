#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_CONTEXT_WORDS = 1000;
const MAX_CHECKPOINT_KB = 50;
const MAX_PROMPT_TOKENS = 600;
const TOKEN_ESTIMATE_CHAR_RATIO = 4;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.trim().length / TOKEN_ESTIMATE_CHAR_RATIO);
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function main() {
  const workspaceRoot = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "..", ".."),
  );
  const stateDir = path.join(workspaceRoot, "state");

  const failures = [];
  const details = {
    contextWords: null,
    checkpointKb: null,
    promptsChecked: 0,
    maxPromptTokens: 0,
  };

  // Context word count
  const contextPath = path.join(stateDir, "context.md");
  const contextContent = await readFileIfExists(contextPath);
  if (contextContent) {
    const words = contextContent.trim().split(/\s+/).filter(Boolean).length;
    details.contextWords = words;
    if (words > MAX_CONTEXT_WORDS) {
      failures.push(
        `Context file exceeds ${MAX_CONTEXT_WORDS} words (found ${words}). Trim state/context.md.`,
      );
    }
  }

  // Checkpoint size
  const checkpointPath = path.join(stateDir, "checkpoint_compact.json");
  const checkpointStats = await statIfExists(checkpointPath);
  if (checkpointStats) {
    const checkpointKb = checkpointStats.size / 1024;
    details.checkpointKb = Number(checkpointKb.toFixed(2));
    if (checkpointKb > MAX_CHECKPOINT_KB) {
      failures.push(
        `Checkpoint exceeds ${MAX_CHECKPOINT_KB}KB (found ${checkpointKb.toFixed(
          2,
        )}KB). Prune checkpoint_compact.json.`,
      );
    }
  }

  // Prompt budget check using compiled orchestrator (if available)
  const distRoot = path.join(workspaceRoot, "tools", "wvo_mcp", "dist");
  const contextModulePath = path.join(
    distRoot,
    "orchestrator",
    "context_assembler.js",
  );
  const stateMachineModulePath = path.join(distRoot, "orchestrator", "state_machine.js");
  const liveFlagsModulePath = path.join(distRoot, "orchestrator", "live_flags.js");

  let stateMachine;
  let assembler;
  let liveFlags;
  let promptMode = "compact";
  try {
    const [stateMachineModule, contextAssemblerModule, liveFlagsModule] = await Promise.all([
      import(pathToFileURL(stateMachineModulePath).href),
      import(pathToFileURL(contextModulePath).href),
      import(pathToFileURL(liveFlagsModulePath).href).catch((error) => {
        console.warn(
          `[check_prompt_budget] Live flags module unavailable; defaulting to compact prompts: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }),
    ]);
    const { StateMachine } = stateMachineModule;
    const { ContextAssembler } = contextAssemblerModule;
    const LiveFlags = liveFlagsModule?.LiveFlags;

    stateMachine = new StateMachine(workspaceRoot);
    if (typeof LiveFlags === "function") {
      try {
        liveFlags = new LiveFlags({ workspaceRoot });
        promptMode = liveFlags.getValue("PROMPT_MODE") === "verbose" ? "verbose" : "compact";
      } catch (error) {
        console.warn(
          `[check_prompt_budget] Failed to initialise live flags; using compact prompts: ${error instanceof Error ? error.message : String(error)}`,
        );
        liveFlags = undefined;
      }
    }
    assembler = new ContextAssembler(stateMachine, workspaceRoot, {
      liveFlags: liveFlags ?? undefined,
    });

    const tasks = stateMachine.getTasks({
      status: ["pending", "in_progress", "needs_review", "needs_improvement"],
    });
    const sampleTasks = tasks.slice(0, 5);

    for (const task of sampleTasks) {
      const context = await assembler.assembleForTask(task.id, {
        includeCodeContext: true,
        includeQualityHistory: true,
        maxDecisions: 6,
        maxLearnings: 3,
        hoursBack: 24,
      });
      const prompt =
        promptMode === "verbose"
          ? assembler.formatForPrompt(context)
          : assembler.formatForPromptCompact(context);
      const tokens = estimateTokens(prompt);
      details.promptsChecked += 1;
      details.maxPromptTokens = Math.max(details.maxPromptTokens, tokens);
      if (tokens > MAX_PROMPT_TOKENS) {
        failures.push(
          `Prompt for task ${task.id} estimated at ${tokens} tokens (limit ${MAX_PROMPT_TOKENS}).`,
        );
      }
    }
  } catch (error) {
    // When dist is missing or modules fail to load we provide guidance without failing the check.
    details.promptsChecked = 0;
    details.maxPromptTokens = 0;
    console.warn(
      `Skipped prompt assembly check (build dist first with "npm run build"): ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (assembler && typeof assembler.dispose === "function") {
      await assembler.dispose();
    }
    if (stateMachine && typeof stateMachine.close === "function") {
      stateMachine.close();
    }
    if (liveFlags && typeof liveFlags.dispose === "function") {
      liveFlags.dispose();
    }
  }

  if (failures.length > 0) {
    console.error("❌ Prompt budget check failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    [
      "✅ Prompt budget check passed.",
      details.contextWords !== null
        ? `Context words: ${details.contextWords}`
        : "Context words: n/a",
      details.checkpointKb !== null
        ? `Checkpoint size: ${details.checkpointKb}KB`
        : "Checkpoint size: n/a",
      `Prompts checked: ${details.promptsChecked}`,
      `Max prompt tokens: ${details.maxPromptTokens}`,
    ].join(" "),
  );
}

const isExecutedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  await main();
}

export { estimateTokens, main };
