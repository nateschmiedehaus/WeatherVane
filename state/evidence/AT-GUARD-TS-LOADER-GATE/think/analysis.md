## Analysis
- `--import tsx` is the only loader currently installed in CI that works under Node 20; other loaders (ts-node) remain optional but unsupported today.
- Workflow steps may be inline (`run: node --import tsx ...`) or block literals. The guard must stitch multi-line commands before checking for `.ts` usage.
- False positives to avoid: `.mjs`, documentation references, or commands already using `npx tsx`.
- Extracting the step name improves remediation hints, so the parser walks upward to capture the nearest `name:` label.
