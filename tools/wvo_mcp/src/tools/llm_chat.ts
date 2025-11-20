import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_MODEL =
  process.env.CODEX_CHAT_MODEL ??
  process.env.CODEX_AUTOPILOT_MODEL ??
  "gpt-5-codex";
const DEFAULT_PROFILE = process.env.CODEX_PROFILE_NAME;
const DEFAULT_SANDBOX =
  process.env.CODEX_LLM_CHAT_SANDBOX ?? "danger-full-access";
const EXEC_TIMEOUT_MS = Number(process.env.LLM_CHAT_TIMEOUT_MS ?? 240_000);
const MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.LLM_CHAT_MAX_ATTEMPTS ?? 2)
);
const RETRY_DELAY_MS = Math.max(
  1000,
  Number(process.env.LLM_CHAT_RETRY_DELAY_MS ?? 2000)
);

export interface LLMChatRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  model?: string;
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

function resolveCodexBinary(): string {
  const fromEnv = process.env.CODEX_BIN;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const which = spawnSync("which", ["codex"], { encoding: "utf-8" });
  if (which.status === 0) {
    const candidate = which.stdout.trim();
    if (candidate) {
      return candidate;
    }
  }

  const homebrew = "/opt/homebrew/bin/codex";
  const usrLocal = "/usr/local/bin/codex";

  if (fs.existsSync(homebrew)) {
    return homebrew;
  }
  if (fs.existsSync(usrLocal)) {
    return usrLocal;
  }

  throw new Error(
    "Codex CLI not found. Set CODEX_BIN or install the codex CLI to enable llm_chat."
  );
}

function formatMessages(
  messages: Array<{ role: string; content: string }>
): string {
  if (!messages || messages.length === 0) {
    throw new Error("llm_chat requires at least one message.");
  }

  return messages
    .map((msg) => {
      const header =
        msg.role === "system"
          ? "System"
          : msg.role === "assistant"
          ? "Assistant"
          : "User";
      return `${header}:\n${msg.content}`;
    })
    .join("\n\n");
}

function applyConfigArgs(request: LLMChatRequest): string[] {
  const args: string[] = [];

  if (typeof request.temperature === "number") {
    args.push("--temperature", String(request.temperature));
  }
  if (typeof request.maxTokens === "number") {
    args.push("--max-tokens", String(request.maxTokens));
  }

  return args;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function llmChat(
  request: LLMChatRequest
): Promise<LLMChatResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await invokeCodex(request);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw (
    lastError ?? new Error("llm_chat failed without diagnostic output")
  );
}

async function invokeCodex(
  request: LLMChatRequest
): Promise<LLMChatResponse> {
  const codexBin = resolveCodexBinary();
  const prompt = formatMessages(request.messages);
  const model = request.model ?? DEFAULT_MODEL;

  const args = [
    "exec",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "--sandbox",
    DEFAULT_SANDBOX,
  ];

  if (DEFAULT_PROFILE) {
    args.push("--profile", DEFAULT_PROFILE);
  }
  if (model) {
    args.push("--model", model);
  }

  args.push(...applyConfigArgs(request));
  args.push("-");

  const child = spawn(codexBin, args, {
    env: {
      ...process.env,
      WVO_LLM_CHAT_WORKDIR: process.cwd(),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
  }, EXEC_TIMEOUT_MS);

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.stdin?.write(prompt);
  child.stdin?.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });

  clearTimeout(timer);

  if (exitCode !== 0) {
    throw new Error(
      `llm_chat failed (exit ${exitCode}): ${stderr || "no stderr captured"}`
    );
  }

  let content = "";
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;

  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === "item.completed" && parsed?.item?.content) {
          content = parsed.item.content;
        }
        if (parsed?.type === "metadata" && parsed?.usage) {
          usage = parsed.usage;
        }
      } catch {
        // ignore non-JSON lines
      }
    });

  if (!content) {
    throw new Error("llm_chat returned no content");
  }

  return {
    provider: "codex",
    content,
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    },
  };
}
