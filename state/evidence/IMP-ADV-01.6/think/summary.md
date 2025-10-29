# THINK Summary

## Key Design Decisions
- **Pluggable backend**: Introduce `EmbeddingBackend` protocol with implementations `TFIDFBackend` and `NeuralBackend`. `compute_task_embedding()` delegates to backend selected via (priority order) CLI argument → env var (`QUALITY_GRAPH_EMBEDDINGS`) → config flag (`quality_graph.embeddings`) → default `tfidf`. Avoids touching TypeScript persistence logic.
- **Neural model management**: Use `sentence-transformers` with explicit model path resolution. Allow override via `QUALITY_GRAPH_EMBED_MODEL_PATH` or config JSON. If unavailable, raise descriptive error suggesting `ensureQualityGraphPython --sync-models` (new bootstrap subcommand) or manual download instructions.
- **Determinism + Performance**: Cache `SentenceTransformer` singleton, set `torch.set_num_threads(1)`, disable gradients. Pre-normalize embeddings to unit norm using numpy to mirror existing verification.
- **Ablation harness**: Build Python script (e.g., `compare_embeddings.py`) that loads labeled pairs from `state/evidence/IMP-ADV-01.3/sample_tasks.json`, generates embeddings for both backends, and computes metrics; output includes precision@k, MAP, recall, and latency. Use `random.seed(0)` and deterministic iteration order for reproducibility.
- **Testing**: Add pytest module verifying backend selection, normalization, and error messaging. Mock neural backend when sentence-transformers unavailable to keep unit tests light; integration tests triggered conditionally when model present.

## Information Gaps & Resolution
- **Model artifact availability**: Need to confirm whether repo already stores MiniLM weights; initial search found none. Plan: document manual download path and rely on bootstrap helper to check; if testing requires actual embeddings, prepare to request network approval for one-time download or use local wheel cache if present.
- **Flag plumbing location**: Determine where configuration is loaded (likely `tools/wvo_mcp/src/quality_graph/config.ts` or global `config/live_flags`). Will inspect during implementation to ensure runtime respects new `quality_graph.embeddings` key.
- **Evaluation dataset freshness**: Validate IMP-ADV-01.3 dataset size and ensure license for storing new metrics. If dataset insufficient (n<30 tasks), augment by combining with latest `state/quality_graph/task_vectors.jsonl` filtered by manual tags.

## Edge Cases to Handle
- Missing or corrupt model files → fallback error message without crash.
- CPU-only environment (no torch GPU) — ensure dependencies pinned to CPU wheels.
- Mixed-language tasks; neural embeddings should capture semantics; ensure tests include non-English tokens to verify normalization.
- CLI usage in automation contexts where env var not set; default to `tfidf` to avoid breaking existing jobs.
