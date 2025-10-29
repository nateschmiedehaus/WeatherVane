# IMP-ADV-01.6 — Implementation Plan

## Work Breakdown
1. **Context Deep Dive**
   - Review existing TF-IDF pipeline (`embeddings.py`, recorder/query scripts) and TypeScript consumers to map embedder touch points.
   - Inspect IMP-ADV-01.3 dataset + metrics to reuse evaluation harness.
2. **Design Embedder Abstraction**
   - Refactor Python embedding module to expose pluggable strategy pattern (e.g., `EmbeddingBackend` interface + factory reading config/env/CLI flag).
   - Implement TF-IDF backend as compatibility layer; add neural backend using `sentence-transformers` with lazy load + deterministic settings.
3. **CLI & Flag Wiring**
   - Update `record_task_vector.py` and `query_similar_tasks.py` to accept `--embedding-mode` and respect environment `QUALITY_GRAPH_EMBEDDINGS` / config.
   - Extend `ensureQualityGraphPython()` bootstrap helper to validate/install neural deps + optional model directory presence, surfacing actionable guidance.
   - Update config/feature flag plumbing (likely `config/live_flags` or similar) to include `quality_graph.embeddings` default `tfidf`.
4. **Docs & Requirements**
   - Amend `requirements.txt` with `sentence-transformers` + supporting deps; document rationale + offline model instructions in README & improvement plan.
5. **Testing Harness**
   - Add unit tests covering TF-IDF vs neural pipelines (mocked model load, ensures shapes + normalization).
   - Implement ablation script that loads labeled dataset, runs both embed modes, computes metrics, writes JSON evidence.
   - Run CLI smoke for both modes.
6. **Verification & Evidence**
   - Execute ablation, capture metrics + commentary under `verify/`.
   - Run integrity + tracing smoke to confirm no regressions.
   - Prepare review summary + monitor notes (flag default, follow-up work like model sync automation).

## Sequencing Notes
- Keep TF-IDF path working at every step to avoid breaking existing flows.
- Add neural backend but gate usage until bootstrap + tests pass; evaluation runs near end after verifying pipeline.
- Ensure documentation updates happen before REVIEW to avoid late-stage gaps.

## Resource / Coordination
- Reuse existing Python virtualenv from IMP-ADV-01.5 (ensures bootstrap helper aligned).
- Coordinate with docs to update improvement plan statuses once verified.
- Potential approvals needed for network/model download; plan for manual instructions if approval denied.
