#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseJsonPayload(value) {
  if (value === undefined) {
    return Promise.resolve({});
  }

  if (value === "-") {
    const stdinData = [];
    return new Promise((resolve, reject) => {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => stdinData.push(chunk));
      process.stdin.on("error", reject);
      process.stdin.on("end", () => {
        const raw = stdinData.join("");
        try {
          const parsed = raw.trim() ? JSON.parse(raw) : {};
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON from stdin: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });
  }

  try {
    return Promise.resolve(JSON.parse(value));
  } catch (error) {
    throw new Error(`Failed to parse JSON payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveWorkspace(explicitWorkspace) {
  if (explicitWorkspace) {
    return path.resolve(explicitWorkspace);
  }
  const envWorkspace = process.env.WEATHERVANE_WORKSPACE;
  if (envWorkspace) {
    return path.resolve(envWorkspace);
  }
  return path.resolve(__dirname, "..", "..", "..");
}

function resolveEntry(explicitEntry, workspaceRoot) {
  if (explicitEntry) {
    return path.resolve(explicitEntry);
  }
  return path.join(workspaceRoot, "tools", "wvo_mcp", "dist", "index.js");
}

function createErrorFromRpc(rpcError) {
  const message = rpcError?.message ?? "MCP tool returned an unknown error.";
  const error = new Error(message);
  if (rpcError?.code !== undefined) {
    error.code = rpcError.code;
  }
  if (rpcError?.data !== undefined) {
    error.details = rpcError.data;
  }
  return error;
}

function parseCliArguments(argv) {
  const args = [...argv];
  let toolName;
  let payloadArg;
  let workspaceArg;
  let entryArg;
  let rawOutput = false;

  while (args.length > 0) {
    const current = args.shift();
    if (current === "--workspace" && args.length > 0) {
      workspaceArg = args.shift();
      continue;
    }
    if (current === "--entry" && args.length > 0) {
      entryArg = args.shift();
      continue;
    }
    if (current === "--raw") {
      rawOutput = true;
      continue;
    }
    if (!toolName) {
      toolName = current;
      continue;
    }
    if (!payloadArg) {
      payloadArg = current;
      continue;
    }
    throw new Error(`Unexpected argument "${current}". Usage: mcp_tool_cli.mjs <tool> [json] [--workspace path] [--entry path] [--raw]`);
  }

  if (!toolName) {
    throw new Error("Missing tool name. Usage: mcp_tool_cli.mjs <tool> [json] [--workspace path] [--entry path] [--raw]");
  }

  return { toolName, payloadArg, workspaceArg, entryArg, rawOutput };
}

function createServer(workspaceRoot, entryPath) {
  const absoluteEntry = path.resolve(entryPath);
  const args = [absoluteEntry, "--workspace", workspaceRoot];
  const isDistEntry = absoluteEntry.includes(`${path.sep}dist${path.sep}`);
  if (isDistEntry) {
    args.push("--lazy-runtime");
  }
  return spawn("node", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function callTool({ toolName, payload, workspaceRoot, entryPath }) {
  const server = createServer(workspaceRoot, entryPath);
  const pending = new Map();
  let closed = false;
  let rl;

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      server.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      rl?.close();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!server.killed) {
        server.kill();
      }
    }, 50);
  };

  return new Promise((resolve, reject) => {
    const failOutstanding = (error) => {
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
    };

    server.on("error", (error) => {
      failOutstanding(error);
      cleanup();
      reject(error);
    });

    server.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    rl = readline.createInterface({ input: server.stdout });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let message;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        process.stderr.write(`Received non-JSON output from MCP server: ${trimmed}\n`);
        return;
      }

      if (message.id === undefined || message.id === null) {
        return;
      }

      const request = pending.get(message.id);
      if (!request) {
        return;
      }
      pending.delete(message.id);

      if (message.error) {
        request.reject(createErrorFromRpc(message.error));
        return;
      }

      request.resolve(message.result);
    });

    server.on("close", (code) => {
      cleanup();
      if (pending.size > 0) {
        const error = new Error(`MCP server exited before completing all requests (exit code ${code ?? 0}).`);
        failOutstanding(error);
        reject(error);
      }
    });

    const sendRequest = (payload) =>
      new Promise((resolveRequest, rejectRequest) => {
        pending.set(payload.id, { resolve: resolveRequest, reject: rejectRequest });
        server.stdin.write(`${JSON.stringify(payload)}\n`);
      });

    const initialize = async () => {
      await sendRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "weathervane-mcp-cli",
            version: "0.1.0",
          },
        },
      });
    };

    const invokeTool = async () => {
      const result = await sendRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: payload,
        },
      });
      resolve(result);
      cleanup();
    };

    initialize()
      .then(invokeTool)
      .catch((error) => {
        failOutstanding(error);
        cleanup();
        reject(error);
      });
  });
}

function maybeExtractStructuredResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  if (!Array.isArray(result.content) || result.content.length === 0) {
    return null;
  }

  const parsed = [];
  for (const item of result.content) {
    if (!item || typeof item !== "object" || item.type !== "text" || typeof item.text !== "string") {
      return null;
    }
    const trimmed = item.text.trim();
    if (!trimmed) {
      parsed.push(null);
      continue;
    }
    try {
      parsed.push(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (parsed.length === 1) {
    return parsed[0] ?? null;
  }
  return parsed;
}

async function main() {
  try {
    const { toolName, payloadArg, workspaceArg, entryArg, rawOutput } = parseCliArguments(process.argv.slice(2));
    const workspaceRoot = resolveWorkspace(workspaceArg);
    const entryPath = resolveEntry(entryArg, workspaceRoot);

    if (!fs.existsSync(entryPath)) {
      throw new Error(
        `MCP entry not found at ${entryPath}. Run 'npm run build --prefix tools/wvo_mcp' to regenerate dist files.`,
      );
    }

    const payload = await parseJsonPayload(payloadArg);

    const result = await callTool({
      toolName,
      payload,
      workspaceRoot,
      entryPath,
    });

    const structured = maybeExtractStructuredResult(result);
    const outputData = structured ?? result;
    const output = rawOutput ? JSON.stringify(outputData) : JSON.stringify(outputData, null, 2);
    process.stdout.write(`${output}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (error?.details !== undefined) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
    process.exitCode = 1;
  }
}

await main();
