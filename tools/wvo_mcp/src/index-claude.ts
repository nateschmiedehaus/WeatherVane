import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { describeClaudeCodeCommands } from "./executor/claude_code_commands.js";
import { RoadmapAutoExtender } from "./planner/roadmap_auto_extend.js";
import { QualityFramework } from "./quality/quality_framework.js";
import { SessionContext } from "./session.js";
import { ContextManager } from "./state/context_manager.js";
import { logError, logInfo, logWarning } from "./telemetry/logger.js";
import { initTracing } from "./telemetry/tracing.js";
import { AuthChecker } from "./utils/auth_checker.js";
import { ProviderManager, type Provider } from "./utils/provider_manager.js";
import { formatData, formatError, formatList, formatSuccess } from "./utils/response_formatter.js";
import { ScreenshotCapture } from "./utils/screenshot.js";
import { ScreenshotManager } from "./utils/screenshot_manager.js";
import { OrchestratorRuntime } from "./orchestrator/orchestrator_runtime.js";
import { resolveWorkspaceRoot } from "./utils/config.js";
import { SERVER_NAME, SERVER_VERSION } from "./utils/version.js";
import { toJsonSchema } from "./utils/schema.js";
import { buildClusterSummaries } from "./utils/cluster.js";
import { LiveFlags } from "./orchestrator/live_flags.js";
import {
  lspDefinitionInput,
  lspReferencesInput,
  lspHoverInput,
  lspServerStatusInput,
  lspInitializeInput,
  type LspDefinitionInput,
  type LspReferencesInput,
  type LspHoverInput,
  type LspServerStatusInput,
  type LspInitializeInput,
} from "./tools/input_schemas.js";

let activeRuntime: OrchestratorRuntime | null = null;

async function main() {
  const workspaceRoot = resolveWorkspaceRoot();
  const liveFlags = new LiveFlags({ workspaceRoot });
  const otelFlag = liveFlags.getValue("OTEL_ENABLED");
  const explicitOtel = process.env.WVO_OTEL_ENABLED === "1";
  const tracingEnabled =
    explicitOtel || (otelFlag === "1" && process.env.WVO_DRY_RUN !== "1");
  const sampleRatioEnv = process.env.WVO_OTEL_SAMPLE_RATIO;
  const sampleRatio =
    sampleRatioEnv && Number.isFinite(Number.parseFloat(sampleRatioEnv))
      ? Number.parseFloat(sampleRatioEnv)
      : undefined;
  initTracing({
    workspaceRoot,
    enabled: tracingEnabled,
    sampleRatio,
  });

  const runtime = new OrchestratorRuntime(workspaceRoot, {
    codexWorkers: 3,
    targetCodexRatio: 5,
  });
  // NOTE: Don't start runtime for Claude Code MCP - let it be passive and tool-driven
  // runtime.start();
  activeRuntime = runtime;

  const session = new SessionContext(runtime);
  const authChecker = new AuthChecker();
  const defaultProvider: Provider = process.env.WVO_DEFAULT_PROVIDER === "codex" ? "codex" : "claude_code";
  const providerManager = new ProviderManager(defaultProvider);
  const roadmapExtender = new RoadmapAutoExtender();
  const contextManager = new ContextManager(session.workspaceRoot);
  const qualityFramework = new QualityFramework();
  const screenshotCapture = new ScreenshotCapture();
  const screenshotManager = new ScreenshotManager(session.workspaceRoot);
  const emptyObjectSchema = toJsonSchema(z.object({}), "EmptyObject");

  const shutdown = () => {
    logInfo("Shutting down MCP server gracefully");
    runtime.stop();
    activeRuntime = null;
    process.exit(0);
  };

  // Enhanced signal handling with cleanup
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  // Handle uncaught exceptions to prevent crashes
  process.on("uncaughtException", (err) => {
    logError("Uncaught exception in MCP server", { error: String(err), stack: err.stack });
    // Don't exit on uncaught exception - log and continue
  });

  process.on("unhandledRejection", (reason, promise) => {
    logError("Unhandled promise rejection in MCP server", { reason: String(reason) });
    // Don't exit on unhandled rejection - log and continue
  });

  logInfo("WVO MCP server (Claude Code) booting", {
    workspace: session.workspaceRoot,
    profile: session.profile,
  });

  // Skip authentication check for Claude Code MCP to avoid deadlock
  // (Claude is already running the server, can't check Claude auth)
  const authStatus = {
    codex: { authenticated: false, error: "Auth check deferred for MCP mode" },
    claude_code: { authenticated: true, user: "claude_mcp_host" },
  };

  logInfo("Claude Code MCP mode - auth checks deferred");

  // Configure provider manager based on available auth
  const preferredProvider: Provider | null = (() => {
    if (defaultProvider === "codex" && authStatus.codex.authenticated) {
      return "codex";
    }
    if (defaultProvider === "claude_code" && authStatus.claude_code.authenticated) {
      return "claude_code";
    }
    if (authStatus.claude_code.authenticated) {
      return "claude_code";
    }
    if (authStatus.codex.authenticated) {
      return "codex";
    }
    return null;
  })();

  if (preferredProvider) {
    const reason = preferredProvider === defaultProvider ? "env_default" : "authenticated";
    providerManager.switchProvider(preferredProvider, reason);
  }

  // Skip checkpoint loading during boot for fast startup
  // Checkpoints will be loaded lazily when tools are called
  logInfo("WVO MCP server ready (lazy initialization mode)");

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {},
    },
  );

  const planNextInput = z.object({
    limit: z.number().int().positive().max(20).optional().default(5),
    filters: z
      .object({
        status: z.array(z.enum(["pending", "in_progress", "blocked", "done"])).optional(),
        epic_id: z.string().optional(),
        milestone_id: z.string().optional(),
        domain: z.enum(["product", "mcp"]).optional(),
      })
      .optional(),
    minimal: z.boolean().optional().describe("Return only id, title, status (saves ~70% tokens)"),
  });
  const planNextSchema = toJsonSchema(planNextInput, "PlanNextInput");

  const jsonResponse = (payload: unknown) => ({
    content: [
      {
        type: "text" as const,
        // Compact JSON for token efficiency (was pretty-printed with null, 2)
        text: JSON.stringify(payload),
      },
    ],
  });

  // Welcome/Status tool for onboarding
  server.registerTool(
    "wvo_status",
    {
      description: `Get WeatherVane Orchestrator status and available capabilities.

This tool provides:
- Current workspace and profile information
- Available tools overview
- Quick start guidance
- System health check
- Last session summary

Use this tool first to understand what's available and get oriented.`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const tools = [
        "📋 plan_next - Get your next tasks",
        "✅ plan_update - Update task status",
        "📝 context_write - Update context",
        "💾 state_save - Save compact checkpoint",
        "📊 state_metrics - Check state size",
        "🧹 state_prune - Clean old data",
        "✨ quality_standards - View excellence criteria",
        "🎯 quality_checklist - Get quality checklist for task",
        "🔍 quality_philosophy - World-class standards",
        "📂 fs_read/fs_write - File operations",
        "⚡ cmd_run - Execute commands",
        "🔍 critics_run - Run quality checks",
        "🤖 autopilot tools - Automated QA",
        "⏳ heavy_queue tools - Background tasks",
        "🧠 lsp_initialize - Boot TypeScript/Python language servers",
        "📡 lsp_server_status - Inspect LSP server health",
        "🔎 lsp_definition - Jump to symbol definitions",
        "📚 lsp_references - List usages across the codebase",
        "📝 lsp_hover - Show symbol types and docs",
        "🔄 provider_status - Check provider capacity",
      ];

      const summary = await contextManager.getQuickSummary();

      return formatData({
        workspace: session.workspaceRoot,
        profile: session.profile,
        status: "✅ Ready",
        last_session: summary,
        available_tools: tools,
        quick_start: "Try: plan_next to see your roadmap tasks",
        provider_info: providerManager.getStatus(),
      }, "🚀 WeatherVane Orchestrator Status");
    },
  );

  // State management tools
  server.registerTool(
    "state_save",
    {
      description: `💾 Save a compact checkpoint for session persistence.

Creates a lightweight checkpoint (<50KB) with:
- Roadmap summary (not full dump)
- Recent activity
- Provider state
- Key decisions (last 3-5 only)

This checkpoint persists across:
- New chat sessions
- Different models
- Server restarts

Parameters: none

Perfect for: Session boundaries, before long operations, periodic saves
Note: Automatically called after significant operations`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      try {
        // Get current state summaries
        const allTasks = await session.planNext({ limit: 1000 });
        const roadmapSummary = {
          total_tasks: allTasks.length,
          completed_tasks: allTasks.filter((t: any) => t.status === "done").length,
          in_progress_tasks: allTasks.filter((t: any) => t.status === "in_progress").length,
          pending_tasks: allTasks.filter((t: any) => t.status === "pending").length,
          completion_percentage: allTasks.length > 0 ? (allTasks.filter((t: any) => t.status === "done").length / allTasks.length) * 100 : 0,
          current_phase: roadmapExtender.determineProjectPhase(allTasks),
          next_tasks: allTasks.filter((t: any) => t.status === "pending").slice(0, 3).map((t: any) => t.id || "unknown"),
        };

        const providerStatus = providerManager.getStatus();
        const getPercentUsed = (providerKey: Provider): number => {
          const providerInfo = providerStatus.providers.find((entry) => entry.provider === providerKey);
          if (!providerInfo) {
            return 0;
          }
          const rawValue = providerInfo.percentUsed;
          if (typeof rawValue === "number") {
            return Number.isFinite(rawValue) ? rawValue : 0;
          }
          if (typeof rawValue === "string") {
            const parsed = parseFloat(rawValue);
            return Number.isFinite(parsed) ? parsed : 0;
          }
          return 0;
        };

        const providerState = {
          current_provider: providerStatus.currentProvider,
          token_usage_summary: {
            codex_percent_used: getPercentUsed("codex"),
            claude_code_percent_used: getPercentUsed("claude_code"),
          },
        };

        await contextManager.saveCompactCheckpoint({
          roadmap_summary: roadmapSummary,
          provider_state: providerState,
          continuation_hint: `Resume work: ${roadmapSummary.pending_tasks} pending tasks in ${roadmapSummary.current_phase} phase`,
        });

        return formatSuccess("Compact checkpoint saved", {
          size: "< 50KB",
          completion: roadmapSummary.completion_percentage.toFixed(0) + "%",
          persists_across: ["new chats", "different models", "restarts"],
        });
      } catch (error) {
        return formatError("Failed to save checkpoint", error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "state_metrics",
    {
      description: `📊 Check state size and health metrics.

Shows:
- Size of checkpoint, roadmap, context files
- Whether state is bloated
- If pruning is needed

Parameters: none

Perfect for: Monitoring state growth, deciding when to prune
Warning: State > 200KB total indicates bloat`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const metrics = contextManager.getStateMetrics();

      return formatData({
        ...metrics,
        health: metrics.is_bloated ? "⚠️  Bloated" : "✅ Healthy",
        recommendation: metrics.needs_pruning ? "Run state_prune to clean up" : "No action needed",
      }, "📊 State Metrics");
    },
  );

  server.registerTool(
    "state_prune",
    {
      description: `🧹 Prune old and unnecessary state data.

Removes:
- Old checkpoint formats
- Archived completed tasks
- Excessive history

Keeps:
- Latest checkpoint
- Active tasks
- Recent decisions

Parameters: none

Perfect for: Cleaning bloated state, preparing for long sessions
Result: Smaller, faster state files`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      try {
        const result = await contextManager.pruneState();

        return formatSuccess("State pruned successfully", {
          files_removed: result.pruned.length,
          size_reduction_kb: result.size_reduction_kb.toFixed(2),
          new_metrics: contextManager.getStateMetrics(),
        });
      } catch (error) {
        return formatError("Failed to prune state", error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Quality Framework tools
  server.registerTool(
    "quality_standards",
    {
      description: `✨ View world-class quality standards across all dimensions.

Shows excellence criteria for:
- Code Elegance (clarity, beauty, maintainability)
- Architecture Design (scalability, robustness)
- User Experience (intuitiveness, helpfulness)
- Communication Clarity (precision, accessibility)
- Scientific Rigor (reproducibility, validity)
- Performance Efficiency (speed, resource usage)
- Security Robustness (safety, audit)
- Documentation Quality (comprehensive, current)
- Testing Coverage (reliability, behavior)
- Maintainability (changeability, extensibility)

Each dimension includes principles, anti-patterns, and target scores (85-95%).

Parameters: none

Perfect for: Understanding excellence criteria before starting work
Philosophy: World-class quality is the only acceptable standard`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const standards = qualityFramework.getAllStandards();
      const summary = standards.map(s => ({
        dimension: s.dimension,
        description: s.description,
        target_score: s.target_score + "%",
        top_principles: s.principles.slice(0, 3),
      }));

      return formatData({
        standards: summary,
        philosophy: "Excellence is non-negotiable. Ship world-class or iterate.",
        mindset: "Would I be proud to show this to an expert?",
        result: "Beautiful, reliable systems that are joy to use",
      }, "✨ World-Class Quality Standards");
    },
  );

  server.registerTool(
    "quality_checklist",
    {
      description: `🎯 Get a quality checklist for a specific task.

Generates task-appropriate quality checks based on:
- Task type (code, api, docs, model, deploy)
- Quality dimensions relevant to the work
- Universal excellence criteria

Returns a checklist to verify before marking task complete.

Parameters:
- task_description (required): Description of the task

Examples:
- { "task_description": "Implement user authentication API" }
- { "task_description": "Write deployment documentation" }
- { "task_description": "Build forecasting model" }

Perfect for: Pre-completion quality verification
Standard: All checks must pass before shipping`,
      inputSchema: toJsonSchema(z.object({ task_description: z.string().min(1) }), "AutopilotGuidanceInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = z.object({ task_description: z.string().min(1) }).parse(input);
        const checklist = qualityFramework.generateChecklistForTask(parsed.task_description);
        const selfAssessment = qualityFramework.generateSelfAssessmentPrompt(parsed.task_description);

        return formatData({
          task: parsed.task_description,
          checklist,
          self_assessment_guide: selfAssessment,
          reminder: "Excellence is non-negotiable. Verify all checks before shipping.",
        }, `🎯 Quality Checklist`);
      } catch (error) {
        return formatError("Failed to generate checklist", error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "quality_philosophy",
    {
      description: `🔍 Get the core quality philosophy and principles.

Returns the foundational beliefs about excellence:
- Core principles (10 fundamental rules)
- Quality mindset
- Standards (85-95% across all dimensions)
- Result (beautiful, reliable systems)

This philosophy guides all work and ensures world-class output.

Parameters: none

Perfect for: Understanding the quality mindset, onboarding
Embed this: Use before starting any significant work`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const philosophy = qualityFramework.getQualityPhilosophy();

      return formatData({
        philosophy,
        core_belief: "World-class work is the only acceptable standard",
        standard: "85-95% across all dimensions",
        mindset: "Would I be proud to show this to an expert?",
      }, "🔍 Quality Philosophy");
    },
  );

  // Provider status and management
  server.registerTool(
    "provider_status",
    {
      description: `🔄 Check provider capacity and get intelligent routing recommendations.

Shows token usage, capacity, and provider switching status.
The system automatically switches between Codex and Claude Code based on:
- Token limits (hourly/daily)
- Task complexity
- Current capacity

Parameters: none

Perfect for: Understanding provider health, troubleshooting rate limits`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const status = providerManager.getStatus();
      return formatData(status, "🔄 Provider Status");
    },
  );

  // Authentication status check
  server.registerTool(
    "auth_status",
    {
      description: `🔐 Check authentication status for all providers.

Verifies login status for both Codex and Claude Code.
Provides guidance on how to authenticate if needed.

The MCP server requires authentication to at least one provider.
For best results, authenticate to both providers for automatic failover.

Parameters: none

Perfect for: Troubleshooting auth issues, verifying login status`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const status = await authChecker.checkAll();
      const guidance = authChecker.getAuthGuidance(status);
      const warning = authChecker.getWarning(status);

      return formatData({
        status,
        guidance,
        warning,
        can_proceed: authChecker.canProceed(status),
      }, "🔐 Authentication Status");
    },
  );

  // Roadmap auto-extension - check completion and generate new tasks
  server.registerTool(
    "roadmap_check_and_extend",
    {
      description: `🔄 Check roadmap completion and auto-generate new tasks if needed.

Analyzes roadmap progress and automatically extends it when nearing completion.
Prioritizes shipping velocity over excessive review.

This tool:
- Calculates completion metrics
- Detects when roadmap needs extension (>75% complete or <3 pending tasks)
- Generates phase-appropriate tasks
- Always prioritizes shipping over analysis
- Maintains high development velocity

Parameters: none

Perfect for: Autonomous operation, maintaining momentum, continuous delivery
Strategy: Ship fast, iterate from production, optimize deployment velocity`,
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      try {
        // Get current roadmap
        const allTasks = await session.planNext({ limit: 1000 });

        // Check if extension needed and generate tasks
        const result = await roadmapExtender.autoExtendIfNeeded(allTasks);

        if (!result.shouldExtend) {
          return formatSuccess("Roadmap has sufficient tasks", {
            metrics: result.metrics,
            message: "No extension needed - roadmap healthy",
          });
        }

        // Extension needed - return generated tasks
        return formatData({
          extended: true,
          metrics: result.metrics,
          generated_tasks: result.generatedTasks,
          project_phase: roadmapExtender.determineProjectPhase(allTasks),
          next_action: "Add these tasks to roadmap with plan_update, then start executing",
          philosophy: "🚀 Ship fast, iterate from production, prioritize deployment over review",
        }, `🔄 Roadmap Extended: ${result.generatedTasks.length} New Tasks`);
      } catch (error) {
        return formatError("Failed to check/extend roadmap", error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    "plan_next",
    {
      description: `📋 Get the next prioritized tasks from the WeatherVane roadmap.

Returns a prioritized list of tasks based on dependencies, status, and importance.

Parameters:
- limit (optional): Number of tasks to return (1-20, default: 5)
- filters (optional): Filter by status, epic_id, or milestone_id

Examples:
- Get next 5 tasks: { "limit": 5 }
- Get pending tasks: { "filters": { "status": ["pending"] } }
- Get tasks in an epic: { "filters": { "epic_id": "E1" } }

Perfect for: Understanding what to work on next, getting oriented with the roadmap
Model: Uses intelligent routing based on complexity and provider capacity`,
      inputSchema: planNextSchema,
    },
    async (input: unknown) => {
      const startTime = Date.now();
      const recommendation = providerManager.getProviderRecommendation("plan_next");

      try {
        const parsed = planNextInput.parse(input);
        const tasks = await session.planNext(parsed);
        const clusters = buildClusterSummaries(tasks);

        // Minimal mode: return only essential fields (70% token savings)
        const minimalTasks = parsed.minimal
          ? tasks.map(t => ({ id: t.id, title: t.title, status: t.status, domain: t.domain }))
          : tasks;

        // Estimate tokens used (rough approximation)
        const estimatedTokens = parsed.minimal
          ? 300 + (tasks.length * 30)  // Minimal mode uses ~70% fewer tokens
          : 500 + (tasks.length * 100);
        providerManager.trackUsage(recommendation.provider, estimatedTokens);

        const payload = {
          count: tasks.length,
          tasks: minimalTasks,
          profile: session.profile,
          clusters,
          ...(tasks.length === 0
            ? { hint: "Try adjusting your filters or check the roadmap in state/roadmap.yaml" }
            : {}),
        };

        return formatData(payload, `📋 Next ${tasks.length} Task(s)`);
      } catch (error) {
        return formatError("Failed to get next tasks", error instanceof Error ? error.message : String(error));
      }
    },
  );

  const planUpdateInput = z.object({
    task_id: z.string().min(1, "Task ID is required"),
    status: z.enum(["pending", "in_progress", "blocked", "done"]),
  });
  const planUpdateSchema = toJsonSchema(planUpdateInput, "PlanUpdateInput");

  server.registerTool(
    "plan_update",
    {
      description: `✅ Update the status of a roadmap task.

Changes a task's status in the roadmap and updates state tracking.

Parameters:
- task_id (required): The task identifier (e.g., "T1.1.1")
- status (required): One of: "pending", "in_progress", "blocked", "done"

Examples:
- Mark task as started: { "task_id": "T1.1.1", "status": "in_progress" }
- Mark task as done: { "task_id": "T1.1.1", "status": "done" }
- Mark task as blocked: { "task_id": "T1.1.1", "status": "blocked" }

Perfect for: Tracking progress, maintaining roadmap state`,
      inputSchema: planUpdateSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = planUpdateInput.parse(input);
        await session.updatePlanStatus(parsed.task_id, parsed.status);
        return formatSuccess(`Task ${parsed.task_id} updated to status: ${parsed.status}`, {
          task_id: parsed.task_id,
          new_status: parsed.status,
        });
      } catch (error) {
        return formatError("Failed to update task status", error instanceof Error ? error.message : String(error));
      }
    },
  );

  const contextWriteInput = z.object({
    section: z.string().min(1, "Section name is required"),
    content: z.string().min(1, "Content cannot be empty"),
    append: z.boolean().optional().default(false),
  });
  const contextWriteSchema = toJsonSchema(contextWriteInput, "ContextWriteInput");

  server.registerTool(
    "context_write",
    {
      description: `📝 Write or append to the running context document.

Updates state/context.md with session notes, decisions, and progress updates.
Keep context ≤1000 words for optimal recovery.

Parameters:
- section (required): Section name (e.g., "Current Focus", "Decisions", "Blockers")
- content (required): Content to write
- append (optional): If true, appends to section; if false, replaces (default: false)

Examples:
- Update current focus: { "section": "Current Focus", "content": "Working on T1.1.1 - Implementing Open-Meteo connector" }
- Add decision: { "section": "Decisions", "content": "Using Polars for data processing", "append": true }
- Note blocker: { "section": "Blockers", "content": "Waiting for API credentials" }

Perfect for: Tracking progress, documenting decisions, noting blockers`,
      inputSchema: contextWriteSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = contextWriteInput.parse(input);
        await session.writeContext(parsed.section, parsed.content, parsed.append);
        const action = parsed.append ? "appended to" : "updated";
        return formatSuccess(`Context section '${parsed.section}' ${action}`, {
          section: parsed.section,
          action,
          location: "state/context.md",
        });
      } catch (error) {
        return formatError("Failed to write context", error instanceof Error ? error.message : String(error));
      }
    },
  );

  const contextSnapshotInput = z.object({
    notes: z.string().optional(),
  });
  const contextSnapshotSchema = toJsonSchema(contextSnapshotInput, "ContextSnapshotInput");

  server.registerTool(
    "context_snapshot",
    {
      description: `💾 Create a checkpoint for session recovery.

Saves current roadmap state, context, and open tasks to state/checkpoint.json.
Use this before long operations or at natural stopping points.

Parameters:
- notes (optional): Additional notes about this checkpoint

Examples:
- Basic checkpoint: {}
- With notes: { "notes": "Before starting integration tests" }

Perfect for: Session recovery, saving progress before risky operations`,
      inputSchema: contextSnapshotSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = contextSnapshotInput.parse(input);
        await session.snapshot(parsed.notes);
        return formatSuccess("Checkpoint created successfully", {
          location: "state/checkpoint.json",
          notes: parsed.notes || "none",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return formatError("Failed to create checkpoint", error instanceof Error ? error.message : String(error));
      }
    },
  );

  const fsReadInput = z.object({
    path: z.string().min(1, "File path is required"),
  });
  const fsReadSchema = toJsonSchema(fsReadInput, "FsReadInput");

  server.registerTool(
    "fs_read",
    {
      description: `📂 Read a file from the WeatherVane workspace.

Reads file contents relative to the workspace root.

Parameters:
- path (required): Relative path from workspace root (e.g., "apps/api/main.py")

Examples:
- Read config: { "path": "apps/api/config.py" }
- Read roadmap: { "path": "state/roadmap.yaml" }
- Read docs: { "path": "docs/ARCHITECTURE.md" }

Perfect for: Inspecting code, reviewing configs, checking documentation`,
      inputSchema: fsReadSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = fsReadInput.parse(input);
        const content = await session.readFile(parsed.path);
        return formatData({ path: parsed.path, content }, `📂 ${parsed.path}`);
      } catch (error) {
        return formatError(`Failed to read file: ${(input as any).path}`, error instanceof Error ? error.message : String(error));
      }
    },
  );

  const fsWriteInput = z.object({
    path: z.string().min(1, "File path is required"),
    content: z.string(),
  });
  const fsWriteSchema = toJsonSchema(fsWriteInput, "FsWriteInput");

  server.registerTool(
    "fs_write",
    {
      description: `📝 Write a file to the WeatherVane workspace.

Writes content to a file relative to the workspace root. Creates directories as needed.

Parameters:
- path (required): Relative path from workspace root
- content (required): File content to write

Examples:
- Create config: { "path": "config/new_config.yaml", "content": "..." }
- Update code: { "path": "apps/api/routes.py", "content": "..." }
- Write docs: { "path": "docs/new_feature.md", "content": "..." }

Perfect for: Creating files, updating code, writing documentation`,
      inputSchema: fsWriteSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = fsWriteInput.parse(input);
        await session.writeFile(parsed.path, parsed.content);
        return formatSuccess(`File written successfully: ${parsed.path}`, {
          path: parsed.path,
          size: parsed.content.length + " bytes",
        });
      } catch (error) {
        return formatError(`Failed to write file: ${(input as any).path}`, error instanceof Error ? error.message : String(error));
      }
    },
  );

  const cmdRunInput = z.object({
    cmd: z.string().min(1, "Command is required"),
    quiet: z.boolean().optional().describe("Suppress stdout/stderr unless command fails"),
  });
  const cmdRunSchema = toJsonSchema(cmdRunInput, "CmdRunInput");

  server.registerTool(
    "cmd_run",
    {
      description: `⚡ Execute a shell command in the WeatherVane workspace.

Runs commands with workspace confinement and safety guardrails.
Commands run from the workspace root directory.

Parameters:
- cmd (required): Shell command to execute

Examples:
- Run tests: { "cmd": "make test" }
- Check status: { "cmd": "git status" }
- Run linter: { "cmd": "make lint" }
- Install deps: { "cmd": "npm install" }

Safety: Blocks destructive commands (rm -rf /, git reset --hard, etc.)
Perfect for: Running builds, tests, git operations, package management`,
      inputSchema: cmdRunSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = cmdRunInput.parse(input);
        const result = await session.runShellCommand(parsed.cmd);

        const status = result.code === 0 ? "✅" : "❌";

        // Quiet mode: suppress output unless failed
        if (parsed.quiet && result.code === 0) {
          return formatSuccess(`Command succeeded: ${parsed.cmd}`, { exit_code: result.code });
        }

        return formatData({
          command: parsed.cmd,
          exit_code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        }, `${status} Command: ${parsed.cmd}`);
      } catch (error) {
        return formatError(`Failed to execute command: ${(input as any).cmd}`, error instanceof Error ? error.message : String(error));
      }
    },
  );

  const criticsRunInput = z.object({
    critics: z.array(z.string()).optional(),
    quiet: z.boolean().optional().describe("Only show summary, suppress detailed output"),
  });
  const criticsRunSchema = toJsonSchema(criticsRunInput, "CriticsRunInput");

  server.registerTool(
    "critics_run",
    {
      description: `🔍 Run quality critic suites on the codebase.

Executes automated checks for code quality, tests, security, and more.

Parameters:
- critics (optional): Array of critic names to run (defaults to all based on profile)

Available critics:
- build, tests, typecheck - Code quality
- security - Security scan
- data_quality, leakage, causal - Data science
- allocator, forecast_stitch - Domain-specific
- design_system, org_pm - Process checks

Examples:
- Run all critics: {}
- Run specific: { "critics": ["build", "tests", "security"] }
- Quick check: { "critics": ["build", "typecheck"] }

Perfect for: Quality gates, pre-commit checks, comprehensive validation`,
      inputSchema: criticsRunSchema,
    },
    async (input: unknown) => {
      try {
        const parsed = criticsRunInput.parse(input);
        const results = await session.runCritics(parsed.critics ?? undefined);

        const summary = results.map(r => `${r.passed ? "✅" : "❌"} ${r.critic}`).join("\n");

        // Quiet mode: only show summary stats
        if (parsed.quiet) {
          return formatSuccess(`Critics: ${results.filter(r => r.passed).length}/${results.length} passed`, {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
          });
        }

        return formatData({
          profile: session.profile,
          total: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length,
          results,
        }, `🔍 Critics Results\n\n${summary}`);
      } catch (error) {
        return formatError("Failed to run critics", error instanceof Error ? error.message : String(error));
      }
    },
  );

  const autopilotAuditInput = z.object({
    task_id: z.string().min(1).optional(),
    focus: z.string().min(1).optional(),
    notes: z.string().optional(),
  });
  const autopilotAuditSchema = toJsonSchema(autopilotAuditInput, "AutopilotAuditInput");

  server.registerTool(
    "autopilot_record_audit",
    {
      description:
        "Record a surprise QA audit against a completed roadmap item, including task id, focus area, and notes.",
      inputSchema: autopilotAuditSchema,
    },
    async (input: unknown) => {
      const parsed = autopilotAuditInput.parse(input);
      const state = await session.recordAutopilotAudit({
        task_id: parsed.task_id,
        focus: parsed.focus,
        notes: parsed.notes,
      });
      return jsonResponse({ ok: true, state });
    },
  );

  server.registerTool(
    "autopilot_status",
    {
      description: "Return the persisted autopilot audit cadence state.",
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const state = await session.getAutopilotState();
      return jsonResponse({ state });
    },
  );

  const heavyQueueEnqueueInput = z.object({
    summary: z.string().min(1),
    command: z.string().optional(),
    notes: z.string().optional(),
    id: z.string().optional(),
  });
  const heavyQueueEnqueueSchema = toJsonSchema(heavyQueueEnqueueInput, "HeavyQueueEnqueueInput");

  server.registerTool(
    "heavy_queue_enqueue",
    {
      description: "Enqueue a heavy/background task so it can run asynchronously.",
      inputSchema: heavyQueueEnqueueSchema,
    },
    async (input: unknown) => {
      const parsed = heavyQueueEnqueueInput.parse(input);
      const item = await session.enqueueHeavyTask(parsed);
      return jsonResponse({ item });
    },
  );

  const heavyQueueUpdateInput = z.object({
    id: z.string().min(1),
    status: z.enum(["queued", "running", "completed", "cancelled"]).optional(),
    notes: z.string().optional(),
    command: z.string().optional(),
  });
  const heavyQueueUpdateSchema = toJsonSchema(heavyQueueUpdateInput, "HeavyQueueUpdateInput");

  server.registerTool(
    "heavy_queue_update",
    {
      description: "Update the status of a heavy/background task.",
      inputSchema: heavyQueueUpdateSchema,
    },
    async (input: unknown) => {
      const parsed = heavyQueueUpdateInput.parse(input);
      const item = await session.updateHeavyTask(parsed);
      return jsonResponse({ item });
    },
  );

  server.registerTool(
    "heavy_queue_list",
    {
      description: "List queued heavy/background tasks and their status.",
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      const items = await session.listHeavyTasks();
      return jsonResponse({ items });
    },
  );

  const artifactRecordInput = z.object({
    type: z.string(),
    path: z.string(),
    metadata: z.record(z.any()).optional(),
  });
  const artifactRecordSchema = toJsonSchema(artifactRecordInput, "ArtifactRecordInput");

  server.registerTool(
    "artifact_record",
    {
      description: "Register an artifact path for later reference.",
      inputSchema: artifactRecordSchema,
    },
    async (input: unknown) => {
      const parsed = artifactRecordInput.parse(input);
      await session.recordArtifact(parsed.type, parsed.path, parsed.metadata);
      return jsonResponse({ ok: true });
    },
  );

  server.registerTool(
    "cli_commands",
    {
      description: "List known Claude Code CLI commands and recommended usage.",
      inputSchema: emptyObjectSchema,
    },
    async (_input: unknown) => {
      return jsonResponse({
        profile: session.profile,
        commands: describeClaudeCodeCommands(),
      });
    },
  );

  // Screenshot tools for design review
  const screenshotCaptureInput = z.object({
    url: z.string().min(1),
    fullPage: z.boolean().optional(),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
    waitForSelector: z.string().optional(),
    delay: z.number().int().nonnegative().optional(),
  });
  const screenshotCaptureSchema = toJsonSchema(screenshotCaptureInput, "ScreenshotCaptureInput");

  server.registerTool(
    "screenshot_capture",
    {
      description: `📸 Capture a screenshot of a web page for design review.

**Use this to:**
- Capture UI screenshots for design evaluation
- Review responsive layouts at different viewport sizes
- Document the current state of the application
- Generate visual artifacts for design critique

**Example:**
\`\`\`json
{
  "url": "http://localhost:3000/dashboard",
  "fullPage": true,
  "viewport": { "width": 1920, "height": 1080 }
}
\`\`\`

**Returns:** Screenshot path and base64 encoding for immediate analysis by Claude or Codex.

**Note:** Both Codex and Claude Code can analyze images! Use this to get executive-level design feedback.`,
      inputSchema: screenshotCaptureSchema,
    },
    async (input: unknown) => {
      const parsed = screenshotCaptureInput.parse(input);
      const result = await screenshotCapture.capture(parsed);

      if (!result.success) {
        return formatError(`Screenshot failed: ${result.error}`);
      }

      return formatSuccess(`Screenshot captured at ${result.path}`, {
        path: result.path,
        width: result.width,
        height: result.height,
        base64_preview: result.base64?.substring(0, 100) + "...",
      });
    },
  );

  const screenshotMultipleInput = z.object({
    pages: z.array(
      z.object({
        url: z.string().min(1),
        name: z.string().min(1),
      }),
    ),
  });
  const screenshotMultipleSchema = toJsonSchema(screenshotMultipleInput, "ScreenshotMultipleInput");

  server.registerTool(
    "screenshot_capture_multiple",
    {
      description: `📸 Capture screenshots of multiple pages for comprehensive design review.

**Use this to:**
- Capture all key pages of the application (dashboard, settings, reports, etc.)
- Generate a complete visual audit for design system review
- Create before/after comparisons for UI changes
- Document the entire user journey with screenshots

**Example:**
\`\`\`json
{
  "pages": [
    { "url": "http://localhost:3000/", "name": "homepage" },
    { "url": "http://localhost:3000/dashboard", "name": "dashboard" },
    { "url": "http://localhost:3000/settings", "name": "settings" }
  ]
}
\`\`\`

**Returns:** Map of screenshot results by page name.

**Recommended workflow:**
1. Capture all pages with this tool
2. Review screenshots with design_system critic
3. Generate executive summary of UX improvements needed`,
      inputSchema: screenshotMultipleSchema,
    },
    async (input: unknown) => {
      const parsed = screenshotMultipleInput.parse(input);
      const results = await screenshotCapture.captureMultiple(parsed.pages);

      const summary: Record<string, unknown> = {};
      for (const [name, result] of results.entries()) {
        summary[name] = result.success
          ? { path: result.path, width: result.width, height: result.height }
          : { error: result.error };
      }

      return formatSuccess(`Captured ${parsed.pages.length} screenshots`, summary);
    },
  );

  // Smart screenshot session tool
  const screenshotSessionInput = z.object({
    baseUrl: z.string().optional(),
    force: z.boolean().optional(),
    startDevServer: z.boolean().optional(),
  });
  const screenshotSessionSchema = toJsonSchema(screenshotSessionInput, "ScreenshotSessionInput");

  server.registerTool(
    "screenshot_session",
    {
      description: `🎨 Run intelligent screenshot session with auto-detection and error handling.

**This is the RECOMMENDED way to capture screenshots** - it handles everything automatically:

✅ **Automatic Features:**
- Starts dev server if needed (no manual intervention)
- Auto-discovers all pages in your app
- Tests mobile, tablet, and desktop viewports
- Retries failed captures automatically (3 attempts)
- Skips if no UI changes since last session
- Cleans up old screenshot sessions
- Returns organized artifacts for design review

**Example:**
\`\`\`json
{
  "force": false,
  "startDevServer": true
}
\`\`\`

**When to use:**
- Before running design_system critic
- After completing UI/UX tasks
- When you want comprehensive design review
- Let autopilot decide (it will check if UI changed)

**Returns:** Session report with all captured screenshots organized by page and viewport.

**Configuration:** Edit state/screenshot_config.yaml to customize pages/viewports.`,
      inputSchema: screenshotSessionSchema,
    },
    async (input: unknown) => {
      const parsed = screenshotSessionInput.parse(input);
      const baseUrl = parsed.baseUrl || "http://localhost:3000";
      const startServer = parsed.startDevServer !== false; // Default true

      try {
        // Check if we should take screenshots
        if (!parsed.force) {
          const lastSession = screenshotManager.getLastSession();
          const lastGitSha = lastSession ? lastSession.sessionId : null;
          const should = await screenshotManager.shouldScreenshot(lastGitSha);

          if (!should) {
            return formatSuccess("No UI changes detected, skipping screenshots", {
              reason: "no_changes",
              lastSession: lastSession?.sessionId,
            });
          }
        }

        // Start dev server if requested
        if (startServer) {
          const serverStarted = await screenshotManager.ensureDevServer({
            command: "npm run dev --prefix apps/web",
            port: 3000,
            readyCheck: baseUrl,
          });

          if (!serverStarted) {
            return formatError("Failed to start dev server - cannot capture screenshots");
          }
        }

        // Run screenshot session
        const session = await screenshotManager.runScreenshotSession(baseUrl);

        // Cleanup old sessions
        await screenshotManager.cleanupOldSessions();

        if (session.success) {
          return formatSuccess(`Screenshot session completed: ${session.artifacts.length} screenshots captured`, {
            sessionId: session.sessionId,
            pages: session.pages,
            viewports: session.viewports,
            artifacts: session.artifacts,
            successRate: `${((session.artifacts.length / (session.pages.length * session.viewports.length)) * 100).toFixed(1)}%`,
          });
        } else {
          const errorMsg = `Screenshot session partially failed: ${session.errors.join(", ")}`;
          return formatError(errorMsg);
        }
      } catch (error) {
        return formatError(`Screenshot session failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  // LSP Tools for symbol-aware code context
  server.registerTool(
    "lsp_initialize",
    {
      description: `Initialize and start Language Server Protocol (LSP) servers.

Starts both TypeScript and Python language servers for symbol-aware code context. This enables:
- Jump-to-definition lookups
- Symbol reference finding
- Type hover information
- Multi-language support

**When to use:**
- When starting a new context session
- After major workspace changes
- Before using other LSP tools

**Returns:** Server status for both TypeScript and Python servers.`,
      inputSchema: toJsonSchema(lspInitializeInput, "LspInitializeInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = lspInitializeInput.parse(input);
        const { getLSPManager } = await import("./lsp/lsp_manager.js");
        const lspManager = getLSPManager(parsed.workspaceRoot);

        // Start both servers
        await Promise.all([
          lspManager.startTypeScriptServer().catch((e) => {
            logWarning("Failed to start TypeScript server", {
              error: e instanceof Error ? e.message : String(e),
            });
          }),
          lspManager.startPythonServer().catch((e) => {
            logWarning("Failed to start Python server", {
              error: e instanceof Error ? e.message : String(e),
            });
          }),
        ]);

        const tsStatus = lspManager.getServerStatus("typescript");
        const pyStatus = lspManager.getServerStatus("python");

        return formatSuccess("LSP servers initialized", {
          servers: {
            typescript: tsStatus,
            python: pyStatus,
          },
        });
      } catch (error) {
        return formatError(
          "LSP initialization failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  );

  server.registerTool(
    "lsp_server_status",
    {
      description: `Check the status of LSP servers (TypeScript and/or Python).

Returns connection status, version info, and capabilities for active language servers. Useful for:
- Verifying server health
- Checking which servers are ready
- Debugging connection issues

**Parameters:**
- language (optional): 'typescript' | 'python' (omit to check both)

**Returns:** Server status including running state, version, and capabilities.`,
      inputSchema: toJsonSchema(lspServerStatusInput, "LspServerStatusInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = lspServerStatusInput.parse(input ?? {});
        const { getLSPManager } = await import("./lsp/lsp_manager.js");
        const lspManager = getLSPManager(session.workspaceRoot);

        if (parsed.language) {
          const status = lspManager.getServerStatus(parsed.language);
          return formatData({ server: status }, `LSP Server Status: ${parsed.language}`);
        } else {
          // Return status for both servers
          const tsStatus = lspManager.getServerStatus("typescript");
          const pyStatus = lspManager.getServerStatus("python");
          return formatData(
            {
              servers: {
                typescript: tsStatus,
                python: pyStatus,
              },
            },
            "LSP Servers Status"
          );
        }
      } catch (error) {
        return formatError(
          "LSP status check failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  );

  server.registerTool(
    "lsp_definition",
    {
      description: `Find where a symbol is defined in your codebase.

Uses TypeScript/Python language servers to locate symbol definitions with surrounding context. Enables:
- Jump to symbol definition
- Tracing imports and references
- Understanding code structure
- Symbol-aware context extraction

**Parameters:**
- language: 'typescript' | 'python'
- filePath: Path to source file
- line: Line number (0-indexed)
- character: Character position (0-indexed)
- contextLines: Lines of context around definition (default: 5)

**Returns:** Definition location with file, line, character, and surrounding source code.`,
      inputSchema: toJsonSchema(lspDefinitionInput, "LspDefinitionInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = lspDefinitionInput.parse(input);
        const { getLSPManager } = await import("./lsp/lsp_manager.js");
        const lspManager = getLSPManager(session.workspaceRoot);

        // Ensure language server is running
        const status = lspManager.getServerStatus(parsed.language);
        if (!status.running) {
          if (parsed.language === "typescript") {
            await lspManager.startTypeScriptServer();
          } else {
            await lspManager.startPythonServer();
          }
        }

        // Get definitions based on language
        if (parsed.language === "typescript") {
          const { TypeScriptLSPProxy } = await import("./lsp/tsserver_proxy.js");
          const proxy = new TypeScriptLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getDefinitionWithContext(
            parsed.filePath,
            parsed.line,
            parsed.character,
            parsed.contextLines ?? 5
          );
          return formatData({ definitions: result }, "Symbol Definitions");
        } else {
          const { PythonLSPProxy } = await import("./lsp/pyright_proxy.js");
          const proxy = new PythonLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getDefinitionWithContext(
            parsed.filePath,
            parsed.line,
            parsed.character,
            parsed.contextLines ?? 5
          );
          return formatData({ definitions: result }, "Symbol Definitions");
        }
      } catch (error) {
        return formatError(
          "LSP definition lookup failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  );

  server.registerTool(
    "lsp_references",
    {
      description: `Find all references to a symbol in your codebase.

Locates every use of a symbol with surrounding context. Enables:
- Finding all usages of a function/variable
- Impact analysis
- Refactoring support
- Symbol dependency mapping

**Parameters:**
- language: 'typescript' | 'python'
- filePath: Path to source file
- line: Line number (0-indexed)
- character: Character position (0-indexed)
- contextLines: Lines of context around each reference (default: 3)

**Returns:** Array of reference locations with file, line, character, and surrounding source code.`,
      inputSchema: toJsonSchema(lspReferencesInput, "LspReferencesInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = lspReferencesInput.parse(input);
        const { getLSPManager } = await import("./lsp/lsp_manager.js");
        const lspManager = getLSPManager(session.workspaceRoot);

        // Ensure language server is running
        const status = lspManager.getServerStatus(parsed.language);
        if (!status.running) {
          if (parsed.language === "typescript") {
            await lspManager.startTypeScriptServer();
          } else {
            await lspManager.startPythonServer();
          }
        }

        // Get references based on language
        if (parsed.language === "typescript") {
          const { TypeScriptLSPProxy } = await import("./lsp/tsserver_proxy.js");
          const proxy = new TypeScriptLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getReferencesWithContext(
            parsed.filePath,
            parsed.line,
            parsed.character,
            parsed.contextLines ?? 3
          );
          return formatData({ references: result }, "Symbol References");
        } else {
          const { PythonLSPProxy } = await import("./lsp/pyright_proxy.js");
          const proxy = new PythonLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getReferencesWithContext(
            parsed.filePath,
            parsed.line,
            parsed.character,
            parsed.contextLines ?? 3
          );
          return formatData({ references: result }, "Symbol References");
        }
      } catch (error) {
        return formatError(
          "LSP references lookup failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  );

  server.registerTool(
    "lsp_hover",
    {
      description: `Get type information and documentation for a symbol.

Retrieves hover information (type signature, documentation) for symbols. Enables:
- Type information display
- Documentation preview
- Type checking without compilation
- Symbol context understanding

**Parameters:**
- language: 'typescript' | 'python'
- filePath: Path to source file
- line: Line number (0-indexed)
- character: Character position (0-indexed)

**Returns:** Hover information including type, documentation, and semantic details.`,
      inputSchema: toJsonSchema(lspHoverInput, "LspHoverInput"),
    },
    async (input: unknown) => {
      try {
        const parsed = lspHoverInput.parse(input);
        const { getLSPManager } = await import("./lsp/lsp_manager.js");
        const lspManager = getLSPManager(session.workspaceRoot);

        // Ensure language server is running
        const status = lspManager.getServerStatus(parsed.language);
        if (!status.running) {
          if (parsed.language === "typescript") {
            await lspManager.startTypeScriptServer();
          } else {
            await lspManager.startPythonServer();
          }
        }

        // Get hover info based on language
        if (parsed.language === "typescript") {
          const { TypeScriptLSPProxy } = await import("./lsp/tsserver_proxy.js");
          const proxy = new TypeScriptLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getHover(
            parsed.filePath,
            parsed.line,
            parsed.character
          );
          return formatData(result, "Hover Information");
        } else {
          const { PythonLSPProxy } = await import("./lsp/pyright_proxy.js");
          const proxy = new PythonLSPProxy(lspManager, session.workspaceRoot);
          const result = await proxy.getHover(
            parsed.filePath,
            parsed.line,
            parsed.character
          );
          return formatData(result, "Hover Information");
        }
      } catch (error) {
        return formatError(
          "LSP hover information failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo("WVO MCP server (Claude Code) ready", {
    workspace: session.workspaceRoot,
    profile: session.profile,
  });
}

main().catch((error) => {
  activeRuntime?.stop();
  activeRuntime = null;
  logError("Fatal MCP server error", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  process.exit(1);
});
