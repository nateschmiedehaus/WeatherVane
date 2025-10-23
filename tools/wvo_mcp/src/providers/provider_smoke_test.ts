#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

import { getProviderMetadata, listProviders, isProviderEnabled } from "./registry.js";
import type { ProviderMetadata } from "./types.js";

interface SmokeResult {
  providerId: string;
  label: string;
  status: "ok" | "warning" | "error";
  messages: string[];
}

function checkRequiredEnv(metadata: ProviderMetadata): SmokeResult {
  const messages: string[] = [];
  const missingEnv = (metadata.requiredEnv || []).filter((key) => !process.env[key]);

  if (missingEnv.length) {
    messages.push(`Missing required environment variables: ${missingEnv.join(", ")}`);
    return {
      providerId: metadata.id,
      label: metadata.label,
      status: "error",
      messages,
    };
  }

  messages.push("All required environment variables present.");
  return {
    providerId: metadata.id,
    label: metadata.label,
    status: "ok",
    messages,
  };
}

function runCommand(command: string[], cwd?: string): { ok: boolean; output: string } {
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (result.error) {
    return { ok: false, output: result.error.message };
  }
  if (typeof result.status === "number" && result.status !== 0) {
    return { ok: false, output: result.stderr || result.stdout || `exit code ${result.status}` };
  }
  return { ok: true, output: result.stdout?.trim() ?? "" };
}

function smokeTestProvider(metadata: ProviderMetadata): SmokeResult {
  const envCheck = checkRequiredEnv(metadata);
  const messages = [...envCheck.messages];

  if (envCheck.status === "error") {
    return {
      providerId: metadata.id,
      label: metadata.label,
      status: "error",
      messages,
    };
  }

  if (!metadata.smokeTest) {
    messages.push("No smoke test defined; environment variables verified.");
    return {
      providerId: metadata.id,
      label: metadata.label,
      status: "warning",
      messages,
    };
  }

  if (metadata.smokeTest.type === "command" && metadata.smokeTest.command) {
    const { ok, output } = runCommand(metadata.smokeTest.command);
    if (ok) {
      messages.push("Smoke command succeeded.");
      if (output) {
        messages.push(output);
      }
      return {
        providerId: metadata.id,
        label: metadata.label,
        status: "ok",
        messages,
      };
    }
    messages.push("Smoke command failed:");
    messages.push(output);
    return {
      providerId: metadata.id,
      label: metadata.label,
      status: "error",
      messages,
    };
  }

  messages.push(metadata.smokeTest.description ?? "Smoke test passed (environment verified).");
  return {
    providerId: metadata.id,
    label: metadata.label,
    status: "ok",
    messages,
  };
}

function formatResult(result: SmokeResult): string {
  const header = `${result.status.toUpperCase()}  ${result.providerId} — ${result.label}`;
  const details = result.messages.map((line) => `  • ${line}`).join("\n");
  return `${header}\n${details}`;
}

function parseArguments(): { providerIds: string[]; includeStaging: boolean } {
  const args = process.argv.slice(2);
  const providerIds: string[] = [];
  let includeStaging = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--provider" || arg === "-p") {
      const value = args[i + 1];
      if (value) {
        providerIds.push(value);
        i += 1;
      }
    } else if (arg === "--include-staging") {
      includeStaging = true;
    }
  }

  return { providerIds, includeStaging };
}

function main() {
  const { providerIds, includeStaging } = parseArguments();

  const selectedProviders = providerIds.length
    ? providerIds
    : listProviders({ includeStaging }).map((provider) => provider.id);

  const uniqueProviders = Array.from(new Set(selectedProviders));
  const results: SmokeResult[] = [];

  for (const providerId of uniqueProviders) {
    const metadata = getProviderMetadata(providerId);
    if (!metadata) {
      results.push({
        providerId,
        label: providerId,
        status: "error",
        messages: ["Unknown provider id"],
      });
      continue;
    }

    if (!includeStaging && metadata.staging && !isProviderEnabled(metadata)) {
      results.push({
        providerId: metadata.id,
        label: metadata.label,
        status: "warning",
        messages: [
          "Provider is staging-only. Re-run with --include-staging or enable via environment variable.",
        ],
      });
      continue;
    }

    results.push(smokeTestProvider(metadata));
  }

  let exitCode = 0;
  for (const result of results) {
    console.log(formatResult(result));
    console.log("");
    if (result.status === "error") {
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main();
