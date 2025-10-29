# Alternatives Considered

1. **Embed Persona Hashing in Prompt Compiler (IMP-21)**
   - *Pros:* Single module owns serialization, fewer cross-module exports.
   - *Cons:* Compiler already in-flight; mixing persona logic complicates Claude’s work and duplicates persona router validation. Harder to reuse hash in tool router/telemetry outside prompt compilation.
   - *Decision:* Keep hashing in persona router module; expose helper to compiler.

2. **Persist Full PersonaSpec in Attestation**
   - *Pros:* Human-readable diff in history.
   - *Cons:* Inflates JSONL logs, complicates drift detection (string diff). Hash + minimal summary strikes balance; detailed persona data can live elsewhere if needed.
   - *Decision:* Store hash + optional summary (phase role, overlays) to keep logs compact.

3. **New Telemetry Counter vs. Metadata**
   - *Option A:* Add `persona_drift_detected` counter.
   - *Option B:* Reuse `prompt_drift_detected` with metadata `dimension: persona`.
   - *Decision:* Prefer Option B to avoid counter explosion; only create new counter if telemetry reviewers insist.
