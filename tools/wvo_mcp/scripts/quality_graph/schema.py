"""
Quality Graph - Task Vector Schema (Python)

Pydantic models for task vector validation.
Used by embedding generation and backfill scripts.
"""

from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
import numpy as np


class TaskOutcome(BaseModel):
    """Task completion outcome"""
    status: Literal['success', 'failure', 'abandoned']
    reason: Optional[str] = None


class TaskVector(BaseModel):
    """
    Vector representation of a task

    Each vector contains:
    - embedding: 384-dim TF-IDF vector (unit-normalized)
    - metadata: task context for similarity hints
    - outcome: completion status
    """
    # Required fields
    task_id: str = Field(min_length=1)
    embedding: List[float] = Field(min_length=384, max_length=384)
    timestamp: datetime
    outcome: TaskOutcome

    # Optional metadata
    title: Optional[str] = None
    description: Optional[str] = None
    files_touched: Optional[List[str]] = None
    complexity_score: Optional[float] = Field(None, ge=0, le=100)
    duration_ms: Optional[float] = Field(None, ge=0)
    quality: Optional[Literal['high', 'medium', 'low']] = None

    @field_validator('embedding')
    @classmethod
    def validate_embedding(cls, v: List[float]) -> List[float]:
        """Validate embedding is unit-normalized and finite"""
        arr = np.array(v)

        # Check for NaN/Inf
        if not np.all(np.isfinite(arr)):
            raise ValueError('Embedding contains NaN or Infinity')

        # Check unit normalization (L2 norm ≈ 1.0)
        norm = np.linalg.norm(arr)
        if abs(norm - 1.0) > 0.01:
            raise ValueError(f'Embedding not normalized: L2 norm = {norm:.3f}, expected 1.0')

        return v

    def to_jsonl(self) -> str:
        """Serialize to JSONL format"""
        return self.model_dump_json()

    @classmethod
    def from_jsonl(cls, line: str) -> 'TaskVector':
        """Deserialize from JSONL line"""
        return cls.model_validate_json(line)


class SimilarTask(BaseModel):
    """Similarity query result"""
    task_id: str
    similarity: float = Field(ge=0, le=1)
    outcome: TaskOutcome
    title: Optional[str] = None
    duration_ms: Optional[float] = None
    is_confident: bool = Field(
        description='True if similarity > 0.5'
    )


def validate_task_vector(data: dict) -> tuple[bool, Optional[TaskVector], Optional[str]]:
    """
    Validate task vector data

    Returns:
        (success, vector, error_message)
    """
    try:
        vector = TaskVector(**data)
        return (True, vector, None)
    except Exception as e:
        return (False, None, str(e))


def is_normalized_embedding(embedding: List[float]) -> bool:
    """Check if embedding is unit-normalized"""
    norm = np.linalg.norm(embedding)
    return abs(norm - 1.0) < 0.01


def validate_embedding_array(embedding: np.ndarray) -> tuple[bool, Optional[str]]:
    """
    Validate embedding array

    Returns:
        (valid, error_message)
    """
    if embedding.shape[0] != 384:
        return (False, f'Expected 384 dimensions, got {embedding.shape[0]}')

    if not np.all(np.isfinite(embedding)):
        return (False, 'Contains NaN or Infinity')

    norm = np.linalg.norm(embedding)
    if abs(norm - 1.0) > 0.01:
        return (False, f'Not normalized: L2 norm = {norm:.3f}, expected 1.0')

    return (True, None)


# Example usage
if __name__ == '__main__':
    # Valid vector
    vector = TaskVector(
        task_id='test-1',
        embedding=[0.1] * 383 + [0.316],  # Normalized to unit length
        timestamp=datetime.now(),
        outcome=TaskOutcome(status='success'),
        title='Test task',
        quality='high'
    )
    print('✅ Valid vector:', vector.task_id)

    # Invalid vector (not normalized)
    try:
        bad_vector = TaskVector(
            task_id='test-2',
            embedding=[1.0] * 384,  # NOT unit-normalized
            timestamp=datetime.now(),
            outcome=TaskOutcome(status='success')
        )
    except ValueError as e:
        print('❌ Invalid vector rejected:', str(e))
