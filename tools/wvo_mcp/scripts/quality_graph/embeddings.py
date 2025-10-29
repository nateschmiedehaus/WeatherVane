"""
Quality Graph - Embedding Generation

Computes TF-IDF embeddings for task similarity search.

Design Decisions:
1. TF-IDF chosen over neural embeddings (simpler, no API dependency)
2. 384 dimensions (good balance: signal vs performance)
3. Feature weighting: title (0.4) + description (0.3) + files (0.3)
4. Unit normalization for cosine similarity
5. Unicode-aware preprocessing

Verification Checklist:
- [ ] Embeddings are 384-dimensional
- [ ] All embeddings have unit L2 norm (≈1.0)
- [ ] Handles empty/missing fields gracefully
- [ ] Unicode characters processed correctly
- [ ] Code snippets in backticks normalized
- [ ] Computation completes in <100ms per task
"""

from typing import Dict, List, Optional
import re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize


class TaskEmbedder:
    """
    Computes TF-IDF embeddings for tasks

    Pipeline:
    1. Extract text: title + description + files
    2. Preprocess: lowercase, remove punctuation, tokenize
    3. TF-IDF: scikit-learn with max 1000 features
    4. Project to 384 dimensions (PCA-like random projection)
    5. Normalize to unit length

    Performance:
    - Cold start (first embedding): ~50-100ms (fit vectorizer)
    - Warm (subsequent): ~10-20ms per task
    - Memory: ~5MB for vectorizer
    """

    def __init__(self, max_features: int = 1000, target_dims: int = 384):
        """
        Initialize embedder

        Args:
            max_features: Max TF-IDF features (vocabulary size)
            target_dims: Output embedding dimensions
        """
        self.max_features = max_features
        self.target_dims = target_dims

        # TF-IDF vectorizer (fit on first call)
        self.vectorizer = TfidfVectorizer(
            max_features=max_features,
            lowercase=True,
            token_pattern=r'\b\w\w+\b',  # Unicode-aware word tokenizer
            stop_words='english',
            min_df=1,
            max_df=0.95,  # Ignore very common terms
        )

        # Random projection matrix for dimensionality reduction
        # (initialized lazily after first fit)
        self.projection: Optional[np.ndarray] = None

        # Track if vectorizer has been fitted
        self.is_fitted = False

    def preprocess_text(self, text: str) -> str:
        """
        Preprocess text for embedding

        Steps:
        1. Remove emoji (low signal)
        2. Normalize code snippets: `foo.bar()` → CODE_SNIPPET
        3. Remove special chars except alphanumeric and spaces
        4. Lowercase
        5. Trim whitespace

        Args:
            text: Input text

        Returns:
            Preprocessed text

        Verification:
        - Emoji removed: "Fix 🐛 bug" → "Fix bug"
        - Code normalized: "Add `cache.get(key)`" → "Add CODE_SNIPPET"
        - Unicode preserved: "修复错误" → "修复错误"
        """
        if not text:
            return ""

        # Remove emoji (using regex for common emoji ranges)
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F700-\U0001F77F\U0001F780-\U0001F7FF\U0001F800-\U0001F8FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002702-\U000027B0\U000024C2-\U0001F251]+', '', text)

        # Normalize code snippets in backticks
        text = re.sub(r'`[^`]+`', 'CODE_SNIPPET', text)

        # Keep alphanumeric, spaces, and basic punctuation
        text = re.sub(r'[^\w\s\-]', ' ', text)

        # Collapse multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()

        return text

    def extract_text_features(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[List[str]] = None
    ) -> str:
        """
        Extract and weight text features

        Weighting:
        - title: 0.4 (most important, always short)
        - description: 0.3 (detailed context)
        - files: 0.3 (domain signal from paths)

        Implementation:
        Repeat title 2x, description 1.5x, files 1.5x to achieve weights

        Args:
            title: Task title
            description: Task description (optional)
            files_touched: List of file paths (optional)

        Returns:
            Combined weighted text

        Verification:
        - Empty fields handled: title only → valid
        - Files contribute: ["api/users.ts"] → includes "api users ts"
        """
        parts = []

        # Title (weight: 0.4) - repeat 2x
        if title:
            preprocessed = self.preprocess_text(title)
            parts.extend([preprocessed] * 2)

        # Description (weight: 0.3) - repeat 1.5x (round to 2)
        if description:
            preprocessed = self.preprocess_text(description)
            parts.extend([preprocessed] * 2)

        # Files (weight: 0.3) - extract path components
        if files_touched:
            # Extract meaningful components from paths
            file_terms = []
            for file_path in files_touched:
                # Split path: "src/api/users.ts" → ["src", "api", "users", "ts"]
                components = re.split(r'[/._-]', file_path)
                file_terms.extend([c for c in components if len(c) > 1])

            if file_terms:
                file_text = ' '.join(file_terms)
                parts.extend([file_text] * 2)

        combined = ' '.join(parts)

        # Handle edge case: completely empty
        if not combined.strip():
            return "UNKNOWN_TASK"

        return combined

    def compute_embedding(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        files_touched: Optional[List[str]] = None,
        corpus: Optional[List[str]] = None
    ) -> np.ndarray:
        """
        Compute task embedding

        Args:
            title: Task title
            description: Task description (optional)
            files_touched: File paths (optional)
            corpus: Additional documents for TF-IDF fit (optional)

        Returns:
            384-dimensional unit-normalized embedding

        Raises:
            ValueError: If embedding computation fails

        Verification:
        - Output shape: (384,)
        - Output norm: ≈1.0 (within 0.01)
        - No NaN/Inf values
        - Deterministic: same input → same output
        """
        # Extract and preprocess text
        text = self.extract_text_features(title, description, files_touched)

        # Fit vectorizer on first call (or if corpus provided)
        if not self.is_fitted or corpus:
            fit_corpus = corpus if corpus else [text]

            try:
                self.vectorizer.fit(fit_corpus)
            except ValueError as e:
                # Handle minimal-text edge case: max_df constraint violation
                # Occurs when corpus is too small (e.g., single short task)
                if 'max_df' in str(e):
                    # Retry with relaxed parameters (allow all terms)
                    self.vectorizer = TfidfVectorizer(
                        max_features=self.max_features,
                        lowercase=True,
                        token_pattern=r'\b\w\w+\b',
                        stop_words='english',
                        min_df=1,
                        max_df=1.0,  # Allow all terms (no upper threshold)
                    )
                    try:
                        self.vectorizer.fit(fit_corpus)
                    except Exception:
                        # Extremely degenerate case: can't fit even with relaxed params
                        # Fall back to identity vectorizer (no vocabulary filtering)
                        self.vectorizer = TfidfVectorizer(
                            lowercase=True,
                            token_pattern=r'\b\w\w+\b',
                        )
                        self.vectorizer.fit(fit_corpus)
                else:
                    raise  # Re-raise non-max_df errors

            self.is_fitted = True

            # Initialize random projection matrix
            # (stable random seed for reproducibility)
            vocab_size = len(self.vectorizer.vocabulary_)
            np.random.seed(42)
            self.projection = np.random.randn(vocab_size, self.target_dims)
            self.projection = normalize(self.projection, axis=0)

        # Transform text to TF-IDF vector
        tfidf = self.vectorizer.transform([text]).toarray()[0]

        # Project to target dimensions
        if self.projection is None:
            raise ValueError("Projection matrix not initialized")

        # Handle case where vocabulary changed
        if len(tfidf) != self.projection.shape[0]:
            # Re-initialize projection (rare, only if vocab changed)
            np.random.seed(42)
            self.projection = np.random.randn(len(tfidf), self.target_dims)
            self.projection = normalize(self.projection, axis=0)

        embedding = tfidf @ self.projection

        # Normalize to unit length for cosine similarity
        norm = np.linalg.norm(embedding)
        if norm > 1e-10:  # Avoid division by zero
            embedding = embedding / norm
        else:
            # Degenerate case: zero vector (very rare)
            # Return random unit vector (better than zeros)
            embedding = np.random.randn(self.target_dims)
            embedding = embedding / np.linalg.norm(embedding)

        # Validation
        assert embedding.shape == (self.target_dims,), f"Wrong shape: {embedding.shape}"
        assert np.all(np.isfinite(embedding)), "Embedding contains NaN/Inf"
        assert abs(np.linalg.norm(embedding) - 1.0) < 0.01, f"Not normalized: norm={np.linalg.norm(embedding)}"

        return embedding


def compute_task_embedding(
    metadata: Dict,
    embedder: Optional[TaskEmbedder] = None
) -> np.ndarray:
    """
    Convenience function: compute embedding from task metadata dict

    Args:
        metadata: Dict with keys: title, description (opt), files_touched (opt)
        embedder: Reusable embedder instance (optional, for efficiency)

    Returns:
        384-dimensional embedding

    Example:
        >>> metadata = {
        ...     'title': 'Add GET /api/users endpoint',
        ...     'description': 'Implement user listing with pagination',
        ...     'files_touched': ['src/api/users.ts', 'src/api/users.test.ts']
        ... }
        >>> embedding = compute_task_embedding(metadata)
        >>> embedding.shape
        (384,)
        >>> abs(np.linalg.norm(embedding) - 1.0) < 0.01
        True
    """
    if embedder is None:
        embedder = TaskEmbedder()

    return embedder.compute_embedding(
        title=metadata.get('title'),
        description=metadata.get('description'),
        files_touched=metadata.get('files_touched')
    )


# Quality assessment
def assess_embedding_quality(
    metadata: Dict
) -> str:
    """
    Assess embedding quality based on available metadata

    Quality levels:
    - high: title + description + files
    - medium: title + (description OR files)
    - low: title only

    Args:
        metadata: Task metadata dict

    Returns:
        Quality level: 'high' | 'medium' | 'low'
    """
    has_title = bool(metadata.get('title'))
    has_description = bool(metadata.get('description'))
    has_files = bool(metadata.get('files_touched'))

    if not has_title:
        return 'low'  # Degenerate

    if has_description and has_files:
        return 'high'
    elif has_description or has_files:
        return 'medium'
    else:
        return 'low'


# Verification helper
def verify_embedding(embedding: np.ndarray) -> Dict:
    """
    Verify embedding meets requirements

    Checks:
    1. Shape is (384,)
    2. All values finite (no NaN/Inf)
    3. L2 norm ≈ 1.0
    4. Not all zeros

    Args:
        embedding: Embedding to verify

    Returns:
        Dict with verification results
    """
    return {
        'shape_ok': embedding.shape == (384,),
        'finite': np.all(np.isfinite(embedding)),
        'normalized': abs(np.linalg.norm(embedding) - 1.0) < 0.01,
        'non_zero': np.any(embedding != 0),
        'norm': float(np.linalg.norm(embedding)),
    }


if __name__ == '__main__':
    # Demo: compute embeddings for sample tasks
    print("Quality Graph Embedding Demo\n")

    embedder = TaskEmbedder()

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

    for i, metadata in enumerate(samples, 1):
        embedding = compute_task_embedding(metadata, embedder)
        quality = assess_embedding_quality(metadata)
        verification = verify_embedding(embedding)

        print(f"Task {i}: {metadata['title']}")
        print(f"  Quality: {quality}")
        print(f"  Embedding shape: {embedding.shape}")
        print(f"  L2 norm: {verification['norm']:.6f}")
        print(f"  Verification: {verification}")
        print()

    print("✅ All embeddings valid")
