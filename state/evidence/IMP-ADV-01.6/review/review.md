# Reviewer Checklist

## Summary
- Added neural embedding backend (`sentence-transformers/all-MiniLM-L6-v2`) with flaggable selection.
- Updated CLI scripts to accept `--embedding-mode` and propagate feature flag.
- Extended feature gates + live flags with `QUALITY_GRAPH_EMBEDDINGS`.
- Documented embedding modes, new dependencies, and offline bootstrap steps.
- Added ablation script + evidence showing neural precision lift.

## Code Risks
- **Torch dependency footprint**: Verified via `requirements.txt`; ensure caching to avoid repeated downloads.
- **Feature flag wiring**: Confirmed `MonitorRunner` passes `featureGates` to recorder and defaults to TF-IDF.
- **Unicode regression**: Pytest coverage for `preprocess_text` ensures CJK preserved.
- **Performance**: Latency ~219ms per embedding; documented for operators to weigh before enabling.

## Tests Reviewed
- `npm --prefix tools/wvo_mcp run test -- --runInBand`
- `python -m pytest tools/wvo_mcp/scripts/quality_graph/tests/test_embeddings.py`
- `embedding_ablation.py` run stored under `verify/neural_vs_tfidf_ablation.json`

## Follow-ups / Recommendations
- Consider caching MiniLM model under `tools/wvo_mcp/scripts/quality_graph/models/` to avoid repeated downloads for air-gapped runs.
- Evaluate gating neural mode behind staged rollout (shadow vs observe) once telemetry confirms latency acceptable.
