# IMP-ADV-01.6 — Specification

## Acceptance Criteria
1. **Neural Embedder Implementation**: Quality graph embedding pipeline provides a neural encoder option (`sentence-transformers/all-MiniLM-L6-v2` by default) that emits 384-dimensional, unit-normalized vectors. CLI commands (`record_task_vector.py`, `query_similar_tasks.py`) accept a flag/env var to choose `neural` or `tfidf` and succeed in both modes.
2. **Flagged Rollout**: Default configuration remains TF-IDF. A new feature flag/setting (`quality_graph.embeddings`) toggles modes; recorder + planner observers honor the flag without code changes in TypeScript consumers.
3. **Offline Model Handling**: Bootstrap helper validates neural dependencies. If the model weights are missing, scripts emit actionable instructions without crashing; logic supports `QUALITY_GRAPH_EMBED_MODEL_PATH` override for pre-downloaded artifacts.
4. **Ablation Evidence**: Deterministic evaluation script runs both embedders on IMP-ADV-01.3 labeled dataset, producing `state/evidence/IMP-ADV-01.6/verify/neural_vs_tfidf_ablation.json` with metrics (precision@5, MAP, latency). Neural must show ≥10% relative precision@5 gain.
5. **Documentation Updates**: `tools/wvo_mcp/src/quality_graph/README.md` and `docs/autopilot/IMPROVEMENT_BATCH_PLAN.md` (status table) explain neural mode, dependency bootstrap, flags, and evaluation process. Requirements file annotated with new dependency rationale.
6. **Tests & Integrity**: Unit coverage for embedder selection (TF-IDF + neural) with deterministic seeds. Integrity suite (`run_integrity_tests.sh`) and quality graph pytest (if any) pass in TF-IDF mode; ablation script invoked in VERIFY stage with recorded output. No regressions in existing telemetry/observer smoke scripts.

## Out of Scope / Constraints
- No vector database migration (remain JSONL persistence).
- No prompt compiler integration or autopilot runtime enforcement.
- No runtime network fetches; assume model artifacts provided locally.

## Dependencies
- Completed IMP-ADV-01.{1-5} infrastructure.
- Access to IMP-ADV-01.3 labeled dataset (`sample_tasks.json`).
- Python environment with ability to install torch/sentence-transformers via bootstrap helper.

## Test & Evidence Plan
- Unit tests for embedder module covering normalization, fallback, error handling (pytest under `tools/wvo_mcp/scripts/quality_graph/tests` or similar).
- CLI smoke: run `record_task_vector.py`/`query_similar_tasks.py` in both modes using temporary workspace.
- Ablation script comparing metrics; stored output + summary commentary.
- Integrity tests + tracing smoke to ensure no regressions.

## Rollback Plan
- Keep TF-IDF implementation intact; default remains `tfidf`.
- Feature flag change to revert in production.
- Documented instructions for removing neural dependencies if rollback needed.
