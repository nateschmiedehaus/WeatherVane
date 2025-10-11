import type { CodexCommandDescriptor } from "../utils/types.js";

// Claude Code CLI commands and their descriptions
// Based on Claude Code documentation and capabilities
export const CLAUDE_CODE_COMMANDS: CodexCommandDescriptor[] = [
  {
    command: "claude --help",
    description: "Display help information about Claude Code CLI commands.",
    recommendedProfile: "low",
  },
  {
    command: "claude --version",
    description: "Show Claude Code CLI version information.",
    recommendedProfile: "low",
  },
  {
    command: "claude chat",
    description: "Start an interactive chat session with Claude Code.",
    recommendedProfile: "medium",
  },
  {
    command: "claude config",
    description: "Configure Claude Code settings and preferences.",
    recommendedProfile: "medium",
    requiresApproval: false,
  },
  {
    command: "claude mcp list",
    description: "List all registered MCP servers.",
    recommendedProfile: "low",
  },
  {
    command: "claude mcp add",
    description: "Register a new MCP server configuration.",
    recommendedProfile: "medium",
  },
  {
    command: "claude mcp remove",
    description: "Remove an MCP server configuration.",
    recommendedProfile: "medium",
  },
];

export function describeClaudeCodeCommands(): string {
  return CLAUDE_CODE_COMMANDS.map(
    (entry) =>
      `- ${entry.command} [${entry.recommendedProfile}]${entry.requiresApproval ? " (may require approval)" : ""} — ${entry.description}`,
  ).join("\n");
}
