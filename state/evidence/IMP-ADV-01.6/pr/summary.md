# PR Summary

## What Changed
- Introduced neural embedding backend (`sentence-transformers/all-MiniLM-L6-v2`) with configurable selection via `QUALITY_GRAPH_EMBEDDINGS` feature flag and CLI overrides.
- Refactored quality graph Python helpers into pluggable backends; updated tests to cover neural stubs and unicode handling.
- Added ablation tooling to compare TF-IDF vs neural embeddings; captured evidence showing precision@5 improvement (0.19 → 0.27).
- Updated docs and requirements to describe neural mode bootstrap, environment flags, and dependency installation.

## Testing
- `npm --prefix tools/wvo_mcp run test -- --runInBand`
- `python -m pytest tools/wvo_mcp/scripts/quality_graph/tests/test_embeddings.py`
- `QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1 python tools/wvo_mcp/scripts/quality_graph/embedding_ablation.py . --output state/evidence/IMP-ADV-01.6/verify/neural_vs_tfidf_ablation.json`

## Rollout / Flags
- Default remains `tfidf`; enable neural with `QUALITY_GRAPH_EMBEDDINGS=neural` once MiniLM weights available locally.
- Scripts respect `QUALITY_GRAPH_EMBED_MODEL_PATH` for offline installs; optional `QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1` allows HuggingFace fetch.
