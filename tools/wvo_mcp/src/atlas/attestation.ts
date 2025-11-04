import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface BriefingPackAttestation {
  attestation?: {
    manifest_sha: string;
    prompt_registry_sha: string;
  };
}

function sha(absPath: string): string {
  const data = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifyAtlasAttestationSync(workspaceRoot: string): {
  manifestSha: string;
  promptRegistrySha: string;
} {
  const packPath = path.join(workspaceRoot, "docs/autopilot/AGENT_BRIEFING_PACK.json");
  if (!fs.existsSync(packPath)) {
    throw new Error("Atlas briefing pack missing. Run atlas generator before starting orchestrator.");
  }
  const pack = JSON.parse(fs.readFileSync(packPath, "utf-8")) as BriefingPackAttestation;
  if (!pack.attestation) {
    throw new Error("Atlas briefing pack lacks attestation block. Regenerate Atlas.");
  }

  const manifestPath = path.join(workspaceRoot, "docs/autopilot/MANIFEST.yml");
  const promptRegistryPath = path.join(workspaceRoot, "docs/autopilot/PROMPT_REGISTRY.md");

  const manifestSha = sha(manifestPath);
  const promptSha = sha(promptRegistryPath);

  if (pack.attestation.manifest_sha !== manifestSha || pack.attestation.prompt_registry_sha !== promptSha) {
    const diagnostics = {
      expected_manifest: pack.attestation.manifest_sha,
      current_manifest: manifestSha,
      expected_prompt_registry: pack.attestation.prompt_registry_sha,
      current_prompt_registry: promptSha,
    };
    const incidentDir = path.join(workspaceRoot, "state", "incidents");
    fs.mkdirSync(incidentDir, { recursive: true });
    const incidentPath = path.join(incidentDir, `atlas_attestation_${Date.now()}.json`);
    fs.writeFileSync(incidentPath, `${JSON.stringify(diagnostics, null, 2)}\n`);
    throw new Error(
      `Atlas attestation mismatch. Generated ${incidentPath}. Run atlas generator + validator before restarting.`,
    );
  }

  return { manifestSha, promptRegistrySha: promptSha };
}
