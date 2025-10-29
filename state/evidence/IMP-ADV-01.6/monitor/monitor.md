# Monitor Plan

- **Telemetry**: Track `quality_graph.embeddings.mode` counter and measure neural inference latency vs TF-IDF baseline once flag flipped in staging.
- **Ablation Drift**: Re-run `embedding_ablation.py` weekly when corpus grows >25% or model updated to ensure MAP lift persists.
- **Resource Footprint**: Monitor `state/quality_graph/.venv` size and torch cache (~1.2GB); alert if exceeding workspace budget.
- **Fallback**: Keep TF-IDF path + flag for instant rollback if latency or precision regress.
