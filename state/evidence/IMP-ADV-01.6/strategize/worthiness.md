# Worthiness & Kill Switches

## Why Now
- Observability + baseline integration (IMP-ADV-01.1..01.5) completed; roadmap calls out neural upgrade as next value lever once infrastructure ready.
- Manual reviews show TF-IDF misses semantic matches (e.g., "bootstrap helper" vs "venv bootstrap"), lowering planner hint quality; neural embeddings should reduce drift risk when similar tasks diverge lexically.
- Upcoming prompting improvements will rely on higher-quality hints; upgrading embeddings beforehand prevents cascading rework.

## Expected Value
- Anticipated ≥10-15% lift in retrieval precision improves plan quality and observer baselines, reducing false anomalies.
- Provides foundation for future features (IMP-ADV-01.7 vector DB, prompt compiler integration) with modern embedding standard.

## Investment / Effort
- Engineering estimate: 5-6 focused hours including evaluation and documentation.
- Additional cost: manage 100MB model artifact + dependency footprint; mitigated via cached wheels + manual sync instructions.

## Kill Triggers
- Abort if neural model cannot be vendored/offline-accessed within current infra (no approval to ship large artifact, or licensing conflict).
- Abort if ablation fails to show ≥10% relative gain (flag results, revert to TF-IDF until better model chosen).
- Abort if dependency stack conflicts with existing Python tooling (torch import failure or bootstrap scripts break) and remediation exceeds scope.

## Out-of-Scope
- Migrating storage to vector DB (IMP-ADV-01.7).
- Prompt compiler integration or live hint rewriting (covered in later tracks).
- Cloud inference; on-device only.
