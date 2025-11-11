/**
 * LLM Chat Tool - Subscription-Based Authentication
 *
 * This uses Claude Code's monthly subscription credentials automatically.
 * NO API KEYS NEEDED - authentication is inherited from the Claude Code session.
 *
 * How it works:
 * 1. Wave 0 runs as subprocess of Claude Code (stdio transport)
 * 2. Delegates AI work to parent Claude Code process via Task tool
 * 3. Claude Code handles authentication using subscription tokens
 * 4. Returns AI responses with usage metrics
 */

export interface LLMChatRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  model?: "haiku" | "sonnet" | "opus";
  maxTokens?: number;
  temperature?: number;
}

export interface LLMChatResponse {
  provider: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Format messages as a single prompt string for Claude Code's Task tool
 */
function formatMessagesAsPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((msg) => {
      if (msg.role === "system") {
        return `System: ${msg.content}`;
      } else if (msg.role === "user") {
        return `User: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    })
    .join("\n\n");
}

/**
 * Call AI using Claude Code's subscription credentials
 *
 * This function delegates AI work to Claude Code via the Task tool,
 * which automatically inherits subscription authentication.
 *
 * @param request - The LLM chat request
 * @param mcpClient - MCP client for delegating to Claude Code (optional for backward compat)
 * @returns LLM response with content and usage metrics
 */
export async function llmChat(
  request: LLMChatRequest,
  mcpClient?: any
): Promise<LLMChatResponse> {
  // If MCP client provided, use it for Task tool delegation (preferred)
  if (mcpClient && typeof mcpClient.executeTool === "function") {
    try {
      const taskPrompt = formatMessagesAsPrompt(request.messages);

      const response = await mcpClient.executeTool("Task", {
        subagent_type: "general-purpose",
        description: "AI reasoning for Wave 0",
        prompt: taskPrompt,
        model: request.model || "sonnet", // haiku, sonnet, opus
      });

      const content = response.result || response.content || "";
      const usage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };

      return {
        provider: "anthropic",
        content,
        usage,
      };
    } catch (err) {
      throw new Error(
        `AI call failed via MCP Task tool: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Fallback: No MCP client - cannot make AI calls without subscription auth
  throw new Error(
    "CRITICAL: No subscription credentials available. " +
      "Wave 0 requires Claude Code's monthly subscription authentication. " +
      "Ensure Wave 0 is running inside Claude Code (not standalone). " +
      "Pass mcpClient parameter to llmChat() to enable subscription auth."
  );
}

/**
 * Streaming not yet supported with Task tool delegation
 * Use regular llmChat() instead
 */
export async function* llmChatStream(
  request: LLMChatRequest,
  mcpClient?: any
): AsyncGenerator<string, void, unknown> {
  const response = await llmChat(request, mcpClient);
  yield response.content;
}
