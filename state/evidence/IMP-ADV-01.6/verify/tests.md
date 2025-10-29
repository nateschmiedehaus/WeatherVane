# Verification Commands

## TypeScript Suite (serial)
- Command: `npm --prefix tools/wvo_mcp run test -- --runInBand`
- Result: PASS (1597 tests, 12 skipped, duration ~160s)
- Notes: Run in serial mode to avoid lease contention in critic approval integration tests.

## Python Unit Tests
- Command: `python -m pytest tools/wvo_mcp/scripts/quality_graph/tests/test_embeddings.py`
- Result: PASS (28 tests)

## Embedding Ablation
- Command: `QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1 python tools/wvo_mcp/scripts/quality_graph/embedding_ablation.py . --output state/evidence/IMP-ADV-01.6/verify/neural_vs_tfidf_ablation.json`
- Result: PASS (neural precision@5 = 0.27 vs TF-IDF 0.19, MAP improvement ~+5.6pp)
