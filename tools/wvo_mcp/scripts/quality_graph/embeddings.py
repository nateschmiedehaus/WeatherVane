"""
Quality Graph - Embedding Generation

Provides pluggable embedding backends for the quality graph. Supports the
original TF-IDF pipeline and a neural `sentence-transformers` encoder that can be
selected via feature flag, environment variable, or CLI override.

Verification Checklist (shared by both backends):
- Embeddings are 384-dimensional unit vectors
- Handles empty/missing metadata defensively
- Deterministic output given same inputs/configuration
- Offline-friendly: neural mode surfaces actionable guidance when models missing
"""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.preprocessing import normalize

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 384
SUPPORTED_MODES = {"tfidf", "neural"}
DEFAULT_MODE = "tfidf"
DEFAULT_NEURAL_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

ENV_MODE = "QUALITY_GRAPH_EMBEDDINGS"
ENV_MODEL_PATH = "QUALITY_GRAPH_EMBED_MODEL_PATH"
ENV_MODEL_NAME = "QUALITY_GRAPH_EMBED_MODEL_NAME"
ENV_ALLOW_DOWNLOAD = "QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD"
ENV_DEVICE = "QUALITY_GRAPH_EMBED_DEVICE"


class EmbeddingConfigurationError(RuntimeError):
    """Raised when embedding configuration is invalid."""


class EmbeddingComputationError(RuntimeError):
    """Raised when an embedding cannot be computed."""


def _normalize_files(files: Optional[Sequence[str]]) -> Optional[List[str]]:
    if not files:
        return None
    normalized = []
    for item in files:
        if not item:
            continue
        parts = re.split(r"[/._-]", item)
        normalized.extend([p for p in parts if len(p) > 1])
    return normalized or None


HASH_FEATURES = 4096


@dataclass
class TFIDFBackend:
    """Deterministic hashing backend (legacy-compatible default)."""

    max_features: int = HASH_FEATURES
    target_dims: int = EMBEDDING_DIM

    def __post_init__(self) -> None:
        # Stateless hashing vectorizer yields stable feature space without fitting.
        self.n_features = self.max_features
        self.vectorizer = HashingVectorizer(
            n_features=self.n_features,
            alternate_sign=False,
            lowercase=True,
            token_pattern=r"\b\w\w+\b",
            stop_words="english",
            norm=None,
        )
        # Deterministic projection -> 384 dims
        rng = np.random.default_rng(42)
        projection = rng.standard_normal((self.n_features, self.target_dims))
        self.projection = normalize(projection, axis=0)

    @staticmethod
    def preprocess_text(text: Optional[str]) -> str:
        """Normalize text for TF-IDF consumption."""
        if not text:
            return ""

        emoji_pattern = (
            r"[\U0001F600-\U0001F64F"
            r"\U0001F300-\U0001F5FF"
            r"\U0001F680-\U0001F6FF"
            r"\U0001F700-\U0001F77F"
            r"\U0001F780-\U0001F7FF"
            r"\U0001F800-\U0001F8FF"
            r"\U0001F900-\U0001F9FF"
            r"\U0001FA00-\U0001FA6F"
            r"\U0001FA70-\U0001FAFF"
            r"\U0001F1E6-\U0001F1FF"
            r"\U00002600-\U000026FF"
            r"\U00002700-\U000027BF]"
        )
        cleaned = re.sub(emoji_pattern, "", text)
        cleaned = re.sub(r"`[^`]+`", "CODE_SNIPPET", cleaned)
        cleaned = re.sub(r"[^\w\s\-]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def extract_text_features(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
    ) -> str:
        parts: List[str] = []

        if title:
            processed = self.preprocess_text(title)
            parts.extend([processed] * 2)

        if description:
            processed = self.preprocess_text(description)
            parts.extend([processed] * 2)

        file_terms = _normalize_files(files_touched)
        if file_terms:
            parts.extend([" ".join(file_terms)] * 2)

        combined = " ".join(parts)
        if not combined.strip():
            return "UNKNOWN_TASK"
        return combined

    def compute_embedding(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
        corpus: Optional[Sequence[str]] = None,
    ) -> np.ndarray:
        text = self.extract_text_features(title, description, files_touched)
        # HashingVectorizer ignores corpus; keep parameter for API compatibility.
        hashed = self.vectorizer.transform([text]).toarray()[0].astype(np.float32)

        if hashed.shape[0] != self.projection.shape[0]:
            raise EmbeddingComputationError(
                f"Hashing feature dimension mismatch: expected {self.projection.shape[0]}, got {hashed.shape[0]}"
            )

        embedding = hashed @ self.projection
        norm = np.linalg.norm(embedding)
        if norm <= 1e-10:
            # Deterministic fallback: set first component to 1.0
            embedding = np.zeros(self.target_dims, dtype=np.float32)
            embedding[0] = 1.0
        else:
            embedding = embedding / norm

        assert embedding.shape == (self.target_dims,), f"Wrong shape: {embedding.shape}"
        assert np.all(np.isfinite(embedding)), "Embedding contains NaN/Inf"
        return embedding.astype(np.float32)


class NeuralBackend:
    """Sentence-transformers based embedding backend."""

    def __init__(
        self,
        target_dims: int = EMBEDDING_DIM,
        model_name: Optional[str] = None,
        model_path: Optional[str] = None,
    ) -> None:
        self.target_dims = target_dims
        self.model_name = model_name or os.environ.get(ENV_MODEL_NAME) or DEFAULT_NEURAL_MODEL
        self.model_path = model_path or os.environ.get(ENV_MODEL_PATH)
        self.allow_download = os.environ.get(ENV_ALLOW_DOWNLOAD, "0") == "1"
        self.device = os.environ.get(ENV_DEVICE, "cpu")
        self._model = None

    def _resolve_identifier(self) -> str:
        if self.model_path:
            path = Path(self.model_path)
            if not path.exists():
                raise EmbeddingConfigurationError(
                    f"Neural embedding model path not found: {path}"
                )
            if not path.is_dir():
                raise EmbeddingConfigurationError(
                    f"Neural embedding model path must be a directory: {path}"
                )
            return str(path)

        if not self.allow_download:
            raise EmbeddingConfigurationError(
                "Neural embedding model not available. Set QUALITY_GRAPH_EMBED_MODEL_PATH "
                "to a local SentenceTransformer directory or export "
                "QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1 to permit fetching."
            )

        return self.model_name

    def _ensure_model(self):
        if self._model is not None:
            return self._model

        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise EmbeddingConfigurationError(
                "sentence-transformers is not installed. Run ensureQualityGraphPython() "
                "or `pip install sentence-transformers` inside the quality graph venv."
            ) from exc

        load_target = self._resolve_identifier()
        start = time.perf_counter()
        try:
            model = SentenceTransformer(load_target, device=self.device)
        except OSError as exc:
            raise EmbeddingConfigurationError(
                "Failed to load neural embedding model. Ensure the model directory contains "
                "config.json and model files, or allow downloads via QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1."
            ) from exc

        try:
            import torch

            threads = max(torch.get_num_threads(), 1)
            torch.set_num_threads(threads)
        except Exception:
            # Torch not available or configuration failed; continue silently.
            pass

        elapsed = time.perf_counter() - start
        logger.info(
            "Loaded sentence-transformer model",
            extra={"model": load_target, "device": self.device, "load_seconds": round(elapsed, 3)},
        )
        self._model = model
        return self._model

    @staticmethod
    def build_input_text(
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
    ) -> str:
        parts: List[str] = []
        if title:
            parts.append(title.strip())
        if description:
            parts.append(description.strip())
        if files_touched:
            cleaned = ", ".join(
                sorted({f.strip() for f in files_touched if f and f.strip()})
            )
            if cleaned:
                parts.append(f"Files touched: {cleaned}")
        text = "\n".join(parts).strip()
        if not text:
            return "UNKNOWN_TASK"
        return text

    def compute_embedding(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
        corpus: Optional[Sequence[str]] = None,
    ) -> np.ndarray:
        del corpus  # Unused, kept for signature parity
        text = self.build_input_text(title, description, files_touched)
        if not text.strip() or text == "UNKNOWN_TASK":
            raise EmbeddingComputationError(
                "Cannot compute neural embedding without task metadata. Provide title/description/files."
            )

        model = self._ensure_model()
        embeddings = model.encode(
            text,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        vector = np.asarray(embeddings, dtype=np.float32)
        if vector.ndim == 2:
            vector = vector[0]
        if vector.shape[0] != self.target_dims:
            raise EmbeddingComputationError(
                f"Neural embedding dimension mismatch: expected {self.target_dims}, got {vector.shape[0]}"
            )
        return vector

    def compute_embeddings_batch(
        self,
        tasks: Sequence[dict],
        batch_size: int = 32,
        show_progress: bool = False,
    ) -> np.ndarray:
        """
        Compute embeddings for multiple tasks in batches.

        Args:
            tasks: List of dicts with 'title', 'description', 'files_touched' keys
            batch_size: Number of tasks to process in each batch (default: 32)
            show_progress: Whether to show progress bar (default: False)

        Returns:
            np.ndarray of shape (len(tasks), target_dims) with unit-normalized vectors

        Raises:
            EmbeddingComputationError: If any task has invalid metadata
        """
        if not tasks:
            return np.empty((0, self.target_dims), dtype=np.float32)

        # Build input texts for all tasks
        texts = []
        for i, task in enumerate(tasks):
            text = self.build_input_text(
                title=task.get("title"),
                description=task.get("description"),
                files_touched=task.get("files_touched"),
            )
            if not text.strip() or text == "UNKNOWN_TASK":
                raise EmbeddingComputationError(
                    f"Cannot compute neural embedding for task {i}: missing title/description/files"
                )
            texts.append(text)

        # Batch encode with sentence-transformers
        model = self._ensure_model()
        embeddings = model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        # Validate shape
        embeddings = np.asarray(embeddings, dtype=np.float32)
        if embeddings.ndim != 2:
            raise EmbeddingComputationError(
                f"Expected 2D array from batch encoding, got shape {embeddings.shape}"
            )
        if embeddings.shape[1] != self.target_dims:
            raise EmbeddingComputationError(
                f"Neural embedding dimension mismatch: expected {self.target_dims}, got {embeddings.shape[1]}"
            )
        if embeddings.shape[0] != len(tasks):
            raise EmbeddingComputationError(
                f"Expected {len(tasks)} embeddings, got {embeddings.shape[0]}"
            )

        return embeddings


class TaskEmbedder:
    """Facade for embedding backends."""

    def __init__(
        self,
        mode: Optional[str] = None,
        max_features: int = HASH_FEATURES,
        target_dims: int = EMBEDDING_DIM,
        neural_model_name: Optional[str] = None,
        neural_model_path: Optional[str] = None,
    ) -> None:
        resolved = resolve_embedding_mode(mode)
        self.mode = resolved
        self.target_dims = target_dims

        if resolved == "tfidf":
            self._backend: Union[TFIDFBackend, NeuralBackend] = TFIDFBackend(
                max_features=max_features,
                target_dims=target_dims,
            )
        elif resolved == "neural":
            self._backend = NeuralBackend(
                target_dims=target_dims,
                model_name=neural_model_name,
                model_path=neural_model_path,
            )
        else:
            raise EmbeddingConfigurationError(f"Unsupported embedding mode: {resolved}")

    def compute_embedding(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
        corpus: Optional[Sequence[str]] = None,
    ) -> np.ndarray:
        embedding = self._backend.compute_embedding(
            title=title,
            description=description,
            files_touched=files_touched,
            corpus=corpus,
        )
        return embedding

    def preprocess_text(self, text: Optional[str]) -> str:
        if isinstance(self._backend, TFIDFBackend):
            return TFIDFBackend.preprocess_text(text)
        return (text or "").strip()

    def extract_text_features(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[Sequence[str]] = None,
    ) -> str:
        if isinstance(self._backend, TFIDFBackend):
            return self._backend.extract_text_features(title, description, files_touched)
        return NeuralBackend.build_input_text(title, description, files_touched)


def resolve_embedding_mode(candidate: Optional[str]) -> str:
    if candidate:
        mode = candidate.strip().lower()
    else:
        env_value = os.environ.get(ENV_MODE, "").strip().lower()
        mode = env_value or DEFAULT_MODE

    if mode not in SUPPORTED_MODES:
        logger.warning("Unknown embedding mode '%s'; defaulting to %s", mode, DEFAULT_MODE)
        return DEFAULT_MODE
    return mode


def compute_task_embedding(
    metadata: Optional[Dict[str, Any]] = None,
    *,
    title: Optional[str] = None,
    description: Optional[str] = None,
    files_touched: Optional[Sequence[str]] = None,
    mode: Optional[str] = None,
    embedder: Optional[TaskEmbedder] = None,
    corpus: Optional[Sequence[str]] = None,
) -> np.ndarray:
    """Compute embedding for task metadata using configured backend."""
    if metadata is not None:
        title = title if title is not None else metadata.get("title")
        description = description if description is not None else metadata.get("description")
        files_touched = files_touched if files_touched is not None else metadata.get("files_touched")

    if embedder is None:
        embedder = TaskEmbedder(mode=mode)

    return embedder.compute_embedding(
        title=title,
        description=description,
        files_touched=files_touched,
        corpus=corpus,
    )


# Quality assessment remains unchanged

def assess_embedding_quality(metadata: Dict[str, Any]) -> str:
    has_title = bool(metadata.get('title'))
    has_description = bool(metadata.get('description'))
    has_files = bool(metadata.get('files_touched'))

    if not has_title:
        return 'low'
    if has_description and has_files:
        return 'high'
    if has_description or has_files:
        return 'medium'
    return 'low'


def verify_embedding(embedding: np.ndarray) -> Dict[str, Any]:
    norm = float(np.linalg.norm(embedding))
    return {
        'shape_ok': embedding.shape == (EMBEDDING_DIM,),
        'finite': np.all(np.isfinite(embedding)),
        'normalized': abs(norm - 1.0) < 0.01,
        'non_zero': np.any(embedding != 0),
        'norm': norm,
    }


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)

    print("Quality Graph Embedding Demo\n")

    for mode in ("tfidf", "neural"):
        print(f"Mode: {mode}")
        try:
            embedder = TaskEmbedder(mode=mode)
            samples = [
                {
                    'title': 'Add GET /api/users endpoint',
                    'description': 'Implement user listing with pagination',
                    'files_touched': ['src/api/users.ts'],
                },
                {
                    'title': 'Fix authentication bug',
                    'description': 'Users unable to login with special chars in password',
                    'files_touched': ['src/auth/login.ts'],
                },
                {
                    'title': 'Update dependencies',
                    'files_touched': ['package.json'],
                },
            ]

            for idx, metadata in enumerate(samples, 1):
                embedding = compute_task_embedding(metadata, embedder=embedder)
                verification = verify_embedding(embedding)
                print(f"  Task {idx}: norm={verification['norm']:.6f} valid={verification['shape_ok']}")
        except EmbeddingConfigurationError as exc:
            print(f"  Skipping mode due to configuration error: {exc}")
        except EmbeddingComputationError as exc:
            print(f"  Failed to compute embedding: {exc}")
        print()

    print("✅ Demo complete")
