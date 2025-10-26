# Autopilot Security Policy Snapshot

- Secrets never leave environment variables; prompts and LCPs must not embed tokens or credentials.
- Router restricts providers to Codex 5 + Claude 4.5; unknown model requests are rejected and logged.
- Context Fabric redacts sensitive anchors (no `.env`, no credential files) and stores only path references.
- Verify enforces security scans + license checks before Review can proceed.
- Attestation guard halts orchestrator startup if Atlas manifests or prompt hashes drift.
