# Implementation Notes

## Session Log
- TBD — populate with concrete actions (file changes, scripts run) as implementation progresses.
- Refactored `embeddings.py` into pluggable backend architecture with TF-IDF and neural MiniLM support, including environment/config-driven mode resolution and error messaging.
- Added `--embedding-mode` flag and error handling to `record_task_vector.py` and `query_similar_tasks.py`.
- Introduced `QUALITY_GRAPH_EMBEDDINGS` live flag plumbing via feature gates and recorder wiring.
- Extended Python requirements with `torch`, `transformers`, `accelerate`, and `sentence-transformers`; documented embedding modes and bootstrap instructions in `quality_graph/README.md`.
- Created `embedding_ablation.py` script to compare TF-IDF vs neural embeddings using IMP-ADV-01.3 evaluation dataset.
- Added package initializers under `tools/wvo_mcp/scripts/quality_graph/{__,tests}/__init__.py` to fix pytest import path.
- Installed torch + sentence-transformers dependencies via pip for ablation; note to cache wheels for CI.
- Updated emoji filtering to avoid stripping non-Latin characters.
