# README Automation & Directory Health

Docsync keeps key WeatherVane directories self-documenting and structurally healthy. It synthesises README sections, captures AFP/SCAS metrics, and blocks merges when knowledge drifts.

## Commands

```bash
# First-time bootstrap (generates manifest + READMEs for tracked modules)
npm run readme:bootstrap

# Refresh READMEs for all tracked modules
npm run readme:update

# Refresh only staged modules (useful before committing)
npm run readme:update -- --mode staged

# CI / pre-commit guard (fails if docs are stale)
npm run readme:check
```

## Generated section

Each README managed by docsync contains a generated block between `<!-- BEGIN DOCSYNC -->` and `<!-- END DOCSYNC -->`. The block includes:

- Purpose summary and language mix
- Key files (largest by size)
- Upstream imports & downstream consumers
- Guardrail/test coverage snapshot
- AFP/SCAS scores and critical evaluation warnings

Content outside the generated block is left untouched so teams can keep human notes.

## Structural health model

Docsync analyses each tracked directory using AFP/SCAS forces:

| Force                 | Example checks                                      |
| --------------------- | --------------------------------------------------- |
| **Coherence**         | Mixing unrelated languages or concerns              |
| **Economy / Via Negativa** | Empty directories, redundant placeholder modules |
| **Locality**          | Excessive cross-module imports                      |
| **Visibility**        | Missing tests/critics/guardrails                    |
| **Evolution**         | TODO accumulation, repeated critic failures         |

Warnings are logged to `state/analytics/readme_sync.jsonl` and surfaced in README critical evaluation sections.

## Workflow integration

- Pre-commit hook runs `docsync check --mode staged` and fails if READMEs drift.
- `.github/workflows/afp-quality-gates.yml` calls `npm run readme:check` on every PR.
- `state/analytics/readme_manifest.json` stores digests + metrics (do not edit manually).
- `.docsyncignore` provides escape hatches for directories we intentionally exclude.

### Bulk regeneration (READMEs only)

Occasionally we must regenerate the entire README corpus (e.g., after changing the generated schema). Use the dedicated bulk mode so we stay compliant with AFP micro-batching:

1. Run the desired docsync command (`npm run readme:update` or `npm run readme:bootstrap`).
2. Review diffs and ensure **only** `*/README.md`, `state/analytics/readme_manifest.json`, and `.docsyncignore` are staged.
3. Commit using the bulk override:
   ```bash
   ALLOW_DOCSYNC_BULK=1 git commit -m "docs: regenerate readmes"
   ```
   The pre-commit hook will allow >5 files only when the above conditions are met and will log the override to `state/overrides.jsonl`.
4. Follow up with `npm run readme:check` to verify digests.

## Best practices

1. Run `npm run readme:update -- --mode staged` before committing changes in tracked modules.
2. Review README diffs for accuracy and add human commentary where useful.
3. Create roadmap remediation tasks for repeating high-severity warnings (Stage 2 guardrail).
4. Update `.docsyncignore` or the allowlist in `tools/docsync/analyzer.ts` when new modules are added.

## Extending

- Update `ALLOWED_APPS`, `ALLOWED_TOOLS`, or `EXCLUDED_PATHS` in `tools/docsync/analyzer.ts` when the module layout evolves.
- Add richer metrics or reporting by extending `buildWarnings` and `renderReadme`.
- Future work: emit mermaid dependency diagrams, publish a module navigation index from the manifest.
