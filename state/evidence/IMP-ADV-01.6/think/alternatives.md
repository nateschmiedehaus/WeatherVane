# Alternatives Considered

## 1. Cloud Embedding API (OpenAI, Vertex AI)
- **Pros**: No local model management, high-quality embeddings.
- **Cons**: Requires network access + credentials, introduces latency/cost, inconsistent with offline-first policy.
- **Decision**: Rejected for this milestone; would violate current governance (no external API dependencies during bootstrap).

## 2. Upgrade TF-IDF with character n-grams
- **Pros**: Minimal dependency change, easy to implement.
- **Cons**: Limited semantic improvement, still bag-of-words; fails on synonyms/abstractions.
- **Decision**: Rejected; does not meet anticipated 10%+ precision lift.

## 3. Use Hugging Face `transformers` directly
- **Pros**: Fine-grained control over model loading.
- **Cons**: Higher setup complexity; need pooling logic; duplicates features already handled by `sentence-transformers`.
- **Decision**: Rejected; `sentence-transformers` provides optimized pipeline with pooling + caching.

## 4. Train custom domain model
- **Pros**: Potentially higher accuracy.
- **Cons**: Requires labeled corpus + compute; out-of-scope for current improvement batch.
- **Decision**: Defer to future research track.
