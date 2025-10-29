# IMP-ADV-01.6 — Strategy

## Reality Check
- Current quality graph embeddings rely on TF-IDF + random projection (`embeddings.py`), giving precision@5 ≈ baseline documented in `state/evidence/IMP-ADV-01.3/metrics.json` (~0.62) but plateauing on semantic matches (code vs prose, synonyms).
- No neural model support exists; requirements.txt lacks transformer deps; recorder/query scripts assume TF-IDF deterministic vocabulary; fallback logic absent.
- Prior phases (IMP-ADV-01..01.5) delivered recording, hints, observer integration, and bootstrap helpers, so infrastructure is ready for richer vectors.
- Neural upgrade deferred in plan; not yet scoped for offline model handling or evaluation pipeline.

## Objectives
1. Introduce sentence-transformer embeddings (target `all-MiniLM-L6-v2`, 384d) with reproducible, offline-friendly loading.
2. Preserve TF-IDF as fallback + comparison baseline for ablation and safe rollout (flag-controlled).
3. Produce quantitative evidence (`precision@k`, cosine similarity histograms) comparing neural vs TF-IDF using existing labeled pairs (IMP-ADV-01.3 dataset) and store under `verify/neural_vs_tfidf_ablation.json`.
4. Update docs/tooling (README, improvement plan references) so operators understand new dependencies, flags, and evaluation expectations.

## Constraints & Assumptions
- Network access restricted; model downloads must be optional/manual. Strategy: support local model directory override and document bootstrap recipe (reuse `ensureQualityGraphPython()` for wheels + model sync).
- Embedding dimension must stay 384 to remain compatible with downstream TypeScript schema (no JSON schema churn now).
- Need deterministic behavior for tests; set `SentenceTransformer` to use `torch.set_num_threads(1)` and disable randomness.
- Performance: embedding generation should stay <300ms cold / <80ms warm; cache model + optional thread pool reuse.

## Risks & Mitigations
- **Large model downloads**: Provide explicit guard + error message instructing manual download if model missing; do not auto-fetch without flag.
- **Dependency bloat**: `sentence-transformers` pulls torch; ensure requirements + bootstrap helper cope with CPU-only install and document wheel caching.
- **Regression in existing pipelines**: Maintain TF-IDF path behind feature flag (`quality_graph.embeddings` with `tfidf` default) and add unit tests for both modes.
- **Evaluation flakiness**: Reuse fixed dataset from IMP-ADV-01.3; seed random states; snapshot metrics in evidence; add CLI to run ablation deterministically.

## Success Metrics / Exit Criteria
- Neural embeddings integrated with configurable flag, default `tfidf`.
- Ablation shows ≥10% relative gain in precision@5 vs TF-IDF on labeled pairs.
- `tracing_smoke` / observer flows unaffected; quality graph scripts succeed in both modes.
- Documentation and evidence updated; bootstrap helper instructions cover new deps + model artifact handling.

## Selected Approach
Adopt pluggable embedder abstraction within Python scripts sharing base interface. Implement neural embedder using `sentence-transformers` with local path/env override and caching. Extend CLI commands + bootstrap helper for dependency/model validation. Provide TypeScript side flag + telemetry updates if needed (but embeddings consumed as-is). Conclude with verification script comparing both modes, writing structured results for review.
