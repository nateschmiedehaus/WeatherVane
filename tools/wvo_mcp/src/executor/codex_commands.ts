import type { CodexCommandDescriptor } from "../utils/types.js";

export const CODEX_COMMANDS: CodexCommandDescriptor[] = [
  {
    command: "codex mcp-server",
    description: "Launches an MCP server process using configured instructions.",
    recommendedProfile: "medium",
  },
  {
    command: "codex login",
    description: "Authenticate Codex via ChatGPT or API key flows.",
    recommendedProfile: "low",
  },
  {
    command: "codex logout",
    description: "Clear stored authentication credentials.",
    recommendedProfile: "low",
  },
  {
    command: "codex session",
    description: "Starts a new Codex chat session with optional base instructions.",
    recommendedProfile: "medium",
  },
  {
    command: "codex reply",
    description: "Continues an existing conversation by conversation id.",
    recommendedProfile: "low",
  },
  {
    command: "codex plan",
    description: "Displays or updates the current plan for the active session.",
    recommendedProfile: "medium",
  },
  {
    command: "codex tools",
    description: "Lists registered MCP tools and allows manual invocation.",
    recommendedProfile: "low",
  },
  {
    command: "codex status",
    description: "Shows Codex CLI status, including sandbox and approvals.",
    recommendedProfile: "low",
  },
  {
    command: "codex config",
    description: "Reads or updates Codex configuration profiles.",
    recommendedProfile: "medium",
    requiresApproval: false,
  },
  {
    command: "codex exec",
    description: "Run Codex in non-interactive mode; combine with --full-auto or --json for automation.",
    recommendedProfile: "high",
  },
  {
    command: "codex logs",
    description: "Streams recent CLI logs for debugging.",
    recommendedProfile: "medium",
  },
  {
    command: "codex prune",
    description: "Cleans cached sessions or artifacts to reclaim resources.",
    recommendedProfile: "high",
    requiresApproval: true,
  },
  {
    command: "codex version",
    description: "Prints CLI version information.",
    recommendedProfile: "low",
  },
];

export function describeCodexCommands(): string {
  return CODEX_COMMANDS.map(
    (entry) =>
      `- ${entry.command} [${entry.recommendedProfile}]${entry.requiresApproval ? " (may require approval)" : ""} — ${entry.description}`,
  ).join("\n");
}
