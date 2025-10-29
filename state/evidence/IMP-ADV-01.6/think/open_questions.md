# Open Questions

1. **Model Distribution**: Can we check in the MiniLM model artifacts to the repository, or must operators download manually? Need confirmation from policy (size/licensing). For now, assume manual download documented + optional caching via bootstrap helper.
2. **Feature Flag Location**: Which live flags file controls `quality_graph.*` settings? Need to inspect `config/live_flags` or orchestrator defaults before implementation.
3. **Evaluation Threshold**: What was baseline precision@5 for TF-IDF? Need to read `state/evidence/IMP-ADV-01.3/metrics.json` to set target delta precisely.
4. **CI Integration**: Should ablation script run in CI or only manually? Determine expectation to avoid runtime cost (neural inference might be slow); likely manual in VERIFY only.

## Resolutions (2025-10-29)
- **Model Distribution**: Retained manual download guidance; README now documents `QUALITY_GRAPH_EMBED_MODEL_PATH` and `QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1` flow.
- **Feature Flag Location**: Added `QUALITY_GRAPH_EMBEDDINGS` to `state/live_flags.ts` and exposed via `FeatureGates.getQualityGraphEmbeddingMode()`.
- **Evaluation Threshold**: Baseline precision@5 confirmed at 0.19 (see `state/evidence/IMP-ADV-01.3/metrics.json`); neural ablation achieved 0.27 (+42% relative).
- **CI Integration**: Ablation kept as manual VERIFY artifact; not wired into CI to avoid 200ms/model hit. Documented expectation in verification summary.
