"""
Tests for Quality Graph Embeddings

Verification coverage:
- Embedding shape and normalization
- Unicode handling
- Code snippet normalization
- Empty field handling
- Feature weighting
- Reproducibility
- Edge cases
"""

from typing import Optional

import numpy as np
import pytest

from ..embeddings import (
    EMBEDDING_DIM,
    EmbeddingComputationError,
    EmbeddingConfigurationError,
    NeuralBackend,
    TaskEmbedder,
    assess_embedding_quality,
    compute_task_embedding,
    resolve_embedding_mode,
    verify_embedding,
)


class TestTaskEmbedder:
    """Test TaskEmbedder class"""

    def test_embedding_shape(self):
        """Verify embedding has correct shape"""
        embedder = TaskEmbedder()
        embedding = embedder.compute_embedding(title="Test task")

        assert embedding.shape == (EMBEDDING_DIM,), f"Expected ({EMBEDDING_DIM},), got {embedding.shape}"

    def test_embedding_normalized(self):
        """Verify embedding has unit L2 norm"""
        embedder = TaskEmbedder()
        embedding = embedder.compute_embedding(title="Test task")

        norm = np.linalg.norm(embedding)
        assert abs(norm - 1.0) < 0.01, f"Embedding not normalized: norm={norm}"

    def test_no_nan_or_inf(self):
        """Verify embedding contains no NaN or Infinity"""
        embedder = TaskEmbedder()
        embedding = embedder.compute_embedding(title="Test task")

        assert np.all(np.isfinite(embedding)), "Embedding contains NaN or Inf"

    def test_different_tasks_different_embeddings(self):
        """Verify different tasks produce different embeddings"""
        embedder = TaskEmbedder()
        corpus = [
            "Add API endpoint",
            "Fix authentication bug",
            "Update documentation",
        ]
        embedder.compute_embedding(title="Warm start", corpus=corpus)
        emb1 = embedder.compute_embedding(title="Add API endpoint")
        emb2 = embedder.compute_embedding(title="Fix authentication bug")

        similarity = np.dot(emb1, emb2)
        assert similarity < 0.99, f"Embeddings too similar: {similarity}"


class TestPreprocessing:
    """Test text preprocessing"""

    def test_emoji_removal(self):
        """Verify emoji are removed"""
        embedder = TaskEmbedder()
        text = "Fix 🐛 bug in API ⚡"
        processed = embedder.preprocess_text(text)

        # Emoji should be removed
        assert '🐛' not in processed
        assert '⚡' not in processed
        assert 'bug' in processed.lower()
        assert 'api' in processed.lower()

    def test_code_snippet_normalization(self):
        """Verify code in backticks is normalized"""
        embedder = TaskEmbedder()
        text = "Add `cache.get(key)` method to API"
        processed = embedder.preprocess_text(text)

        # Code should be replaced with CODE_SNIPPET
        assert '`' not in processed
        assert 'CODE_SNIPPET' in processed
        assert 'method' in processed.lower()

    def test_unicode_preservation(self):
        """Verify unicode characters are preserved"""
        embedder = TaskEmbedder()
        text = "修复错误 in authentication"
        processed = embedder.preprocess_text(text)

        # Chinese characters should be preserved
        assert '修复错误' in processed

    def test_empty_text(self):
        """Verify empty text handled gracefully"""
        embedder = TaskEmbedder()
        processed = embedder.preprocess_text("")

        assert processed == ""


class TestFeatureExtraction:
    """Test feature extraction and weighting"""

    def test_title_only(self):
        """Verify title-only embedding works"""
        embedder = TaskEmbedder()
        text = embedder.extract_text_features(title="Add API endpoint")

        assert "API" in text or "api" in text
        assert len(text) > 0

    def test_title_and_description(self):
        """Verify title + description combined"""
        embedder = TaskEmbedder()
        text = embedder.extract_text_features(
            title="Add endpoint",
            description="Implement user listing"
        )

        # Both should be present
        assert "endpoint" in text.lower()
        assert "listing" in text.lower()

    def test_files_contribute(self):
        """Verify files_touched extracted correctly"""
        embedder = TaskEmbedder()
        text = embedder.extract_text_features(
            title="Fix bug",
            files_touched=["src/api/users.ts", "src/api/auth.ts"]
        )

        # File path components should be extracted
        assert "api" in text.lower()
        assert "users" in text.lower() or "auth" in text.lower()

    def test_empty_fields(self):
        """Verify empty fields handled gracefully"""
        embedder = TaskEmbedder()
        text = embedder.extract_text_features(
            title="Test",
            description="",
            files_touched=[]
        )

        assert len(text) > 0  # Title should be present


class TestEdgeCases:
    """Test edge cases"""

    def test_very_long_title(self):
        """Verify very long title handled"""
        embedder = TaskEmbedder()
        title = "A" * 1000  # Very long title
        embedding = embedder.compute_embedding(title=title)

        # Should still produce valid embedding
        assert embedding.shape == (EMBEDDING_DIM,)
        assert np.all(np.isfinite(embedding))

    def test_special_characters(self):
        """Verify special characters handled"""
        embedder = TaskEmbedder()
        title = "Fix @#$%^&*() bug !!! ???"
        embedding = embedder.compute_embedding(title=title)

        assert embedding.shape == (EMBEDDING_DIM,)

    def test_only_code_snippets(self):
        """Verify task with only code snippets"""
        embedder = TaskEmbedder()
        title = "`foo()` `bar()` `baz()`"
        embedding = embedder.compute_embedding(title=title)

        assert embedding.shape == (EMBEDDING_DIM,)


class TestReproducibility:
    """Test reproducibility"""

    def test_same_input_same_output(self):
        """Verify same input produces same embedding"""
        embedder1 = TaskEmbedder()
        embedder2 = TaskEmbedder()

        # Fit on same corpus
        corpus = ["Task 1", "Task 2", "Task 3"]
        emb1 = embedder1.compute_embedding(title="Test task", corpus=corpus)
        emb2 = embedder2.compute_embedding(title="Test task", corpus=corpus)

        # Should be identical (or very close due to random projection)
        # Note: Random seed is fixed, so should be identical
        np.testing.assert_allclose(emb1, emb2, rtol=1e-5)


class TestConvenienceFunctions:
    """Test convenience functions"""

    def test_compute_task_embedding(self):
        """Test compute_task_embedding function"""
        metadata = {
            'title': 'Add API endpoint',
            'description': 'Implement user listing',
            'files_touched': ['src/api/users.ts'],
        }

        embedding = compute_task_embedding(metadata)

        assert embedding.shape == (EMBEDDING_DIM,)
        assert abs(np.linalg.norm(embedding) - 1.0) < 0.01

    def test_assess_embedding_quality_high(self):
        """Test quality assessment: high"""
        metadata = {
            'title': 'Test',
            'description': 'Description',
            'files_touched': ['file.ts'],
        }

        quality = assess_embedding_quality(metadata)
        assert quality == 'high'

    def test_assess_embedding_quality_medium(self):
        """Test quality assessment: medium"""
        metadata = {
            'title': 'Test',
            'description': 'Description',
        }

        quality = assess_embedding_quality(metadata)
        assert quality == 'medium'

    def test_assess_embedding_quality_low(self):
        """Test quality assessment: low"""
        metadata = {
            'title': 'Test',
        }

        quality = assess_embedding_quality(metadata)
        assert quality == 'low'

    def test_verify_embedding_valid(self):
        """Test embedding verification: valid"""
        embedding = np.random.randn(EMBEDDING_DIM)
        embedding = embedding / np.linalg.norm(embedding)

        result = verify_embedding(embedding)

        assert result['shape_ok']
        assert result['finite']
        assert result['normalized']
        assert result['non_zero']

    def test_verify_embedding_invalid(self):
        """Test embedding verification: invalid"""
        embedding = np.array([np.nan] * EMBEDDING_DIM)

        result = verify_embedding(embedding)

        assert not result['finite']


class StubSentenceTransformer:
    """Minimal stub for sentence-transformer encode."""

    def __init__(self, vector: Optional[np.ndarray] = None):
        self.vector = (
            vector
            if vector is not None
            else np.full((EMBEDDING_DIM,), 1.0 / np.sqrt(EMBEDDING_DIM), dtype=np.float32)
        )

    def encode(self, text: str, show_progress_bar: bool, convert_to_numpy: bool, normalize_embeddings: bool):
        assert convert_to_numpy is True
        assert normalize_embeddings is True
        return self.vector


class TestNeuralBackend:
    """Neural backend behaviour."""

    def test_compute_with_stub_model(self, monkeypatch):
        backend = NeuralBackend()
        monkeypatch.setattr(backend, '_ensure_model', lambda: StubSentenceTransformer())

        embedding = backend.compute_embedding(title="Neural test", description="Check stub")

        assert embedding.shape == (EMBEDDING_DIM,)
        assert abs(np.linalg.norm(embedding) - 1.0) < 1e-6

    def test_missing_metadata_raises(self, monkeypatch):
        backend = NeuralBackend()
        monkeypatch.setattr(backend, '_ensure_model', lambda: StubSentenceTransformer())

        with pytest.raises(EmbeddingComputationError):
            backend.compute_embedding()

    def test_missing_model_configuration_surfaces_error(self, monkeypatch):
        monkeypatch.delenv('QUALITY_GRAPH_EMBED_MODEL_PATH', raising=False)
        monkeypatch.delenv('QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD', raising=False)
        embedder = TaskEmbedder(mode='neural')

        with pytest.raises(EmbeddingConfigurationError):
            embedder.compute_embedding(title="Requires model")


class TestResolveEmbeddingMode:
    """Mode resolution helper."""

    def test_explicit_param_wins(self, monkeypatch):
        monkeypatch.setenv('QUALITY_GRAPH_EMBEDDINGS', 'tfidf')
        assert resolve_embedding_mode('neural') == 'neural'

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv('QUALITY_GRAPH_EMBEDDINGS', 'neural')
        assert resolve_embedding_mode(None) == 'neural'

    def test_unknown_mode_falls_back(self, monkeypatch):
        monkeypatch.setenv('QUALITY_GRAPH_EMBEDDINGS', 'gibberish')
        assert resolve_embedding_mode(None) == 'tfidf'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
