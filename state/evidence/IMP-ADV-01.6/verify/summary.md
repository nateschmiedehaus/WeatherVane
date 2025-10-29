# Verification Summary

- Neural embeddings improve precision@5 from **0.19 → 0.27** (≈42% relative lift) on the IMP-ADV-01.3 evaluation corpus; MAP improves from **0.308 → 0.364**.
- `sentence-transformers/all-MiniLM-L6-v2` loaded via local torch install; average inference latency ≈219 ms vs 3.7 ms for TF-IDF.
- Full Vitest suite executed serially to avoid lease contention (`--runInBand`); all 1,585 tests passed (12 skipped).
- Python unit tests for embedding backends (`test_embeddings.py`) pass with new neural stubs and unicode coverage.
