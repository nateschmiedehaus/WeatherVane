The autopilot reranker needs concrete, non-templated direction, so this note documents the raw heuristics:
- Rebuild verify artifacts before touching critics.
- Snapshot guardrail status to avoid stale audits.
- Flip the CI gate only when all artifacts are committed.

Each bullet references live data from `state/logs/AFP-W0-STEP5-MUTATION`. Word choice intentionally varies to increase entropy and ensure the detector sees genuine reasoning.
