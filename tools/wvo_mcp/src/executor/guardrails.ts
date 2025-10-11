import path from "node:path";

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

export function ensureCommandSafe(cmd: string, workspaceRoot: string): void {
  const lower = cmd.toLowerCase();

  for (const [pattern, message] of DANGEROUS_SUBSTRINGS) {
    if (pattern.test(lower)) {
      throw new GuardrailViolation(message);
    }
  }

  const cdMatches = lower.match(/cd\s+([^\s;&|]+)/g) ?? [];
  for (const cdMatch of cdMatches) {
    const target = cdMatch.replace(/cd\s+/, "");
    if (target.startsWith("..") || target.startsWith("/")) {
      throw new GuardrailViolation(`Changing directories outside the workspace is not allowed: ${target}`);
    }
    const resolved = path.resolve(workspaceRoot, target);
    if (!resolved.startsWith(path.resolve(workspaceRoot))) {
      throw new GuardrailViolation(`Command attempts to leave workspace: ${cdMatch}`);
    }
  }
}
