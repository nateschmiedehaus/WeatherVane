import path from "node:path";
import type { LiveFlagsReader } from "../state/live_flags.js";
import { FeatureGates } from "../orchestrator/feature_gates.js";

export const ALLOWED_COMMANDS = [
  "bash",
  "sh",
  "git",
  "make",
  "mcp",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "python",
  "python3",
  "pip",
  "pip3",
  "pytest",
  "ruff",
  "mypy",
  "node",
  "ts-node",
  "tsc",
  "cd",
  "which",
  "nl",
  "ls",
  "cat",
  "tail",
  "head",
  "sed",
  "awk",
  "grep",
  "rg",
  "find",
  "echo",
  "docker",
  "./scripts/restart_mcp.sh"
] as const;

const ALLOWED_COMMAND_SET = new Set<string>(ALLOWED_COMMANDS);

type CommandSyntaxScan = {
  hasMultiline: boolean;
  hasChaining: boolean;
  hasCommandSubstitution: boolean;
};

function analyzeCommandSyntax(cmd: string): CommandSyntaxScan {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const scan: CommandSyntaxScan = {
    hasMultiline: false,
    hasChaining: false,
    hasCommandSubstitution: false,
  };

  for (let index = 0; index < cmd.length; index += 1) {
    const char = cmd[index];
    const prevChar = index > 0 ? cmd[index - 1] : "";
    const nextChar = index + 1 < cmd.length ? cmd[index + 1] : "";

    if (char === "\n" || char === "\r") {
      scan.hasMultiline = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote && prevChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "&") {
      if (nextChar === "&") {
        scan.hasChaining = true;
        index += 1;
        continue;
      }
      scan.hasChaining = true;
      continue;
    }

    if (char === "|" || char === ";") {
      scan.hasChaining = true;
      continue;
    }

    if (char === "$" && nextChar === "(") {
      scan.hasCommandSubstitution = true;
      continue;
    }

    if (char === "`") {
      scan.hasCommandSubstitution = true;
    }
  }

  return scan;
}

const DANGEROUS_SUBSTRINGS: Array<[RegExp, string]> = [
  [/\bsudo\b/, "Use of sudo is prohibited inside the orchestrated workspace."],
  [/rm\s+-rf\s+\/(\s|$)/, "Refusing to run rm -rf / commands."],
  [/rm\s+-rf\s+~(\s|$)/, "Refusing to run rm -rf ~ commands."],
  [/rm\s+-rf\s+\$HOME/, "Refusing to run rm -rf $HOME commands."],
  [/mkfs/i, "Filesystem formatting commands are blocked."],
  [/dd\s+if=/i, "Low-level disk operations are blocked."],
  [/shutdown\b/i, "Shutdown commands are blocked."],
  [/reboot\b/i, "Reboot commands are blocked."],
  [/chown\b/, "Changing ownership is not permitted."],
  [/chmod\s+777/, "chmod 777 is blocked; choose a narrower mode."],
  [/git\s+reset\s+--hard/, "git reset --hard is blocked to protect existing changes."],
  [/git\s+clean\s+-[fx]d/, "git clean destructive options are blocked."],
  [/git\s+checkout\s+--/, "git checkout -- is blocked to prevent discarding changes."],
  [/rm\s+-rf\s+\.git/, "Removing the .git directory is blocked."],
];

export class GuardrailViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardrailViolation";
  }
}

function extractCommandBinary(cmd: string): string {
  const tokens = cmd.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token || token.includes("=")) {
      continue;
    }
    return token;
  }
  return "";
}

function assertCommandSyntax(cmd: string, dangerGatesEnabled: boolean = false): void {
  const syntax = analyzeCommandSyntax(cmd);

  // Strict enforcement when DANGER_GATES='1'
  if (dangerGatesEnabled) {
    if (syntax.hasMultiline) {
      throw new GuardrailViolation("[DANGER_GATES] Multi-line commands are strictly prohibited.");
    }
    if (syntax.hasChaining) {
      throw new GuardrailViolation("[DANGER_GATES] Command chaining (&&, ||, |, ;, &) is strictly prohibited.");
    }
    if (syntax.hasCommandSubstitution) {
      throw new GuardrailViolation("[DANGER_GATES] Command substitution is strictly prohibited.");
    }
  } else {
    // Relaxed enforcement (default) - warnings only
    if (syntax.hasMultiline) {
      throw new GuardrailViolation("Multi-line commands are not permitted; invoke a single command per request.");
    }
    if (syntax.hasChaining) {
      throw new GuardrailViolation("Command chaining, pipes, backgrounding, or separators (&&, ||, |, ;, &) are not allowed.");
    }
    if (syntax.hasCommandSubstitution) {
      throw new GuardrailViolation("Command substitution ($(…) or backticks) is not permitted; invoke the target binary directly.");
    }
  }
}

export function ensureAllowedCommand(cmd: string, liveFlags?: LiveFlagsReader): void {
  const dangerGatesEnabled = liveFlags ? new FeatureGates(liveFlags).isDangerGatesEnabled() : false;
  assertCommandSyntax(cmd, dangerGatesEnabled);
  const binary = extractCommandBinary(cmd);
  if (!binary) {
    throw new GuardrailViolation("Unable to determine command binary; specify a direct command (no chaining).");
  }

  if (!isCommandAllowed(cmd)) {
    const allowList = Array.from(ALLOWED_COMMAND_SET).sort().join(", ");
    throw new GuardrailViolation(`Command '${binary}' is not permitted. Allowed commands: ${allowList}`);
  }
}

export function isCommandAllowed(cmd: string): boolean {
  const syntax = analyzeCommandSyntax(cmd);
  if (syntax.hasMultiline || syntax.hasChaining || syntax.hasCommandSubstitution) {
    return false;
  }

  const binary = extractCommandBinary(cmd);
  if (!binary) {
    return false;
  }

  if (binary.startsWith("./")) {
    return ALLOWED_COMMAND_SET.has(binary);
  }

  return ALLOWED_COMMAND_SET.has(binary);
}

export function ensureCommandSafe(cmd: string, workspaceRoot: string): void {
  const lower = cmd.toLowerCase();
  const root = path.resolve(workspaceRoot);

  for (const [pattern, message] of DANGEROUS_SUBSTRINGS) {
    if (pattern.test(lower)) {
      throw new GuardrailViolation(message);
    }
  }

  const cdMatches = lower.match(/cd\s+([^\s;&|]+)/g) ?? [];
  for (const cdMatch of cdMatches) {
    const target = cdMatch.replace(/cd\s+/, "");
    if (target === "" || target === "." || target === "./") {
      continue;
    }
    if (target.startsWith("..") || target.startsWith("/")) {
      throw new GuardrailViolation(`Changing directories outside the workspace is not allowed: ${target}`);
    }
    const resolved = path.resolve(workspaceRoot, target);
    if (!resolved.startsWith(root)) {
      throw new GuardrailViolation(`Command attempts to leave workspace: ${cdMatch}`);
    }
  }
}
