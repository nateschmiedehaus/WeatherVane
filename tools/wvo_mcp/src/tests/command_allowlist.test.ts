import { describe, expect, it } from "vitest";

import {
  ALLOWED_COMMANDS,
  ensureAllowedCommand,
  ensureCommandSafe,
  GuardrailViolation,
  isCommandAllowed,
} from "../executor/guardrails.js";

describe("isCommandAllowed", () => {
  it("returns true for allow-listed binaries", () => {
    expect(isCommandAllowed("npm run build")).toBe(true);
    expect(isCommandAllowed("bash -lc \"echo ok\"")).toBe(true);
    expect(isCommandAllowed("./scripts/restart_mcp.sh")).toBe(true);
  });

  it("returns false for binaries outside the allow-list", () => {
    expect(isCommandAllowed("curl https://example.com")).toBe(false);
    expect(isCommandAllowed("FOO=bar")).toBe(false);
  });

  it("returns false when command chaining or substitution is detected", () => {
    expect(isCommandAllowed("npm run lint && ls")).toBe(false);
    expect(isCommandAllowed("ls | grep src")).toBe(false);
    expect(isCommandAllowed("echo hello\nls")).toBe(false);
    expect(isCommandAllowed("echo $(ls)")).toBe(false);
  });
});

describe("ensureAllowedCommand", () => {
  it("allows known binaries", () => {
    expect(() => ensureAllowedCommand("npm run build")).not.toThrow();
    expect(() => ensureAllowedCommand("python3 scripts/setup.py")).not.toThrow();
    expect(() => ensureAllowedCommand("bash -lc \"echo ok\"")).not.toThrow();
    expect(() => ensureAllowedCommand("which npm")).not.toThrow();
    expect(() => ensureAllowedCommand("nl README.md")).not.toThrow();
  });

  it("allows explicitly whitelisted scripts", () => {
    expect(() => ensureAllowedCommand("./scripts/restart_mcp.sh")).not.toThrow();
  });

  it("ignores environment variable assignments when extracting the binary", () => {
    expect(() => ensureAllowedCommand("NODE_ENV=production npm run lint")).not.toThrow();
  });

  it("blocks chained commands even when the first binary is allowed", () => {
    expect(() => ensureAllowedCommand("npm run lint && ls")).toThrow(GuardrailViolation);
    expect(() => ensureAllowedCommand("cd apps && npm run lint")).toThrow(GuardrailViolation);
  });

  it("blocks pipes and command substitution constructs", () => {
    expect(() => ensureAllowedCommand("ls | grep src")).toThrow(GuardrailViolation);
    expect(() => ensureAllowedCommand("echo $(ls)")).toThrow(GuardrailViolation);
    expect(() => ensureAllowedCommand("`ls`")).toThrow(GuardrailViolation);
  });

  it("blocks multi-line commands", () => {
    expect(() => ensureAllowedCommand("ls\\necho 1")).toThrow(GuardrailViolation);
  });

  it("blocks binaries that are not in the allow-list", () => {
    expect(() => ensureAllowedCommand("curl https://example.com")).toThrow(GuardrailViolation);
  });

  it("blocks local scripts that are not explicitly allowed", () => {
    expect(() => ensureAllowedCommand("./scripts/hack.sh")).toThrow(GuardrailViolation);
  });

  it("fails fast when no executable binary can be determined", () => {
    expect(() => ensureAllowedCommand("FOO=bar")).toThrow(GuardrailViolation);
  });

  it("shares the allow-list contents for error messaging", () => {
    try {
      ensureAllowedCommand("curl https://example.com");
      expect.unreachable("GuardrailViolation expected");
    } catch (error) {
      const message = (error as GuardrailViolation).message;
      for (const binary of ALLOWED_COMMANDS) {
        expect(message).toContain(binary);
      }
    }
  });

  it("restricts cd commands to paths inside the workspace", () => {
    expect(() => ensureCommandSafe("cd apps", process.cwd())).not.toThrow();
    expect(() => ensureCommandSafe("cd ..", process.cwd())).toThrow(GuardrailViolation);
    expect(() => ensureCommandSafe("cd /etc", process.cwd())).toThrow(GuardrailViolation);
  });
});
