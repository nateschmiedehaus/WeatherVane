import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "..", "..", "..");

export interface SeedWorkspaceOptions {
  copyAccountManager?: boolean;
}

export interface RunCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  { cwd, env, timeoutMs = 60_000 }: RunCommandOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

    const timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Autopilot script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

export function runAutopilotScript(
  scriptPath: string,
  options: RunCommandOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runCommand("bash", [scriptPath], options);
}

export function createStubCodex(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const codexPath = path.join(binDir, "codex");
  const script = `#!/usr/bin/env bash
set -euo pipefail
cmd=$1
shift || true
case "$cmd" in
  status)
    echo "Codex stub status: logged in as autopilot-tester"
    exit 0
    ;;
  login)
    if [ "\${1:-}" = "status" ]; then
      echo "Logged in as autopilot-tester"
    else
      echo "Codex login stub"
    fi
    exit 0
    ;;
  mcp)
    exit 0
    ;;
  exec)
    if [ -n "\${WVO_CLI_STUB_EXEC_PATH:-}" ] && [ -f "\${WVO_CLI_STUB_EXEC_PATH}" ]; then
      cat "\${WVO_CLI_STUB_EXEC_PATH}"
    elif [ -n "\${WVO_CLI_STUB_EXEC_JSON:-}" ]; then
      printf '%s\n' "\${WVO_CLI_STUB_EXEC_JSON}"
    else
      printf '%s\n' '{"completed_tasks":[],"in_progress":[],"blockers":["stub-usage"],"next_focus":[],"notes":"codex exec stub"}'
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`;
  writeFileSync(codexPath, script, "utf8");
  chmodSync(codexPath, 0o755);
}

function seedYamlModule(stubRoot: string): void {
  const yamlDir = path.join(stubRoot, "tools", "wvo_mcp", "node_modules", "yaml", "dist");
  mkdirSync(yamlDir, { recursive: true });
  const yamlModule = `const parse = (source) => {
  if (typeof source !== "string" || !source.trim()) {
    return {};
  }
  try {
    return JSON.parse(source);
  } catch {
    return {};
  }
};
const stringify = (value) => JSON.stringify(value);
export { parse, stringify };
export default { parse, stringify };
`;
  writeFileSync(path.join(yamlDir, "index.js"), yamlModule, "utf8");
}

export function seedAutopilotWorkspace(options: SeedWorkspaceOptions = {}): {
  workspace: string;
  scriptPath: string;
} {
  const { copyAccountManager = false } = options;
  const workspace = mkdtempSync(path.join(tmpdir(), "wvo-autopilot-"));

  const toolsDir = path.join(workspace, "tools", "wvo_mcp");
  const scriptsDir = path.join(toolsDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });

  const distDir = path.join(toolsDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, "index-claude.js"), "export default () => {}", "utf8");
  writeFileSync(path.join(distDir, "index.js"), "export default () => {}", "utf8");

  const nodeModulesDir = path.join(toolsDir, "node_modules");
  mkdirSync(nodeModulesDir, { recursive: true });
  seedYamlModule(workspace);

  const docsDir = path.join(workspace, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(path.join(docsDir, "wvo_prompt.md"), "# Autopilot Prompt\n", "utf8");

  const stateDir = path.join(workspace, "state");
  mkdirSync(stateDir, { recursive: true });
  seedFlagshipArtifacts(stateDir);

  const autopilotSource = path.join(packageRoot, "scripts", "autopilot.sh");
  const autopilotDest = path.join(scriptsDir, "autopilot.sh");
  copyFileSync(autopilotSource, autopilotDest);
  chmodSync(autopilotDest, 0o755);

  const configureSource = path.join(packageRoot, "scripts", "configure_codex_profile.py");
  const configureDest = path.join(scriptsDir, "configure_codex_profile.py");
  copyFileSync(configureSource, configureDest);
  chmodSync(configureDest, 0o755);

  if (copyAccountManager) {
    const accountManagerSource = path.join(packageRoot, "scripts", "account_manager.py");
    const accountManagerDest = path.join(scriptsDir, "account_manager.py");
    copyFileSync(accountManagerSource, accountManagerDest);
    chmodSync(accountManagerDest, 0o755);
  }

  return { workspace, scriptPath: autopilotDest };
}

function seedFlagshipArtifacts(stateDir: string): void {
  const write = (relativePath: string, content: string) => {
    const filePath = path.join(stateDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  };

  // Experience flow
  write(
    path.join("artifacts", "experience_flow", "journey.md"),
    `# Journey Blueprint

${"awareness onboarding scenario execution follow-up weather insight ".repeat(28)}
The orchestrated journey keeps stakeholders aligned from first touch to recurring value.`,
  );
  write(
    path.join("artifacts", "experience_flow", "demo_script.md"),
    `${"demo flow story conversion call to action weather animation momentum ".repeat(22)}
Demo choreography, setup time, and conversion hooks remain synchronized across weather states.`,
  );

  // Weather aesthetic
  write(
    path.join("artifacts", "weather_aesthetic", "themes.json"),
    JSON.stringify(
      {
        version: "stub",
        themes: [
          { name: "sunny", palette: ["#FFE066", "#FFB347"], typography: ["Display", "Sans"] },
          { name: "rain", palette: ["#0E1E3D", "#3A6EA5"], typography: ["Nimbus", "Suisse"] },
          { name: "snow", palette: ["#EAF2FF", "#5D8BF4"], typography: ["Cirrus", "Grotesk"] },
          { name: "storm", palette: ["#040814", "#FF3366"], typography: ["Tempest", "Montreal"] },
        ],
        transitions: {
          "sunny->rain": { animation: "gradient-shift" },
          "rain->snow": { animation: "crystal-fade" },
          "snow->storm": { animation: "flash-transition" },
          "storm->sunny": { animation: "horizon-break" },
        },
        accessibility: { contrastRating: "AA+", motionPreferences: { reducedMotion: "fade" } },
      },
      null,
      2,
    ),
  );
  write(
    path.join("artifacts", "weather_aesthetic", "screenshot_catalog.md"),
    [
      "# Inspiration Screens",
      "- Framer climate dashboard with color palette swaps and motion cues.",
      "- Webflow storm control center capturing SiteInspire pacing.",
      "- Awwwards ambient experience demonstrating typography shifts.",
      "- SiteInspire responsive panel showing motion-sensitive treatments.",
      "- Behance retail concept exploring inclusive color palette options.",
      "- Internal capture blending weather animation with conversion copy.",
    ].join("\n"),
  );

  // Motion design
  write(
    path.join("artifacts", "motion", "motion_specs.md"),
    `Motion specs document easing, timeline beats, framer motion choreography, weather transition signals, and micro-interaction guardrails across fps budgets.\n${"easing timeline framer motion weather transition micro-interaction fps ".repeat(20)}`,
  );
  write(
    path.join("artifacts", "motion", "prototype_links.md"),
    [
      "https://stub.example.com/framer-prototype?ref=framer",
      "https://stub.example.com/lottie/weather-transition?ref=lottie",
      "https://stub.example.com/after-effects/title?ref=after%20effects",
      "Prototype references validated for smoke mode.",
    ].join("\n"),
  );

  // Responsive surface
  write(
    path.join("artifacts", "responsive", "layouts.json"),
    JSON.stringify(
      {
        breakpoints: [
          { id: "mobile", min: 0, max: 599, notes: "mobile" },
          { id: "tablet", min: 600, max: 1023, notes: "tablet" },
          { id: "desktop", min: 1024, max: 1439, notes: "desktop" },
          { id: "large", min: 1440, max: 4000, notes: "large" },
        ],
        components: { hero: { mobile: {}, desktop: {}, large: {} } },
      },
      null,
      2,
    ),
  );
  write(
    path.join("artifacts", "responsive", "testing_report.md"),
    `Lighthouse and WebPageTest runs confirm accessibility, touch gestures, and performance budget compliance.\n${"lighthouse webpagetest accessibility touch gestures performance budget ".repeat(18)}`,
  );

  // Inspiration
  write(
    path.join("artifacts", "inspiration", "analysis.md"),
    `Framer, Webflow, Awwwards, and SiteInspire references analysed for motion language, color theory, and interaction cue adoption.\n${"Framer Webflow Awwwards SiteInspire motion language color theory interaction cue ".repeat(18)}`,
  );
  ["refA", "refB", "refC"].forEach((folder) => {
    mkdirSync(path.join(stateDir, "web_inspiration", folder), { recursive: true });
    write(path.join("web_inspiration", folder, "notes.md"), `Stub inspiration set ${folder}.`);
  });

  // Stakeholder narrative
  write(
    path.join("artifacts", "stakeholder", "narrative.md"),
    `Executive summary for CMO, marketing operations, and analyst personas highlights weather signal driven return on investment with storytelling artifacts.\n${"CMO marketing operations analyst return on investment weather signal storytelling executive summary ".repeat(16)}`,
  );
  write(
    path.join("artifacts", "stakeholder", "persona_matrix.json"),
    JSON.stringify(
      {
        personas: [
          { id: "cmo", label: "CMO Visionary" },
          { id: "marketing-ops", label: "Marketing Operations Lead" },
          { id: "analyst", label: "Revenue Analyst" },
        ],
      },
      null,
      2,
    ),
  );

  // Demo conversion
  write(
    path.join("artifacts", "demo", "demo_plan.md"),
    `Value proposition emphasises weather-driven insight, setup time under five minutes, and demo choreography culminating in a compelling call to action.\n${"value proposition weather-driven insight setup time demo choreography call to action ".repeat(18)}`,
  );
  write(
    path.join("artifacts", "demo", "metrics.json"),
    JSON.stringify(
      {
        conversionRate: { target: 0.4 },
        timeToValue: { targetMinutes: 5 },
        signupFunnel: { steps: ["demo", "signup"] },
        weatherHook: { headline: "Weather-driven urgency" },
      },
      null,
      2,
    ),
  );
  write(
    path.join("artifacts", "demo", "performance_report.md"),
    `TTFB, LCP, CLS, and performance budget targets validated with fallback strategies for demo resilience.\n${"TTFB LCP CLS performance budget fallback ".repeat(18)}`,
  );

  // Integration completeness
  write(
    path.join("artifacts", "integration", "integration_matrix.json"),
    JSON.stringify(
      {
        weather: ["Open-Meteo"],
        marketing: ["Meta Ads"],
        analytics: ["Snowflake"],
        payments: ["Stripe"],
      },
      null,
      2,
    ),
  );
  write(
    path.join("artifacts", "integration", "test_report.md"),
    `Postman contract testing across webhooks ensures resilience and alerts coverage.\n${"Postman contract testing webhooks resilience alerts ".repeat(18)}`,
  );
}
