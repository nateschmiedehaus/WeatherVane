# Open Questions

1. **Compiler Interface Contract:** Does IMP-21 expose a persona slot that expects serialized text or structured object? Need sync with Claude before implementation.
2. **Telemetry Naming:** Should persona drift share the `prompt_drift_detected` counter or have a dedicated metric? Await Observability feedback.
3. **Ledger Schema Versioning:** Is adding `persona_hash` to entries considered a schema change that requires MANIFEST/Atlas updates?
4. **Default Persona Handling:** What should we hash when persona selection is “neutral” or absent? Proposed: hash canonical representation of empty spec, but confirm with product owners.
