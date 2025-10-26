Version: 2025-10-25

# Security Checklist (Unified Autopilot)

1. **Tool Access**
   - Use ABAC/RBAC wrappers for `shell.exec`, `git.push`, `deploy.*`.
   - Default to `dry_run` until Supervisor authorizes live changes.

2. **Secrets Handling**
   - Never load `.env` into prompts or logs.
   - Interact with secret managers or env vars via dedicated connectors only.

3. **Network & Filesystem**
   - No arbitrary `curl`/`wget`; whitelist providers.
   - Prevent destructive commands (`rm -rf`, package manager installs) unless policy-approved.

4. **Reviews & Journals**
   - Critical agent must scan for injections, secrets, and unsafe migrations.
   - Decision journal records high-severity findings and mitigation status.
